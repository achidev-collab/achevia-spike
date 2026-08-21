import {
  BAND_RULE,
  CRITERION_INTENT_NOTES,
  EXPECTED_SHAPE_OF_A_GOOD_REPLY,
  SCENARIO,
} from '@/lib/scenario';

export const RESPONSE_SHAPE = `{
  "band": "Poor" | "Good" | "Best",
  "cited_moment": string,
  "what_went_wrong": string,
  "how_to_improve": string,
  "emotion_band": 0 | 40 | 80 | 100
}`;

/**
 * The single scoring prompt. Both providers receive this exact text and the
 * exact same audio, so the two runs are comparable.
 */
export const SYSTEM_PROMPT = `You are scoring one spoken turn from a hospitality student practising front desk English. You are given the student's raw audio. Score what they actually said.

SCENARIO
${SCENARIO.department} · ${SCENARIO.module} "${SCENARIO.moduleTitle}" · ${SCENARIO.chapter} · ${SCENARIO.set} · Level ${SCENARIO.level} · Study language: ${SCENARIO.studyLanguage}
${SCENARIO.description}

The guest has just said, out loud:
"${SCENARIO.guestOpeningLine}"

EXPECTED SHAPE OF A GOOD STUDENT REPLY
This is your reference only. It is never shown to the student and it is not a keyword checklist. Do not reward the student for reciting these words; reward them for doing these things.
${EXPECTED_SHAPE_OF_A_GOOD_REPLY.map((line) => `- ${line}`).join('\n')}

SCORE AGAINST THESE FIVE COMMUNICATION CRITERIA, each Poor / Good / Best
1. Understand the guest
2. Clarity and relevance
3. Factual information conveyed
4. Tone and language
5. Solution handling

CRITERION INTENT NOTES
${CRITERION_INTENT_NOTES.map((line) => `- ${line}`).join('\n')}

BAND RULE
${BAND_RULE}

"band" is the single overall band across those five criteria.

EMOTION BAND
"emotion_band" is the Interpersonal "Emotion" sub-dimension, not a Communication criterion. 0 is fail, 40 is weak, 80 is competent and is the pass line, 100 is strong. Use only those four values.

CITED MOMENT
"cited_moment" must quote or point at a specific moment in what the student actually said. A generic reason is not acceptable. If the audio is empty, silent or unintelligible, say exactly that in cited_moment and band the attempt Poor.

OUTPUT
Reply with a single JSON object and nothing else. No prose, no code fence.
${RESPONSE_SHAPE}`;

export const USER_INSTRUCTION_AUDIO =
  "This is the student's spoken reply to the guest. Score it and reply with the JSON object only.";

export const USER_INSTRUCTION_TEXT = (text: string) =>
  `This is the student's reply to the guest, typed instead of spoken (the text-input fallback). Score it and reply with the JSON object only.\n\nStudent reply:\n"""${text}"""`;
