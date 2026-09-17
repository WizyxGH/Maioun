/**
 * Points de référence réglables depuis le site (§20).
 *
 * Le lieu de travail et la gare décident du temps de trajet affiché sur chaque
 * annonce — donc, en pratique, de ce qu'on regarde en premier. Ils vivaient
 * dans `.env` et dans les secrets GitHub : les changer demandait d'éditer un
 * fichier sur la machine de collecte, ou de retrouver un écran de réglages
 * GitHub. Un déménagement ou un changement d'employeur devenait une opération
 * technique.
 *
 * Ils vivent maintenant dans `app_settings`, comme les critères, et se règlent
 * depuis l'écran Paramètres. `.env` reste la valeur de départ : tant que rien
 * n'a été réglé depuis le site, rien ne change.
 *
 * ON Y GARDE L'ADRESSE, PAS LES COORDONNÉES. Une adresse se relit, se corrige
 * et se reconnaît ; une paire de coordonnées ne dit rien à personne. Le
 * géocodage a lieu à la collecte suivante, une fois, puis reste en cache.
 *
 * CES ADRESSES SONT PRIVÉES (§26) : elles désignent un lieu de travail et un
 * domicile. Elles vivent dans une base à jeton, jamais dans le dépôt.
 */

/**
 * Moyen de transport, pour convertir une distance en durée.
 *
 * `train` est une valeur ANCIENNE, conservée pour relire ce qui a été
 * enregistré : elle se lit aujourd'hui comme `transit`. Voir
 * `normalizeTravelMode`.
 */
export type ReferenceTravelMode = 'walking' | 'cycling' | 'transit' | 'train' | 'driving';

/**
 * Les modes PROPOSÉS à l'écran, du plus lent au plus rapide — qui est aussi
 * l'ordre du plus quotidien au plus exceptionnel.
 *
 * LE TRAIN N'EST PLUS UN CHOIX. Il en était un parce que l'estimation à vol
 * d'oiseau comptait « transports en commun » à 18 km/h, et qu'une commune
 * desservie par le TER paraissait alors plus loin qu'un quartier voisin. La
 * raison était mesurée et elle reste vraie — mais elle porte sur le CALCUL, pas
 * sur l'utilisateur : personne ne sait à l'avance s'il prendra le bus ou le
 * train, et c'est justement ce qu'un calculateur d'itinéraire répond. La
 * distinction est passée dans `estimateTravelMinutes`, qui retient pour un
 * trajet le plus court des deux.
 */
export const REFERENCE_TRAVEL_MODES: readonly ReferenceTravelMode[] = [
  'walking',
  'cycling',
  'transit',
  'driving',
];

/**
 * Le mode tel qu'on le traite aujourd'hui.
 *
 * UN POINT DE REPÈRE ENREGISTRÉ « EN TRAIN » NE DISPARAÎT PAS et ne change pas
 * de sens : il devient ce qu'il a toujours voulu dire — les transports en
 * commun. Il y gagne même, car la collecte ne demande d'itinéraire réel que
 * pour les points en `transit` : un point « en train » était silencieusement
 * privé du vrai calcul, et restait sur l'estimation.
 */
export function normalizeTravelMode(mode: ReferenceTravelMode): ReferenceTravelMode {
  return mode === 'train' ? 'transit' : mode;
}

/** Un point de référence tel qu'on le règle : un nom, une adresse, un mode. */
export interface StoredReferencePoint {
  /** Libellé affiché sur la fiche, ex. « Travail ». */
  readonly label: string;
  /** Adresse en clair, géocodée à la collecte suivante. */
  readonly address: string;
  readonly mode: ReferenceTravelMode;
}

/**
 * Clé des points de référence dans `app_settings`.
 *
 * CONTRAT INTER-PROCESSUS, comme les critères : la collecte la lit, le site
 * l'écrit, et ils n'ont aucun autre point de rencontre.
 */
export const REFERENCE_POINTS_SETTING = 'referencePoints';

function isTravelMode(value: unknown): value is ReferenceTravelMode {
  return REFERENCE_TRAVEL_MODES.includes(value as ReferenceTravelMode);
}

/**
 * Valide ce qui sort de la base ou d'un formulaire.
 *
 * Renvoie `null` quand rien d'exploitable n'est stocké — et non un tableau
 * vide : « l'utilisateur n'a rien réglé » (on retombe sur `.env`) et
 * « l'utilisateur a tout retiré » (aucune distance, volontairement) sont deux
 * intentions différentes, et les confondre rallumerait un point de référence
 * qu'on vient d'effacer.
 */
export function parseReferencePoints(value: unknown): StoredReferencePoint[] | null {
  if (!Array.isArray(value)) return null;

  const points: StoredReferencePoint[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const label = typeof candidate['label'] === 'string' ? candidate['label'].trim() : '';
    const address = typeof candidate['address'] === 'string' ? candidate['address'].trim() : '';
    // Une adresse vide ne se géocode pas : le point serait déclaré sans jamais
    // produire de distance, ce qui se lirait comme une panne.
    if (label === '' || address === '') continue;
    points.push({
      label,
      address,
      // `train` ressort en `transit` : c'est ici que la fusion des deux modes
      // s'applique aux points déjà enregistrés, une fois pour toutes, sans
      // réécrire la base — la collecte comme le site relisent par ici.
      mode: isTravelMode(candidate['mode']) ? normalizeTravelMode(candidate['mode']) : 'transit',
    });
  }
  return points;
}

/**
 * Vitesses moyennes de SURFACE, en km/h — celles d'un trajet qui suit les rues.
 *
 * ELLES VIVAIENT DANS LE COLLECTEUR, qui seul en avait besoin tant que la durée
 * se calculait une fois pour toutes. Le filtre de trajet laisse maintenant
 * choisir le mode : l'interface doit convertir, et elle ne peut pas importer le
 * collecteur — d'où leur place ici, à côté des modes qu'elles chiffrent.
 *
 * `transit` est la vitesse du bus et du tram. Le rail se compte autrement, voir
 * plus bas. `train` n'est plus proposé et garde sa valeur d'alors, pour les
 * durées enregistrées dans cette unité.
 */
export const TRAVEL_SPEED_KMH: Readonly<Record<ReferenceTravelMode, number>> = {
  walking: 4.5,
  cycling: 14,
  transit: 18,
  train: 45,
  driving: 22,
};

/**
 * Ce qu'un trajet de surface parcourt en plus de la ligne droite. 1,3 est la
 * valeur usuellement retenue pour un tissu urbain dense.
 */
const URBAN_DETOUR_FACTOR = 1.3;

/**
 * Vitesse du TER entre deux gares, arrêts compris. Sans facteur de détour : sur
 * la Côte d'Azur la voie suit le littoral, donc à peu près la ligne droite.
 */
const RAIL_SPEED_KMH = 50;

/**
 * Ce que coûte le train en plus du roulage : rejoindre la gare de départ,
 * attendre, et repartir de la gare d'arrivée. C'est précisément ce que la ligne
 * droite ignore, et ce qui empêche de compter un trajet de deux kilomètres à la
 * vitesse d'un TER.
 */
const RAIL_ACCESS_MINUTES = 25;

/**
 * Estime une durée de trajet à partir d'une distance à vol d'oiseau, en minutes.
 *
 * LES TRANSPORTS EN COMMUN N'ONT PAS UNE VITESSE, ILS EN ONT DEUX. Sur quelques
 * kilomètres, c'est le bus ou le tram. Au-delà, sur la Côte d'Azur, c'est le
 * TER : plus rapide, mais payé d'un accès aux gares et d'une attente. On retient
 * le plus court des deux, ce que fait un calculateur d'itinéraire — et ce qui
 * faisait la justesse de l'ancien mode « en train », sans avoir à demander à
 * l'utilisateur de deviner lequel il prendra.
 *
 * Les deux branches se croisent vers huit kilomètres à vol d'oiseau : en
 * dessous, le bus gagne ; au-dessus, le train. Une commune du littoral desservie
 * par le TER n'est donc plus comptée comme si l'on y allait en bus.
 *
 * SON DÉFAUT, ASSUMÉ : une commune éloignée SANS gare — l'arrière-pays du
 * Paillon — se retrouve estimée comme si elle en avait une. C'est le prix d'un
 * repli qui ne connaît que la distance, et il ne vaut que tant que Navitia n'est
 * pas branché : dès qu'il l'est, l'itinéraire réel remplace cette estimation.
 */
export function estimateTravelMinutes(distanceKm: number, mode: ReferenceTravelMode): number {
  const actual = normalizeTravelMode(mode);
  const surface = ((distanceKm * URBAN_DETOUR_FACTOR) / TRAVEL_SPEED_KMH[actual]) * 60;
  if (actual !== 'transit') return Math.round(surface);
  const rail = RAIL_ACCESS_MINUTES + (distanceKm / RAIL_SPEED_KMH) * 60;
  return Math.round(Math.min(surface, rail));
}

/**
 * La distance qu'une durée estimée suppose — l'inverse de la fonction ci-dessus.
 *
 * Les deux branches des transports en commun croissent avec la distance : le
 * plus court des deux se renverse donc en le plus LONG des deux inverses.
 */
function distanceForMinutes(minutes: number, mode: ReferenceTravelMode): number {
  const actual = normalizeTravelMode(mode);
  const surface = ((minutes / 60) * TRAVEL_SPEED_KMH[actual]) / URBAN_DETOUR_FACTOR;
  if (actual !== 'transit') return surface;
  return Math.max(surface, ((minutes - RAIL_ACCESS_MINUTES) / 60) * RAIL_SPEED_KMH);
}

/**
 * Convertit une durée ESTIMÉE d'un mode vers un autre.
 *
 * C'EST EXACT, ET CE N'EST PAS UNE APPROXIMATION DE PLUS. Une estimation ne
 * dépend que de la distance, laquelle ne dépend pas du mode : on remonte à la
 * distance, puis on redescend dans l'autre mode. On n'a donc besoin ni de
 * connaître cette distance — elle ne quitte pas le collecteur (§26) — ni d'un
 * nouveau calcul d'itinéraire.
 *
 * NE VAUT QUE POUR UNE ESTIMATION. Un itinéraire réel en transports tient
 * compte des lignes, des correspondances et des horaires : le remettre à
 * l'échelle d'une marche à pied inventerait un trajet (§17). L'appelant vérifie
 * `durationSource` avant d'y recourir.
 */
export function convertEstimatedDuration(
  minutes: number,
  from: ReferenceTravelMode,
  to: ReferenceTravelMode,
): number {
  if (normalizeTravelMode(from) === normalizeTravelMode(to)) return minutes;
  return estimateTravelMinutes(distanceForMinutes(minutes, from), to);
}
