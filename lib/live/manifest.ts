/**
 * CONTENT MANIFEST — hard constraint for /roleplay-live.
 *
 * PLACEHOLDER. Written against the Achevia Content Framework's Chapter 1
 * scope, not the authored chapter manifest. Do not treat as canonical.
 *
 * The model may freely vary phrasing, turn order, emotion intensity and how
 * situations combine. It may NOT introduce vocabulary, procedures, facts,
 * emotions or task types outside this file. Ingredients locked, recipe free.
 */

export const MANIFEST = {
  department: 'Front Desk',
  module: 'Module 1',
  chapter:
    "Chapter 1 — « Arrivée, vérification de la réservation et organisation simple du séjour »",
  level: 'B1',
  studyLanguage: 'FRENCH',
  maxTurns: 5,
  seed:
    'Client de passage, sans réservation, hall calme, milieu d’après-midi.',
} as const;

export const ALLOWED_VOCABULARY = [
  'Salutations et politesse : bonjour, bonsoir, bienvenue, monsieur, madame, je vous en prie, avec plaisir',
  'Réservation : réservation, réserver, disponibilité, chambre libre, nom de la réservation, sans réservation, passage',
  'Séjour : nombre de nuits, nombre de personnes, date d’arrivée, date de départ, séjour',
  'Types de chambre (mention simple uniquement) : chambre simple, chambre double',
  'Confirmation : confirmer, vérifier, c’est noté, tout est en ordre',
  'Questions pratiques de base : petit-déjeuner (horaires seulement), wifi, ascenseur, bagages',
  'Clôture polie : bon séjour, n’hésitez pas, je reste à votre disposition',
] as const;

export const ALLOWED_PROCEDURES = [
  'Accueillir le client',
  'Identifier s’il a une réservation ou s’il est de passage',
  'Demander le nom',
  'Demander le nombre de personnes et le nombre de nuits',
  'Confirmer verbalement les informations',
  'Répondre à une question pratique simple',
  'Clôturer poliment',
] as const;

export const ALLOWED_FACTS = [
  'Nombre de nuits : 1 à 3',
  'Nombre de personnes : 1 ou 2',
  'Petit-déjeuner servi de 7h à 10h',
  'Wifi disponible gratuitement',
  'Chambre simple ou chambre double',
] as const;

export const ALLOWED_EMOTIONS = [
  'Calme',
  'Légèrement fatigué',
  'Légèrement pressé',
] as const;

export const OUT_OF_SYLLABUS = [
  'Prix, tarifs, paiement, carte bancaire, facture',
  'Surclassement, statut VIP, programme de fidélité',
  'Animaux, demandes spéciales, allergies',
  'Réclamations, conflits, colère',
  'Room service, restaurant, spa, activités',
  'Annulation, modification de réservation',
  'Pièce d’identité, passeport',
  'Anything in English',
] as const;

export type Mood = 'calme' | 'presse';

export const MOOD_LABEL: Record<Mood, string> = {
  calme: 'Calme',
  presse: 'Légèrement pressé',
};

/**
 * Mood trigger, from the scenario seed: mood starts CALME and shifts to
 * LÉGÈREMENT PRESSÉ if the student takes more than one turn without asking
 * for the name or without moving toward availability.
 */
export const MOOD_TRIGGER_DESCRIPTION =
  'L’humeur passe de « calme » à « légèrement pressé » si le stagiaire laisse passer plus d’un tour sans demander le nom et sans avancer vers la disponibilité.';

/* ── Containment: deterministic layer ─────────────────────────────────── */

export interface DenyRule {
  /** Which out-of-syllabus category this belongs to. */
  category: string;
  pattern: RegExp;
}

/**
 * Lexical deny-list over the explicitly out-of-syllabus list. This runs
 * before the model-based semantic check and cannot fail or time out, so a
 * banned topic can never reach the screen because a check errored.
 */
export const DENY_RULES: DenyRule[] = [
  {
    category: 'Prix, tarifs, paiement, carte bancaire, facture',
    pattern:
      /\b(prix|tarifs?|tarifaire|paiement|payer|payez|payé|règlement|régler|carte\s+(bancaire|de\s+crédit|bleue)|facture|factures|coût|coûte|coûter|euros?|combien\s+ça\s+coûte|acompte|caution|dépôt)\b|€/i,
  },
  {
    category: 'Surclassement, statut VIP, programme de fidélité',
    pattern:
      /\b(surclassement|surclasser|surclassé|upgrade|vip|fidélité|points\s+fidélité|programme\s+de\s+fidélité|membre\s+privilège)\b/i,
  },
  {
    category: 'Animaux, demandes spéciales, allergies',
    pattern:
      /\b(animal|animaux|chien|chienne|chat|chatte|allergies?|allergique|demande\s+spéciale|demandes\s+spéciales|intolérance)\b/i,
  },
  {
    category: 'Réclamations, conflits, colère',
    pattern:
      /\b(réclamations?|réclamer|plaintes?|me\s+plaindre|inacceptable|scandaleux|colère|en\s+colère|furieux|furieuse|directeur|responsable\s+de\s+cet\s+hôtel)\b/i,
  },
  {
    category: 'Room service, restaurant, spa, activités',
    pattern:
      /\b(room\s*service|service\s+en\s+chambre|restaurants?|brasserie|bar\b|spa\b|piscine|sauna|hammam|salle\s+de\s+sport|excursions?|activités?|visites?\s+guidées?)\b/i,
  },
  {
    category: 'Annulation, modification de réservation',
    pattern:
      /\b(annulations?|annuler|annulé|annulée|modifier\s+(ma|la|une)\s+réservation|modification\s+de\s+(ma|la)\s+réservation|reporter\s+(ma|la)\s+réservation)\b/i,
  },
  {
    category: 'Pièce d’identité, passeport',
    pattern:
      /\b(pièce\s+d’identité|pièce\s+d'identité|piece\s+d'identite|passeports?|carte\s+d’identité|carte\s+d'identité|justificatif\s+d’identité)\b/i,
  },
];

/**
 * English-only tokens with no French homograph. A generated "French" line
 * containing any of these is out of syllabus ("Anything in English").
 */
const ENGLISH_MARKERS =
  /\b(the|and|you|your|yours|please|thank|thanks|hello|hi|would|could|should|have|has|with|for|is|are|was|were|sorry|welcome|breakfast|room|rooms|night|nights|name|available|availability|guest|stay|booking|booked|check[-\s]?in|good\s+(morning|afternoon|evening))\b/i;

export interface DeterministicVerdict {
  ok: boolean;
  /** Populated when ok is false. */
  reason?: string;
  matched?: string;
}

export function checkDeterministic(line: string): DeterministicVerdict {
  for (const rule of DENY_RULES) {
    const match = line.match(rule.pattern);
    if (match) {
      return {
        ok: false,
        reason: `Hors syllabus — ${rule.category}`,
        matched: match[0],
      };
    }
  }

  const english = line.match(ENGLISH_MARKERS);
  if (english) {
    return {
      ok: false,
      reason: 'Hors syllabus — Anything in English',
      matched: english[0],
    };
  }

  return { ok: true };
}

/** Rendered into every prompt so both providers receive identical wording. */
export function manifestAsPromptBlock(): string {
  return `MANIFESTE DE CONTENU — CONTRAINTE ABSOLUE

${MANIFEST.department} · ${MANIFEST.module} · ${MANIFEST.chapter}
Niveau ${MANIFEST.level} · Langue d’étude : ${MANIFEST.studyLanguage}

Tu peux varier librement la formulation, l’ordre des tours, l’intensité de
l’émotion et la façon dont les situations se combinent. Tu ne peux PAS
introduire de vocabulaire, de procédures, de faits, d’émotions ou de types
de tâches en dehors de ce manifeste. Les ingrédients sont fixes, la recette
est libre.

VOCABULAIRE ET THÈMES AUTORISÉS
${ALLOWED_VOCABULARY.map((line) => `- ${line}`).join('\n')}

PROCÉDURES AUTORISÉES
${ALLOWED_PROCEDURES.map((line) => `- ${line}`).join('\n')}

FAITS AUTORISÉS (le client ne peut énoncer ou demander que ceci)
${ALLOWED_FACTS.map((line) => `- ${line}`).join('\n')}

ÉMOTIONS AUTORISÉES DU CLIENT
${ALLOWED_EMOTIONS.map((line) => `- ${line}`).join('\n')}

TYPES DE TÂCHES AUTORISÉS
- Conversation parlée uniquement

EXPLICITEMENT HORS SYLLABUS — le client ne doit JAMAIS aborder ceci
${OUT_OF_SYLLABUS.map((line) => `- ${line}`).join('\n')}

SITUATION DE DÉPART
${MANIFEST.seed}`;
}
