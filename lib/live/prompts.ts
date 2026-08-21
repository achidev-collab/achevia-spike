import {
  MANIFEST,
  MOOD_LABEL,
  MOOD_TRIGGER_DESCRIPTION,
  type Mood,
  manifestAsPromptBlock,
} from '@/lib/live/manifest';
import { CRITERIA } from '@/lib/live/types';

/**
 * Both providers receive these exact strings, so the comparison between them
 * is a comparison of the models, not of two different prompts.
 */

/* ── Guest line generation ────────────────────────────────────────────── */

export function guestSystemPrompt(mood: Mood): string {
  return `Tu joues le rôle d’un CLIENT dans un hôtel français. Tu n’es pas le réceptionniste. Le stagiaire qui te répond est le réceptionniste.

${manifestAsPromptBlock()}

TON HUMEUR ACTUELLE : ${MOOD_LABEL[mood]}
${MOOD_TRIGGER_DESCRIPTION}
Ta façon de parler doit refléter cette humeur. « Légèrement pressé » veut dire des phrases plus courtes et plus directes, jamais de la colère ni une réclamation.

RÈGLES DE PRODUCTION
- Réponds en FRANÇAIS uniquement.
- Produis UNE SEULE réplique de client, deux phrases au maximum.
- Ne produis que la réplique elle-même. Pas de guillemets, pas de nom de personnage, pas de didascalie, pas de commentaire, pas de traduction.
- Reste strictement dans le manifeste. Si tu es tenté d’aborder un sujet hors syllabus, choisis plutôt un sujet autorisé.
- Tu es un client de passage, sans réservation.`;
}

export function guestOpeningUserPrompt(): string {
  return `C’est le début de l’échange. Le stagiaire n’a encore rien dit. Produis la première réplique du client qui entre dans le hall. Une seule réplique, en français.`;
}

export function guestReplyUserPrompt(
  turnNumber: number,
  history: { guest: string; }[],
): string {
  const transcript = history
    .map((entry, index) => `Tour ${index + 1} — toi (le client) : « ${entry.guest} »`)
    .join('\n');

  return `Voici tes répliques précédentes dans cet échange :
${transcript}

L’audio joint est la réponse que le stagiaire (le réceptionniste) vient de te donner. Écoute-la et produis ta réplique suivante, la réplique numéro ${turnNumber} de l’échange. Une seule réplique, en français, deux phrases au maximum.`;
}

/* ── Containment check, model layer ───────────────────────────────────── */

export const CONTAINMENT_SYSTEM_PROMPT = `Tu es un vérificateur de conformité. On te donne une réplique de client générée pour un exercice de formation hôtelière, et un manifeste de contenu. Tu dois dire si la réplique reste à l’intérieur du manifeste.

${manifestAsPromptBlock()}

RÈGLES DE RÉPONSE
- Si la réplique reste entièrement dans le manifeste, réponds exactement : CONFORME
- Sinon, réponds sur une seule ligne : HORS-SUJET: <raison courte en français>
- Ne réponds rien d’autre. Pas de JSON, pas d’explication longue, pas de guillemets.`;

export function containmentUserPrompt(line: string): string {
  return `Réplique à vérifier :
${line}`;
}

/* ── Mood trigger check ───────────────────────────────────────────────── */

export const INTENT_SYSTEM_PROMPT = `Tu analyses la réponse parlée d’un stagiaire réceptionniste dans un hôtel français.

On te demande une seule chose : est-ce que le stagiaire a demandé le nom du client, OU est-ce qu’il a avancé vers la disponibilité d’une chambre (vérifier s’il y a de la place, demander le nombre de nuits ou le nombre de personnes) ?

RÈGLES DE RÉPONSE
- Si oui, réponds exactement : OUI
- Si non, réponds exactement : NON
- Ne réponds rien d’autre.`;

export const INTENT_USER_PROMPT = `L’audio joint est la réponse du stagiaire. Réponds OUI ou NON.`;

/* ── End-of-exchange scoring ──────────────────────────────────────────── */

export const LIVE_SCORE_RESPONSE_SHAPE = `{
  "overall_band": "Poor" | "Good" | "Best",
  "criteria": [
    { "name": string, "band": "Poor" | "Good" | "Best", "cited_moment": string }
  ],
  "emotion_band": 0 | 40 | 80 | 100,
  "what_went_wrong": string,
  "how_to_improve": string,
  "correct_example": string
}`;

export function liveScoreSystemPrompt(): string {
  return `Tu évalues la performance parlée d’un stagiaire réceptionniste dans un hôtel français. Tu reçois l’audio brut de TOUTES ses réponses de l’échange, dans l’ordre. Évalue ce qu’il a réellement dit.

${manifestAsPromptBlock()}

CRITÈRES DE COMMUNICATION — chacun noté Poor, Good ou Best
${CRITERIA.map((name, index) => `${index + 1}. ${name}`).join('\n')}

Le champ "criteria" doit contenir exactement ces cinq critères, avec ces noms exacts, dans cet ordre.

"cited_moment" doit citer une phrase française précise que le stagiaire a réellement prononcée. Une raison générique n’est pas acceptable. Si un passage est inaudible ou vide, dis-le explicitement dans le cited_moment concerné.

"emotion_band" est la sous-dimension « Émotion » de l’axe Interpersonnel : 0 échec, 40 faible, 80 compétent et c’est la ligne de réussite, 100 fort. Utilise uniquement ces quatre valeurs.

"correct_example" est une réponse modèle en français, construite UNIQUEMENT à partir du vocabulaire du manifeste ci-dessus.

Tout le texte de retour doit être en FRANÇAIS.

FORMAT DE SORTIE
Réponds avec un seul objet JSON et rien d’autre. Pas de texte avant, pas de texte après, pas de bloc de code.
${LIVE_SCORE_RESPONSE_SHAPE}`;
}

export function liveScoreUserPrompt(turnCount: number): string {
  return `Les ${turnCount} fichiers audio joints sont les réponses du stagiaire, dans l’ordre des tours 1 à ${turnCount} de l’échange. Le scénario était : ${MANIFEST.seed}

Évalue l’ensemble de l’échange et réponds uniquement avec l’objet JSON.`;
}

/* ── Hint ─────────────────────────────────────────────────────────────── */

/**
 * The one Communication tip behind the collapsed hint box. Fixed text drawn
 * from the manifest's own allowed procedures — not generated, so opening the
 * hint costs no model call and cannot drift out of syllabus.
 */
export const COMMUNICATION_HINT = {
  title: 'Pourquoi on répond ainsi',
  body: 'Accueillez le client, puis identifiez tout de suite s’il a une réservation ou s’il est de passage. Demandez le nom, puis le nombre de personnes et le nombre de nuits. Confirmez à voix haute ce que vous avez noté avant de passer à autre chose.',
} as const;
