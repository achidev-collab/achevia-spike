import { NextResponse } from 'next/server';

import { getScoringProvider } from '@/lib/scoring/provider';
import { ProviderError } from '@/lib/scoring/types';

export const runtime = 'nodejs';
// Vercel's default serverless timeout is too short for audio scoring.
export const maxDuration = 60;

/** Vercel Hobby caps the serverless request body. Reject early and loudly. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const routeStartedAt = Date.now();

  let form: FormData;
  try {
    form = await request.formData();
  } catch (cause) {
    return NextResponse.json(
      {
        provider: null,
        error: `The upload could not be read: ${(cause as Error).message}. If the clip was long, record a shorter one — the serverless request body limit is about 4.5 MB.`,
      },
      { status: 400 },
    );
  }
  const receivedAt = Date.now();

  const requestedProvider = asString(form.get('provider'));
  let provider;
  try {
    provider = getScoringProvider(requestedProvider);
  } catch (cause) {
    return NextResponse.json(
      { provider: requestedProvider ?? null, error: (cause as Error).message },
      { status: 500 },
    );
  }

  const text = asString(form.get('text'));
  const file = form.get('audio');

  let scoreRequest;
  let audioBytes = 0;
  let audioMimeType: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          provider: provider.id,
          error: `The recording is ${(file.size / 1024 / 1024).toFixed(2)} MB, over the ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(1)} MB upload limit. Record a shorter clip.`,
        },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    audioBytes = buffer.byteLength;
    audioMimeType = file.type || 'audio/webm';
    scoreRequest = {
      audio: { base64: buffer.toString('base64'), mimeType: audioMimeType },
    };
  } else if (text && text.trim() !== '') {
    scoreRequest = { text: text.trim() };
  } else {
    return NextResponse.json(
      {
        provider: provider.id,
        error: 'The request carried neither audio nor text.',
      },
      { status: 400 },
    );
  }

  try {
    const { result, modelMs, model } = await provider.score(scoreRequest);
    return NextResponse.json({
      provider: provider.id,
      providerLabel: provider.label,
      model,
      result,
      timings: {
        // Time spent reading the uploaded body inside the route.
        serverReceiveMs: receivedAt - routeStartedAt,
        // Time spent inside the provider HTTP call.
        modelMs,
        // Total time inside this route.
        serverTotalMs: Date.now() - routeStartedAt,
      },
      audio: audioMimeType
        ? { bytes: audioBytes, mimeType: audioMimeType }
        : null,
    });
  } catch (cause) {
    if (cause instanceof ProviderError) {
      return NextResponse.json(
        {
          provider: cause.provider,
          providerLabel: provider.label,
          error: `${provider.label} could not score this attempt: ${cause.reason}`,
        },
        { status: cause.status && cause.status >= 400 ? cause.status : 502 },
      );
    }
    return NextResponse.json(
      {
        provider: provider.id,
        providerLabel: provider.label,
        error: `${provider.label} could not score this attempt: ${(cause as Error).message}`,
      },
      { status: 502 },
    );
  }
}

function asString(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' ? value : null;
}
