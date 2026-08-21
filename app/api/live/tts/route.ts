import { NextResponse } from 'next/server';

import { checkDeterministic } from '@/lib/live/manifest';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Speaks a generated guest line with a French voice.
 *
 * Unlike /api/tts, the text here is dynamic, so the lexical containment
 * check runs again on the server before anything is sent to Deepgram. That
 * closes the loop: an out-of-syllabus line cannot be spoken even if it
 * reached the client somehow.
 */

const DEFAULT_FR_VOICE = 'aura-2-pandora-en';
const VOICE_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_TEXT_LENGTH = 600;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'The request body was not valid JSON.' },
      { status: 400 },
    );
  }

  const text = (body as { text?: string })?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'No text was supplied.' },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      {
        provider: 'Deepgram',
        error: `The line is ${text.length} characters, over the ${MAX_TEXT_LENGTH} character limit for one guest turn.`,
      },
      { status: 400 },
    );
  }

  // Second gate: never speak a line that breaks the manifest. This runs
  // before the API key is even looked at, so refusing an out-of-syllabus
  // line never depends on TTS being configured.
  const verdict = checkDeterministic(text);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        provider: 'Deepgram',
        error: `Refused to speak this line: ${verdict.reason}${verdict.matched ? ` (« ${verdict.matched} »)` : ''}`,
        containmentBlocked: true,
      },
      { status: 422 },
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'DEEPGRAM_API_KEY is not set on the server.' },
      { status: 500 },
    );
  }

  // Voice model name, not a secret. Overridable per request so the French
  // voice can be swapped while the right one is being chosen.
  const requestedVoice = (body as { voice?: string })?.voice;
  const voice =
    typeof requestedVoice === 'string' && VOICE_PATTERN.test(requestedVoice)
      ? requestedVoice
      : process.env.DEEPGRAM_TTS_MODEL_FR || DEFAULT_FR_VOICE;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        provider: 'Deepgram',
        error: `The request to Deepgram failed: ${(cause as Error).message}`,
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return NextResponse.json(
      {
        provider: 'Deepgram',
        voice,
        error: `Deepgram returned HTTP ${response.status} for voice "${voice}". ${extractMessage(detail)}`,
      },
      { status: response.status },
    );
  }

  const audio = await response.arrayBuffer();

  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store',
      'x-deepgram-ms': String(Date.now() - startedAt),
      'x-deepgram-voice': voice,
    },
  });
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.err_msg ?? parsed?.message ?? parsed?.error ?? body.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}
