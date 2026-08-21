export type Band = 'Poor' | 'Good' | 'Best';
export type EmotionBand = 0 | 40 | 80 | 100;

export interface ScoreResult {
  band: Band;
  /** A specific quote or moment from what the student actually said. */
  cited_moment: string;
  what_went_wrong: string;
  how_to_improve: string;
  /** Interpersonal "Emotion" sub-dimension. 80 is the pass line. */
  emotion_band: EmotionBand;
}

export type ProviderId = 'qwen' | 'gemini';

export interface ScoreRequest {
  /** Raw student audio. Mutually exclusive with `text`. */
  audio?: { base64: string; mimeType: string };
  /** Typed fallback so the scoring prompt can be tested without Deepgram. */
  text?: string;
}

export interface ProviderResponse {
  result: ScoreResult;
  /** Milliseconds spent inside the provider HTTP call. */
  modelMs: number;
  /** Exact model id that answered. */
  model: string;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly reason: string,
    readonly status?: number,
  ) {
    super(`${provider}: ${reason}`);
    this.name = 'ProviderError';
  }
}

export interface ScoringProvider {
  id: ProviderId;
  label: string;
  score(request: ScoreRequest): Promise<ProviderResponse>;
}

const BANDS: Band[] = ['Poor', 'Good', 'Best'];
const EMOTION_BANDS: EmotionBand[] = [0, 40, 80, 100];

/**
 * Validate the model's JSON. A malformed response is an error, never a
 * silently-repaired or defaulted score.
 */
export function parseScoreResult(
  provider: ProviderId,
  raw: string,
): ScoreResult {
  const trimmed = stripCodeFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ProviderError(
      provider,
      `returned text that is not valid JSON: ${truncate(trimmed)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new ProviderError(provider, 'returned JSON that is not an object');
  }
  const o = parsed as Record<string, unknown>;

  if (typeof o.band !== 'string' || !BANDS.includes(o.band as Band)) {
    throw new ProviderError(
      provider,
      `returned an invalid band: ${JSON.stringify(o.band)}`,
    );
  }
  const emotion = typeof o.emotion_band === 'string'
    ? Number(o.emotion_band)
    : o.emotion_band;
  if (
    typeof emotion !== 'number' ||
    !EMOTION_BANDS.includes(emotion as EmotionBand)
  ) {
    throw new ProviderError(
      provider,
      `returned an invalid emotion_band: ${JSON.stringify(o.emotion_band)}`,
    );
  }
  for (const key of ['cited_moment', 'what_went_wrong', 'how_to_improve']) {
    if (typeof o[key] !== 'string' || o[key] === '') {
      throw new ProviderError(provider, `returned an empty or missing ${key}`);
    }
  }

  return {
    band: o.band as Band,
    cited_moment: o.cited_moment as string,
    what_went_wrong: o.what_went_wrong as string,
    how_to_improve: o.how_to_improve as string,
    emotion_band: emotion as EmotionBand,
  };
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
