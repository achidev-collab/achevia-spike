import { NextResponse } from 'next/server';

import { findSpikeTurn } from '@/lib/multiturnSpikeContent';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * TIMING-RIG ROUTE. Speaks the fixed placeholder guest lines from
 * lib/multiturnSpikeContent.ts — never the real scenario content. Kept
 * separate from /api/tts so the placeholder lines can never be reached
 * through the production screens' route.
 */
export async function POST(request: Request) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'DEEPGRAM_API_KEY is not set on the server.' },
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

  const turnId = (body as { turn?: string })?.turn;
  const turn = turnId ? findSpikeTurn(turnId) : undefined;
  if (!turn) {
    return NextResponse.json(
      { provider: 'Deepgram', error: `Unknown turn "${String(turnId)}". Expected turn_1, turn_2 or turn_3.` },
      { status: 400 },
    );
  }

  const model = process.env.DEEPGRAM_TTS_MODEL || 'aura-2-thalia-en';

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
        body: JSON.stringify({ text: turn.guestLine }),
      },
    );
  } catch (cause) {
    return NextResponse.json(
      { provider: 'Deepgram', error: `The request to Deepgram failed: ${(cause as Error).message}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return NextResponse.json(
      { provider: 'Deepgram', error: `Deepgram returned HTTP ${response.status}. ${detail.slice(0, 300)}` },
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
      'x-turn-number': String(turn.turnNumber),
    },
  });
}
