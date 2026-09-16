/**
 * Critères de recherche (§2).
 *
 * Pour le MVP, seuls trois critères sont actifs : ville, budget, surface.
 * Les autres champs existent pour que l'ajout d'un critère ne demande aucune
 * modification de structure — uniquement une règle de scoring supplémentaire.
 * Ils valent `undefined` tant qu'ils ne sont pas utilisés : un critère absent
 * n'est pas un critère à zéro.
 */

import type { PropertyType } from './listing.js';

export interface SearchCriteria {
  // --- Actifs dans le MVP ---------------------------------------------------
  /** Villes recherchées, en minuscules sans accent, ex. `['nice']`. */
  readonly cities: readonly string[];
  /** Loyer mensuel maximum en euros, charges comprises. */
  readonly maxPrice: number;
  /** Surface minimum en m². */
  readonly minArea: number;

  // --- Prévus, inactifs par défaut (§2) ------------------------------------
  /**
   * Loyer mensuel MINIMUM en euros. Sert surtout à écarter les biens non
   * résidentiels mal étiquetés « appartement » par la source (parking, box,
   * cave à ~100 €), qu'aucun autre signal fiable ne distingue. Un bien sans
   * prix publié n'est jamais exclu (§17).
   */
  readonly minPrice?: number;
  /**
   * `true` : exclure les locations ÉTUDIANTES (résidences étudiantes, biens
   * annoncés « étudiant/erasmus »). Détecté par mots-clés dans le titre, la
   * description et l'URL. Décision utilisateur.
   */
  readonly excludeStudent?: boolean;
  readonly propertyTypes?: readonly PropertyType[];
  readonly minRooms?: number;
  readonly maxRooms?: number;
  readonly furnished?: boolean;
  /**
   * `true` : exclure les biens proposés EN colocation de la liste principale
   * (ils restent collectés et consultables via « hors critères », §53). Un
   * bien dont la source ne précise rien n'est PAS exclu (on n'élimine pas sur
   * une donnée absente, §17).
   */
  readonly excludeFlatShare?: boolean;
  /**
   * Quartiers retenus, par leur slug canonique (voir `districts.ts`). Vide ou
   * absent = toute la commune.
   *
   * IL EXISTAIT SANS RIEN FAIRE : le champ était déclaré, personne ne le
   * lisait, et aucun écran ne permettait de le remplir. Il porte désormais la
   * « zone de recherche » — c'est le quartier qui décide du trajet, du
   * voisinage et du prix au mètre, pas la commune.
   *
   * LES ANNONCES SANS QUARTIER CONNU SONT GARDÉES PAR DÉFAUT — voir
   * `includeUnknownDistrict` et `trait-filters.ts`.
   */
  readonly districts?: readonly string[];
  /**
   * Garder les annonces dont le quartier est INCONNU quand des quartiers sont
   * nommés. Absent = oui.
   *
   * Les digests des portails n'indiquent jamais de quartier : en liste blanche
   * stricte, vingt-quatre quartiers cochés masquaient 125 annonces sur 193, et
   * les notifications s'étaient tues (relevé le 2026-09-10). Décoché, on ne
   * garde que les quartiers nommés.
   */
  readonly includeUnknownDistrict?: boolean;
  /**
   * Filtre sur la NATURE DU BAILLEUR (décision utilisateur) :
   * - `'all'` (défaut) : aucune restriction.
   * - `'private'` : masque les annonces d'AGENCE connue. Les particuliers ET
   *   les bailleurs INCONNUS restent affichés — on n'élimine pas sur une donnée
   *   absente (§17), et les alertes e-mail SeLoger/Bien'ici (souvent inconnues)
   *   restent visibles.
   * - `'agency'` : ne garde QUE les agences connues.
   * `'private'` et `'agency'` partitionnent l'ensemble : chaque annonce est dans
   * l'un ou l'autre, `'all'` est leur union.
   */
  readonly landlordFilter?: 'all' | 'private' | 'agency';
  /**
   * Filtre sur le caractère MEUBLÉ (décision utilisateur), distinct de la
   * préférence notée `furnished` :
   * - `'all'` (défaut) : aucune restriction.
   * - `'furnished'` : ne garde que les biens meublés (et ceux au statut inconnu,
   *   §17 — on n'élimine pas sur une donnée absente).
   * - `'unfurnished'` : ne garde que les biens NON meublés (+ inconnus).
   */
  readonly furnishedFilter?: 'all' | 'furnished' | 'unfurnished';
  /**
   * Durée maximale acceptée du trajet DOMICILE → TRAVAIL, en minutes. Au-delà,
   * l'annonce est hors critères (§53). Comparée au temps de trajet réel en
   * transports en commun quand il est disponible (Navitia, §20), sinon à
   * l'estimation vol d'oiseau. Un bien sans localisation connue n'est jamais
   * exclu sur ce critère (§17). Absent → pas de plafond de trajet.
   */
  readonly maxCommuteMinutes?: number;
  /**
   * Date d'emmenagement souhaitee (`AAAA-MM-JJ`). Ne garde que les logements
   * disponibles au plus tard ce jour-la — ceux dont la date est INCONNUE
   * restent affiches (§17), comme pour tous les filtres de ce fichier.
   *
   * Filtre de LECTURE : il n'entre pas dans `matches_criteria`, sinon le
   * decocher ne ramenerait rien (voir `trait-filters.ts`).
   */
  readonly availableBy?: string;
  /** Durée maximale acceptée vers un point de référence, en minutes. */
  readonly maxDurationToReference?: Readonly<Record<string, number>>;
  /** Classes DPE acceptées, ex. `['A', 'B', 'C']`. */
  readonly energyClasses?: readonly string[];
  readonly requiresBalcony?: boolean;
  readonly requiresParking?: boolean;
}

/**
 * Critères du MVP (§2).
 *
 * Ces valeurs sont publiques et peuvent figurer dans le dépôt : elles ne
 * révèlent rien de personnel, contrairement aux points de référence (§20).
 */
export const MVP_CRITERIA: SearchCriteria = {
  cities: ['nice'],
  maxPrice: 700,
  // 20 m² depuis le 2026-09-01 (12 → 14 le 2026-08-15 → 16 le 2026-08-22 → 18 le
  // 2026-08-25 → 20) — décisions utilisateur successives. Comparaison inclusive
  // (surface ≥ minArea).
  minArea: 20,
  // L'utilisateur ne cherche pas de colocation (décision du 2026-08-15).
  excludeFlatShare: true,
  // Écarte les parkings/box/caves mal étiquetés « appartement » (~100 €).
  minPrice: 250,
  // L'utilisateur ne cherche pas de location étudiante (décision du 2026-08-15).
  excludeStudent: true,
  // Trajet domicile→travail ≤ 60 min (arrivée 9 h) — décision du 2026-08-22.
  maxCommuteMinutes: 60,
};

/**
 * CE QUE « PROCHE DE VOS CRITÈRES » VEUT DIRE, CRITÈRE PAR CRITÈRE.
 *
 * Il n'y avait qu'un seul nombre — cinq pour cent — appliqué à deux critères,
 * le loyer et la surface. Tout le reste était muet : un trajet de 80 minutes
 * n'était jamais « presque » 60, et personne ne pouvait dire pourquoi.
 *
 * CHAQUE CRITÈRE A SON UNITÉ, et c'est le fond du problème : un pourcentage a
 * du sens sur un loyer (5 % de 700 €, c'est 35 €), aucun sur un nombre de
 * pièces (5 % d'un T2, ce n'est rien) et un sens trompeur sur une durée
 * estimée. La table dit donc, pour chacun, dans quelle unité il se relâche et
 * de combien.
 *
 * CHAQUE MARGE SE JUGE SEULE, et aucune ne s'étire pour couvrir celle d'à
 * côté : un loyer dans sa marge n'autorise pas un mètre carré de plus en
 * moins. Une annonce peut glisser sur deux critères à la fois — 725 € et
 * 61 minutes, chacun dans sa marge — et l'alerte les nomme alors tous les
 * deux ; sur le stock du 2026-09-16, 37 annonces sur 47 n'en dépassaient qu'un
 * seul, dix en dépassaient deux, aucune trois.
 *
 * Ce que cette table NE couvre pas est écrit juste en dessous, et ce n'est pas
 * un oubli : voir `NEAR_MATCH_NEVER_RELAXED`.
 */
export type RelaxableCriterion =
  | 'maxPrice'
  | 'minArea'
  | 'minRooms'
  | 'maxRooms'
  | 'maxCommuteMinutes'
  | 'maxDurationToReference'
  | 'availableBy';

export const NEAR_MATCH_MARGINS = {
  /**
   * +5 % du loyer, soit 701–735 € sur un plafond de 700 €.
   *
   * C'était dix pour cent, et dix était trop : jusqu'à 770 €, soixante-dix
   * euros par mois et huit cent quarante par an — ce n'est plus un arrondi,
   * c'est un autre budget, et l'alerte qui le propose fait douter du filtre.
   * Mesuré le 2026-09-16, à marges égales par ailleurs : le canal signale 47
   * annonces à 5 %, 83 à 8 % — presque le double pour trente-cinq euros de
   * plus. Le loyer est un nombre PUBLIÉ, exact : la marge n'y corrige
   * aucune incertitude, elle rattrape seulement des charges qui basculent le
   * total d'un cheveu.
   */
  maxPrice: { percent: 0.05 },
  /**
   * −5 % de la surface, sans jamais descendre de moins d'un mètre carré.
   *
   * Le plancher d'un m² est là parce que les annonces publient des surfaces au
   * mètre près (« 19,8 m² ») : sous un mètre, la marge ne rattraperait que des
   * arrondis d'affichage. À 20 m², 5 % font justement 1 m², donc 19 m².
   */
  minArea: { percent: 0.05, atLeastSqm: 1 },
  /**
   * −1 pièce, et jamais moins d'une : il n'existe pas de demi-pièce, donc pas
   * de marge plus petite que celle-là. Un T1 quand on demande un T2 reste un
   * écart qu'on voit sur les photos, pas une erreur de mesure.
   *
   * Le score ne juge pas encore le nombre de pièces : la marge ne décide donc
   * que du sort des annonces déjà hors critères pour une autre raison.
   */
  minRooms: { rooms: 1 },
  /** +1 pièce, par symétrie — une pièce de plus se refuse, elle ne se cache pas. */
  maxRooms: { rooms: 1 },
  /**
   * +5 minutes de trajet, sans jamais dépasser un dixième du plafond.
   *
   * CINQ MINUTES PARCE QUE LE NOMBRE EST UNE ESTIMATION, pas une mesure : le
   * temps rendu par Navitia change avec la minute de départ, et un bus manqué
   * coûte déjà cet écart. Relâcher de cinq minutes, ce n'est pas céder sur le
   * critère, c'est admettre que 62 et 60 sont le même trajet compté deux fois.
   * Au-delà, ce n'est plus l'estimation qu'on tolère : dix minutes de plus,
   * c'est vingt minutes par jour aller-retour — mesuré le 2026-09-16, +5 min
   * fait passer le canal de 25 à 47 annonces, +10 min à 64.
   *
   * LE DIXIÈME EST UN GARDE-FOU pour les petits plafonds : sur 20 minutes
   * demandées, cinq de plus seraient un quart de trajet en plus, et sur un
   * plafond à zéro la marge doit rester nulle.
   */
  maxCommuteMinutes: { minutes: 5, neverMoreThanPercent: 0.1 },
  /**
   * Même règle : c'est la même unité et la même estimation. Ce canal ne compare
   * pas encore les points de repère secondaires — la table les tient prêts pour
   * que la question ne se repose pas le jour où il le fera.
   */
  maxDurationToReference: { minutes: 5, neverMoreThanPercent: 0.1 },
  /**
   * +7 jours sur la date d'emménagement : une semaine, c'est le chevauchement
   * de loyers qu'on absorbe ou l'hébergement qu'on trouve. Au-delà, ce n'est
   * plus un décalage, c'est un autre calendrier.
   */
  availableBy: { days: 7 },
} as const satisfies Readonly<Record<RelaxableCriterion, Readonly<Record<string, number>>>>;

/**
 * LES CRITÈRES QUI NE SE RELÂCHENT JAMAIS, et pourquoi.
 *
 * UN CRITÈRE BINAIRE N'A PAS DE VOISINAGE. Une colocation exclue reste exclue
 * même « de peu » : il n'existe pas de demi-colocation, et signaler celle-là
 * reviendrait à discuter la décision de quelqu'un sur sa propre recherche. Ce
 * canal a déjà envoyé 42 alertes de ce genre sur 52 (relevé du 2026-09-16)
 * faute d'appliquer les exclusions ; elles le sont depuis, et cette table dit
 * que ce n'est pas un réglage mais une règle.
 *
 * LA LISTE EST EXHAUSTIVE PAR CONSTRUCTION : son type est « tous les critères
 * SAUF les relâchables ». Ajouter un critère à `SearchCriteria` sans trancher
 * ne compile pas — c'est le seul moyen qu'un critère n'arrive pas ici par
 * défaut, faute d'avoir été regardé.
 */
export type StrictCriterion = Exclude<keyof SearchCriteria, RelaxableCriterion>;

export const NEAR_MATCH_NEVER_RELAXED: Readonly<Record<StrictCriterion, string>> = {
  cities: "une autre commune n'est pas un voisinage, c'est ailleurs",
  minPrice:
    'ce plancher écarte les parkings et les caves étiquetés « appartement » : le relâcher rouvrirait la porte au rebut, pas à une occasion',
  propertyTypes: 'une maison proposée à qui cherche un appartement reste une maison',
  furnished: 'meublé ou non : un logement ne l’est pas à moitié',
  excludeFlatShare: 'il n’existe pas de demi-colocation',
  excludeStudent: 'un bail étudiant est un bail étudiant, la durée ne se négocie pas d’un cheveu',
  landlordFilter: 'une agence ne devient pas un particulier parce qu’elle en est proche',
  furnishedFilter: 'même raison que `furnished` : le filtre trie deux ensembles disjoints',
  districts:
    'le projet ne connaît pas les quartiers voisins de chaque quartier ; sans cette carte, « à côté » ne veut rien dire et « à côté de Riquier » pourrait désigner toute la ville',
  includeUnknownDistrict: 'c’est la règle de lecture des quartiers, pas une quantité',
  energyClasses:
    'la lettre voisine d’une classe acceptée peut être une passoire interdite à la location',
  requiresBalcony: 'un balcon est là ou il n’y est pas',
  requiresParking: 'un stationnement est là ou il n’y est pas',
};

/**
 * La marge du LOYER, seule et en clair, pour les écrans qui l'affichent.
 *
 * Elle reste la définition unique — elle est LUE dans la table, jamais
 * recopiée — mais elle ne suffit plus à décrire le canal : la surface, le
 * trajet, les pièces et la date ont chacun la leur.
 */
export const NEAR_MATCH_MARGIN = NEAR_MATCH_MARGINS.maxPrice.percent;

/** Les critères relâchés, dans leur unité d'origine. */
export interface NearMatchBounds {
  /** Loyer plafond élargi. */
  readonly maxPrice: number;
  /** Surface plancher abaissée. */
  readonly minArea: number;
  readonly minRooms?: number;
  readonly maxRooms?: number;
  readonly maxCommuteMinutes?: number;
  /** Date d'emménagement repoussée (`AAAA-MM-JJ`). */
  readonly availableBy?: string;
}

/** Ce qu'il faut des critères pour calculer les bornes élargies. */
export type RelaxableCriteria = Pick<SearchCriteria, 'maxPrice' | 'minArea'> &
  Partial<Pick<SearchCriteria, 'minRooms' | 'maxRooms' | 'maxCommuteMinutes' | 'availableBy'>>;

/**
 * Les critères, élargis d'une marge chacun.
 *
 * Un critère absent le reste : on n'invente pas un plafond de trajet pour
 * quelqu'un qui n'en a pas posé.
 */
export function nearMatchBounds(criteria: RelaxableCriteria): NearMatchBounds {
  const area = NEAR_MATCH_MARGINS.minArea;
  const commute = NEAR_MATCH_MARGINS.maxCommuteMinutes;
  return {
    maxPrice: criteria.maxPrice * (1 + NEAR_MATCH_MARGINS.maxPrice.percent),
    minArea: Math.max(
      0,
      criteria.minArea - Math.max(criteria.minArea * area.percent, area.atLeastSqm),
    ),
    // Jamais en dessous d'une pièce : un logement de zéro pièce n'existe pas.
    ...(criteria.minRooms === undefined
      ? {}
      : { minRooms: Math.max(1, criteria.minRooms - NEAR_MATCH_MARGINS.minRooms.rooms) }),
    ...(criteria.maxRooms === undefined
      ? {}
      : { maxRooms: criteria.maxRooms + NEAR_MATCH_MARGINS.maxRooms.rooms }),
    ...(criteria.maxCommuteMinutes === undefined
      ? {}
      : {
          maxCommuteMinutes:
            criteria.maxCommuteMinutes +
            Math.min(commute.minutes, criteria.maxCommuteMinutes * commute.neverMoreThanPercent),
        }),
    ...(criteria.availableBy === undefined || criteria.availableBy === ''
      ? {}
      : { availableBy: addDays(criteria.availableBy, NEAR_MATCH_MARGINS.availableBy.days) }),
  };
}

/** `AAAA-MM-JJ` + n jours, dans le même format. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Ce qu'on regarde d'une annonce pour dire EN QUOI elle dépasse. */
export interface OvershootInput {
  readonly price: number | null;
  readonly area: number | null;
  readonly rooms: number | null;
  /** Trajet estimé pour CE compte, en minutes. */
  readonly commuteMinutes: number | null;
  /** Date d'emménagement publiée (ISO). */
  readonly availableAt: string | null;
}

/**
 * CE QUI DÉPASSE, ET DE COMBIEN — la phrase que porte la notification.
 *
 * Elle nomme le critère et les deux nombres : « 735 € pour un budget de
 * 700 € » se vérifie d'un coup d'œil, « proche de vos critères » ne se vérifie
 * pas du tout. Avec une marge par critère, une formule générique aurait laissé
 * deviner LEQUEL a bougé, ce qui est exactement la question qu'on se pose en
 * lisant l'alerte.
 *
 * Vide quand rien ne dépasse : à l'appelant de ne pas signaler une annonce qui
 * respecte tout — elle n'est pas « proche », elle est dedans.
 */
export function describeOvershoot(listing: OvershootInput, criteria: RelaxableCriteria): string {
  const parts: string[] = [];
  if (listing.price !== null && listing.price > criteria.maxPrice) {
    parts.push(`${money(listing.price)} € pour un budget de ${money(criteria.maxPrice)} €`);
  }
  if (listing.area !== null && listing.area < criteria.minArea) {
    parts.push(`${money(listing.area)} m² pour ${money(criteria.minArea)} m² demandés`);
  }
  if (
    criteria.minRooms !== undefined &&
    listing.rooms !== null &&
    listing.rooms < criteria.minRooms
  ) {
    parts.push(`${rooms(listing.rooms)} pour ${rooms(criteria.minRooms)} demandées`);
  }
  if (
    criteria.maxRooms !== undefined &&
    listing.rooms !== null &&
    listing.rooms > criteria.maxRooms
  ) {
    parts.push(`${rooms(listing.rooms)} pour ${rooms(criteria.maxRooms)} au plus`);
  }
  if (
    criteria.maxCommuteMinutes !== undefined &&
    listing.commuteMinutes !== null &&
    listing.commuteMinutes > criteria.maxCommuteMinutes
  ) {
    parts.push(
      `${Math.round(listing.commuteMinutes)} min de trajet pour ${Math.round(criteria.maxCommuteMinutes)}`,
    );
  }
  if (
    criteria.availableBy !== undefined &&
    criteria.availableBy !== '' &&
    listing.availableAt !== null &&
    listing.availableAt.slice(0, 10) > criteria.availableBy
  ) {
    parts.push(`libre le ${day(listing.availableAt)} pour le ${day(criteria.availableBy)} demandé`);
  }
  return parts.join(' · ');
}

/** Un nombre tel qu'on l'écrit en français : virgule, et pas de zéro inutile. */
function money(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

function rooms(count: number): string {
  return count <= 1 ? `${count} pièce` : `${count} pièces`;
}

function day(iso: string): string {
  const [year, month, dayOfMonth] = iso.slice(0, 10).split('-');
  return `${dayOfMonth}/${month}/${year}`;
}
