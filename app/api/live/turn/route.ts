import { NextResponse } from 'next/server';

import { generateContainedTurn } from '@/lib/live/generateTurn';
import { getLiveLlm } from '@/lib/live/llm';
import { MANIFEST, type Mood } from '@/lib/live/manifest';
import { INTENT_SYSTEM_PROMPT, INTENT_USER_PROMPT } from '@/lib/live/prompts';
import { ProviderError } from '@/lib/scoring/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * One turn of the live exchange: decide whether the mood trigger fired from
 * the student's audio, then generate the guest's next line and hold it to
 * the manifest before returning it. Generation only — no scoring happens
 * between turns.
 */
export async function POST(request: Request) {
  const routeStartedAt = Date.now();

  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause) {
    return NextResponse.json(
      { error: `The request could not be read: ${(cause as Error).message}` },
      { status: 400 },
    );
  }

  const providerParam = asString(form.get('provider'));
  let llm;
  try {
    llm = getLiveLlm(providerParam);
  } catch (cause) {
    return NextResponse.json(
      { provider: providerParam, error: (cause as Error).message },
      { status: 500 },
    );
  }

  const turnNumber = Number(asString(form.get('turnNumber')) ?? '1');
  if (!Number.isInteger(turnNumber) || turnNumber < 1 || turnNumber > MANIFEST.maxTurns) {
    return NextResponse.json(
      {
        provider: llm.id,
        error: `turnNumber must be an integer between 1 and ${MANIFEST.maxTurns}.`,
      },
      { status: 400 },
    );
  }

  let history: { guest: string }[] = [];
  const historyRaw = asString(form.get('history'));
  if (historyRaw) {
    try {
      const parsed = JSON.parse(historyRaw);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      return NextResponse.json(
        { provider: llm.id, error: 'history was not valid JSON.' },
        { status: 400 },
      );
    }
  }

  let mood: Mood = asString(form.get('mood')) === 'presse' ? 'presse' : 'calme';
  let turnsWithoutIntent = Number(asString(form.get('turnsWithoutIntent')) ?? '0');
  if (!Number.isFinite(turnsWithoutIntent) || turnsWithoutIntent < 0) {
    turnsWithoutIntent = 0;
  }

  // Student audio for this turn, absent on the opening line.
  let studentAudio: { base64: string; mimeType: string } | undefined;
  const file = form.get('audio');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          provider: llm.id,
          error: `The recording is ${(file.size / 1024 / 1024).toFixed(2)} MB, over the ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(1)} MB upload limit. Record a shorter reply.`,
        },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    studentAudio = {
      base64: buffer.toString('base64'),
      mimeType: file.type || 'audio/webm',
    };
  }

  let intentMs: number | null = null;
  let moodShiftedThisTurn = false;

  try {
    // Mood trigger: more than one turn without asking the name and without
    // moving toward availability.
    if (studentAudio && mood === 'calme') {
      const intent = await llm.complete({
        system: INTENT_SYSTEM_PROMPT,
        userText: INTENT_USER_PROMPT,
        audio: [studentAudio],
      });
      intentMs = intent.ms;

      const said = /^\s*oui\b/i.test(intent.text.trim());
      turnsWithoutIntent = said ? 0 : turnsWithoutIntent + 1;
      if (turnsWithoutIntent > 1) {
        mood = 'presse';
        moodShiftedThisTurn = true;
      }
    }

    const generated = await generateContainedTurn({
      llm,
      turnNumber,
      mood,
      history,
      studentAudio,
    });

    if (!generated.ok) {
      return NextResponse.json(
        {
          provider: llm.id,
          providerLabel: llm.label,
          model: generated.model,
          error: `${llm.label}: ${generated.error}`,
          rejections: generated.rejections,
          mood,
          turnsWithoutIntent,
          timings: {
            intentMs,
            generateMs: generated.generateMs,
            containmentMs: generated.containmentMs,
            serverTotalMs: Date.now() - routeStartedAt,
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      provider: llm.id,
      providerLabel: llm.label,
      model: generated.model,
      turnNumber,
      guestLine: generated.line,
      mood,
      moodShiftedThisTurn,
      turnsWithoutIntent,
      rejections: generated.rejections,
      timings: {
        intentMs,
        generateMs: generated.generateMs,
        containmentMs: generated.containmentMs,
        serverTotalMs: Date.now() - routeStartedAt,
      },
    });
  } catch (cause) {
    if (cause instanceof ProviderError) {
      return NextResponse.json(
        {
          provider: cause.provider,
          providerLabel: llm.label,
          error: `${llm.label} could not produce this turn: ${cause.reason}`,
        },
        { status: cause.status && cause.status >= 400 ? cause.status : 502 },
      );
    }
    return NextResponse.json(
      {
        provider: llm.id,
        providerLabel: llm.label,
        error: `${llm.label} could not produce this turn: ${(cause as Error).message}`,
      },
      { status: 502 },
    );
  }
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}
