import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * TIMING-RIG ROUTE. Represents "the student's reply for this turn is
 * captured and queued" in a fixed (non-branching) multi-turn sequence: it
 * accepts the audio or typed reply, measures how long that took to arrive,
 * and returns immediately. No model call happens here — in this spike, the
 * guest's next line never depends on what the student said, so there is
 * nothing to classify per turn. This isolates pure record-and-upload cost
 * from the cost a real branch-classification step would add.
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
  const receivedAt = Date.now();

  const turn = form.get('turn');
  const file = form.get('audio');
  const text = form.get('text');

  let kind: 'audio' | 'text';
  let bytes = 0;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `The recording is over the ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(1)} MB limit.` },
        { status: 413 },
      );
    }
    kind = 'audio';
    bytes = file.size;
    // Read fully so the timing includes the same body-transfer cost a real
    // storage write would pay, without actually storing anything.
    await file.arrayBuffer();
  } else if (typeof text === 'string' && text.trim() !== '') {
    kind = 'text';
    bytes = new TextEncoder().encode(text).length;
  } else {
    return NextResponse.json(
      { error: 'The request carried neither audio nor text.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    turn: typeof turn === 'string' ? turn : null,
    kind,
    bytes,
    timings: {
      serverReceiveMs: receivedAt - routeStartedAt,
      serverTotalMs: Date.now() - routeStartedAt,
    },
  });
}
