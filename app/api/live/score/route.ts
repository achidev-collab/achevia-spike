import { NextResponse } from 'next/server';

import { getLiveLlm, type AudioPart } from '@/lib/live/llm';
import { liveScoreSystemPrompt, liveScoreUserPrompt } from '@/lib/live/prompts';
import type { LiveScoreOutcome, LiveScoreResult } from '@/lib/live/types';
import { ProviderError } from '@/lib/scoring/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * End-of-exchange scoring. Every turn's student audio is sent to the model
 * natively, in order. There is no transcript step.
 *
 * If the provider does not return clean JSON, the raw output is surfaced
 * verbatim. No fence stripping, no bracket hunting, no repair — the brief is
 * explicit that a parsing hack would hide exactly the finding this spike is
 * meant to produce.
 */
export async function POST(request: Request) {
  const routeStartedAt = Date.now();

  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause) {
    return NextResponse.json(
      { error: `The upload could not be read: ${(cause as Error).message}` },
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

  const audio: AudioPart[] = [];
  let totalBytes = 0;
  for (const entry of form.getAll('audio')) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    totalBytes += entry.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          provider: llm.id,
          error: `The turns total ${(totalBytes / 1024 / 1024).toFixed(2)} MB, over the ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB upload limit. Record shorter replies.`,
        },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(await entry.arrayBuffer());
    audio.push({
      base64: buffer.toString('base64'),
      mimeType: entry.type || 'audio/webm',
    });
  }

  if (audio.length === 0) {
    return NextResponse.json(
      { provider: llm.id, error: 'No turn audio was supplied.' },
      { status: 400 },
    );
  }

  try {
    const completion = await llm.complete({
      system: liveScoreSystemPrompt(),
      userText: liveScoreUserPrompt(audio.length),
      audio,
      json: true,
    });

    const outcome = parseStrict(completion.text);

    return NextResponse.json({
      provider: llm.id,
      providerLabel: llm.label,
      model: completion.model,
      turnCount: audio.length,
      totalBytes,
      outcome,
      timings: {
        modelMs: completion.ms,
        serverTotalMs: Date.now() - routeStartedAt,
      },
    });
  } catch (cause) {
    if (cause instanceof ProviderError) {
      return NextResponse.json(
        {
          provider: cause.provider,
          providerLabel: llm.label,
          error: `${llm.label} could not score this exchange: ${cause.reason}`,
        },
        { status: cause.status && cause.status >= 400 ? cause.status : 502 },
      );
    }
    return NextResponse.json(
      {
        provider: llm.id,
        providerLabel: llm.label,
        error: `${llm.label} could not score this exchange: ${(cause as Error).message}`,
      },
      { status: 502 },
    );
  }
}

const BANDS = ['Poor', 'Good', 'Best'];
const EMOTION_BANDS = [0, 40, 80, 100];

/**
 * Strict. The text must be a JSON object as it stands. Anything else is
 * reported as a parse failure with the raw output attached.
 */
function parseStrict(raw: string): LiveScoreOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (cause) {
    return {
      ok: false,
      raw,
      parseError: `La réponse n’est pas du JSON valide : ${(cause as Error).message}`,
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, raw, parseError: 'La réponse n’est pas un objet JSON.' };
  }
  const o = parsed as Record<string, unknown>;

  if (typeof o.overall_band !== 'string' || !BANDS.includes(o.overall_band)) {
    return {
      ok: false,
      raw,
      parseError: `overall_band invalide : ${JSON.stringify(o.overall_band)}`,
    };
  }

  const emotion =
    typeof o.emotion_band === 'string' ? Number(o.emotion_band) : o.emotion_band;
  if (typeof emotion !== 'number' || !EMOTION_BANDS.includes(emotion)) {
    return {
      ok: false,
      raw,
      parseError: `emotion_band invalide : ${JSON.stringify(o.emotion_band)}`,
    };
  }

  for (const key of ['what_went_wrong', 'how_to_improve', 'correct_example']) {
    if (typeof o[key] !== 'string' || o[key] === '') {
      return { ok: false, raw, parseError: `${key} est vide ou absent.` };
    }
  }

  if (!Array.isArray(o.criteria) || o.criteria.length === 0) {
    return { ok: false, raw, parseError: 'criteria est absent ou vide.' };
  }

  const criteria = [];
  for (const [index, entry] of o.criteria.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, raw, parseError: `criteria[${index}] n’est pas un objet.` };
    }
    const c = entry as Record<string, unknown>;
    if (typeof c.name !== 'string' || c.name === '') {
      return { ok: false, raw, parseError: `criteria[${index}].name est vide.` };
    }
    if (typeof c.band !== 'string' || !BANDS.includes(c.band)) {
      return {
        ok: false,
        raw,
        parseError: `criteria[${index}].band invalide : ${JSON.stringify(c.band)}`,
      };
    }
    if (typeof c.cited_moment !== 'string' || c.cited_moment === '') {
      return {
        ok: false,
        raw,
        parseError: `criteria[${index}].cited_moment est vide.`,
      };
    }
    criteria.push({
      name: c.name,
      band: c.band as LiveScoreResult['overall_band'],
      cited_moment: c.cited_moment,
    });
  }

  return {
    ok: true,
    raw,
    result: {
      overall_band: o.overall_band as LiveScoreResult['overall_band'],
      criteria,
      emotion_band: emotion as LiveScoreResult['emotion_band'],
      what_went_wrong: o.what_went_wrong as string,
      how_to_improve: o.how_to_improve as string,
      correct_example: o.correct_example as string,
    },
  };
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}
