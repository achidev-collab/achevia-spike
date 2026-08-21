import {
  SYSTEM_PROMPT,
  USER_INSTRUCTION_AUDIO,
  USER_INSTRUCTION_TEXT,
} from '@/lib/scoring/prompt';
import {
  ProviderError,
  parseScoreResult,
  type ProviderResponse,
  type ScoreRequest,
  type ScoringProvider,
} from '@/lib/scoring/types';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Google AI Studio, native audio input. */
export function createGeminiProvider(): ScoringProvider {
  return {
    id: 'gemini',
    label: 'Gemini',
    async score(request: ScoreRequest): Promise<ProviderResponse> {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ProviderError(
          'gemini',
          'GEMINI_API_KEY is not set on the server.',
        );
      }
      const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

      const parts = request.audio
        ? [
            {
              inline_data: {
                mime_type: request.audio.mimeType,
                data: request.audio.base64,
              },
            },
            { text: USER_INSTRUCTION_AUDIO },
          ]
        : [{ text: USER_INSTRUCTION_TEXT(request.text ?? '') }];

      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(
          `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
              contents: [{ role: 'user', parts }],
              generationConfig: {
                temperature: 0,
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
              },
            }),
          },
        );
      } catch (cause) {
        throw new ProviderError(
          'gemini',
          `the request to Google AI Studio failed: ${(cause as Error).message}`,
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(
          'gemini',
          describeHttpError(response.status, body),
          response.status,
        );
      }

      const payload = (await response.json()) as GeminiResponse;
      const modelMs = Date.now() - startedAt;

      const blocked = payload.promptFeedback?.blockReason;
      if (blocked) {
        throw new ProviderError('gemini', `blocked the request: ${blocked}`);
      }

      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();

      if (!text) {
        const finish = payload.candidates?.[0]?.finishReason;
        throw new ProviderError(
          'gemini',
          `returned no text${finish ? ` (finishReason: ${finish})` : ''}.`,
        );
      }

      return { result: parseScoreResult('gemini', text), modelMs, model };
    },
  };
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    band: { type: 'STRING', enum: ['Poor', 'Good', 'Best'] },
    cited_moment: { type: 'STRING' },
    what_went_wrong: { type: 'STRING' },
    how_to_improve: { type: 'STRING' },
    emotion_band: { type: 'INTEGER' },
  },
  required: [
    'band',
    'cited_moment',
    'what_went_wrong',
    'how_to_improve',
    'emotion_band',
  ],
  propertyOrdering: [
    'band',
    'cited_moment',
    'what_went_wrong',
    'how_to_improve',
    'emotion_band',
  ],
} as const;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

function describeHttpError(status: number, body: string): string {
  const detail = extractMessage(body);
  if (status === 400 && /API key not valid/i.test(detail)) {
    return `the API key was rejected (HTTP 400). ${detail}`;
  }
  if (status === 401 || status === 403) {
    return `the API key was rejected (HTTP ${status}). ${detail}`;
  }
  if (status === 429) {
    return `the free tier quota or rate limit is exhausted (HTTP 429). ${detail}`;
  }
  return `HTTP ${status}. ${detail}`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message ?? body.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}
