/**
 * Lire les conditions d'accès qu'une annonce énonce dans sa description.
 *
 * « GARANTIE LOYERS IMPAYES : Revenu minimum de 1 975 € net / CDI hors période
 * d'essai / indépendant depuis plus de 2 ans / étudiant avec garants ». Cette
 * phrase décide de la candidature, et elle est perdue au milieu de neuf cents
 * caractères de prose. On la lit ici pour pouvoir la comparer au profil.
 *
 * CHAQUE RÈGLE EXIGE SON MOT-CLÉ. Un montant croisé au hasard n'est pas un
 * revenu exigé — les descriptions sont pleines de dépôts de garantie,
 * d'honoraires et d'états des lieux. Sans la mention explicite, on ne rend rien
 * (§17), et l'annonce est alors traitée comme accessible.
 */

import {
  NO_REQUIREMENTS,
  type AcceptedSituation,
  type GuaranteeKind,
  type TenancyRequirements,
} from '@maioun/shared';
import { cleanText } from './text.js';
import { parseFrenchNumber } from './parse-number.js';

/**
 * Bornes de plausibilité d'un revenu mensuel exigé, en euros.
 *
 * En dessous de 500 € on lit un dépôt de garantie ou des honoraires ; au-dessus
 * de 20 000 € un prix de vente ou un revenu annuel.
 */
const INCOME_BOUNDS = { min: 500, max: 20_000 };

/**
 * Les espaces qui séparent les milliers, écrites en points de code.
 *
 * « 1 975 € » emploie souvent une espace INSÉCABLE ou une espace fine : les
 * traitements de texte les posent seules. Recopiée telle quelle dans le
 * fichier, elle serait invisible à la relecture — et le linteur la refuse,
 * pour cette raison même.
 */
const ESPACES_MILLIERS = '\\s\\u00a0\\u202f';

/** Le montant, avec ses séparateurs, suivi de sa monnaie. */
const MONTANT = `([\\d${ESPACES_MILLIERS}.,]+)\\s*(?:\\u20ac|eur\\b|euros?\\b|eur\\w*)`;

/**
 * Le revenu minimum exigé, et lui seul.
 *
 * FORMES RELEVÉES sur les annonces actives, toutes DIRIGÉES — le montant doit
 * être attribué au revenu, jamais simplement voisin du mot. On essaie dans
 * l'ordre et l'on retient la première qui donne un montant plausible.
 *
 *   « Revenus minimum requis : 1 971 € nets / mois »
 *   « Revenu minimum de 4 540€ » / « Revenu minimum NET de 3 530€ »
 *   « Il faut un minimum de 1 858 € net/mois »
 *   « revenu minimum pour y accéder : 3 800€ »
 *   « Revenus minimum exigés (Garantie des Loyers Impayés) : 1 850 €/mois »
 *   « revenus exigés de 2.430 € par mois »
 *   « il faut avoir des revenus nets de 4 050 € »
 *
 * Le « NET » qui s'intercale entre « minimum » et « de » est la raison pour
 * laquelle les qualificatifs sont optionnels ET répétables dans la première.
 *
 * « ressources minimales (salaire de 3 600€ pour une personne ou 4 000€ pour
 * un couple) » reste DEHORS : deux seuils, et rien ne dit lequel s'applique.
 */
const MIN_INCOME_FORMS: readonly RegExp[] = [
  new RegExp(
    'revenus?\\s+(?:mensuels?\\s+)?(?:minimum|minimal\\w*)' +
      `\\s*(?:net\\w*|requis|exig\\w*|\\s)*[:\\s]*(?:de\\s+)?(?:net\\w*\\s+)?(?:de\\s+)?${MONTANT}`,
    'i',
  ),
  // « net » après le montant est indispensable : sans lui, « il faut un
  // minimum de 500 € » parlerait de n'importe quoi.
  new RegExp(`il\\s+faut\\s+un\\s+minimum\\s+de\\s+${MONTANT}\\s*net`, 'i'),
  new RegExp(`revenus?\\s+minimum\\s+pour\\s+y\\s+acc[ée]der\\s*:?\\s*${MONTANT}`, 'i'),
  new RegExp(`revenus?\\s+minimum\\s+exig[ée]*s?\\s*\\([^)]{0,80}\\)\\s*:\\s*${MONTANT}`, 'i'),
  new RegExp(`revenus?\\s+(?:nets?\\s+)?exig[ée]*s?\\s+de\\s+${MONTANT}`, 'i'),
  new RegExp(`revenus?\\s+nets?\\s+de\\s+${MONTANT}`, 'i'),
];

/**
 * Le seuil écrit en MULTIPLE DU LOYER, la forme dominante sous GLI.
 *
 *   « il faut percevoir 3 fois le montant du loyer »
 *   « revenus 2,7 x supérieurs au loyer »
 *   « revenus nets mensuels équivalents à trois fois le montant du loyer »
 *
 * Il ne donne aucun euro : c'est le loyer de l'annonce qui le convertira, et
 * seulement là où il est connu.
 */
const RENT_MULTIPLE =
  /(\d(?:[.,]\d+)?|deux|trois|quatre)\s*(?:fois|x)\s+(?:sup[ée]rieurs?\s+au\s+(?:montant\s+du\s+)?loyer|le\s+montant\s+du\s+loyer|le\s+loyer)/i;

/** Les multiples écrits en toutes lettres, tels qu'on les rencontre. */
const MULTIPLE_WORDS: Readonly<Record<string, number>> = { deux: 2, trois: 3, quatre: 4 };

/**
 * Bornes de plausibilité d'un multiple du loyer.
 *
 * Deux et demi à trois est la règle du marché, trois et demi chez les assureurs
 * les plus stricts. En dehors, on lit autre chose — « 3 fois par semaine ».
 */
const MULTIPLE_BOUNDS = { min: 2, max: 4 };

/**
 * UN MULTIPLE ATTRIBUÉ AU GARANT N'EST PAS EXIGÉ DU CANDIDAT.
 *
 * « Garants avec des revenus 3 fois supérieurs au loyer » ne dit rien des
 * revenus du locataire ; le lui appliquer le déclarerait hors dossier à tort.
 * On regarde donc les quarante caractères qui précèdent.
 */
const GUARANTOR_INCOME = /\bgarant/i;
const GUARANTOR_LOOKBACK = 40;

/**
 * L'assurance loyers impayés, sous ses écritures courantes.
 *
 * CE N'EST PAS UN DÉTAIL ADMINISTRATIF. Quand elle est là, c'est l'ASSUREUR qui
 * fixe les critères, et il n'accorde pas d'exception : un dossier hors grille
 * est refusé avant d'arriver au bailleur.
 *
 * « assurance » compte autant que « garantie » : cinq annonces n'écrivent que
 * « ASSURANCE LOYERS IMPAYES », et elles posent la même exigence.
 */
const INSURED_RENT = /(?:garantie|assurance)\s+(?:des\s+)?loyers?\s+impay|\bGLI\b/i;

/**
 * Les garanties nommément citées.
 *
 * `physical` — un garant en chair et en os — demande une tournure qui l'EXIGE.
 * Le seul mot « garant » ne suffit pas : « dépôt de garantie » figure dans
 * quatre cent quarante et une descriptions, et n'a rien à voir.
 */
const GUARANTEES: readonly (readonly [RegExp, GuaranteeKind])[] = [
  [/\bvisale\b/i, 'visale'],
  [/\bgarant\s?me\b/i, 'garantme'],
  [/\bstudapart\b/i, 'studapart'],
  [
    /\bgarants?\s+(?:obligatoire|exig|requis|demand)|\bavec\s+garants?\b|\bcaution\s+solidaire\b|\bse\s+porter\s+caution\b/i,
    'physical',
  ],
];

/**
 * Les tournures par lesquelles une annonce REFUSE une garantie.
 *
 * « pas de visale, pas de garant », « nous n'acceptons pas les garanties Visale
 * ou GarantMe ». Deux annonces sur les actives, et ce sont exactement celles
 * qu'un dossier Visale ne doit pas viser.
 */
const REFUSAL = /(?:pas\s+de|n['’]accept\w+\s+pas(?:\s+(?:les?|la)\s+garanties?)?)/gi;

/**
 * CE QUI PRÉCÈDE FAIT TOUT. « inutile d'appeler si vous n'avez pas de garant »
 * EXIGE un garant — c'est l'inverse d'un refus. Le verbe « avoir » juste avant
 * la négation la retourne, et suffit à l'écarter.
 */
const REFUSAL_INVERTED = /av(?:ez|ons|oir)|disposez|poss[eè]d/i;
const REFUSAL_LOOKBACK = 40;

/**
 * Longueur de la négation, en caractères.
 *
 * « pas de visale, pas de garant » : chaque refus nomme sa garantie dans la
 * foulée. Au-delà, on ramasserait la phrase suivante.
 */
const REFUSAL_WINDOW = 60;

/** Les garanties telles qu'elles se nomment dans un refus, sans exigence. */
const REFUSED_NAMES: readonly (readonly [RegExp, GuaranteeKind])[] = [
  [/\bvisale\b/i, 'visale'],
  [/\bgarant\s?me\b/i, 'garantme'],
  [/\bstudapart\b/i, 'studapart'],
  [/\bgarants?\b/i, 'physical'],
];

/**
 * Frontière de mot qui tient devant une lettre ACCENTUÉE.
 *
 * `\b` se définit sur `[A-Za-z0-9_]` : entre une espace et un « é », il n'y a
 * donc aucune frontière, et `/\bétudiant/` ne trouve jamais « / étudiant avec
 * garants ». Le mot était silencieusement absent de toutes les listes de
 * critères — celles-là mêmes qui commencent presque toujours par un accent.
 */
const AVANT_MOT = '(?<![\\p{L}\\p{N}])';

/**
 * Les situations professionnelles nommément acceptées.
 *
 * « CDI » exige le mot entier en capitales : c'est ainsi qu'il s'écrit, et le
 * chercher sans casse le trouverait dans « cdi » au milieu d'un mot.
 */
const SITUATIONS: readonly (readonly [RegExp, AcceptedSituation])[] = [
  [/\bCDI\b/, 'cdi'],
  [
    new RegExp(`${AVANT_MOT}(?:ind[ée]pendant|freelance|profession\\s+lib[ée]rale)`, 'iu'),
    'independant',
  ],
  [new RegExp(`${AVANT_MOT}[ée]tudiant`, 'iu'), 'etudiant'],
  [new RegExp(`${AVANT_MOT}fonctionnaire`, 'iu'), 'fonctionnaire'],
];

/**
 * Longueur de la phrase de critères, en caractères.
 *
 * « GARANTIE LOYERS IMPAYES : Revenu minimum de 1 975 € net / CDI hors période
 * d'essai / indépendant depuis plus de 2 ans / étudiant avec garants » en fait
 * cent quarante. Deux cents laissent la marge d'une formulation plus longue
 * sans atteindre le paragraphe suivant.
 */
const CRITERIA_WINDOW = 200;

/** Le revenu exigé en euros, et l'endroit du texte où il est écrit. */
function findMinIncome(text: string): { amount: number; index: number } | null {
  for (const form of MIN_INCOME_FORMS) {
    const match = form.exec(text);
    if (match?.[1] === undefined) continue;
    const parsed = parseFrenchNumber(match[1]);
    if (parsed !== null && parsed >= INCOME_BOUNDS.min && parsed <= INCOME_BOUNDS.max) {
      return { amount: parsed, index: match.index };
    }
  }
  return null;
}

/** Le multiple du loyer exigé du CANDIDAT, et l'endroit où il est écrit. */
function findMultiplier(text: string): { value: number; index: number } | null {
  const match = RENT_MULTIPLE.exec(text);
  if (match?.[1] === undefined) return null;

  const avant = text.slice(Math.max(0, match.index - GUARANTOR_LOOKBACK), match.index);
  if (GUARANTOR_INCOME.test(avant)) return null;

  const value =
    MULTIPLE_WORDS[match[1].toLowerCase()] ?? parseFrenchNumber(match[1].replace('.', ','));
  if (value === null || value < MULTIPLE_BOUNDS.min || value > MULTIPLE_BOUNDS.max) return null;
  return { value, index: match.index };
}

/** Les garanties que le texte refuse nommément. */
function findRefused(text: string): readonly GuaranteeKind[] {
  const refused = new Set<GuaranteeKind>();
  for (const match of text.matchAll(REFUSAL)) {
    const avant = text.slice(Math.max(0, match.index - REFUSAL_LOOKBACK), match.index);
    if (REFUSAL_INVERTED.test(avant)) continue;

    let fenetre = text.slice(match.index, match.index + REFUSAL_WINDOW);
    for (const [pattern, kind] of REFUSED_NAMES) {
      if (!pattern.test(fenetre)) continue;
      refused.add(kind);
      // « GarantMe » contient « Garant » : sans ce retrait, un refus de
      // GarantMe passerait aussi pour un refus de garant physique.
      fenetre = fenetre.replace(new RegExp(pattern.source, 'gi'), ' ');
    }
  }
  return [...refused];
}

/**
 * Les conditions d'accès lues dans un texte libre.
 *
 * @returns toujours un objet — `NO_REQUIREMENTS` quand rien n'est énoncé, ce
 *          qui est le cas de la grande majorité des annonces.
 */
export function parseRequirements(text: string | null | undefined): TenancyRequirements {
  const cleaned = cleanText(text);
  if (cleaned === '') return NO_REQUIREMENTS;

  const income = findMinIncome(cleaned);
  // Le multiple ne sert qu'à DÉFAUT d'un montant : quand l'annonce écrit les
  // deux, c'est le montant qu'elle a calculé elle-même qui fait foi.
  const multiplier = income === null ? findMultiplier(cleaned) : null;

  const insuredRent = INSURED_RENT.test(cleaned) ? true : null;

  const refusedGuarantees = findRefused(cleaned);
  // Une garantie refusée n'est pas une garantie acceptée : « pas de visale »
  // contient « visale », et l'annonce serait rendue accueillante à l'inverse
  // de ce qu'elle dit.
  const guarantees = GUARANTEES.filter(
    ([pattern, kind]) => pattern.test(cleaned) && !refusedGuarantees.includes(kind),
  ).map(([, kind]) => kind);

  /**
   * LES SITUATIONS NE SE LISENT QUE DANS LEUR PHRASE. « étudiant » apparaît
   * partout — « idéal étudiant », « quartier étudiant » — et ne dit alors rien
   * de ce que le bailleur accepte. On ne les cherche donc que dans le segment
   * qui suit la mention du revenu ou de l'assurance, c'est-à-dire là où le
   * bailleur énumère ses critères.
   */
  const debut = income?.index ?? multiplier?.index ?? INSURED_RENT.exec(cleaned)?.index ?? null;
  const segment = debut === null ? '' : cleaned.slice(debut, debut + CRITERIA_WINDOW);
  const situations = SITUATIONS.filter(([pattern]) => pattern.test(segment)).map(
    ([, kind]) => kind,
  );

  return {
    minIncome: income?.amount ?? null,
    incomeMultiplier: multiplier?.value ?? null,
    insuredRent,
    guarantees,
    refusedGuarantees,
    situations,
  };
}
