import { ProviderError, type ProviderId } from '@/lib/scoring/types';

/**
 * A generic completion layer for /roleplay-live. Both providers must handle
 * both the turn-by-turn guest generation and the end-of-exchange scoring, so
 * they are expressed through one interface that takes the same system
 * prompt, the same user text and the same audio for either job.
 *
 * Kept separate from lib/scoring/* so the two existing screens' pipeline is
 * untouched by this screen's changes.
 */

export interface AudioPart {
  base64: string;
  mimeType: string;
}

export interface LlmRequest {
  system: string;
  userText: string;
  /** Audio is sent natively. There is no transcription step anywhere here. */
  audio?: AudioPart[];
  /** Ask the provider for JSON. Never used to repair a malformed reply. */
  json?: boolean;
}

export interface LlmResponse {
  text: string;
  ms: number;
  model: string;
}

export interface LiveLlm {
  id: ProviderId;
  label: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/* ── Qwen ─────────────────────────────────────────────────────────────── */

const QWEN_DEFAULT_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_DEFAULT_MODEL = 'qwen3-omni-flash';

function createQwenLlm(): LiveLlm {
  return {
    id: 'qwen',
    label: 'Qwen',
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        throw new ProviderError(
          'qwen',
          'DASHSCOPE_API_KEY is not set on the server.',
        );
      }
      const baseUrl = process.env.QWEN_BASE_URL || QWEN_DEFAULT_BASE_URL;
      const model =
        process.env.QWEN_LIVE_MODEL || process.env.QWEN_MODEL || QWEN_DEFAULT_MODEL;

      const content: unknown[] = [];
      for (const part of request.audio ?? []) {
        content.push({
          type: 'input_audio',
          input_audio: {
            data: `data:${part.mimeType};base64,${part.base64}`,
            format: formatFromMime(part.mimeType),
          },
        });
      }
      content.push({ type: 'text', text: request.userText });

      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            modalities: ['text'],
            // The omni models only emit streamed output on this endpoint.
            stream: true,
            messages: [
              { role: 'system', content: [{ type: 'text', text: request.system }] },
              { role: 'user', content },
            ],
          }),
        });
      } catch (cause) {
        throw new ProviderError(
          'qwen',
          `the request to Model Studio failed: ${(cause as Error).message}`,
        );
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new ProviderError(
          'qwen',
          describeHttpError('qwen', response.status, body),
          response.status,
        );
      }

      const text = await readQwenStream(response);
      return { text, ms: Date.now() - startedAt, model };
    },
  };
}

async function readQwenStream(response: Response): Promise<string> {
  if (!response.body) {
    throw new ProviderError('qwen', 'returned a response with no body.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let out = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineAt: number;
    while ((newlineAt = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineAt).trim();
      buffer = buffer.slice(newlineAt + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '' || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') out += delta;
      } catch {
        // Partial or keepalive line.
      }
    }
  }
  return out;
}

/* ── Gemini ───────────────────────────────────────────────────────────── */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';

function createGeminiLlm(): LiveLlm {
  return {
    id: 'gemini',
    label: 'Gemini',
    async complete(request: LlmRequest): Promise<LlmResponse> {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new ProviderError(
          'gemini',
          'GEMINI_API_KEY is not set on the server.',
        );
      }
      const model =
        process.env.GEMINI_LIVE_MODEL || process.env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL;

      const parts: unknown[] = [];
      for (const part of request.audio ?? []) {
        parts.push({
          inline_data: { mime_type: part.mimeType, data: part.base64 },
        });
      }
      parts.push({ text: request.userText });

      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(
          `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: request.system }] },
              contents: [{ role: 'user', parts }],
              generationConfig: {
                temperature: request.json ? 0 : 0.8,
                ...(request.json ? { responseMimeType: 'application/json' } : {}),
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
          describeHttpError('gemini', response.status, body),
          response.status,
        );
      }

      const payload = (await response.json()) as GeminiResponse;
      const ms = Date.now() - startedAt;

      const blocked = payload.promptFeedback?.blockReason;
      if (blocked) {
        throw new ProviderError('gemini', `blocked the request: ${blocked}`);
      }

      const text =
        payload.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? '')
          .join('')
          .trim() ?? '';

      if (text === '') {
        const finish = payload.candidates?.[0]?.finishReason;
        throw new ProviderError(
          'gemini',
          `returned no text${finish ? ` (finishReason: ${finish})` : ''}.`,
        );
      }

      return { text, ms, model };
    },
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

/* ── Selection ────────────────────────────────────────────────────────── */

const factories: Record<ProviderId, () => LiveLlm> = {
  qwen: createQwenLlm,
  gemini: createGeminiLlm,
};

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'qwen' || value === 'gemini';
}

/**
 * Resolve the provider for one request. An explicit value comes from the
 * selector at the top of /roleplay-live; otherwise SCORING_PROVIDER decides.
 * There is no mock provider and no fallback.
 */
export function getLiveLlm(requested?: string | null): LiveLlm {
  if (requested != null && requested !== '') {
    if (!isProviderId(requested)) {
      throw new Error(
        `Unknown provider "${requested}". Expected "qwen" or "gemini".`,
      );
    }
    return factories[requested]();
  }
  const configured = process.env.SCORING_PROVIDER;
  if (!configured) {
    throw new Error(
      'SCORING_PROVIDER is not set on the server. Set it to "qwen" or "gemini".',
    );
  }
  if (!isProviderId(configured)) {
    throw new Error(
      `SCORING_PROVIDER is "${configured}". Expected "qwen" or "gemini".`,
    );
  }
  return factories[configured]();
}

/* ── Shared helpers ───────────────────────────────────────────────────── */

function describeHttpError(
  provider: ProviderId,
  status: number,
  body: string,
): string {
  const detail = extractMessage(body);
  if (status === 401 || status === 403) {
    return `the API key was rejected (HTTP ${status}). ${detail}`;
  }
  if (status === 400 && /API key not valid/i.test(detail)) {
    return `the API key was rejected (HTTP 400). ${detail}`;
  }
  if (status === 429) {
    return `the free tier quota or rate limit is exhausted (HTTP 429). ${detail}`;
  }
  if (status === 503) {
    return `the model is overloaded or unavailable (HTTP 503). ${detail}`;
  }
  return `HTTP ${status}. ${detail}`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message ?? parsed?.message ?? body.slice(0, 400);
  } catch {
    return body.slice(0, 400);
  }
}

function formatFromMime(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
  };
  return map[base] ?? base.replace('audio/', '');
}
