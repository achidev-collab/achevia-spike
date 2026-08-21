/**
 * SCENARIO CONTENT — used exactly as supplied in the spike brief.
 *
 * PLACEHOLDER CONTENT. Structurally correct per the Achevia Content Framework
 * but not the authored chapter. Do not treat as canonical.
 *
 * Nothing in this file may be invented, extended or embellished. Every guest
 * line and every field value is verbatim from the brief.
 */

export const SCENARIO = {
  department: 'Front Desk',
  module: 'Module 1',
  moduleTitle: 'Arrival, Reservation Check & Basic Stay Mapping',
  chapter: 'Chapter 1 (basics)',
  set: 'Set 1 — calm',
  level: 'B1',
  studyLanguage: 'English',
  mood: 'calm',
  description:
    'Unbooked walk-in guest, quiet lobby, mid-afternoon. The guest has no reservation. The student must recognise this is a walk-in and ask for the name to check availability — NOT to look up a booking.',
  /** Sent to Deepgram TTS on /roleplay-spike. */
  guestOpeningLine:
    "Good afternoon. I don't have anything booked — would you have a room free for two nights?",
  /** Sent to Deepgram TTS on /pms-spike, verbatim. */
  guestSpokenInformationScript:
    'Of course. My first name is Claire, C-L-A-I-R-E. Last name Fontaine, F-O-N-T-A-I-N-E. My phone number is zero six, four four, seven one, nine two, zero three. My email is claire dot fontaine at mail dot com — that’s C-L-A-I-R-E dot F-O-N-T-A-I-N-E at mail dot com. And you said the rate was one hundred and forty euros per night?',
} as const;

/**
 * Reference material for the scoring prompt only.
 * Never shown to the student. Never used as a keyword checklist.
 */
export const EXPECTED_SHAPE_OF_A_GOOD_REPLY = [
  'Greets the guest warmly and professionally.',
  'Recognises this is a walk-in with no existing reservation.',
  "Asks for the guest's name in order to check availability.",
  'Confirms or asks the number of guests and the length of stay.',
  'Keeps a calm, unhurried register matching the quiet lobby.',
] as const;

export const CRITERION_INTENT_NOTES = [
  'Understand the guest — Poor: treats it as a booking lookup, asks for a reservation number or confirmation. Good: recognises the walk-in and moves to availability. Best: recognises it and confirms guest count and stay length in the same turn.',
  'Clarity and relevance — the reply answers the actual question asked and does not wander into unrelated services.',
  'Factual information conveyed — nothing stated that the scenario does not support. The student must not invent rates, room types or availability.',
  'Tone and language — polite, professional, appropriate to a calm lobby.',
  'Solution handling — the reply advances toward a resolution rather than stalling.',
] as const;

export const BAND_RULE =
  'Intent detected = Good. Intent detected with richer hospitality phrasing = Best. Intent NOT detected = Poor, regardless of how polished the language was.';

/** PMS FIELD SET — Chapter 1 */
export type PmsFieldKey =
  | 'first_name'
  | 'last_name'
  | 'phone'
  | 'email'
  | 'room_rate';

export interface PmsField {
  key: PmsFieldKey;
  label: string;
  expected: string;
}

export const PMS_FIELDS: readonly PmsField[] = [
  { key: 'first_name', label: 'first_name', expected: 'Claire' },
  { key: 'last_name', label: 'last_name', expected: 'Fontaine' },
  { key: 'phone', label: 'phone', expected: '0644719203' },
  { key: 'email', label: 'email', expected: 'claire.fontaine@mail.com' },
  { key: 'room_rate', label: 'room_rate', expected: '140' },
] as const;

/**
 * MATCHING RULES, exactly as specified.
 * Binary correct/incorrect per field. No partial credit, no negative marking.
 */
export function isFieldCorrect(key: PmsFieldKey, raw: string): boolean {
  const value = raw.trim();
  if (value === '') return false;

  switch (key) {
    case 'phone': {
      // Ignore all spacing, dots, dashes and parentheses. Digits must match exactly.
      const digits = value.replace(/[\s.\-()]/g, '');
      return digits === '0644719203';
    }
    case 'email':
      // Exact string after lowercasing.
      return value.toLowerCase() === 'claire.fontaine@mail.com';
    case 'room_rate': {
      // Accept "140", "140.00", "€140", "140 EUR". Wrong number fails.
      const normalised = value.toLowerCase().replace(/\s/g, '');
      return (
        normalised === '140' ||
        normalised === '140.00' ||
        normalised === '€140' ||
        normalised === '€140.00' ||
        normalised === '140eur' ||
        normalised === '140.00eur'
      );
    }
    case 'first_name':
      // Case-insensitive.
      return value.toLowerCase() === 'claire';
    case 'last_name':
      return value.toLowerCase() === 'fontaine';
  }
}
