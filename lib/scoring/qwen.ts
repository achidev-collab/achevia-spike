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

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-omni-flash';

/**
 * Qwen via Alibaba Cloud Model Studio, international endpoint,
 * OpenAI-compatible mode. The omni models accept audio input and only emit
 * streamed output, so the stream is aggregated here before parsing.
 */
export function createQwenProvider(): ScoringProvider {
  return {
    id: 'qwen',
    label: 'Qwen',
    async score(request: ScoreRequest): Promise<ProviderResponse> {
      const apiKey = process.env.DASHSCOPE_API_KEY;
      if (!apiKey) {
        throw new ProviderError(
          'qwen',
          'DASHSCOPE_API_KEY is not set on the server.',
        );
      }
      const baseUrl = process.env.QWEN_BASE_URL || DEFAULT_BASE_URL;
      const model = process.env.QWEN_MODEL || DEFAULT_MODEL;

      const userContent = request.audio
        ? [
            {
              type: 'input_audio',
              input_audio: {
                data: `data:${request.audio.mimeType};base64,${request.audio.base64}`,
                format: formatFromMime(request.audio.mimeType),
              },
            },
            { type: 'text', text: USER_INSTRUCTION_AUDIO },
          ]
        : [{ type: 'text', text: USER_INSTRUCTION_TEXT(request.text ?? '') }];

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
            stream: true,
            messages: [
              { role: 'system', content: [{ type: 'text', text: SYSTEM_PROMPT }] },
              { role: 'user', content: userContent },
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
        throw new ProviderError('qwen', describeHttpError(response.status, body), response.status);
      }

      const text = await readStream(response);
      const modelMs = Date.now() - startedAt;

      if (text.trim() === '') {
        throw new ProviderError('qwen', 'returned an empty response.');
      }

      return { result: parseScoreResult('qwen', text), modelMs, model };
    },
  };
}

async function readStream(response: Response): Promise<string> {
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
        // A partial or non-JSON keepalive line. Skip it.
      }
    }
  }
  return out;
}

function describeHttpError(status: number, body: string): string {
  const detail = extractMessage(body);
  if (status === 401 || status === 403) {
    return `the API key was rejected (HTTP ${status}). ${detail}`;
  }
  if (status === 429) {
    return `the free tier or rate limit is exhausted (HTTP 429). ${detail}`;
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
