/**
 * Parsers de champs d'annonce : prix, charges, surface, pièces, type, meublé,
 * code postal, téléphone, dates relatives.
 *
 * Chaque parser rend `null` dès qu'il n'est pas certain. Une valeur inventée
 * est bien plus coûteuse qu'une valeur absente : elle fausse silencieusement
 * les filtres et les scores (§17).
 */

import {
  NICE_DISTRICTS,
  SHORT_TERM_LEASE_FEATURE,
  STUDENT_HOUSING_FEATURE,
  type PropertyType,
} from '@maioun/shared';
import { cleanText, comparable, completeTruncatedWords } from './text.js';
import { extractNumber, parseFrenchNumber } from './parse-number.js';

/**
 * Bornes de plausibilité d'un loyer mensuel, en euros.
 * En dessous de 50 € il s'agit presque toujours d'un prix au m² ou d'un
 * fragment de référence ; au-dessus de 20 000 €, le plus souvent d'un prix de
 * vente (voir `LUXURY_RENT` pour l'exception).
 */
const PRICE_BOUNDS = { min: 50, max: 20_000 };

/**
 * Au-delà de 20 000 €, une villa de prestige se loue bel et bien (25 000 €/mois
 * chez Nicolas Pisani). On l'admet si le loyer au m² reste celui d'une location
 * haut de gamme : un prix de vente mal lu le dépasse de loin (350 000 € pour
 * 60 m², c'est 5 800 €/m²). Sans surface, rien ne permet de trancher.
 */
const LUXURY_RENT = { max: 100_000, maxPerSqm: 150 };

/** Bornes de plausibilité d'une surface habitable, en m². */
const AREA_BOUNDS = { min: 5, max: 1_000 };

/** Bornes de plausibilité des charges mensuelles, en euros. */
const CHARGES_BOUNDS = { min: 1, max: 2_000 };

export interface ParsedPrice {
  /** Loyer mensuel en euros, ou `null` si illisible. */
  readonly amount: number | null;
  /**
   * `true` si le texte indique explicitement « charges comprises »,
   * `false` s'il indique « hors charges », `null` s'il ne dit rien (§17).
   */
  readonly chargesIncluded: boolean | null;
}

/** Minuscules sans accents, ponctuation gardée : « € » et « / » comptent ici. */
function unaccentedLower(text: string | null | undefined): string {
  return cleanText(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const CONNECTOR = String.raw`(?:\/|\(|(?:par|per|la|a la|pour une?|each)\s+)`;
const EURO = String.raw`(?:€|eur(?:os?)?\b)`;

const SHORT_PERIODS = String.raw`(?:nuit(?:ee)?s?|semaines?|sem|jours?|nights?|weeks?|days?)\b`;

/**
 * Loyer à la nuit, à la semaine ou au jour, dans un champ de PRIX : « 700 €/sem. »,
 * « 95 € la nuit », « 450 per week », « weekly ». Ce n'est pas un loyer au mois.
 */
const SHORT_PERIOD_PRICE_FIELD = new RegExp(
  String.raw`\d\s*${EURO}\s*(?:ttc\s*)?(?:${CONNECTOR}\s*)?${SHORT_PERIODS}` +
    String.raw`|\d\s*${CONNECTOR}\s*${SHORT_PERIODS}` +
    String.raw`|\/\s*(?:nuit|semaine|sem|jour|night|week|day)\b` +
    String.raw`|\b(?:weekly|nightly|daily|hebdomadaire|hebdo)\b` +
    String.raw`|\b(?:par|per|a la)\s+(?:nuit(?:ee)?|semaine|night|week)\b`,
);

/**
 * Même idée dans une PROSE, plus stricte : devise exigée, et ni jour ni day —
 * « 10 € par jour de retard » ou « 2 fois par semaine » ne sont pas des loyers.
 */
const SHORT_PERIOD_PRICE_PROSE = new RegExp(
  String.raw`\d\s*${EURO}\s*(?:ttc\s*)?${CONNECTOR}\s*(?:nuit(?:ee)?s?|semaines?|sem|nights?|weeks?)\b`,
);

/** `true` si le champ de prix donne un tarif à la nuit, à la semaine ou au jour. */
export function isShortPeriodPrice(priceText: string | null | undefined): boolean {
  return SHORT_PERIOD_PRICE_FIELD.test(unaccentedLower(priceText));
}

/** `true` si le texte cite un montant à la nuit ou à la semaine. */
export function mentionsShortPeriodPrice(text: string | null | undefined): boolean {
  return SHORT_PERIOD_PRICE_PROSE.test(unaccentedLower(text));
}

/** Montant suivi de sa devise, ou nombre seul. */
const EURO_AMOUNT = new RegExp(String.raw`(\d[\d\s.,]*?)\s*${EURO}`, 'i');
const BARE_AMOUNT = /^\s*(\d[\d\s.,]*)\s*$/;

/** Loyer de prestige, admis au vu de la surface ; `null` sinon. */
function luxuryAmount(segment: string, area: number | null | undefined): number | null {
  if (area === null || area === undefined || area <= 0) return null;
  const fragment = EURO_AMOUNT.exec(segment)?.[1] ?? BARE_AMOUNT.exec(segment)?.[1];
  const value = fragment === undefined ? null : parseFrenchNumber(fragment);
  if (value === null || value <= PRICE_BOUNDS.max || value > LUXURY_RENT.max) return null;
  return value / area <= LUXURY_RENT.maxPerSqm ? value : null;
}

/**
 * Extrait un loyer mensuel.
 *
 * Le texte est d'abord coupé avant toute mention de charges, pour éviter que
 * « 690 € + 50 € de charges » ne rende 50. On ne retient ensuite que le premier
 * nombre plausible. Un tarif à la nuit ou à la semaine ne rend rien.
 *
 * @param context.area surface connue, qui seule permet d'admettre un loyer de
 *        prestige au-delà du plafond courant
 */
export function parsePrice(
  text: string | null | undefined,
  context: { readonly area?: number | null } = {},
): ParsedPrice {
  const cleaned = cleanText(text);
  if (cleaned === '') return { amount: null, chargesIncluded: null };

  const lower = comparable(cleaned);

  let chargesIncluded: boolean | null = null;
  if (/\bcharges comprises\b|\bcc\b|\btoutes charges comprises\b|\btcc\b/.test(lower)) {
    chargesIncluded = true;
  } else if (/\bhors charges\b|\bhc\b|\bcharges en sus\b/.test(lower)) {
    chargesIncluded = false;
  }

  // Tronque avant la mention des charges pour ne pas capturer leur montant.
  const separatorIndex = cleaned.search(/\+|\bdont\b|\bcharges\b/i);
  const priceSegment = separatorIndex > 0 ? cleaned.slice(0, separatorIndex) : cleaned;

  if (isShortPeriodPrice(cleaned)) return { amount: null, chargesIncluded };
  const amount =
    extractNumber(priceSegment, PRICE_BOUNDS) ??
    extractNumber(cleaned, PRICE_BOUNDS) ??
    luxuryAmount(priceSegment, context.area);
  return { amount, chargesIncluded };
}

/**
 * Extrait un montant de charges.
 * Ne rend une valeur que si le texte mentionne effectivement des charges :
 * sans cette mention, tout nombre trouvé serait une supposition.
 */
export function parseCharges(text: string | null | undefined): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '' || !/charge/i.test(cleaned)) return null;

  // Cherche un montant à proximité immédiate du mot « charges ».
  const match = cleaned.match(/([\d\s.,]+)\s*€?\s*(?:de\s+)?charges|charges\s*:?\s*([\d\s.,]+)/i);
  if (match) {
    const fragment = match[1] ?? match[2];
    if (fragment !== undefined) {
      const value = parseFrenchNumber(fragment);
      if (value !== null && value >= CHARGES_BOUNDS.min && value <= CHARGES_BOUNDS.max) {
        return value;
      }
    }
  }
  return null;
}

/**
 * Les charges lues dans le CHAMP DÉDIÉ d'une source.
 *
 * `parseCharges` exige le mot « charges » dans le texte, et c'est juste quand
 * on fouille une description ou une ligne de prix : sans ce mot, un montant
 * croisé au hasard n'est pas une provision. Mais quand la source expose un
 * champ dont l'intitulé EST « Provision sur charges récupérables », la valeur
 * arrive seule — « 82 € / Mois » —, le mot est resté dans l'intitulé, et la
 * garde refusait un montant parfaitement explicite. Les fiches Apimo perdaient
 * ainsi leurs charges alors qu'elles les publient toutes.
 *
 * ON N'ASSOUPLIT PAS `parseCharges` POUR AUTANT : elle est aussi appelée sur le
 * texte du PRIX, où un montant nu est le loyer. Un « 1 782 € » y passerait pour
 * des charges — dans les bornes, et faux de vingt fois.
 *
 * D'où cette fonction séparée, réservée au champ dédié : elle accepte un
 * montant SEUL, à condition que le texte ne contienne rien d'autre qu'un
 * nombre, une devise et une périodicité.
 */
export function parseChargesField(text: string | null | undefined): number | null {
  const labelled = parseCharges(text);
  if (labelled !== null) return labelled;

  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  // Un montant, éventuellement suivi de « € », « / mois », « par mois ».
  const bare = cleaned.match(/^([\d\s.,]+)\s*€?\s*(?:\/|par)?\s*(?:mois|mensuel\w*)?$/i);
  if (bare?.[1] === undefined) return null;

  const value = parseFrenchNumber(bare[1]);
  if (value === null || value < CHARGES_BOUNDS.min || value > CHARGES_BOUNDS.max) return null;
  return value;
}

/**
 * Extrait une surface habitable en m².
 * On exige la présence d'une unité (`m2`, `m²`) : un nombre nu dans une
 * description n'est pas une surface.
 */
export function parseArea(text: string | null | undefined): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;

  // `(?!\d)` et non `\b` : « ² » n'étant pas un caractère de mot, `\b` ne peut
  // jamais matcher entre « ² » et l'espace suivant, ce qui rendait toutes les
  // surfaces en m² illisibles. La négation de chiffre suffit à éviter qu'un
  // « 34 m25 » soit lu comme 34 m².
  const match = cleaned.match(/([\d\s.,]+)\s*m\s*(?:²|2|\^2)(?!\d)/i);
  if (match?.[1] === undefined) return null;

  const value = parseFrenchNumber(match[1]);
  if (value === null) return null;
  return value >= AREA_BOUNDS.min && value <= AREA_BOUNDS.max ? value : null;
}

/** Extrait un nombre de pièces (« 3 pièces », « T2 », « studio »). */
export function parseRooms(text: string | null | undefined): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  const lower = comparable(cleaned);

  if (/\bstudio\b|\bstudette\b/.test(lower)) return 1;

  const explicit = lower.match(/(\d+)\s*(?:pieces?|p\b)/);
  if (explicit?.[1] !== undefined) {
    const value = Number.parseInt(explicit[1], 10);
    if (value >= 1 && value <= 20) return value;
  }

  // Notations « T3 » et « F3 ».
  const shorthand = lower.match(/\b[tf](\d+)\b/);
  if (shorthand?.[1] !== undefined) {
    const value = Number.parseInt(shorthand[1], 10);
    if (value >= 1 && value <= 20) return value;
  }

  // EN TOUTES LETTRES, en dernier recours. Le bulletin abonné de BEP titre
  // « DEUX PIECES MEUBLEES, 30 M² » : cinquante-neuf annonces n’avaient aucun
  // nombre de pièces alors qu’il était écrit. Ce texte-là ne vient que du
  // titre et du champ de pièces, jamais de la description — « une pièce à
  // vivre » y désigne le séjour d’un trois-pièces, pas le logement entier.
  const spelled = /\b(une?|deux|trois|quatre|cinq|six)\s+pieces?\b/.exec(lower);
  const word = spelled?.[1];
  if (word !== undefined) return SPELLED_ROOMS[word] ?? null;

  return null;
}

/** Nombres écrits, en forme `comparable` (minuscules, sans accent). */
const SPELLED_ROOMS: Readonly<Record<string, number>> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
};

/** Extrait un nombre de chambres. */
export function parseBedrooms(text: string | null | undefined): number | null {
  const lower = comparable(text);
  const match = lower.match(/(\d+)\s*chambres?/);
  if (match?.[1] === undefined) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 0 && value <= 20 ? value : null;
}

/** Déduit le type de bien. Rend `unknown` plutôt que de supposer (§17). */
export function parsePropertyType(text: string | null | undefined): PropertyType {
  const lower = comparable(text);
  if (lower === '') return 'unknown';

  // LE LOGEMENT D'ABORD. Le non résidentiel passait en premier, si bien qu'une
  // « Studette de 20 m² avec parking » était classée « parking » — donc écartée
  // de la recherche (§16), sans trace. Un parking mentionné dans un titre est
  // presque toujours un ATOUT du logement ; il ne désigne le bien lui-même que
  // lorsque aucun type d'habitation n'est nommé (22 fiches sur 59 étaient dans
  // ce cas au 2026-09-03).
  //
  // Le vocabulaire ANGLAIS est reconnu ici, au seul endroit qui décide d'un
  // type de bien : plusieurs sources publient en anglais (Rentumo, Lodgis,
  // Studapart). Le parseur Rentumo traduisait « Apartment » en
  // « appartement » pour que cette fonction le retraduise en `apartment` —
  // un aller-retour qui couplait silencieusement les deux fichiers.
  if (/\bstudio\b|\bstudette\b/.test(lower)) return 'studio';
  if (/\bloft\b/.test(lower)) return 'loft';
  // « 3 chambre(s) » compte les chambres d'un logement, il ne le désigne pas.
  const uncounted = lower.replace(/\b\d+ (chambres?|rooms?)( s)?\b/g, ' ');
  if (/\b(chambre|room)\b/.test(uncounted) && !/\b(appartement|apartment)\b/.test(lower)) {
    return 'room';
  }
  /**
   * « 0 PIÈCE » NE DÉCRIT PAS UN LOGEMENT. Aucune annonce d'habitation ne
   * l'écrit ; c'est ainsi qu'une vitrine déclare un stationnement — « Box 0
   * pièce à Nice ». Le seul mot « pièce » l'emportait sur « box », et un
   * parking de 12 m² à 132 € par mois passait pour un appartement (relevé du
   * 2026-09-18 sur une fiche Flatbay, que la source typait pourtant « Box »).
   *
   * Le compte est retiré avant les tests d'habitation, comme « 3 chambres »
   * l'est plus haut : ce qui reste du texte décide alors seul.
   */
  const counted = lower.replace(/\b0 ?(pieces?|p)\b/g, ' ');
  // « 3P », « 2 P » : l'abréviation courante des pièces.
  if (/\b(appartement|appart|apartment|flat|duplex|t\d|f\d|\d ?p)\b/.test(counted))
    return 'apartment';
  if (/\b(maison|villa|pavillon|house|townhouse)\b/.test(lower)) return 'house';
  if (/\b(pieces?|bedrooms?)\b/.test(counted)) return 'apartment';

  // Aucun logement nommé : « Location Stationnement », box, garage, cave…
  if (
    /\bstationnement\b|\bparking\b|\bgarage\b|\bbox\b|\bemplacement\b|\bcaves?\b|\bcellier\b/.test(
      lower,
    )
  ) {
    return 'parking';
  }
  // … ou un bien professionnel. « Licence IV 4 - Grande Licence à louer »
  // tombait en `other`, que rien n'écarte, et partait en alerte.
  if (
    /\blicences?\b|\bfonds de commerce\b|\bbail commercial\b|\bdroit au bail\b|\bpas de porte\b|\bmurs commerciaux\b|\blocal\b|\blocaux\b|\b(louer|location) commerce\b|\bbureaux?\b|\bentrepots?\b/.test(
      lower,
    )
  ) {
    return 'commercial';
  }
  return 'other';
}

/**
 * Détermine si le bien est meublé.
 * `null` quand le texte ne le dit pas : un logement non mentionné comme meublé
 * n'est pas nécessairement vide.
 */
export function parseFurnished(text: string | null | undefined): boolean | null {
  const lower = comparable(text);
  if (lower === '') return null;
  if (/\bnon meuble\b|\bvide\b|\bnon meublee\b/.test(lower)) return false;
  if (/\bmeuble\b|\bmeublee\b/.test(lower)) return true;
  return null;
}

/**
 * LE MOT « COLOCATION » SOUS SES ÉCRITURES RÉELLES.
 *
 * Trois formes, et le motif n'en reconnaissait qu'une :
 *
 *   - « colocation », l'orthographe courante ;
 *   - « collocation », la faute la plus répandue ;
 *   - « co-location », dont le trait d'union devient une ESPACE dans la forme
 *     comparable — « co location » — si bien qu'aucune frontière de mot ne
 *     pouvait plus attraper le terme. Relevé du 2026-09-17 sur les 3 996
 *     annonces actives : vingt-six l'écrivent ainsi, dont deux chambres de dix
 *     mètres carrés « pour co-location dans appartement de 80 m² ».
 *
 * « co » SEUL EST INTERDIT, et c'est la raison d'être de ce fragment plutôt
 * que d'un `\bco\b` commode : « coin », « cour », « comble » commencent de la
 * même façon, et une colocation déclarée à tort ferait disparaître de la liste,
 * en silence, un logement entier qui convenait.
 */
const FLAT_SHARE_WORD = String.raw`co ?l{1,2}oc`;

/**
 * LE LOGEMENT ENTIER QUI SE DIT SUR LA COLOCATION, sans en être une.
 *
 * Deux familles, et toutes deux parlent d'un logement qu'on loue en entier :
 *
 *   - LA PERMISSION — « colocation possible », « colocation acceptée »,
 *     « possibilité de faire une co-location » : le bailleur admet des
 *     colocataires, il ne loue pas une place ;
 *   - LE REFUS — « pas de colocation », « sans colocation », « ni colocation »,
 *     « colocation non autorisée », « les colocations ne sont pas permises »,
 *     « la colocation n'est pas autorisée », « colocation interdite ». IL MANQUAIT, et
 *     c'était le faux positif le plus coûteux du lot : le mot suffisait à
 *     déclarer colocation l'annonce qui disait précisément le contraire.
 *     Quinze annonces actives étaient dans ce cas le 2026-09-17 — dont un
 *     studio de 20 m² « pour 1 étudiant, pas de colocation » et deux annonces
 *     Imodirect dont le TITRE porte « Colocation non autorisée ». Toutes
 *     disparaissaient de la liste d'un locataire qui exclut les colocations.
 *
 * Cette famille est examinée AVANT la mention simple, et l'emporte sur elle :
 * une annonce qui dit « colocation possible » puis reparle de colocation plus
 * loin reste un logement entier. Mesuré : l'ordre inverse faisait entrer un
 * deux-pièces de 42 m² qui annonce « colocation possible » puis « 2 couchages
 * indépendants possibles chambre/séjour pour colocation étudiante ».
 */
const WHOLE_DWELLING_SHARE = new RegExp(
  [
    String.raw`${FLAT_SHARE_WORD}ations? (?:possibles?|acceptees?|autorisees?|envisageables?)`,
    String.raw`possibilite (?:de |d une |de faire une )?${FLAT_SHARE_WORD}ation`,
    String.raw`\b(?:pas|plus) de ${FLAT_SHARE_WORD}`,
    String.raw`\b(?:sans|ni|aucune) ${FLAT_SHARE_WORD}`,
    String.raw`${FLAT_SHARE_WORD}ations?(?: n est| ne sont)? (?:non|pas) (?:accepte|autorise|permis|possible|souhaite)\w*`,
    String.raw`${FLAT_SHARE_WORD}ations? (?:interdites?|refusees?|impossibles?|exclues?)`,
  ].join('|'),
);

/**
 * LA COLOCATION DITE EN TOUTES LETTRES, ou par le mot qui la désigne vraiment.
 *
 * « co étudiante » EST une colocation, et l'annonce qui a fait ouvrir le sujet
 * ne dit rien d'autre : « F2 en co étudiante chambre indépendante », dix fois
 * l'expression sur la page, « cuisine équipée collective » dans le texte. Elle
 * entrait dans la liste d'un locataire qui exclut les colocations.
 *
 * LE PLURIEL ÉTAIT INVISIBLE, et il a coûté une annonce signalée par
 * l'utilisateur : une propriétaire qui écrit « j'ai l'habitude de faire des
 * colocationS » et « mes colocS » ne disait le mot qu'au pluriel, et la
 * frontière de mot qui fermait le motif butait sur le « s ». Six annonces
 * actives sont dans ce cas le 2026-09-18 — c'est peu, mais l'oubli portait sur
 * les DEUX bords : le refus « les colocationS ne sont pas permises » était tout
 * aussi muet, d'où la même tolérance dans `WHOLE_DWELLING_SHARE`.
 *
 * CE QUI A ÉTÉ MESURÉ ET REFUSÉ, faute d'être sûr :
 *
 *   - « colocataire » seul — trente-neuf occurrences actives, et les quatre qui
 *     n'étaient pas déjà signalées sont des logements ENTIERS : « parfaites
 *     pour accueillir une petite famille ou des colocataires », « maximum
 *     2 colocataires ensemble ou famille de 4 personnes ». Le mot nomme un
 *     occupant possible, pas le mode de location ;
 *   - « chambre indépendante » — vingt et une annonces actives non partagées
 *     l'emploient pour dire qu'un deux-pièces a une chambre SÉPARÉE du séjour.
 *     C'est l'inverse d'un indice de partage.
 */
const FLAT_SHARE_SAID = new RegExp(
  String.raw`\b${FLAT_SHARE_WORD}ations?\b|\b${FLAT_SHARE_WORD}s?\b|\bco etudiant\w*\b`,
);

/**
 * Détermine si le bien est proposé en colocation.
 *
 * « colocation possible/acceptée » décrit un logement ENTIER dont le bailleur
 * accepte des colocataires → `false`. « en colocation » / « chambre en
 * colocation » décrit une place dans un logement partagé → `true`.
 * `null` quand le texte ne dit rien : une valeur inventée fausserait un filtre
 * d'exclusion, et l'annonce écartée ne laisserait aucune trace.
 */
export function parseFlatShare(
  text: string | null | undefined,
  /**
   * Le TITRE seul, quand l'appelant le connaît.
   *
   * Une annonce intitulée « Chambre meublée à Nice nord » loue une chambre, et
   * on ne loue une chambre seule que dans un logement partagé. La règle
   * générale exigeait une préposition — « chambre DANS un appartement » — et
   * laissait donc passer les titres qui disent la chose sans la construire.
   *
   * C'est le titre et non la description : « trois chambres » apparaît dans la
   * composition de n'importe quel T4. Relevé du 2026-09-05 : sur dix-huit
   * annonces ainsi intitulées, quinze étaient DÉJÀ reconnues comme colocations
   * par les autres règles — le critère les rejoint plus qu'il n'invente.
   */
  title?: string | null,
  /**
   * LA DESCRIPTION SEULE, dont on ne lira QUE LA PREMIÈRE LIGNE.
   *
   * Le titre n'est pas toujours celui de l'annonceur. Les syndicateurs en
   * composent un — 123 Loger intitule toutes ses annonces « Appartement meublé
   * à louer », y compris celle d'une propriétaire dont le texte commence par
   * « Chambre de 57 m² à louer sur Nice ». Le vrai intitulé est alors la
   * première ligne de la description, et elle mérite la même lecture que le
   * titre.
   *
   * SEULEMENT LA PREMIÈRE LIGNE, pour la raison qui vaut déjà pour le titre :
   * « trois chambres » est la composition ordinaire d'un T4. Relevé du
   * 2026-09-18 sur les 4 044 annonces actives : trente-deux ouvrent leur texte
   * sur « Chambre… », trente et une étaient DÉJÀ reconnues, et la seule qui ne
   * l'était pas loue 7 m² dans un appartement « aménagé en trois studios
   * privatifs » avec salle d'eau et WC à partager.
   */
  description?: string | null,
): boolean | null {
  const lower = comparable(text);
  const heading = comparable(title);
  // L'intitulé qu'a réellement écrit l'annonceur, quand le titre est un gabarit.
  const opening = comparable(description?.split('\n').find((line) => line.trim() !== ''));
  if (lower === '' && heading === '') return null;
  /**
   * TROIS LECTURES, DANS CET ORDRE, ET L'ORDRE EST TOUT.
   *
   * 1. LE TITRE QUI LE DIT SANS RÉSERVE l'emporte. « APPART 3 PIECES EN COLOC »
   *    est une colocation, même quand la description ajoute plus bas
   *    « co-location envisageable si le groupe est déjà formé » : l'annonceur a
   *    intitulé son annonce ainsi, il ne vante pas une possibilité.
   * 2. LA RÉSERVE OU LE REFUS, où qu'il soit écrit, l'emporte sur la simple
   *    mention. Sans cette priorité, un deux-pièces de 42 m² qui annonce
   *    « colocation possible » puis « 2 couchages indépendants possibles
   *    chambre/séjour pour colocation étudiante » entrait comme colocation.
   * 3. LA MENTION SIMPLE, enfin.
   *
   * Titre et description sont lus séparément, pour qu'une fin de titre et un
   * début de description ne se touchent jamais au point de former une tournure
   * que ni l'un ni l'autre ne contient.
   *
   * L'INTITULÉ DE LA DESCRIPTION vient APRÈS le refus, et non avec le titre :
   * il est moins sûr que celui-ci, et un texte qui s'ouvre sur « Chambre… »
   * puis écrit « pas de colocation » reste un logement entier.
   */
  if (FLAT_SHARE_SAID.test(heading) && !WHOLE_DWELLING_SHARE.test(heading)) return true;
  if (WHOLE_DWELLING_SHARE.test(lower) || WHOLE_DWELLING_SHARE.test(heading)) return false;
  if (FLAT_SHARE_SAID.test(lower)) return true;
  if (/^chambre\b/.test(heading) || /^chambre\b/.test(opening)) return true;
  if (RENT_PER_PERSON.test(lower)) return true;
  return SHARED_DWELLING.test(lower) ? true : null;
}

/**
 * UN LOYER PAR TÊTE EST UN LOYER DE COLOCATION.
 *
 * « Le loyer est de 700 € CC par étudiant et par mois » : un logement entier ne
 * se loue jamais ainsi, et l'annonce qui l'écrit ne dit parfois rien d'autre —
 * celle qui a déclenché la vérification est un « T3 » dont ni le titre ni la
 * description ne portent le mot « colocation ». Le montant lui-même trahit le
 * partage.
 *
 * LE MOT « LOYER » (ou le mois, ou le prix) DOIT ÊTRE À CÔTÉ, sans quoi « une
 * salle d'eau par personne » suffirait. Relevé du 2026-09-16 sur les 3 704
 * annonces actives : quatre annonces en tout, toutes des colocations avérées.
 */
const RENT_PER_PERSON =
  /\b(?:loyer|charges comprises|cc|mois|mensuel\w*|prix)\b.{0,40}\bpar (?:etudiant|personne|colocataire|chambre)\b/;

/**
 * Logement partagé qui ne dit jamais le mot « colocation ».
 *
 * Relevé du 2026-09-04 sur l'inventaire : « Chambre dans jolie 5 pièces au pied
 * de la Fac » n'était pas signalée, faute du mot-clé. Ce qui la trahit, c'est
 * qu'on loue UNE CHAMBRE *dans* un logement plus grand — ou qu'on distingue des
 * parties communes de parties privatives, ce que seul un logement partagé fait.
 *
 * « Chambre » seule ne suffit pas : une annonce de deux-pièces la mentionne
 * dans sa composition. C'est la préposition qui porte le sens (§17).
 *
 * UNE CUISINE OU UNE SALLE D'EAU DÉCLARÉE COLLECTIVE est le troisième indice,
 * et il est sans équivoque : un logement qu'on loue en entier n'a jamais de
 * cuisine collective. L'annonce qui a fait ouvrir le sujet l'écrit — « cuisine
 * équipée collective » — sans jamais dire le mot « colocation » dans son texte.
 *
 * LE NOM DE LA PIÈCE EST EXIGÉ, et c'est tout ce qui sépare cet indice du
 * bruit : « chauffage collectif », « chaudière collective », « parking
 * collectif », « antenne collective » sont la vie ordinaire d'une copropriété.
 * Quatre-vingt-treize annonces en base portent le mot « collectif » ; une seule
 * l'accole à une cuisine ou à une salle d'eau, et c'est celle-ci. L'indice est
 * donc sûr mais RARE : il ne repose que sur cet exemple.
 */
// La ponctuation ayant disparu de la forme comparable, « co-living » y arrive
// écrit « co living ».
const SHARED_DWELLING =
  /chambre[^.;]{0,40}\b(?:dans|au sein d)\b[^.;]{0,30}(?:appartement|maison|villa|logement|colocation|t\d|f\d|\d\s*pieces?)|parties? privatives?[\s\S]{0,200}parties? communes?|parties? communes?[\s\S]{0,200}parties? privatives?|\bco ?living\b|\b(?:cuisines?|salles? de bains?|salles? d eau|sdb|douches?|sanitaires)\b(?:\s+(?:entierement|equipees?|amenagees?|modernes?|neuves?|partagees?|et|la|le|les))*\s+collecti(?:f|fs|ve|ves)\b/;

/**
 * Logement qu'on ne peut PAS garder à l'année parce qu'il est réservé aux
 * étudiants — ou loué sous un bail qui, par construction, s'arrête.
 *
 * ATTENTION À CE QUI N'EN EST PAS. « Idéal étudiant », « à cinq minutes de la
 * fac », « quartier étudiant » sont des arguments de vente : deux cents
 * annonces de l'inventaire les portent, et la plupart sont de vrais logements à
 * l'année. Ne comptent que les formes qui engagent la DURÉE ou l'ÉLIGIBILITÉ :
 *
 *   - « bail étudiant » — bail meublé de neuf mois, par définition scolaire ;
 *   - « bail mobilité » — un à dix mois, réservé par la loi aux étudiants,
 *     stagiaires et personnes en mission, et non renouvelable ;
 *   - résidence étudiante, CROUS, « réservé/exclusivement aux étudiants » ;
 *   - « colocation étudiante », « coloc étudiants » — la formule NOMME les
 *     occupants, elle ne vante pas un quartier. Relevé du 2026-09-05 : vingt-
 *     trois annonces de l'inventaire l'emploient, aucune à titre d'argument de
 *     vente. Les trois qui ne viennent pas d'une plateforme étudiante sont des
 *     colocations avérées, dont une louée « de septembre à juin ».
 *
 * Le texte est comparé en forme `comparable` : minuscules, sans accent.
 */
// « étudiant(e)s uniquement » arrive en « etudiant e s uniquement ».
const STUDENT_ONLY =
  /residence etudiante|logement etudiant|reserv\w+ aux etudiant|exclusivement (aux |pour )?etudiant|uniquement (pour |aux )?etudiant|(location |bail )?etudiant\w{0,2}(?: e)?(?: s)? uniquement|\bcrous\b|bail etudiant|bail (de )?mobilite|\bcoloc\w*\s+etudiant\w*/;

/**
 * LE MOT « UNIQUEMENT » N'EST PAS LA SEULE FAÇON DE RÉSERVER UN LOGEMENT.
 *
 * La détection était bâtie autour de lui, et laissait donc passer les formules
 * les plus courantes du parc niçois : « Location étudiante 2 pièces », « Studio
 * meublé pour étudiant », « bail meublé étudiant », « 2 pièces meublé étudiant
 * Nice Ouest ». Relevé du 2026-09-16 sur les 5 252 occurrences en base : 248
 * annonces portaient l'une de ces formes sans être signalées — le bailleur y
 * dit exactement la même chose, souvent pour un bail qui s'arrête en juin.
 *
 * Six familles, et toutes NOMMENT le logement ou le contrat :
 *
 *   1. « location étudiante », « loc étudiante », « location meublée étudiante »
 *      — sauf « location étudiante ACCEPTÉE », qui l'admet sans l'imposer,
 *      exactement comme « colocation possible » dans `parseFlatShare` ;
 *   2. « bail meublé étudiant », « bail meublé pour les étudiants » ;
 *   3. le logement qualifié sans préposition — « studio étudiant », « chambre
 *      étudiante », « 2 pièces meublé étudiant » : l'adjectif porte sur le bien ;
 *   4. « studio meublé POUR étudiant », le logement puis sa destination ;
 *   5. « période étudiants » ;
 *   6. « exclusivement destinée aux étudiants », « acceptés seulement pour les
 *      étudiants » — que le motif d'origine manquait dès qu'un mot s'intercalait.
 *
 * CE QU'ON REFUSE D'Y VOIR est aussi important : « idéal étudiant », « proche
 * de la fac », « quartier étudiant » restent des arguments de vente, et deux
 * cents annonces de l'inventaire les portent. Voir les deux gardes ci-dessous.
 */
const STUDENT_RESERVED = new RegExp(
  [
    String.raw`\bloc(?:ation)?s?\b(?:\s+meublees?)?\s+etudiant\w*\b(?!\s+(?:accept|bienven|admis))`,
    String.raw`\bbail\w*\s+(?:meublees?\s+)?(?:pour\s+(?:les\s+)?)?etudiant`,
    String.raw`\b(?:studios?|studettes?|appartements?|appart|chambres?|meublees?|meubles?|t\d|f\d|\d\s*pieces?)\s+etudiant`,
    // Le mot qui vante ne peut pas s'intercaler : « 2 pièces lumineux PARFAIT
    // pour étudiants » resterait sinon attrapé par le logement qui le précède,
    // hors de portée de la garde d'amont, qui ne lit qu'avant la formule.
    String.raw`\b(?:studios?|studettes?|appartements?|appart|logements?|chambres?|meublees?|meubles?|equipees?|loue|louer|t\d|f\d|\d\s*pieces?)\b(?:\s+(?!ideal|parfait|convien|adapte|approprie|recommande|destine)\w+){0,3}\s+pour\s+(?:les\s+|le\s+|un\s+|une\s+|l\s+|de\s+|des\s+)?etudiant`,
    String.raw`\bperiodes?\s+etudiant`,
    String.raw`\b(?:uniquement|seulement|exclusivement)\s+(?:destinees?\s+)?(?:pour\s+|aux\s+|a\s+|de\s+)?(?:les\s+|des\s+|la\s+)?etudiant`,
  ].join('|'),
);

/**
 * CE QUI PRÉCÈDE PEUT ANNULER LA MENTION, et c'est le faux positif à éviter
 * avant tout autre : signaler « réservé aux étudiants » sur un logement ouvert
 * à tous l'écarterait d'une recherche où il avait sa place.
 *
 * Deux cas, tous deux ANCRÉS juste avant la formule — un mot plus loin, il ne
 * porte plus sur elle, et « Idéal étudiant ! Location étudiante de septembre à
 * juin » doit rester signalée :
 *
 *   - l'ARGUMENT DE VENTE : « idéal pour étudiant », « parfait pour étudiants »,
 *     « conviendra à un étudiant » — le bailleur vante, il n'exclut personne ;
 *   - la CONDITION DE DOSSIER : « garants acceptés seulement pour les
 *     étudiants » — c'est la phrase d'ERA Maresol, et elle dit exactement
 *     l'inverse : le garant ne suffit QUE si l'on est étudiant, les autres
 *     candidats se qualifiant sur leurs revenus. Neuf annonces la portent, et
 *     aucune n'est réservée. Les participes (« acceptés », « exigés ») sont
 *     donc franchis comme les articles.
 */
const STUDENT_PITCH_BEFORE =
  /\b(?:ideal\w*|parfait\w*|convien\w+|adapte\w*|approprie\w*|recommande\w*|garants?|garanties?|profils?|situation|dossiers?)\b(?:\s+(?:pour|a|au|aux|le|la|les|un|une|des|de|l|en|seulement|sont|est|etre|seront|accept\w+|exige\w+|demande\w+|requis|admis))*\s*$/;

/**
 * CE QUI SUIT PEUT L'ANNULER AUSSI : « pour étudiants OU jeunes actifs »,
 * « meublé pour étudiants ou bail civil ». Le logement s'adresse aussi à qui
 * n'est pas étudiant — donc il n'est pas réservé, et l'utilisateur peut le
 * louer. « ou mobilité » n'y est volontairement pas : ce bail-là s'arrête.
 */
// La marque du pluriel reste collée au mot (« etudiantS ou jeunes actifs ») et
// les formes inclusives la détachent (« etudiant e s ») : les deux se franchissent.
//
// « ÉTUDIANTS ACCEPTÉS » est la seconde branche, et elle protège d'un faux
// positif que la forme `comparable` fabrique toute seule : la ponctuation
// disparue, un titre qui finit par « 2 pièces » et une description qui
// commence par « Étudiants acceptés » se touchent, et le logement se retrouve
// qualifié d'étudiant par un simple voisinage de phrases.
const STUDENT_OPEN_AFTER =
  /^(?:e|s|es|te|tes)?(?:\s+(?:e|s|es))*\s+(?:(?:ou|et)\s+(?:un\s+|une\s+|des\s+|les\s+|de\s+|au\s+|aux\s+)?(?:jeunes?\s+)?(?:actifs?|actives?|professionnels?|salaries?|travailleurs?|familles?|celibataires?|couples?|bail civil|baux civils)|(?:sont\s+|seront\s+)?(?:acceptees?|acceptes?|bienvenu\w*|admis\w*))\b/;

/** Combien de caractères regarder autour d'une mention d'étudiant. */
const STUDENT_WINDOW = 42;

/**
 * `true` si UNE des mentions réservantes tient dans son contexte.
 *
 * Chaque occurrence est examinée séparément : une annonce qui vante d'abord
 * « idéal étudiant » puis annonce « bail meublé étudiant » doit être signalée.
 */
function reservedToStudents(lower: string): boolean {
  for (const match of lower.matchAll(new RegExp(STUDENT_RESERVED.source, 'g'))) {
    const at = match.index;
    const end = at + match[0].length;
    if (STUDENT_PITCH_BEFORE.test(lower.slice(Math.max(0, at - STUDENT_WINDOW), at))) continue;
    if (STUDENT_OPEN_AFTER.test(lower.slice(end, end + STUDENT_WINDOW))) continue;
    return true;
  }
  return false;
}

/** Mots par lesquels une mention « réservé aux étudiants » peut finir. */
const STUDENT_ONLY_LAST_WORDS = ['uniquement', 'etudiant', 'etudiante', 'mobilite'];

/** `true` si l'annonce réserve le logement aux étudiants ou à un bail qui s'arrête. */
export function isStudentOnlyHousing(text: string | null | undefined): boolean {
  // Un aperçu tronqué (« ETUDIANT uniquemen... ») compte comme le texte entier.
  const lower = comparable(text);
  const completed = completeTruncatedWords(text, STUDENT_ONLY_LAST_WORDS);
  return (
    STUDENT_ONLY.test(lower) ||
    STUDENT_ONLY.test(completed) ||
    reservedToStudents(lower) ||
    reservedToStudents(completed)
  );
}

/**
 * Libellé puis lettre, en forme `comparable`. Entre les deux, seuls des mots
 * de libellé sont franchis — « DPE : Classe C », « DPE et GES : Classe D »,
 * « Diagnostic de performance énergétique de l'appartement : classe F »,
 * « DPE Conso C 160 » ; la lettre peut porter sa valeur (« Classe Energie B71 »).
 * « DPE a venir » est écarté : « a » y est une préposition.
 */
const DPE_IN_TEXT =
  /\b(?:dpe|classe energ\w*|etiquette energ\w*|diagnostic de performance energetique)(?: (?:et ges|conso\w*|energie|energetique|classe|cat|categorie|de l appartement|du logement|du bien))* ([a-g])(?:\d{1,3})?\b(?! (?:venir|realiser|faire|jour|refaire))/;

/**
 * Extrait la classe énergétique (DPE) : « A » à « G ». On accepte les formes
 * « DPE : D », « DPE D », « classe énergie C », « étiquette énergétique B ».
 * `null` si rien de fiable (§17) — jamais deviné, jamais « vierge → G ».
 */
export function parseDpe(text: string | null | undefined): string | null {
  if (text === null || text === undefined || text === '') return null;

  // Valeur brute d'un attribut structuré : une seule lettre A–G.
  const trimmed = text.trim();
  if (/^[A-Ga-g]$/.test(trimmed)) return trimmed.toUpperCase();

  // Texte libre : on retire les accents (« énergétique » → « energetique »)
  // pour une détection robuste, puis on cherche la lettre qui SUIT le mot-clé.
  const flat = comparable(text);
  const match = DPE_IN_TEXT.exec(flat);
  if (match?.[1] !== undefined) return match[1].toUpperCase();

  // Forme du bulletin BEP : « Classe énergétique (kWh/m²/an) C ». L’unité
  // s’intercale entre le libellé et la lettre, et `comparable` l’aplatit en
  // mots — « kwh m2 an » — que le motif ci-dessus refuse de franchir, à juste
  // titre : sauter des mots quelconques ferait attraper n’importe quelle
  // lettre isolée. On lit donc le texte BRUT, où la parenthèse borne
  // exactement ce qu’on saute. Cinquante-cinq annonces du bulletin abonné
  // n’avaient pas de DPE alors qu’il y figurait.
  const parenthesised = /classe\s+[ée]nerg[ée]tique\s*\([^)]*\)\s*[:-]?\s*([A-G])\b/i.exec(text);
  return parenthesised?.[1] !== undefined ? parenthesised[1].toUpperCase() : null;
}

/**
 * Libellé climat puis lettre, même construction que `DPE_IN_TEXT`.
 *
 * `\bges\b` est ce qui protège du bruit : « charges », « images » et la
 * référence ParuVendu « GES83170023 » n'ont pas de frontière de mot au bon
 * endroit et ne peuvent pas déclencher la lecture.
 */
const GES_IN_TEXT =
  /\b(?:ges|classe climat\w*|etiquette climat\w*|emissions? de gaz a effet de serre|gaz a effet de serre)(?: (?:classe|cat|categorie|emissions?|climat|ges|de l appartement|du logement|du bien))* ([a-g])(?:\d{1,3})?\b(?! (?:venir|realiser|faire|jour|refaire))/;

/**
 * Extrait l'étiquette climat (GES) : « A » à « G ». Mêmes règles que `parseDpe`
 * — `null` si rien de fiable (§17), jamais devinée, et surtout jamais recopiée
 * du DPE : les deux classes ne coïncident pas.
 */
export function parseGes(text: string | null | undefined): string | null {
  if (text === null || text === undefined || text === '') return null;

  // Valeur brute d'un attribut structuré : une seule lettre A–G.
  const trimmed = text.trim();
  if (/^[A-Ga-g]$/.test(trimmed)) return trimmed.toUpperCase();

  const match = GES_IN_TEXT.exec(comparable(text));
  if (match?.[1] !== undefined) return match[1].toUpperCase();

  // « GES (kg CO2/m²/an) : B » — l'unité entre parenthèses sépare le libellé de
  // la lettre, et `comparable` l'aplatit en mots que le motif refuse de
  // franchir. La parenthèse, lue sur le texte brut, borne exactement le saut.
  const parenthesised =
    /(?:ges|gaz\s+à?\s*effet\s+de\s+serre|classe\s+climatique)\s*\([^)]*\)\s*[:-]?\s*([A-G])\b/i.exec(
      text,
    );
  return parenthesised?.[1] !== undefined ? parenthesised[1].toUpperCase() : null;
}

/**
 * Classe DPE depuis ses deux valeurs (kWh/m²/an et kg CO₂/m²/an), en double
 * seuil (méthode de 2021) : la pire des deux classes l'emporte. Sert aux sites
 * qui ne publient que les chiffres.
 */
export function dpeFromValues(kwh: number, co2: number): string {
  const energy = [70, 110, 180, 250, 330, 420];
  const gas = [6, 11, 30, 50, 70, 100];
  const rank = (value: number, bounds: number[]): number => {
    const index = bounds.findIndex((bound) => value <= bound);
    return index === -1 ? bounds.length : index;
  };
  return 'ABCDEFG'.charAt(Math.max(rank(kwh, energy), rank(co2, gas)));
}

/**
 * Bail meublé ÉTUDIANT de neuf mois : le bien se loue de septembre à juin, puis
 * repart en location saisonnière l'été. Très répandu à Nice, où plusieurs
 * agences annoncent les deux tarifs dans la même description.
 *
 * Ce n'est PAS un logement à l'année : le locataire doit libérer les lieux pour
 * juillet-août. Le taire reviendrait à proposer un bien qu'on ne peut pas
 * garder — d'où un atout affiché, et l'exclusion « locations étudiantes » (voir
 * `isStudentHousing` dans le score de correspondance).
 *
 * Le texte est comparé en forme `comparable` : minuscules, sans accent.
 */
/**
 * Un bail de neuf mois, sous les tournures qu'emploient vraiment les agences.
 *
 * IL EXIGEAIT QUE LES MOTS SE TOUCHENT, et c'est ce qui l'a fait passer à côté
 * d'un cas parfaitement explicite : « Location étudiant de 9 mois. » Le motif
 * cherchait `location (de )?9 mois` — un seul mot inséré, et plus rien ne
 * correspondait. L'annonce est entrée dans les critères d'un locataire qui
 * cherche à l'année, pour un logement qu'il faut quitter en juin.
 *
 * On tolère donc jusqu'à deux mots entre le type de contrat et sa durée. Le
 * risque de fausse alerte reste faible : « neuf mois » accolé à « bail »,
 * « location » ou « contrat » ne désigne rien d'autre qu'une durée de bail, et
 * « de 9 à 12 mois » ne correspond pas — la durée doit toucher « mois ».
 */
/**
 * LES AGENCES ÉCRIVENT LA DATE, PAS LA DURÉE. « Septembre à juin » n'était
 * reconnu qu'accolé, et c'est ce qui laissait passer la forme la plus répandue :
 * « du 1er septembre 2026 au 30 juin 2027 », « de septembre à fin mai »,
 * « d'octobre à juin », « bail meublé étudiant jusqu'au 31 mai ». Relevé du
 * 2026-09-16 : 226 occurrences énonçaient ainsi une année scolaire sans que
 * l'atout « Bail 9 mois » soit posé — donc sans que rien, sur la fiche, ne dise
 * qu'il faut libérer les lieux pour l'été.
 *
 * DEUX FORMES, et l'une comme l'autre borne le bail :
 *
 *   - la rentrée d'un côté, la fin des cours de l'autre — septembre ou octobre,
 *     puis mai ou juin, à quatre mots de distance au plus (ce qui laisse passer
 *     les millésimes et les quantièmes, pas une phrase entière) ;
 *   - « disponible jusqu'au 30 juin », où seule la fin est écrite : un mot de
 *     location est alors EXIGÉ devant, sans quoi n'importe quelle date de juin
 *     ferait l'affaire.
 *
 * La ponctuation ayant disparu de la forme `comparable`, la distance se compte
 * en mots et non en caractères : c'est la seule borne qui reste.
 */
const SHORT_TERM_LEASE = new RegExp(
  [
    String.raw`\b(?:septembre|octobre)\b(?:\s+\w+){0,4}?\s+(?:mai|juin)\b`,
    String.raw`\b(?:disponible|dispo|libre|louee?|location|bail|louer|periode|duree)\w*(?:\s+\w+){0,5}?\s+jusqu\s+(?:a|au|en)\b(?:\s+\w+){0,3}?\s+(?:mai|juin)\b`,
    // « pour une période de 9 mois », « bail de neuf mois », « bail de 9mois ».
    String.raw`(?:bail|location|contrat|louee?|periode|duree)\w*(?:\s+\w+){0,2}\s+(?:de\s+|du\s+)?(?:9|neuf)\s*mois`,
    String.raw`(?:9|neuf)\s*mois\s+(?:de\s+)?(?:septembre|octobre)`,
    String.raw`saisonnier\w* (?:en |de |sur )?(?:juillet|aout)`,
    String.raw`(?:juillet|aout) en saisonnier`,
  ].join('|'),
);

/** `true` si le texte annonce un bail de neuf mois interrompu par l'été. */
export function isShortTermStudentLease(text: string | null | undefined): boolean {
  return SHORT_TERM_LEASE.test(comparable(text));
}

/**
 * UN MOT N'EST PAS UN ATOUT. Ce qui entoure le mot décide.
 *
 * Les atouts se cherchaient par simple présence du mot — `/\bjardin/` sur le
 * texte entier. À Nice, cela donnait « Jardin » pour « à deux pas du Jardin
 * Albert Ier », « Parking » pour « parking public à proximité », « Garage »
 * pour « proche garage ». Et surtout, la négation passait à travers : « SANS
 * ascenseur » — mention des plus courantes dans le parc ancien niçois —
 * affichait l'atout « Ascenseur », et « non meublé » affichait « Meublé ».
 * L'annonce disait exactement l'inverse de la fiche.
 *
 * Ces erreurs sont invisibles : rien, sur la fiche, ne distingue un atout réel
 * d'un mot attrapé dans une phrase de voisinage. On croit l'annonce.
 *
 * TROIS FAMILLES SUFFISENT à écarter l'essentiel, et chacune se lit dans une
 * fenêtre courte autour du mot :
 *
 * 1. LA NÉGATION qui précède — « sans », « non », « pas de », « aucun » ;
 * 2. LA PROXIMITÉ qui précède ou suit — « proche de », « à deux pas de »,
 *    « vue sur », « à proximité » : le bien est PRÈS de la chose, il ne l'a
 *    pas ;
 * 3. LE CARACTÈRE COLLECTIF qui suit — « public », « municipal », « commun ».
 *    Un parking public dans la rue n'est pas une place de stationnement.
 *
 * CE QUE ÇA NE RATTRAPE PAS, et il faut le savoir : un nom propre sans
 * tournure de proximité — « le Jardin Albert Ier est à 200 m » — passe encore.
 * Les jardins publics niçois les plus cités sont donc nommés, faute de mieux :
 * une liste courte et locale vaut mieux qu'une règle générale qui écarterait
 * de vrais jardins.
 */
const NEGATION_BEFORE = /(?:sans|non|pas d[eu']?|aucune?|ni)\s+(?:\w+\s+){0,1}$/;

const NEARBY_BEFORE =
  /(?:a proximite(?: immediate)?(?: de| du| des| d')?|a deux pas(?: de| du| des| d')?|proches?(?: de| du| des| d')?|pres(?: de| du| des| d')?|face(?: a| au| aux)?|a cote(?: de| du| des| d')?|vue(?: imprenable)?(?: sur| sur le| sur la)?|donnant sur(?: le| la)?|acces(?: au| a| aux)?|non loin(?: de| du| des)?|situe(?:e)? pres(?: de| du)?)\s+(?:le |la |les |l'|du |des |au |aux )?$/;

const NEARBY_AFTER = /^\s*(?:a proximite|a deux pas|dans le quartier|a \d+\s*m(?:etres)?\b)/;

const COLLECTIVE_AFTER =
  /^\s*(?:public|publique|publics|publiques|municipale?|collectif|collective|commune?s?|de la ville|d'?\s?enfants|albert|exotique|botanique|masséna|massena|des arenes|facile|aise|gratuit|dans la rue)/;

/** Combien de caractères regarder de part et d'autre. Une phrase courte. */
const WINDOW = 42;

/**
 * `true` si le texte mentionne l'équipement COMME APPARTENANT AU BIEN.
 *
 * Chaque occurrence est examinée : il suffit qu'une seule soit propre pour que
 * l'atout compte. « Proche du jardin public. Jardin privatif de 20 m² » doit
 * rendre `true` — la seconde phrase l'emporte, et c'est l'ordre inverse qui
 * serait faux.
 */
/**
 * Le mot qui désigne chaque atout, en un seul endroit.
 *
 * La même table sert à les POSER et à retirer ceux que l'ancienne détection
 * avait posés à tort : sans elle, les deux motifs divergeraient, et un atout
 * cesserait d'être nettoyable sans que personne ne s'en aperçoive.
 */
const PATTERNS = {
  Ascenseur: /\bascenseur\b/,
  Balcon: /\bbalcon/,
  Terrasse: /\bterrasse/,
  Jardin: /\bjardin/,
  Parking: /\bparking|\bstationnement|place de parking/,
  Garage: /\bgarage/,
  Cave: /\bcave\b/,
  Piscine: /\bpiscine/,
  Climatisation: /\bclimatisation|\bclim\b|climatise/,
  Meublé: /\bmeuble/,
} as const;

/**
 * La même table, pour une recherche par nom d'atout.
 *
 * Une Map plutôt qu'un accès indexé : le dépôt compile en
 * `noUncheckedIndexedAccess`, qui rend tout index par une chaîne quelconque
 * possiblement `undefined` — ce qui est exact, et qu'il vaut mieux traiter que
 * masquer par une assertion.
 */
const PATTERN_BY_FEATURE: ReadonlyMap<string, RegExp> = new Map(Object.entries(PATTERNS));

/**
 * Les atouts déjà enregistrés que le texte NE JUSTIFIE PLUS.
 *
 * POURQUOI IL NE SUFFIT PAS DE TOUT RECALCULER. Les atouts d'une fiche
 * viennent de deux sources : le texte, et des attributs bruts que la base ne
 * conserve pas (`nbBalcons`, `ascenseur`). Recalculer depuis le seul texte
 * effacerait les seconds — un balcon déclaré par la source disparaîtrait
 * parce que la description n'en parle pas.
 *
 * LA RÈGLE QUI DISTINGUE LES DEUX : on ne retire un atout que si le mot EST
 * dans le texte — donc l'ancienne détection, qui ne regardait que ça, l'a bien
 * posé de là — et que la nouvelle, elle, le refuse. Si le mot est absent,
 * l'atout vient d'un attribut : on n'y touche pas.
 *
 * Ce qu'on nettoie ainsi : « Ascenseur » sur une annonce qui dit « SANS
 * ascenseur », « Jardin » sur « à deux pas du Jardin Albert Ier », « Parking »
 * sur « parking public à proximité ».
 */
export function staleTextFeatures(
  features: readonly string[],
  text: string | null | undefined,
): string[] {
  const lower = comparable(text);
  if (lower === '') return [];
  return features.filter((feature) => {
    const pattern = PATTERN_BY_FEATURE.get(feature);
    if (pattern === undefined) return false;
    return pattern.test(lower) && !mentionsOwnFeature(lower, pattern);
  });
}

export function mentionsOwnFeature(lower: string, pattern: RegExp): boolean {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  for (const match of lower.matchAll(global)) {
    const at = match.index;
    const before = lower.slice(Math.max(0, at - WINDOW), at);
    const after = lower.slice(at + match[0].length, at + match[0].length + WINDOW);
    if (NEGATION_BEFORE.test(before)) continue;
    if (NEARBY_BEFORE.test(before)) continue;
    if (NEARBY_AFTER.test(after)) continue;
    if (COLLECTIVE_AFTER.test(after)) continue;
    return true;
  }
  return false;
}

/**
 * Construit la liste d'atouts affichables à partir du texte de l'annonce et
 * d'attributs déjà extraits. Chaque atout n'est ajouté que s'il est mentionné
 * (§17). Résultat dédoublonné, ordre stable.
 *
 * @param text texte libre (titre + description + caractéristiques)
 * @param extra attributs structurés éventuels (Orpi : etage, ascenseur…)
 */
export function extractFeatures(
  text: string | null | undefined,
  extra?: Readonly<Record<string, string>>,
): string[] {
  const lower = comparable(text);
  const features: string[] = [];
  const add = (value: string): void => {
    if (!features.includes(value)) features.push(value);
  };

  // Étage : d'abord l'attribut structuré, sinon le texte (« au 3e étage »).
  const floorAttr = extra?.['etage'];
  if (floorAttr !== undefined && floorAttr !== '' && floorAttr !== '0') {
    add(`${floorAttr}e étage`);
  } else if (floorAttr === '0') {
    add('Rez-de-chaussée');
  } else {
    const floor = lower.match(/\b(\d{1,2})\s*(?:e|er|eme|ème)?\s*etage/);
    if (floor?.[1] !== undefined) add(`${floor[1]}e étage`);
    else if (/rez.de.chaussee|\brdc\b/.test(lower)) add('Rez-de-chaussée');
  }

  /**
   * La LISTE D'ÉQUIPEMENTS DÉCLARÉE, relue à part du reste du texte.
   *
   * L'appelant la colle à la suite du titre, de la description et du meublé :
   * la dernière phrase de ceux-ci se retrouvait donc juste avant le premier
   * équipement, et pouvait le nier. « … non meublé » suivi de « Balcon · Cave »
   * faisait disparaître le balcon d'une fiche qui le déclare (sudagence.fr,
   * fiche 553). Une déclaration ne se lit pas dans le voisinage d'une autre.
   *
   * La liste garde en revanche son propre voisinage : « sans ascenseur » écrit
   * DEDANS reste une négation, et l'équipement reste écarté.
   */
  const declared = comparable(extra?.['features']);
  const mentioned = (pattern: RegExp): boolean =>
    mentionsOwnFeature(lower, pattern) || mentionsOwnFeature(declared, pattern);

  /**
   * L'ATTRIBUT STRUCTURÉ L'EMPORTE SUR LE TEXTE, quand la source en publie un.
   * `nbBalcons = 2` est une déclaration, pas une tournure de phrase : elle n'a
   * ni négation ni voisinage à interpréter.
   */
  const flags: Array<[boolean, string]> = [
    [extra?.['ascenseur'] === '1' || mentioned(PATTERNS['Ascenseur']), 'Ascenseur'],
    [numericAttr(extra?.['nbBalcons']) > 0 || mentioned(PATTERNS['Balcon']), 'Balcon'],
    [numericAttr(extra?.['nbTerrasses']) > 0 || mentioned(PATTERNS['Terrasse']), 'Terrasse'],
    [mentioned(PATTERNS['Jardin']), 'Jardin'],
    [numericAttr(extra?.['nbParking']) > 0 || mentioned(PATTERNS['Parking']), 'Parking'],
    [mentioned(PATTERNS['Garage']), 'Garage'],
    [mentioned(PATTERNS['Cave']), 'Cave'],
    [mentioned(PATTERNS['Piscine']), 'Piscine'],
    [mentioned(PATTERNS['Climatisation']), 'Climatisation'],
    [mentioned(PATTERNS['Meublé']), 'Meublé'],
    [/\bneuf\b|\brenove|refait a neuf/.test(lower), 'Rénové / neuf'],
    // Contrainte de DURÉE plutôt qu'agrément — mais c'est le fait le plus
    // décisif à voir quand il s'applique : le bien n'est pas louable l'été.
    [SHORT_TERM_LEASE.test(lower), SHORT_TERM_LEASE_FEATURE],
    // Réservé aux étudiants : ce n'est pas un agrément, c'est une condition
    // d'accès. Elle mérite d'être VUE, même quand l'utilisateur n'exclut pas
    // ces locations.
    [isStudentOnlyHousing(text), STUDENT_HOUSING_FEATURE],
  ];
  for (const [present, label] of flags) if (present) add(label);

  return features;
}

function numericAttr(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Nombre maximal d'occupants annoncé par la source.
 *
 * Les meublés courte durée le publient en toutes lettres — « peut accueillir
 * jusqu'à 4 personnes », « 2/3 personnes », « pour 2 personnes maximum ». Le
 * chiffre est DÉCISIF quand on cherche à plusieurs, et aucune autre donnée ne
 * le remplace : le nombre de pièces n'en dit rien.
 *
 * On ne lit que ce qui est écrit, jamais une déduction (§17). Une fourchette
 * (« 2/3 personnes ») rend son PLAFOND, qui est la promesse faite.
 *
 * LES COLOCATIONS LE DISENT AUTREMENT : « idéal pour 3 colocataires », « il y a
 * 4 locataires au total ». Relevé du 2026-09-05 sur l'inventaire, chaque
 * correspondance vérifiée une à une — les quatre trouvées sont de vrais comptes
 * d'occupants, sans une seule fausse.
 *
 * CE QUI A ÉTÉ EXAMINÉ ET REFUSÉ, parce que le chiffre y désigne autre chose :
 *
 *   - « location étudiants jusqu'à 30 juin » — une DATE, six annonces Dazur ;
 *   - « table pouvant recevoir jusqu'à 8 convives » — des places assises ;
 *   - « 4 chambres (1 occupant par chambre) » — il faudrait multiplier, donc
 *     déduire ; §17 l'interdit, même quand le calcul paraît évident.
 */
export function parseMaxOccupants(text: string | null | undefined): number | null {
  const lower = comparable(text);
  if (lower === '') return null;

  // « 4 personnes », « 2 3 personnes » (la barre oblique a sauté au nettoyage),
  // « couchages ». Le dernier nombre d'une fourchette est le plafond.
  const explicit = /(\d{1,2})(?:\s+(\d{1,2}))?\s+(?:personnes?|couchages?|voyageurs?)\b/.exec(
    lower,
  );
  if (explicit?.[1] !== undefined) {
    return boundedOccupants(Number.parseInt(explicit[2] ?? explicit[1], 10));
  }

  // Le vocabulaire de la colocation. « au total » est EXIGÉ pour « locataires » :
  // sans lui, « 1 locataire par chambre » rendrait un, alors que la phrase
  // énonce une règle et non un effectif.
  const shared = /(\d{1,2})\s+colocataires?\b|(\d{1,2})\s+locataires?\s+au\s+total\b/.exec(lower);
  const found = shared?.[1] ?? shared?.[2];
  return found === undefined ? null : boundedOccupants(Number.parseInt(found, 10));
}

/** Au-delà de vingt, c'est une résidence entière ou un nombre attrapé au vol. */
function boundedOccupants(value: number): number | null {
  return Number.isFinite(value) && value >= 1 && value <= 20 ? value : null;
}

/** Extrait un code postal français à cinq chiffres. */
export function parsePostalCode(text: string | null | undefined): string | null {
  const cleaned = cleanText(text);
  const match = cleaned.match(/\b(\d{5})\b/);
  return match?.[1] ?? null;
}

/**
 * Normalise un numéro de téléphone français au format E.164 (`+33...`).
 *
 * Le format canonique est indispensable au dédoublonnage : un même numéro écrit
 * « 06 00 00 00 12 » sur un portail et « +33600000012 » sur un autre doit
 * produire la même clé, sans quoi le doublon passe inaperçu (§14).
 */
export function parsePhone(text: string | null | undefined): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;

  const digitsOnly = cleaned.replace(/[^\d+]/g, '');

  if (/^\+33[1-9]\d{8}$/.test(digitsOnly)) return digitsOnly;
  if (/^0033[1-9]\d{8}$/.test(digitsOnly)) return `+33${digitsOnly.slice(4)}`;
  if (/^0[1-9]\d{8}$/.test(digitsOnly)) return `+33${digitsOnly.slice(1)}`;
  // « +33-0493… » : indicatif accolé au 0 national — rencontré tel quel dans
  // le JSON-LD de sites d'agences (BEP Logement, plateforme Apimo).
  if (/^\+330[1-9]\d{8}$/.test(digitsOnly)) return `+33${digitsOnly.slice(4)}`;

  return null;
}

/** Extrait une adresse e-mail. */
export function parseEmail(text: string | null | undefined): string | null {
  const cleaned = cleanText(text);
  const match = cleaned.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase() : null;
}

/**
 * LA RÉFÉRENCE QUE L'AGENCE ÉCRIT DANS SON TEXTE, quand son gabarit ne la
 * publie pas en champ.
 *
 * « Référence de l'annonce : 0603220 », en fin de descriptif. C'est le numéro
 * qu'on cite au téléphone, et pour certaines sources le seul endroit où il
 * figure : BEP Logement le donne là et nulle part ailleurs, et Paru Vendu le
 * recopie tel quel en relayant l'annonce — ce qui rapproche les deux fiches.
 *
 * L'APOSTROPHE S'ÉCRIT DES DEUX FAÇONS, droite ou typographique, et c'est la
 * courbe que les sources emploient : un motif qui n'accepte que la droite ne
 * trouve rien. « n° » précède parfois le numéro.
 *
 * TROIS CARACTÈRES AU MOINS : en deçà ce n'est pas une référence mais la fin
 * d'une phrase ramassée par hasard.
 */
const PUBLISHED_REFERENCE_IN_TEXT =
  /r[ée]f[ée]rence\s+de\s+l['’ʼ]\s*annonce\s*:?\s*(?:n\s*[°o]\s*)?([A-Za-z0-9][A-Za-z0-9._/-]{2,})/i;

/** La référence imprimée dans un texte libre, ou `null` s'il n'en porte pas. */
export function parsePublishedReference(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return PUBLISHED_REFERENCE_IN_TEXT.exec(text)?.[1] ?? null;
}

/**
 * Interprète une date de publication, absolue ou relative.
 *
 * Les sites français écrivent aussi bien « 14/08/2026 » que « il y a 4 min ».
 * `nowMs` est injecté pour que les tests soient déterministes (§59).
 *
 * @returns une date ISO 8601, ou `null` si le texte n'est pas interprétable.
 */
/**
 * UNE DATE ISO COMPLÈTE, TELLE QUE LES API LA RENDENT : `2026-09-08T14:01:11.696Z`.
 *
 * Les lecteurs de date ne la reconnaissaient pas. Leur motif cherchait
 * `AAAA-MM-JJ` suivi d'une frontière de mot — or entre le « 8 » du jour et le
 * « T » de l'heure il n'y en a pas, les deux étant des caractères de mot. Toute
 * source qui publie un horodatage perdait sa date en silence : Bien'ici, ERA,
 * Mirabello, Orpi. Relevé le 2026-09-10 : 0 % de dates de parution chez
 * Bien'ici, dont l'API les donne toutes.
 */
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

/** L'INSTANT exact d'une date ISO, ou `null` si ce n'en est pas une. */
function isoInstant(text: string): string | null {
  if (!ISO_DATE_TIME.test(text)) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Le JOUR d'une date ISO, tel qu'écrit — à minuit UTC.
 *
 * Pour une disponibilité, c'est le calendrier qui compte, pas l'instant : lu
 * comme un instant, « 2026-10-01T00:00:00+02:00 » deviendrait le 30 septembre,
 * et un logement libre le 1er octobre passerait pour libre la veille.
 */
function isoCalendarDay(text: string): string | null {
  const match = ISO_DATE_TIME.exec(text);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parsePublishedAt(text: string | null | undefined, nowMs: number): string | null {
  const instant = readPublishedAt(text, nowMs);
  if (instant === null) return null;
  // Bien'ici écrit « 1970-01-01T00:00:00.000Z » quand il n'a pas de date :
  // l'instant zéro, pas une parution. Pas de borne dans l'avenir : la lecture
  // sert aussi aux disponibilités, qui y sont par nature.
  return Date.parse(instant) >= Date.UTC(2000, 0, 1) ? instant : null;
}

function readPublishedAt(text: string | null | undefined, nowMs: number): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  // L'horodatage d'une API : l'instant exact, qui dit la fraîcheur.
  const instant = isoInstant(cleaned);
  if (instant !== null) return instant;
  const lower = comparable(cleaned);

  if (/\b(aujourd hui|maintenant|a l instant)\b/.test(lower)) {
    return new Date(nowMs).toISOString();
  }
  if (/\bhier\b/.test(lower)) {
    return new Date(nowMs - 86_400_000).toISOString();
  }

  const relative = lower.match(
    /il y a\s+(\d+)\s*(min|minute|minutes|h|heure|heures|j|jour|jours|semaine|semaines|mois)/,
  );
  if (relative?.[1] !== undefined && relative[2] !== undefined) {
    const amount = Number.parseInt(relative[1], 10);
    const unit = relative[2];
    const msPerUnit: Record<string, number> = {
      min: 60_000,
      minute: 60_000,
      minutes: 60_000,
      h: 3_600_000,
      heure: 3_600_000,
      heures: 3_600_000,
      j: 86_400_000,
      jour: 86_400_000,
      jours: 86_400_000,
      semaine: 604_800_000,
      semaines: 604_800_000,
      mois: 2_592_000_000,
    };
    const factor = msPerUnit[unit];
    if (factor !== undefined) return new Date(nowMs - amount * factor).toISOString();
  }

  // Formats absolus JJ/MM/AAAA et AAAA-MM-JJ.
  const french = cleaned.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
  if (french?.[1] && french[2] && french[3]) {
    const date = new Date(Date.UTC(+french[3], +french[2] - 1, +french[1]));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const iso = cleaned.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso?.[0]) {
    const date = new Date(`${iso[0]}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
}

/**
 * Voies françaises reconnues pour l'extraction d'adresse depuis un texte libre.
 */
const STREET_KINDS =
  'avenue|av\\.?|boulevard|bd\\.?|rue|place|chemin|impasse|all[ée]e|promenade|quai|route|mont[ée]e|traverse|square|passage|corniche';

/**
 * Un caractère de NOM de voie. Le point n'y entre qu'abrégeant « Saint » :
 * « AV. ST. MAURICE » s'arrêtait sinon à « AV. ST ».
 */
const STREET_NAME_CHAR = '(?:[^,;.:()!?0-9"«»”„]|(?<=\\bste?)\\.)';

/**
 * Adresse AVEC numéro de voie.
 *
 * Deux précautions sur le numéro :
 *   - il ne doit pas être précédé d'un chiffre ni d'un séparateur, sans quoi
 *     « disponible 06/2027 Boulevard Napoléon III » livrait « 2027 Boulevard
 *     Napoléon III » — une date prise pour un numéro ;
 *   - la seconde moitié d'un intervalle (« 22-24 ») tient sur trois chiffres :
 *     au-delà, c'est une année ;
 *   - ni d'un mois : « du 1er septembre au 31 mai 2027 Boulevard X ».
 */
const STREET_ADDRESS = new RegExp(
  `(?<![\\d/-])(?<!\\b(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\\s+)(\\d{1,4}(?:[-/]\\d{1,3})?\\s*(?:bis|ter)?[,]?\\s+(?:${STREET_KINDS})\\s+${STREET_NAME_CHAR}{2,45})`,
  'i',
);

/**
 * Une adresse qui COMMENCE par un numéro suivi d'un type de voie.
 *
 * Sert à trancher quand une source colle deux voies dans un champ : la
 * moitié numérotée est celle du bien (voir `dedupeStreetAddress`).
 */
export const NUMBERED_STREET = new RegExp(
  `^\\d{1,4}(?:[-/]\\d{1,3})?\\s*(?:bis|ter)?[,]?\\s+(?:${STREET_KINDS})\\b`,
  'i',
);

/**
 * Voie SANS numéro occupant à elle seule un segment (« Rue Smolett, tout proche
 * du port… »). Les agences niçoises situent le bien ainsi bien plus souvent
 * qu'avec un numéro : l'exiger laissait 86 fiches sur 93 sans rue.
 */
const BARE_STREET = new RegExp(`^(?:${STREET_KINDS})\\s+${STREET_NAME_CHAR}{2,45}$`, 'i');

/** Une adresse qui COMMENCE par un type de voie, numéro ou non. */
const STARTS_WITH_KIND = new RegExp(`^(?:${STREET_KINDS})\\b`, 'i');

/**
 * CE QUE VAUT UNE ADRESSE, en trois marches.
 *
 * Deux adresses désignent souvent le même bien sans se valoir : la source
 * publie « avenue Sainte Colette » quand sa description écrit « 31, avenue
 * Sainte Colette ». Le champ structuré l'emportait toujours — c'est une bonne
 * règle générale — et le numéro était perdu à chaque fois. Or c'est LUI qui
 * place le point sur la carte : sans numéro, le géocodeur vise le milieu de la
 * voie, et le temps de trajet affiché est celui d'un autre logement.
 *
 * Trois marches, parce que trois choses différentes se ressemblent :
 *
 *   2  un numéro ET un type de voie — « 230 avenue de la Californie » ;
 *   1  un type de voie seul — « Corniche Fleurie » ;
 *   0  ni l'un ni l'autre — « Californie, Nice », qui nomme un QUARTIER.
 *
 * La marche 0 est celle qui trompe : elle a l'air d'une adresse, elle se range
 * dans le champ « adresse » de la source, et elle ne situe rien de plus précis
 * que le quartier déjà connu par ailleurs.
 */
export function addressGrade(address: string): 0 | 1 | 2 {
  const clean = address.replace(/\s+/g, ' ').trim();
  if (NUMBERED_STREET.test(clean)) return 2;
  return STARTS_WITH_KIND.test(clean) ? 1 : 0;
}

/**
 * `true` si les deux adresses nomment la MÊME voie, l'une avec son numéro.
 *
 * On compare les noms débarrassés du numéro et du type de voie : « avenue
 * Sainte Colette » et « 31, avenue Sainte Colette » se rejoignent, « avenue
 * Sainte Colette » et « 31 rue Barla » non. Sans cette vérification, un numéro
 * croisé dans la description serait recollé à une voie qui n'est pas la sienne
 * — une adresse fausse, et plausible, ce qui est le pire des deux.
 */
export function sameStreet(a: string, b: string): boolean {
  const noyau = (address: string): string =>
    comparable(address)
      .replace(/^\d{1,4}(?:[-/]\d{1,3})?\s*(?:bis|ter)?[,]?\s*/, '')
      .replace(new RegExp(`^(?:${STREET_KINDS})\\s+`, 'i'), '')
      .replace(/^(?:de\s+la|de\s+l|du|des|de|d)\s+/, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  const gauche = noyau(a);
  const droite = noyau(b);
  if (gauche === '' || droite === '') return false;
  return gauche === droite || gauche.startsWith(droite) || droite.startsWith(gauche);
}

/**
 * FAUX AMIS : un segment qui commence par un type de voie sans désigner une
 * adresse — « Place de parking », « Passage couvert », « Box fermé ».
 *
 * Ce prédicat juge CE QU'EST le segment. Il vaut donc pour une adresse de
 * n'importe quelle provenance, y compris déjà stockée.
 */
const NOT_A_STREET = /\b(parking|stationnement|garage|box|voiture|moto|velo|vélo|couvert)\b/i;

/**
 * PROSE : les mots qui trahissent une extraction ayant mordu sur la phrase
 * suivante, faute de ponctuation — « rue Dr Barety Dans résidence sécurisée ».
 *
 * Ce prédicat juge OÙ le segment aurait dû s'arrêter, et n'a donc de sens que
 * sur un texte qu'on vient d'extraire. L'appliquer à une adresse publiée par
 * la source effacerait des adresses postales parfaitement valides : « 12 Rue
 * X, Résidence Les Oliviers » est écrit ainsi par plusieurs agences, et
 * `streetAddress` en JSON-LD en contient couramment.
 */
const PROSE_AFTER_STREET =
  /\b(dans|proche|avec|situ[ée]e?|id[ée]ale?|entre|r[ée]sidence|immeuble|appartement|studio|villa|copropri[ée]t[ée])\b/i;

/**
 * L'ACCROCHE COMMERCIALE, qui suit la voie sans ponctuation : « 1 boulevard
 * Lech Walesa Joli studio meublé ».
 *
 * Séparée de la prose ci-dessus, et ce n'est pas un détail : celle-là juge
 * aussi les adresses DÉJÀ STOCKÉES, où « Bel », « Rare » ou « Beau » peuvent
 * appartenir à un nom de voie — « Chemin de Bel Air » existe. Rejeter une
 * adresse publiée par la source sur ce motif en perdrait des justes.
 *
 * Ici on ne rejette rien : on COUPE devant, et seulement sur un texte qu'on
 * vient d'extraire. « 1 boulevard Lech Walesa Joli » gardait un mot de trop et
 * ne se géocodait pas.
 */
const SALES_PITCH =
  /\b(tr[èe]s|joli\w*|beau|bel|belle|magnifique|superbe|splendide|charmant\w*|ravissant\w*|spacieux|spacieuse|lumineux|lumineuse|coquet\w*|agr[ée]able|exceptionnel\w*|vaste|refait\w*|r[ée]nov[ée]\w*|bien plac[ée]\w*|au calme)\b/i;

/**
 * ÉQUIPEMENTS : les mots qu'une agence accole au nom de voie dans une accroche
 * composée au tiret — « NICE LE PORT - RUE ARSON GRANDE TERRASSE - CALME ».
 *
 * Le segment commence bien par un type de voie, ne contient aucune prose, et
 * passait donc pour une adresse : « Rue Arson Grande Terrasse » n'existe sur
 * aucune carte. Aucune rue de l'agglomération ne porte l'un de ces mots ; les
 * rejeter perd la rue plutôt que d'en inventer une (§17).
 */
const FEATURE_IN_STREET =
  /\b(terrasse|balcon|ascenseur|meubl[ée]e?|vide|r[ée]nov[ée]e?|climatis[ée]e?|calme|[ée]tage|pi[èe]ces?|vue mer|jardin|cave|piscine)\b/i;

/** `true` si le segment fraîchement extrait est bien une voie, et rien de plus. */
/**
 * Au-delà de ce nombre de mots après le type de voie, on lit de la prose.
 *
 * « rue Hérold » en a un, « ROUTE DE TURIN » deux. Les noms plus longs
 * existent — « rue du Maréchal de Lattre de Tassigny » — mais ce seuil ne sert
 * QUE de rattrapage : sans lui ces adresses seraient perdues de toute façon.
 */
const MAX_STREET_NAME_WORDS = 3;

/**
 * L'adresse d'un candidat qui a mordu sur la phrase suivante, coupée net.
 *
 * L'extraction rejetait le tout dès qu'un mot de prose apparaissait, ce qui
 * jetait l'adresse avec la phrase : « 36 rue Hérold studio vide dans résidence
 * récente » ne rendait rien, alors que la voie est là, complète, en tête.
 *
 * On coupe donc AVANT le premier mot de prose et l'on revérifie. Le résultat
 * n'est accepté que s'il ressemble encore à une adresse : un numéro, un type de
 * voie, et un nom assez court pour en être un. « 1 rue de Orestis Très bel
 * appartement » reste écarté — couper devant « appartement » laisserait
 * « 1 rue de Orestis Très bel », et une rue fausse vaut moins que pas de rue.
 *
 * Ce chemin ne peut que RÉCUPÉRER : il ne s'emprunte que sur des candidats
 * déjà refusés.
 */
function trimAtProse(candidate: string): string | null {
  // Le PREMIER des deux : l'accroche précède souvent la prose (« Joli studio »),
  // et couper au second laisserait le premier mot collé à la voie.
  const positions = [PROSE_AFTER_STREET.exec(candidate)?.index, SALES_PITCH.exec(candidate)?.index]
    .filter((index): index is number => index !== undefined && index > 0)
    .sort((a, b) => a - b);
  const coupe = positions[0];
  if (coupe === undefined) return null;

  const trimmed = candidate
    .slice(0, coupe)
    .trim()
    .replace(/[,\s]+$/, '');
  // LE NUMÉRO EST FACULTATIF, et il l'est devenu : « avenue Malaussena très
  // bien placé » vient d'un segment entier reconnu comme voie, sans numéro,
  // et gardait donc son accroche faute d'être coupé ici.
  const kind = new RegExp(
    `^(?:\\d{1,4}(?:[-/]\\d{1,3})?\\s*(?:bis|ter)?[,]?\\s+)?(?:${STREET_KINDS})\\s+`,
    'i',
  );
  const head = kind.exec(trimmed);
  if (head === null) return null;

  const name = trimmed.slice(head[0].length).trim();
  if (name.length < 2) return null;
  if (name.split(/\s+/).length > MAX_STREET_NAME_WORDS) return null;
  return trimmed;
}

function isCleanStreet(candidate: string): boolean {
  return (
    !NOT_A_STREET.test(candidate) &&
    !PROSE_AFTER_STREET.test(candidate) &&
    !FEATURE_IN_STREET.test(candidate)
  );
}

/**
 * `true` si une adresse DÉJÀ STOCKÉE reste plausible.
 *
 * Sert au rattrapage, et applique les DEUX critères — y compris la prose.
 *
 * LE COMPROMIS EST ASSUMÉ. Une adresse postale peut légitimement contenir
 * « Résidence » ou « Immeuble », et certaines sources la publient ainsi dans
 * un champ structuré : on en perd alors une juste. Mais §17 tranche dans
 * l'autre sens — mieux vaut n'afficher aucune rue qu'une rue introuvable sur
 * une carte. Mesuré sur l'inventaire du 2026-09-03 : 14 adresses écartées, 14
 * réellement fausses, aucune perte légitime (les 203 adresses structurées de
 * Studapart sont intactes).
 */
export function looksLikeStreet(address: string): boolean {
  /**
   * UNE ADRESSE PONCTUÉE A LE DROIT DE NOMMER UNE RÉSIDENCE.
   *
   * La prose trahit une extraction qui a mordu sur la phrase suivante, faute de
   * ponctuation — et c'est bien ce qu'il faut écarter. Mais « Résidence parc
   * Anahit, 3 Imp. Mont Rabeau, 06000 Nice » est une adresse postale complète,
   * écrite ainsi par la source, virgules comprises, et parfaitement géocodable.
   * La règle la jetait avec les autres.
   *
   * La virgule et le code postal sont le signe qu'un humain a composé une
   * adresse, pas qu'un extracteur a débordé.
   */
  const composee = address.includes(',') || /\b\d{5}\b/.test(address);
  if (composee) return !NOT_A_STREET.test(address) && !FEATURE_IN_STREET.test(address);
  return isCleanStreet(address);
}

/**
 * Montant des CHARGES lu dans le texte libre.
 *
 * Quatre pour cent des annonces portaient un montant de charges, alors que
 * deux cent trente-quatre descriptions en citent un. Le loyer affiché n'est
 * pas ce qu'on paie : « 630 € + 45 € de charges », c'est 675 €. Taire les
 * charges, c'est comparer des loyers qui ne se comparent pas.
 *
 * TROIS FORMES SEULEMENT, toutes DIRIGÉES — le montant doit être attribué aux
 * charges, jamais simplement voisin du mot :
 *
 *   - « Charges : 75,28 € », « charges locatives : 30 € »
 *   - « + 45 € de charges »
 *   - « 70,00 euros par mois de provision pour charges »
 *
 * CE QU'ON REFUSE, et c'est le piège : « 750,00 € CHARGES COMPRISES ». Le
 * montant y est le LOYER. Une première version, qui acceptait tout nombre
 * proche du mot « charges », se remplissait de loyers — trente relevés d'un
 * coup chez BEP. Une charge ne se laisse pas deviner par proximité (§17).
 */
/**
 * « € » ou sa trace : « ? » quand l'encodage de la source l'a perdu. Le « ? »
 * n'est admis que collé à un montant de ces tournures dirigées.
 */
const CHARGES_UNIT = String.raw`\s*(?:€|eur\b|euros?|\?)`;
const CHARGES_AMOUNT = String.raw`(\d{1,3}(?:[ .\u00a0]?\d{3})*(?:[.,]\d{1,2})?)`;
/** « provision sur charges », « prov. charges », « provisions mensuelles pour charges ». */
const PROVISION = String.raw`prov(?:isions?|\.)?\s+(?:mensuelles?\s+)?(?:(?:pour|sur|de)\s+(?:les\s+)?)?`;

const CHARGES_IN_TEXT: readonly RegExp[] = [
  // « Loyer hors charges : 675 € » est le loyer : sept fiches en base portent
  // ainsi des « charges » de plus de la moitié du loyer (relevé du 2026-09-15).
  new RegExp(
    String.raw`(?<!hors\s)(?:${PROVISION})?charges?(?:\s+(?:locatives?|mensuelles?|r[ée]cup[ée]rables?))?\s*(?:\([^)]*\))?\s*[:=]\s*${CHARGES_AMOUNT}${CHARGES_UNIT}`,
    'i',
  ),
  // Avec « provision », le deux-points n'est plus nécessaire : « provision
  // charges 155,00 € par mois », « provision sur charges de 55 € ».
  new RegExp(
    String.raw`\b${PROVISION}charges?(?:\s+r[ée]cup[ée]rables?)?\s*(?:de\s+)?${CHARGES_AMOUNT}${CHARGES_UNIT}`,
    'i',
  ),
  new RegExp(
    String.raw`(?:\+|\bdont)\s*${CHARGES_AMOUNT}${CHARGES_UNIT}\s*(?:par mois\s*)?(?:(?:de|d['’])\s*)?(?:${PROVISION})?charges?`,
    'i',
  ),
  new RegExp(
    String.raw`${CHARGES_AMOUNT}${CHARGES_UNIT}\s*(?:par mois\s*)?(?:de|d['’])\s+(?:${PROVISION})?charges?`,
    'i',
  ),
];

/**
 * Plafond de vraisemblance. Au-delà, ce n'est plus une provision de charges
 * mais un loyer qu'une tournure a laissé passer.
 */
const MAX_CHARGES = 900;

/**
 * Cherche un montant de charges dans une description.
 *
 * @param maxPlausible loyer de l'annonce, quand il est connu : des charges
 *        supérieures au loyer ne sont pas des charges. `null` si inconnu, la
 *        seule borne restant alors le plafond absolu.
 * @returns le montant, ou `null` — jamais une supposition (§17).
 */
export function parseChargesFromText(
  text: string | null | undefined,
  maxPlausible: number | null = null,
): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  for (const pattern of CHARGES_IN_TEXT) {
    const raw = pattern.exec(cleaned)?.[1];
    if (raw === undefined) continue;
    // Le point n'est un s\u00e9parateur de milliers que suivi de trois chiffres :
    // \u00ab 1.200 \u00bb vaut mille deux cents, \u00ab 50.0 \u00bb vaut cinquante \u2014 il valait 500.
    const value = Number(
      raw
        .replace(/[ \u00a0]/g, '')
        .replace(/\.(?=\d{3}(?!\d))/g, '')
        .replace(',', '.'),
    );
    if (!Number.isFinite(value) || value <= 0 || value >= MAX_CHARGES) continue;
    if (maxPlausible !== null && value >= maxPlausible) continue;
    return value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dépôt de garantie et honoraires du locataire
// ---------------------------------------------------------------------------

/**
 * Plafonds rapportés au loyer : un dépôt au-delà de trois loyers, des
 * honoraires au-delà de deux, sont un prix de vente ou un montant mal attribué.
 * Sans loyer connu, seul le plafond absolu joue.
 */
const DEPOSIT_RENT_RATIO = 3;
const FEES_RENT_RATIO = 2;

const AMOUNT = String.raw`(\d{1,3}(?:[ .\u00a0]?\d{3})*(?:[.,]\d{1,2})?)`;
/** « € », « eur », « euros » — puis rien qui en fasse un prix au m². */
const EURO_UNIT = String.raw`\s*(?:€|eur(?:os?)?\b)(?:\s*ttc\b)?(?!\s*(?:\/|par|le|du|au)\s*m)`;

function withinRent(
  value: number | null,
  ratio: number,
  rent: number | null,
  allowZero: boolean,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (allowZero ? value < 0 : value <= 0) return null;
  const max = ratio * (rent ?? PRICE_BOUNDS.max);
  return value <= max ? value : null;
}

/**
 * Un montant de champ dédié : un nombre, une devise, « TTC » au plus.
 * « NC », « 1 mois de loyer » ou « 13 €/m² » ne sont pas des montants.
 */
function amountField(text: string | null | undefined): number | null {
  const cleaned = cleanText(text);
  const match = /^(\d[\d\s.,]*?)\s*(?:€|eur|euros?)?\s*(?:ttc)?$/i.exec(cleaned);
  return match?.[1] === undefined ? null : parseFrenchNumber(match[1]);
}

/** Dépôt de garantie lu dans le champ dédié d'une source. */
export function parseDepositField(
  text: string | null | undefined,
  rent: number | null = null,
): number | null {
  return withinRent(amountField(text), DEPOSIT_RENT_RATIO, rent, false);
}

/** Honoraires du locataire lus dans le champ dédié. `0` affiché reste `0`. */
export function parseFeesField(
  text: string | null | undefined,
  rent: number | null = null,
): number | null {
  return withinRent(amountField(text), FEES_RENT_RATIO, rent, true);
}

/**
 * Montant d'un dépôt : l'espace fine perdue en « ? » entre les milliers
 * (« 1?200 € ») et la virgule détachée (« 1 196 ,00 € ») s'y rencontrent.
 */
const DEPOSIT_AMOUNT = String.raw`(\d{1,3}(?:[ .\u00a0\u202f?]?\d{3})*(?:\s?[.,]\d{1,2})?)`;

/**
 * « € » perdu en « ? » par l'encodage de la source (FNAIM, Locservice,
 * ParuVendu). Admis seulement après un intitulé de dépôt ou de charges.
 */
const LOST_EURO = String.raw`\s*\?(?!\s*\d)`;
const DEPOSIT_UNIT = String.raw`(?:${EURO_UNIT}|${LOST_EURO})`;

const DEPOSIT_LABEL = String.raw`(?:d[ée]p[ôo]ts?\s+de\s+garantie|\bcaution)`;

const DEPOSIT_IN_TEXT: readonly RegExp[] = [
  new RegExp(
    String.raw`d[ée]p[ôo]ts?\s+de\s+garantie\s*(?:obligatoire\s*)?(?:\([^)]*\))?\s*(?:[:=;]\s*|(?:est\s+)?de\s+|d['’]un\s+montant\s+de\s+)?${DEPOSIT_AMOUNT}${DEPOSIT_UNIT}`,
    'i',
  ),
  // « Caution » seule désigne aussi le garant — « caution solidaire », « caution
  // des parents » : le montant doit la suivre immédiatement.
  new RegExp(
    String.raw`\b(?:ch[èe]que\s+)?caution\s*(?:demand[ée]e\s*)?[:=]?\s*${DEPOSIT_AMOUNT}${DEPOSIT_UNIT}`,
    'i',
  ),
  // « Dépôt de garantie : 6 800 . » : sans devise, le deux-points et la
  // ponctuation qui suit bornent le montant.
  new RegExp(String.raw`d[ée]p[ôo]ts?\s+de\s+garantie\s*:\s*${DEPOSIT_AMOUNT}\s*(?:[.;]|$)`, 'i'),
];

/** Mois écrits en lettres, en minuscules sans accent. */
const SPELLED_MONTHS: Readonly<Record<string, number>> = { un: 1, une: 1, deux: 2, trois: 3 };

/**
 * « Dépôt de garantie : 2 mois de loyer hors charges », « Caution un mois »,
 * « 1 mois de loyer pour dépôt de garantie ». Le montant qui suit (« soit 880 € »)
 * est lu par les motifs ci-dessus ou `STATED_AFTER_MONTHS`.
 */
const DEPOSIT_IN_MONTHS: readonly RegExp[] = [
  new RegExp(
    String.raw`${DEPOSIT_LABEL}\s*(?:\([^)]*\))?\s*(?:[:=;]\s*|de\s+)?(\d|un|une|deux|trois)\s+mois(\s+de\s+loyers?)?([^.;]{0,30})`,
    'i',
  ),
  /\b(\d|un|une|deux|trois)\s+mois\s+(de\s+loyers?)([^.;]{0,20}?)\s+(?:pour|de|en)\s+(?:d[ée]p[ôo]t\s+de\s+garantie|caution)/i,
];

/**
 * « soit 880 euros », « (2 050 € TTC) », « 1 mois 980 € » juste après la durée.
 * Ni chiffre ni deux-points avant : « hors charges Honoraires : 574 € » n'est
 * pas le dépôt.
 */
const STATED_AFTER_MONTHS = new RegExp(
  String.raw`^(?:[^.;:\d]{0,25}?(?:soit|\(|=))?\s*${DEPOSIT_AMOUNT}${DEPOSIT_UNIT}`,
  'i',
);

/**
 * Dépôt de garantie écrit dans la description : « Dépôt de garantie : 1 000 € »,
 * « DEPOT DE GARANTIE 630 EUROS ». Le montant doit suivre l'intitulé.
 *
 * « 2 mois de loyer » n'est converti que si le LOYER HORS CHARGES est connu
 * (`rentExcludingCharges`) : c'est la base légale quand la phrase ne dit rien,
 * et celle qu'elle nomme le plus souvent. Une durée « charges comprises » ne
 * se convertit pas.
 */
export function parseDepositFromText(
  text: string | null | undefined,
  rent: number | null = null,
  rentExcludingCharges: number | null = null,
): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  const bounded = (value: number | null): number | null =>
    withinRent(value, DEPOSIT_RENT_RATIO, rent, false);

  for (const pattern of DEPOSIT_IN_TEXT) {
    const raw = pattern.exec(cleaned)?.[1];
    const value = bounded(raw === undefined ? null : parseFrenchNumber(raw));
    if (value !== null) return value;
  }
  for (const pattern of DEPOSIT_IN_MONTHS) {
    const match = pattern.exec(cleaned);
    const count = match?.[1];
    if (match === null || count === undefined) continue;
    const tail = cleaned.slice(match.index + match[0].length - (match[3]?.length ?? 0));
    const stated = STATED_AFTER_MONTHS.exec(tail)?.[1];
    if (stated !== undefined) return bounded(parseFrenchNumber(stated));
    const months = SPELLED_MONTHS[count.toLowerCase()] ?? Number.parseInt(count, 10);
    const qualifier = comparable(match[3]);
    if (/\b(?:charges comprises|cc|tcc|charges incluses)\b/.test(qualifier)) return null;
    if (rentExcludingCharges === null || months < 1 || months > 3) return null;
    return bounded(Math.round(months * rentExcludingCharges * 100) / 100);
  }
  return null;
}

/** L'intitulé entre « honoraires » et le montant : court, dans la même phrase. */
const FEES_IN_TEXT = new RegExp(
  String.raw`honoraires([^\d:€.;]{0,60}?)\s*(?:[:=]\s*|sont\s+de\s+|de\s+)?${AMOUNT}${EURO_UNIT}`,
  'gi',
);
const EDL_LABEL = /^\s*(?:d['’]|de\s+l['’]|pour\s+l['’])?\s*[ée]tat\s+des\s+lieux/i;
const LANDLORD_LABEL = /bailleur|propri[ée]taire/i;

/**
 * Honoraires du locataire écrits dans la description.
 *
 * Le premier montant intitulé « honoraires » est le total. Des honoraires
 * d'état des lieux énoncés À PART s'y ajoutent, sauf s'ils sont annoncés
 * « dont » : sinon on afficherait une somme d'entrée trop basse.
 */
export function parseFeesFromText(
  text: string | null | undefined,
  rent: number | null = null,
): number | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;

  let total: number | null = null;
  let totalEnd = 0;
  for (const match of cleaned.matchAll(FEES_IN_TEXT)) {
    const label = match[1] ?? '';
    const amount = match[2] === undefined ? null : parseFrenchNumber(match[2]);
    if (amount === null || LANDLORD_LABEL.test(label)) continue;
    const isInventory = EDL_LABEL.test(label);
    if (total === null) {
      if (isInventory) continue;
      total = amount;
      totalEnd = (match.index ?? 0) + match[0].length;
    } else if (isInventory && !/\bdont\b/i.test(cleaned.slice(totalEnd, match.index))) {
      total += amount;
      break;
    }
  }
  return withinRent(total, FEES_RENT_RATIO, rent, true);
}

/**
 * Adjectifs qu'une annonce accole au mot « quartier » sans nommer de lieu —
 * « quartier Calme », « secteur Résidentiel ». Ce ne sont pas des quartiers.
 */
const NOT_A_DISTRICT =
  /^(calme|residentiel|anime|prise|recherche|vivant|agreable|historique|commercant|pavillonnaire|securise|dynamique|central|populaire|familial)$/i;

/**
 * QUARTIER nommé explicitement dans le texte — « quartier Riquier », « secteur
 * du Mont Boron ».
 *
 * Le quartier n'était lu que dans un champ dédié, que neuf sources sur
 * quarante remplissent : neuf pour cent des fiches en avaient un. Il est
 * pourtant écrit dans cinquante-sept descriptions de plus, et il compte —
 * c'est lui qui place la punaise et le lien Maps quand la rue manque (§20).
 *
 * LA TOURNURE SE DÉSIGNE ELLE-MÊME : « quartier X » ou « secteur X » suivi
 * d'un NOM PROPRE. Pas de dictionnaire de quartiers niçois à tenir à jour, et
 * surtout aucun rapprochement par ressemblance — « proche de Cimiez » ne dit
 * pas que le bien y est. La majuscule fait le tri : « quartier calme » décrit
 * une ambiance, « quartier Carabacel » nomme un lieu (§17).
 */
const NAMED_DISTRICT =
  /\b(?:quartier|secteur)\s+(?:de\s+|du\s+|des\s+|d['’]\s?)?([A-ZÉÈÀÂÎÔÛÇ][\wÀ-ÿ'’-]+(?:[ -][A-ZÉÈÀÂÎÔÛÇ][\wÀ-ÿ'’-]+){0,2})/;

/**
 * Les quartiers de Nice, tels que les annonces les écrivent.
 *
 * IL EN FALLAIT UNE LISTE, et voici pourquoi. La détection ne reconnaissait un
 * quartier qu'ANNONCÉ comme tel — « Quartier Madeleine », « secteur Cimiez ».
 * Or les agences l'écrivent presque toujours nu, dans le titre : « Studio
 * meublé de 25 m² à la madeleine », « Studio Nice Fabron résidence piscine »,
 * « Location meublée Nice Port/Riquier ». Sur cinq annonces portant un nom de
 * quartier évident, une seule était reconnue.
 *
 * UNE LISTE FERMÉE PLUTÔT QU'UNE RÈGLE : « à la madeleine » ne se distingue
 * d'un lieu-dit quelconque que si l'on SAIT que c'est un quartier de Nice. On
 * ne devine pas, on reconnaît (§17) — et un nom absent de cette liste laisse le
 * quartier vide, ce qui est la bonne réponse quand on ne sait pas.
 *
 * ELLE VIENT DE `shared`, ET C'ÉTAIT TOUT L'ENJEU. Le collecteur en tenait une
 * COPIE, figée à trente-cinq noms là où la table partagée en compte
 * soixante-dix-huit, alias compris. Les deux ont donc divergé exactement comme
 * le §75 le redoutait, et le prix se lit en base : Carabacel, Gorbella, Grosso,
 * Valrose, Cessole, Masséna, le Parc Impérial, la Promenade des Anglais, le
 * Carré d'or n'existaient pas pour la normalisation, quand l'écran et le filtre
 * les proposaient. Relevé du 2026-09-16 sur l'inventaire niçois : **1 014
 * occupations de plus reçoivent leur quartier, aucune ne le perd**.
 *
 * L'ORDRE EST SIGNIFIANT, et la table partagée le porte déjà : le premier nom
 * reconnu l'emporte, donc le plus précis vient d'abord. « Nice Ouest Madeleine »
 * doit donner Madeleine, le quartier, et non Nice Ouest, le secteur qui en
 * contient une demi-douzaine ; « Petit Fabron » doit l'emporter sur « Fabron » ;
 * et « Centre-ville », libellé large, ne se déclenche qu'à défaut de tout le
 * reste.
 */
const DISTRICT_SPELLINGS: readonly {
  readonly label: string;
  readonly patterns: readonly RegExp[];
}[] = NICE_DISTRICTS.map((district) => ({
  label: district.label,
  // Compilées une fois : cette reconnaissance passe sur chaque titre et
  // chaque description de chaque annonce, à chaque passage.
  patterns: [district.label, ...(district.aliases ?? [])].map(
    (spelling) => new RegExp(`\\b${districtComparable(spelling).replace(/ /g, '\\s+')}\\b`),
  ),
}));

/**
 * Forme comparable propre aux noms de quartiers : celle de `comparable`, plus
 * l'abréviation dépliée.
 *
 * « St Roch », « Ste Marguerite », « St Pierre de Féric » : les annonces
 * abrègent, la table partagée écrit en toutes lettres. Sans ce dépliage, les
 * deux ne se rencontrent jamais — et c'est la règle que `shared` applique déjà
 * de son côté, reprise ici pour que les deux moitiés du projet lisent un nom de
 * quartier de la même façon.
 */
function districtComparable(input: string): string {
  return comparable(input)
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte');
}

/**
 * « Proche de Cimiez » ne dit PAS que le bien est à Cimiez — il dit le
 * contraire. Ces tournures précèdent un repère dont l'annonce se rapproche, et
 * un nom de quartier qui les suit n'est pas celui du logement (§17).
 *
 * SUR DES MOTS ENTIERS. Sans l'ancre, « Nice cENTRE Carabacel » se lisait
 * « entre », la préposition, et le quartier qui suivait était rejeté comme un
 * simple voisin — le titre perdait Carabacel pour ne garder que le
 * centre-ville. « aPRES », « cyPRES » tendaient le même piège à « pres ». La
 * tournure doit commencer un mot, sinon elle n'en est pas une.
 */
const NEAR_BUT_NOT_IN =
  /\b(?:proche|proximite|pres|pied|deux pas|face|limitrophe|vers|entre|acces|direction)(?: de| du| des| d| a)?$/;

/**
 * Les derniers mots avant un nom de quartier l'éloignent-ils du bien ?
 * « vers LE QUARTIER Magnan » : le mot s'intercale entre la tournure et le nom.
 */
function pointsElsewhere(before: string): boolean {
  const tail = comparable(before)
    .slice(-30)
    .trimEnd()
    .replace(/(?: le| la| du| au| des)? (?:quartier|secteur)(?: de| du| des| d)?$/, '')
    .replace(/(?: la| le| l)$/, '');
  return NEAR_BUT_NOT_IN.test(tail);
}

/**
 * Le quartier niçois nommé dans un texte, s'il en est un de connu.
 *
 * La comparaison se fait en forme `comparable` — minuscules, sans accent ni
 * ponctuation — sur des MOTS ENTIERS : « Port » ne doit se déclencher ni sur
 * « aéroport », ni sur « portes ».
 *
 * ON REND LE NOM DE LA TABLE, jamais la graphie rencontrée : « carré d'or » et
 * « hyper centre » désignent le Centre-ville, et c'est sous ce nom-là que le
 * filtre de l'écran et le rapprochement les attendent.
 */
function knownNiceDistrict(text: string): string | null {
  const haystack = districtComparable(text);
  for (const district of DISTRICT_SPELLINGS) {
    for (const pattern of district.patterns) {
      const found = pattern.exec(haystack);
      if (found === null) continue;
      // Ce qui précède décide : « à la Madeleine » situe, « proche de la
      // Madeleine » éloigne. On regarde les quelques mots d'avant.
      if (pointsElsewhere(haystack.slice(0, found.index))) continue;
      return district.label;
    }
  }
  return null;
}

/**
 * Le quartier nommé dans le texte, ou `null`.
 *
 * Deux chemins : le quartier ANNONCÉ (« quartier X », « secteur X »), qui
 * accepte n'importe quel nom, puis à défaut un quartier niçois RECONNU, qui
 * n'accepte que ceux de la liste.
 */
/**
 * Le quartier d'une annonce, TITRE D'ABORD.
 *
 * L'ordre compte, et il a coûté une erreur : « RIQUIER — 3 rooms in lovely
 * flat » se retrouvait situé au Vieux Nice, parce que sa description en
 * parlait. Le titre nomme le quartier DU BIEN ; la description énumère ce
 * qu'il y a autour. On ne descend donc dans la seconde que si le premier ne
 * dit rien.
 */
export function parseDistrictOf(
  title: string | null | undefined,
  description: string | null | undefined,
): string | null {
  return parseDistrict(title) ?? parseDistrict(description);
}

export function parseDistrict(text: string | null | undefined): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  const named = NAMED_DISTRICT.exec(cleaned);
  const name = named?.[1];
  if (
    named !== null &&
    name !== undefined &&
    !NOT_A_DISTRICT.test(comparable(name)) &&
    !pointsElsewhere(cleaned.slice(0, named.index))
  ) {
    return name;
  }
  return knownNiceDistrict(cleaned);
}

/**
 * Jusqu'où, dans une description, une adresse reste crédible.
 *
 * C'est une limite de POSITION, pas de texte : l'adresse doit COMMENCER avant
 * ce point, mais le texte est lu en entier.
 *
 * On coupait la description à cette longueur avant de chercher, et une adresse
 * à cheval sur la limite ressortait amputée : « situé au 132 corniche fleurie,
 * 06200 Nice » rendait « 132 corniche fle », le cent-vingtième signe tombant au
 * milieu du nom de la voie. Une rue qui n'existe pas ne se géocode pas — la
 * fiche perdait donc à la fois son point sur la carte et son temps de trajet.
 */
const ADDRESS_HEAD = 120;

/**
 * Ce qui sépare deux segments d'une description.
 *
 * La virgule ne suffisait pas : les agences niçoises composent leur accroche au
 * TIRET — « NICE CENTRE - RUE DE PARIS - 3 PIÈCES - PROCHE GARE » — ou en
 * phrases — « Pasteur - rue Raoul Lesueur. Au 5ème étage ». Les trois tirets
 * typographiques sont acceptés, les sites mélangeant les trois.
 *
 * UN ESPACE D'UN SEUL CÔTÉ SUFFIT, et l'exiger des deux coûtait des voies : les
 * agences tapent « NICE NORD - Av Jean Canavese -à proximité des commerces », où
 * le second tiret colle au mot suivant. Le segment ne se fermait alors jamais,
 * la voie s'y noyait avec la phrase entière, et l'annonce restait sans adresse.
 * Le tiret INTERNE à un mot ne coupe toujours pas — « Rue Jean-Jaurès » n'a
 * d'espace ni devant ni derrière.
 *
 * LE DEUX-POINTS EN FAIT PARTIE, et son absence coûtait cher : Citya annonce
 * ses biens « À LOUER : AVENUE JOSEPH RAYBAUD, 06300 NICE ». Sans lui, le
 * premier segment est « À LOUER : AVENUE JOSEPH RAYBAUD », qui ne COMMENCE pas
 * par un type de voie — l'adresse était perdue alors qu'elle était écrite en
 * toutes lettres. En français, le deux-points sépare l'annonce de son contenu :
 * c'est une frontière de segment aussi sûre qu'une virgule.
 *
 * Le point d'une abréviation ne coupe pas : « NICE NORD - AV. ST MAURICE »
 * perdait sa voie, réduite à « AV ».
 */
const SEGMENT_BREAK = /[,;/:¶]|(?<!\b(?:av|bd|st|ste))\.|(?<=\s)[-–—]|[-–—](?=\s)/i;

/**
 * Marqueur de fin de ligne, posé avant le nettoyage.
 *
 * Un retour à la ligne sépare deux idées aussi sûrement qu'une virgule, mais
 * `cleanText` l'aplatit en simple espace : sans ce repère, « rue Dr Barety ⏎
 * Dans résidence sécurisée » ne formait qu'un segment, et l'adresse retenue
 * emportait la phrase suivante.
 */
const LINE_BREAK_MARK = ' ¶ ';

/**
 * Extrait une adresse de rue (« 22-24 Avenue de la Californie », « Rue Smolett »)
 * du DÉBUT d'une description — beaucoup d'agences l'y placent en première ligne.
 *
 * Volontairement restreint aux ~80 premiers caractères : plus loin dans le
 * texte, une adresse est souvent celle d'un commerce voisin ou de l'agence
 * (« proche de l'avenue Jean Médecin ») — mieux vaut rien qu'une adresse
 * fausse (§17, §20).
 *
 * Deux formes sont acceptées, dans cet ordre :
 *   1. avec numéro, n'importe où dans cette tête — un numéro de voie est un
 *      signal fort, il ne s'écrit pas par hasard ;
 *   2. sans numéro, mais seulement si la voie occupe TOUT un segment. C'est ce
 *      qui distingue « …, Rue Francis Gallo, … » ou « NICE CENTRE - RUE DE
 *      PARIS - 3 PIÈCES », qui situent le bien, de « proche de l'avenue Jean
 *      Médecin » ou « entre la porte fausse et la place Rossetti », qui
 *      décrivent les alentours : ceux-là ne COMMENCENT pas par un type de voie.
 */
export function extractStreetAddress(text: string | null | undefined): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;

  // On cherche dans le texte ENTIER, et l'on vérifie ENSUITE que l'adresse
  // commence assez tôt. Couper d'abord amputait celles qui chevauchaient la
  // limite.
  const numbered = STREET_ADDRESS.exec(cleaned);
  if (numbered !== null && numbered.index > ADDRESS_HEAD) return null;
  // Le même garde-fou que pour une voie sans numéro : quand la ponctuation
  // manque, l'adresse mord sur la phrase suivante — « 1 rue de Orestis Très
  // bel appartement de ». Un numéro ne rachète pas une adresse fausse.
  if (numbered?.[1] !== undefined) {
    // ON COUPE D'ABORD, ON JUGE ENSUITE. Couper devant la prose ou l'accroche
    // sauve l'adresse au lieu de la jeter avec la phrase, et le fait AVANT le
    // contrôle rattrape aussi le candidat qui paraissait propre en gardant un
    // mot de trop — « 1 boulevard Lech Walesa Joli ».
    // Le tiret entouré d'espaces clôt la voie : « 17 AV DE LA CALIFORNIE -
    // STUDIO VIDE » était sinon jeté avec l'accroche.
    const head = numbered[1].split(/\s+[-–—]\s+/)[0] ?? numbered[1];
    const candidate = trimAtProse(head) ?? head;
    if (isCleanStreet(candidate)) return cleanText(candidate);
  }

  // Les segments sont découpés sur le texte ENTIER puis bornés par leur position
  // de départ : tronquer d'abord aurait pu couper un nom de voie en son milieu
  // et livrer une adresse incomplète.
  let offset = 0;
  const segmented = cleanText(String(text ?? '').replace(/[\r\n]+/g, LINE_BREAK_MARK));
  for (const segment of segmented.split(SEGMENT_BREAK)) {
    if (offset > ADDRESS_HEAD) break;
    offset += segment.length + 1;
    const trimmed = segment.trim();
    // Coupée d'abord, comme la forme numérotée : sans quoi « avenue Malaussena
    // très bien placé » passait entier, l'accroche comprise.
    const candidate = trimAtProse(trimmed) ?? trimmed;
    if (BARE_STREET.test(candidate) && isCleanStreet(candidate)) return cleanText(candidate);
  }
  return null;
}

/** Mois français (forme comparable, sans accent) → numéro 1-12. */
const FRENCH_MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

/**
 * « Tout de suite », dans les mots des annonces.
 *
 * Séparé du simple « libre » : celui-ci se promène dans les descriptions
 * (« une chambre libre sur deux », « les diagnostics sont disponibles »), alors
 * qu'aucune de ces tournures-ci ne s'emploie pour autre chose.
 */
const AVAILABLE_NOW =
  /(?<!proximite )\b(immediat\w*|de suite|des maintenant|des a present)\b|^(?:disponible|libre) actuellement\b/;

/** « Libre », « disponible », employés seuls. */
const AVAILABLE_BARE = /\b(libre|disponible)\b/;

/**
 * Un jour et un mois, écrits comme les agences les écrivent.
 *
 * `\s*(?:er|ere|eme)?\s+` PLUTÔT QUE `(?:er)?\s+`, et ce détail valait
 * soixante annonces. BEP écrit « DISPONIBLE LE 1 ER OCTOBRE », avec une espace
 * entre le chiffre et son suffixe ; l'ancienne forme exigeait « 1er » collé et
 * ne lisait donc aucune de ces dates.
 */
const DAY_AND_MONTH =
  /\b(\d{1,2})\s*(?:er|ere|eme)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\b/;

/**
 * Un mois SANS jour : « disponible de octobre à mai », « à partir de septembre ».
 *
 * On retient le PREMIER de ce mois. Ce n'est pas une invention (§17) mais la
 * lecture de la phrase : « à partir d'octobre » ne désigne aucune autre date
 * que le début d'octobre. La précision perdue — au plus quelques jours — est
 * sans commune mesure avec l'information gagnée : sans cette règle, ces
 * annonces n'ont pas de disponibilité du tout.
 */
const MONTH_ONLY =
  /\b(?:de|des|du|en|le|a partir de|a partir du|a partir d|a compter de|a compter du|a compter d)\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/;

/**
 * « Début octobre », « mi-septembre », « fin septembre » : le 1er, le 15, le
 * dernier jour. Le dernier jour plutôt que le 1er pour « fin » : mieux vaut
 * annoncer un logement libre un peu tard que trop tôt.
 */
const MONTH_PART =
  /\b(debut|mi|fin)\s+(?:de\s+|d\s+)?(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/;

/** « Au 29/09 », « à partir du 12/10 » : jour et mois sans année, deux chiffres chacun. */
const DAY_MONTH_NUMERIC = /\b(?:au|le|du)\s+(\d{2})[/.](\d{2})(?![/.]?\d)/;

/** « 01/10/26 » : l'année sur deux chiffres. */
const SHORT_YEAR_DATE = /\b(\d{2})[/.-](\d{2})[/.-](\d{2})(?![/.-]?\d)/;

/**
 * Au-delà de ce recul, une date sans année désigne l'année PROCHAINE.
 *
 * PLUSIEURS SEMAINES, ET NON UN JOUR. La tolérance d'un jour envoyait
 * « disponible le 1er septembre », lu le 7 septembre, au 1er septembre 2027 :
 * une annonce libre depuis six jours devenait indisponible pendant un an. Une
 * disponibilité qui vient de passer veut dire « c'est libre » ; une qui date de
 * six mois, elle, désigne bien le prochain tour.
 *
 * Porté à quatre-vingt-dix jours : « Disponible début août », encore en ligne
 * mi-septembre (trois annonces au 2026-09-15), partait en août 2027. Une
 * annonce reste en ligne des semaines, et n'annonce presque jamais une entrée
 * à dix mois.
 */
const STALE_AVAILABILITY_DAYS = 90;

/** Une année explicite, quelque part dans la phrase. */
const NEARBY_YEAR = /\b(20\d{2})\b/;

/**
 * La date française lue dans un texte déjà mis en forme comparable.
 *
 * SANS ANNÉE, ON PREND LA PROCHAINE OCCURRENCE : une disponibilité est toujours
 * devant soi, contrairement à une date de publication.
 */
interface DayOfMonth {
  readonly index: number;
  readonly month: number;
  /** Jour du mois ; `'last'` pour « fin <mois> ». */
  readonly day: number | 'last';
  readonly year?: string;
}

/** Le jour et le mois de la PREMIÈRE date écrite : « de octobre à fin mai » part d'octobre. */
function firstDayOfMonth(lower: string): DayOfMonth | null {
  const candidates: DayOfMonth[] = [];
  const exact = DAY_AND_MONTH.exec(lower);
  if (exact?.[1] !== undefined && exact[2] !== undefined) {
    candidates.push({
      index: exact.index,
      month: FRENCH_MONTHS[exact[2]] ?? 0,
      day: Number.parseInt(exact[1], 10),
      ...(exact[3] === undefined ? {} : { year: exact[3] }),
    });
  }
  const part = MONTH_PART.exec(lower);
  if (part?.[1] !== undefined && part[2] !== undefined) {
    const day = part[1] === 'debut' ? 1 : part[1] === 'mi' ? 15 : 'last';
    candidates.push({ index: part.index, month: FRENCH_MONTHS[part[2]] ?? 0, day });
  }
  const only = MONTH_ONLY.exec(lower);
  if (only?.[1] !== undefined) {
    candidates.push({ index: only.index, month: FRENCH_MONTHS[only[1]] ?? 0, day: 1 });
  }
  const numeric = DAY_MONTH_NUMERIC.exec(lower);
  if (numeric?.[1] !== undefined && numeric[2] !== undefined) {
    const month = Number.parseInt(numeric[2], 10);
    candidates.push({ index: numeric.index, month, day: Number.parseInt(numeric[1], 10) });
  }
  const first = candidates.sort((a, b) => a.index - b.index)[0];
  return first !== undefined && first.month >= 1 && first.month <= 12 ? first : null;
}

function utcDay(year: number, month: number, day: number | 'last'): Date {
  return day === 'last'
    ? new Date(Date.UTC(year, month, 0))
    : new Date(Date.UTC(year, month - 1, day));
}

function frenchDateFrom(lower: string, nowMs: number): string | null {
  // « SEPTEMBRE2026 » : l'année collée au mois.
  const spaced = lower.replace(
    /(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(20\d{2})\b/g,
    '$1 $2',
  );
  const found = firstDayOfMonth(spaced);
  if (found === null) return null;
  const { month, day } = found;
  if (day !== 'last' && (day < 1 || day > 31)) return null;

  // L'ANNÉE PEUT ÊTRE AILLEURS DANS LA PHRASE : « libre du 1er août au 31 août
  // 2026 » ne la porte que sur la seconde date, et l'ignorer faisait basculer
  // la première d'un an.
  // … sauf si elle renvoie à plus de onze mois : « à partir d'octobre jusqu'à
  // juin 2027 », lu en septembre 2026, part d'octobre 2026.
  const nearby = found.year === undefined ? NEARBY_YEAR.exec(spaced)?.[1] : undefined;
  const farAhead =
    nearby !== undefined &&
    utcDay(Number.parseInt(nearby, 10), month, day).getTime() > nowMs + 330 * 86_400_000;
  const stated = found.year ?? (farAhead ? undefined : nearby);
  let year = stated !== undefined ? Number.parseInt(stated, 10) : new Date(nowMs).getUTCFullYear();
  let date = utcDay(year, month, day);
  if (stated === undefined && date.getTime() < nowMs - STALE_AVAILABILITY_DAYS * 86_400_000) {
    year += 1;
    date = utcDay(year, month, day);
  }
  // « 31/02 » déborde sur mars : ce n'est pas une date.
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== month - 1) return null;
  return date.toISOString();
}

/** « 01/10/26 » → 1er octobre 2026. */
function shortYearDate(lower: string): string | null {
  const match = SHORT_YEAR_DATE.exec(lower);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  const month = Number.parseInt(match[2], 10);
  const date = new Date(Date.UTC(2000 + Number.parseInt(match[3], 10), month - 1, +match[1]));
  return date.getUTCMonth() === month - 1 ? date.toISOString() : null;
}

export interface AvailabilityOptions {
  /**
   * « Libre » ou « disponible », seuls et sans date, valent-ils « tout de
   * suite » ?
   *
   * VRAI POUR UN CHAMP DÉDIÉ : la source a répondu à la question, sa réponse
   * est « maintenant ». FAUX DANS UNE DESCRIPTION, où le mot se promène — « les
   * diagnostics sont disponibles sur Géorisques » figure dans un quart des
   * annonces et ne dit rien de la date d'entrée.
   */
  readonly bareWordMeansNow?: boolean;
}

/**
 * Date de disponibilité d'un logement (§17).
 *
 * Comprend, en plus des formats de `parsePublishedAt` :
 *   - « immédiatement », « de suite », « dès maintenant » → maintenant ;
 *   - les dates textuelles françaises « 1er septembre 2027 », « 15 mars »,
 *     « 1 ER OCTOBRE » — sans année, la PROCHAINE occurrence ;
 *   - un mois seul, quand la phrase le présente comme un départ.
 *
 * L'ORDRE A CHANGÉ, ET IL COMPTE. « Libre » était examiné en premier et rendait
 * « maintenant » : « LIBRE DU 1ER AOÛT AU 31 AOÛT 2026 » devenait donc
 * disponible aujourd'hui, alors que la phrase donne une date. Les dates passent
 * désormais avant le mot nu.
 */
export function parseAvailableAt(
  text: string | null | undefined,
  nowMs: number,
  options: AvailabilityOptions = {},
): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;
  // Une date ISO d'API : le jour tel qu'écrit, pas l'instant.
  const day = isoCalendarDay(cleaned);
  if (day !== null) return day;
  const lower = comparable(cleaned);

  if (AVAILABLE_NOW.test(lower)) return new Date(nowMs).toISOString();

  // Barres et points gardés : « au 29/09 » en a besoin.
  const dated = unaccentedLower(cleaned)
    .replace(/[^a-z0-9/.\s]/g, ' ')
    .replace(/\s+/g, ' ');
  const textual = frenchDateFrom(dated, nowMs);
  if (textual !== null) return textual;

  // Formats numériques et relatifs communs avec la date de publication.
  const numeric = parsePublishedAt(text, nowMs) ?? shortYearDate(dated);
  if (numeric !== null) return numeric;

  return (options.bareWordMeansNow ?? true) && AVAILABLE_BARE.test(lower)
    ? new Date(nowMs).toISOString()
    : null;
}

/**
 * La disponibilité repérée dans un TEXTE LIBRE — titre, description.
 *
 * ON NE LIT PAS LA DESCRIPTION ENTIÈRE, mais les quelques mots qui suivent
 * chaque « disponible » ou « libre » : une description mentionne des dates pour
 * dix raisons — travaux, diagnostic, bail précédent — et la première venue
 * n'est presque jamais la bonne.
 *
 * « LIBRE » ÉTAIT ABSENT DE CETTE RECHERCHE, et c'est ce qui manquait le plus :
 * BEP écrit « BAIL A L ANNEE LIBRE DE SUITE » sans jamais employer le mot
 * « disponible ». Aucune de ces annonces n'avait de date.
 *
 * TOUTES LES OCCURRENCES SONT ESSAYÉES, pas seulement la première : « les
 * diagnostics sont disponibles sur Géorisques » ouvre souvent le bal, et
 * s'arrêter là condamnait la vraie phrase, trois lignes plus bas.
 */
export function parseAvailabilityInText(
  text: string | null | undefined,
  nowMs: number,
): string | null {
  const cleaned = cleanText(text);
  if (cleaned === '') return null;

  for (const window of cleaned.matchAll(AVAILABILITY_WINDOW)) {
    // « Disponible jusqu'au 15 mai » dit quand ça s'arrête, pas quand on entre.
    if (/^\S+\s+jusqu/i.test(window[0])) continue;
    const found = parseAvailableAt(window[0], nowMs, { bareWordMeansNow: false });
    if (found !== null) return found;
  }
  // « Immédiatement disponible » : l'adverbe précède le mot.
  return /\b(?:imm[ée]diatement|actuellement)\s+(?:disponible|libre)\b/i.test(cleaned)
    ? new Date(nowMs).toISOString()
    : null;
}

/**
 * La phrase qui annonce l'entrée : après « disponible » ou « libre », ou un
 * « à partir du » rattaché à la location — « LOCATION ÉTUDIANTE À PARTIR DU
 * 01 SEPTEMBRE ». Seul, « à partir du » introduit aussi l'étude des dossiers
 * ou une révision du loyer. Un point suivi d'un chiffre ne clôt pas la phrase
 * (« 21.09.2026 »).
 */
const AVAILABILITY_WINDOW =
  /(?:disponn?ibl\w*|disponibilit\w*|libre|dispo\b|(?:location|louer|lou[ée]e?|bail)[^.;!]{0,25}?(?:[àa] partir|[àa] compter|d[èe]s le)|(?:^|[.!¦]\s*)[àa] partir d)(?:[^.;!]|\.(?=\d)){0,70}/gi;
