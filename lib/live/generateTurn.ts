import type { AudioPart, LiveLlm } from '@/lib/live/llm';
import { checkDeterministic, type Mood } from '@/lib/live/manifest';
import {
  CONTAINMENT_SYSTEM_PROMPT,
  containmentUserPrompt,
  guestOpeningUserPrompt,
  guestReplyUserPrompt,
  guestSystemPrompt,
} from '@/lib/live/prompts';
import type { ContainmentRejection } from '@/lib/live/types';

/**
 * Generate one guest line and run it through the containment check before it
 * is allowed out of this function. An out-of-syllabus line is never returned
 * — it is logged and regenerated. If every attempt fails, the caller gets an
 * explicit failure rather than a line that broke the manifest.
 */

export const MAX_GENERATION_ATTEMPTS = 3;

export interface GenerateTurnInput {
  llm: LiveLlm;
  turnNumber: number;
  mood: Mood;
  history: { guest: string }[];
  /** The student's reply for this turn. Absent on the opening line. */
  studentAudio?: AudioPart;
}

export type GenerateTurnOutput =
  | {
      ok: true;
      line: string;
      rejections: ContainmentRejection[];
      generateMs: number;
      containmentMs: number;
      model: string;
    }
  | {
      ok: false;
      rejections: ContainmentRejection[];
      generateMs: number;
      containmentMs: number;
      model: string;
      error: string;
    };

export async function generateContainedTurn(
  input: GenerateTurnInput,
): Promise<GenerateTurnOutput> {
  const { llm, turnNumber, mood, history, studentAudio } = input;

  const system = guestSystemPrompt(mood);
  const userText =
    turnNumber === 1
      ? guestOpeningUserPrompt()
      : guestReplyUserPrompt(turnNumber, history);

  const rejections: ContainmentRejection[] = [];
  let generateMs = 0;
  let containmentMs = 0;
  let model = '';

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const generated = await llm.complete({
      system,
      userText:
        attempt === 1
          ? userText
          : `${userText}\n\nATTENTION : ta tentative précédente est sortie du manifeste et a été rejetée. Reste strictement dans le vocabulaire, les faits et les procédures autorisés.`,
      audio: studentAudio ? [studentAudio] : undefined,
    });
    generateMs += generated.ms;
    model = generated.model;

    const line = tidy(generated.text);
    if (line === '') {
      rejections.push({
        turnNumber,
        attempt,
        line: generated.text,
        reason: 'Réplique vide',
        caughtBy: 'deterministic',
      });
      continue;
    }

    // Layer 1: lexical. Cannot fail or time out.
    const lexical = checkDeterministic(line);
    if (!lexical.ok) {
      rejections.push({
        turnNumber,
        attempt,
        line,
        reason: lexical.reason ?? 'Hors syllabus',
        caughtBy: 'deterministic',
        matched: lexical.matched,
      });
      continue;
    }

    // Layer 2: semantic, by the same provider. Plain-text verdict, so a
    // model that is bad at JSON cannot break the containment check itself.
    const verdict = await llm.complete({
      system: CONTAINMENT_SYSTEM_PROMPT,
      userText: containmentUserPrompt(line),
    });
    containmentMs += verdict.ms;

    const raw = verdict.text.trim();
    const conforms = /^conforme\b/i.test(raw);
    if (!conforms) {
      rejections.push({
        turnNumber,
        attempt,
        line,
        reason: raw === '' ? 'Vérificateur sans réponse' : raw,
        caughtBy: 'model',
      });
      continue;
    }

    return { ok: true, line, rejections, generateMs, containmentMs, model };
  }

  return {
    ok: false,
    rejections,
    generateMs,
    containmentMs,
    model,
    error: `Aucune réplique conforme au manifeste après ${MAX_GENERATION_ATTEMPTS} tentatives. Rien n’est affiché ni prononcé.`,
  };
}

/**
 * Strip the wrappers models add around a single line of dialogue. This is
 * presentation tidying on generated dialogue, not JSON repair — the scoring
 * path deliberately does no equivalent.
 */
function tidy(text: string): string {
  let line = text.trim();
  line = line.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim();
  line = line.replace(/^(client|guest|le client)\s*:\s*/i, '').trim();
  line = line.replace(/^[«"“']\s*/, '').replace(/\s*[»"”']$/, '').trim();
  return line;
}
