import { createGeminiProvider } from '@/lib/scoring/gemini';
import { createQwenProvider } from '@/lib/scoring/qwen';
import { ProviderError, type ProviderId, type ScoringProvider } from '@/lib/scoring/types';

const factories: Record<ProviderId, () => ScoringProvider> = {
  qwen: createQwenProvider,
  gemini: createGeminiProvider,
};

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'qwen' || value === 'gemini';
}

/**
 * Resolve the provider for one request. An explicit `requested` value comes
 * from the comparison toggle on /roleplay-spike; otherwise SCORING_PROVIDER
 * decides. There is no mock provider and no fallback: if the chosen provider
 * cannot answer, the request fails with its name and reason.
 */
export function getScoringProvider(requested?: string | null): ScoringProvider {
  if (requested != null && requested !== '') {
    if (!isProviderId(requested)) {
      throw new Error(
        `Unknown scoring provider "${requested}". Expected "qwen" or "gemini".`,
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

export { ProviderError };
