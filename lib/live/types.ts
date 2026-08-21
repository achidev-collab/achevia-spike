import type { Mood } from '@/lib/live/manifest';
import type { Band, EmotionBand, ProviderId } from '@/lib/scoring/types';

/** One containment failure. Every rejection is logged, never suppressed. */
export interface ContainmentRejection {
  turnNumber: number;
  /** Which generation attempt produced it, 1-based. */
  attempt: number;
  /** The rejected line, in full. */
  line: string;
  reason: string;
  /** Which layer caught it. */
  caughtBy: 'deterministic' | 'model';
  /** The exact substring the lexical rule matched, when it was that layer. */
  matched?: string;
}

export interface LiveTurnTimings {
  /** Deciding whether the mood trigger fired, from the student's audio. */
  intentMs: number | null;
  /** All generation attempts for this turn, summed. */
  generateMs: number;
  /** All model-side containment checks for this turn, summed. */
  containmentMs: number;
  /** Client-observed round trip for POST /api/live/turn. */
  roundTripMs?: number;
}

export interface LiveTurnResult {
  turnNumber: number;
  guestLine: string;
  mood: Mood;
  moodShiftedThisTurn: boolean;
  rejections: ContainmentRejection[];
  timings: LiveTurnTimings;
  model: string;
}

export const CRITERIA = [
  'Comprendre le client',
  'Clarté et pertinence',
  'Informations factuelles transmises',
  'Ton et langage',
  'Gestion de la solution',
] as const;

export type CriterionName = (typeof CRITERIA)[number];

export interface CriterionScore {
  name: string;
  band: Band;
  /** Must quote a specific French phrase the student actually said. */
  cited_moment: string;
}

export interface LiveScoreResult {
  overall_band: Band;
  criteria: CriterionScore[];
  emotion_band: EmotionBand;
  what_went_wrong: string;
  how_to_improve: string;
  /** A model French reply drawn only from manifest vocabulary. */
  correct_example: string;
}

/**
 * Scoring outcome. When the provider does not return clean JSON the raw
 * output is surfaced verbatim rather than repaired — the brief is explicit
 * that parsing hacks would hide the finding.
 */
export type LiveScoreOutcome =
  | { ok: true; result: LiveScoreResult; raw: string }
  | { ok: false; raw: string; parseError: string };

export interface LiveScoreResponse {
  provider: ProviderId;
  providerLabel: string;
  model: string;
  outcome: LiveScoreOutcome;
  timings: { modelMs: number; serverTotalMs: number };
}
