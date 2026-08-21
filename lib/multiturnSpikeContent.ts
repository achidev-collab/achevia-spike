/**
 * TIMING-RIG CONTENT ONLY. Not real Achevia dialogue.
 *
 * This screen exists to answer one question: how much wall-clock latency
 * does a fixed-length multi-turn guest exchange add per guest, ahead of
 * committing to a real scripted-branch content pipeline for a 5-guest
 * simulation. The scenario brief for the two production screens supplied
 * exactly one guest line — nothing exists for a second or third turn — so
 * inventing "real" Achevia dialogue here would violate the same content
 * rule that governs the roleplay and PMS scenario content. These three
 * lines are deliberately, visibly placeholder: generic, unscored, and
 * labeled as such everywhere they appear.
 *
 * The sequence is fixed, not branching: each turn's guest line is the same
 * regardless of what the student says. That isolates the turn-loop latency
 * (guest speaks, student replies, guest speaks again) from the added cost
 * a real branch-classification step would introduce.
 */

export interface SpikeTurn {
  id: 'turn_1' | 'turn_2' | 'turn_3';
  turnNumber: 1 | 2 | 3;
  /** Sent verbatim to Deepgram TTS. Placeholder only. */
  guestLine: string;
}

export const SPIKE_TURNS: readonly SpikeTurn[] = [
  {
    id: 'turn_1',
    turnNumber: 1,
    guestLine: 'Good afternoon. Do you have a room free for tonight?',
  },
  {
    id: 'turn_2',
    turnNumber: 2,
    guestLine: 'And would that rate include breakfast?',
  },
  {
    id: 'turn_3',
    turnNumber: 3,
    guestLine: 'Thank you. What time is check-in?',
  },
] as const;

export function findSpikeTurn(id: string): SpikeTurn | undefined {
  return SPIKE_TURNS.find((turn) => turn.id === id);
}
