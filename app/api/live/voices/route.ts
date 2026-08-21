import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Diagnostic: which Deepgram TTS voices this project can actually use.
 *
 * /roleplay-live needs a French voice, and Deepgram answers a name it does
 * not sell to this project with 403 rather than 404, which makes guessing
 * names useless. This lists what the key is entitled to. It returns model
 * names and languages only — never the key.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { provider: 'Deepgram', error: 'DEEPGRAM_API_KEY is not set on the server.' },
      { status: 500 },
    );
  }

  let response: Response;
  try {
    response = await fetch('https://api.deepgram.com/v1/models', {
      headers: { Authorization: `Token ${apiKey}` },
    });
  } catch (cause) {
    return NextResponse.json(
      { provider: 'Deepgram', error: `The request failed: ${(cause as Error).message}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return NextResponse.json(
      { provider: 'Deepgram', error: `HTTP ${response.status}. ${detail.slice(0, 300)}` },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as {
    tts?: Array<{ name?: string; canonical_name?: string; language?: string }>;
  };

  const tts = (payload.tts ?? []).map((model) => ({
    name: model.canonical_name ?? model.name ?? null,
    language: model.language ?? null,
  }));

  const names = tts.map((model) => model.name).filter(Boolean) as string[];
  return NextResponse.json({
    total: names.length,
    french: names.filter((name) => /-fr(-|$)|french/i.test(name)),
    nonEnglish: names.filter((name) => !/-en(-|$)/i.test(name)),
    all: names.sort(),
  });
}
