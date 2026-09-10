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

/**
 * Le revenu minimum exigé, et lui seul.
 *
 * QUATRE FORMES RELEVÉES sur les annonces réelles du 2026-09-10, toutes
 * DIRIGÉES — le montant doit être attribué au revenu, jamais simplement voisin
 * du mot :
 *
 *   « Revenus minimum requis : 1 971 € nets / mois »
 *   « Revenu minimum de 4 540€ »
 *   « revenus minimum requis de 4 216 EUR »
 *   « Revenu minimum NET de 3 530€ »
 *
 * Le « NET » qui s'intercale entre « minimum » et « de » est la raison pour
 * laquelle les qualificatifs sont optionnels ET répétables dans l'expression.
 */
const MIN_INCOME = new RegExp(
  'revenus?\\s+(?:mensuels?\\s+)?(?:minimum|minimal\\w*)' +
    '\\s*(?:net\\w*|requis|exig\\w*|\\s)*[:\\s]*(?:de\\s+)?(?:net\\w*\\s+)?(?:de\\s+)?' +
    `([\\d${ESPACES_MILLIERS}.,]+)\\s*(?:\\u20ac|eur\\b|euros?\\b)`,
  'i',
);

/**
 * L'assurance loyers impayés, sous ses trois écritures.
 *
 * CE N'EST PAS UN DÉTAIL ADMINISTRATIF. Quand elle est là, c'est l'ASSUREUR qui
 * fixe les critères, et il n'accorde pas d'exception : un dossier hors grille
 * est refusé avant d'arriver au bailleur.
 */
const INSURED_RENT = /garantie\s+(?:des\s+)?loyers?\s+impay|\bGLI\b/i;

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

/**
 * Les conditions d'accès lues dans un texte libre.
 *
 * @returns toujours un objet — `NO_REQUIREMENTS` quand rien n'est énoncé, ce
 *          qui est le cas de la grande majorité des annonces.
 */
export function parseRequirements(text: string | null | undefined): TenancyRequirements {
  const cleaned = cleanText(text);
  if (cleaned === '') return NO_REQUIREMENTS;

  const match = MIN_INCOME.exec(cleaned);
  const parsed = match?.[1] !== undefined ? parseFrenchNumber(match[1]) : null;
  const minIncome =
    parsed !== null && parsed >= INCOME_BOUNDS.min && parsed <= INCOME_BOUNDS.max ? parsed : null;

  const insuredRent = INSURED_RENT.test(cleaned) ? true : null;

  const guarantees = GUARANTEES.filter(([pattern]) => pattern.test(cleaned)).map(
    ([, kind]) => kind,
  );

  /**
   * LES SITUATIONS NE SE LISENT QUE DANS LEUR PHRASE. « étudiant » apparaît
   * partout — « idéal étudiant », « quartier étudiant » — et ne dit alors rien
   * de ce que le bailleur accepte. On ne les cherche donc que dans le segment
   * qui suit la mention du revenu ou de l'assurance, c'est-à-dire là où le
   * bailleur énumère ses critères.
   */
  const debut = match?.index ?? INSURED_RENT.exec(cleaned)?.index ?? null;
  const segment = debut === null ? '' : cleaned.slice(debut, debut + CRITERIA_WINDOW);
  const situations = SITUATIONS.filter(([pattern]) => pattern.test(segment)).map(
    ([, kind]) => kind,
  );

  return { minIncome, insuredRent, guarantees, situations };
}
