import { NextResponse } from 'next/server';

import { SCENARIO } from '@/lib/scenario';

export const runtime = 'nodejs';
// Vercel's default serverless timeout is too short for a model call.
export const maxDuration = 60;

const DEFAULT_MODEL = 'aura-2-thalia-en';

/**
 * The two lines the guest can speak. The client asks for one by name so no
 * guest text is ever authored or altered on the client.
 */
const SCRIPTS = {
  opening: SCENARIO.guestOpeningLine,
  pms_information: SCENARIO.guestSpokenInformationScript,
} as const;

type ScriptId = keyof typeof SCRIPTS;

export async function POST(request: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        provider: 'Deepgram',
        error: 'DEEPGRAM_API_KEY is not set on the server.',
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'The request body was not valid JSON.' },
      { status: 400 },
    );
  }

  const script = (body as { script?: string })?.script;
  if (!script || !(script in SCRIPTS)) {
    return NextResponse.json(
      {
        provider: 'Deepgram',
        error: `Unknown script "${String(script)}". Expected "opening" or "pms_information".`,
      },
      { status: 400 },
    );
  }

  const model = process.env.DEEPGRAM_TTS_MODEL || DEFAULT_MODEL;
  const text = SCRIPTS[script as ScriptId];

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
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
        error: describeDeepgramError(response.status, detail),
      },
      { status: response.status },
    );
  }

  const audio = await response.arrayBuffer();
  const deepgramMs = Date.now() - startedAt;

  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/mpeg',
      'Cache-Control': 'no-store',
      'x-deepgram-ms': String(deepgramMs),
      'x-deepgram-model': model,
    },
  });
}

function describeDeepgramError(status: number, detail: string): string {
  const message = extractMessage(detail);
  if (status === 401 || status === 403) {
    return `Deepgram rejected the API key (HTTP ${status}). ${message}`;
  }
  if (status === 429) {
    return `Deepgram rate limit or credit balance is exhausted (HTTP 429). ${message}`;
  }
  return `Deepgram returned HTTP ${status}. ${message}`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.err_msg ?? parsed?.message ?? parsed?.error ?? body.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}
