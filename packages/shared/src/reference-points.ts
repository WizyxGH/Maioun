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

/** Moyen de transport, pour convertir une distance en durée. */
export type ReferenceTravelMode = 'walking' | 'cycling' | 'transit' | 'train' | 'driving';

/**
 * Dans l'ordre du plus lent au plus rapide, qui est aussi celui du plus
 * quotidien au plus exceptionnel.
 *
 * LE TRAIN A SA PLACE À PART. Le ranger sous « transports en commun » le
 * comptait à 18 km/h : sur la Côte d'Azur, une commune desservie par le TER
 * paraissait alors plus loin qu'un quartier voisin, alors qu'elle est souvent
 * plus proche en temps.
 */
export const REFERENCE_TRAVEL_MODES: readonly ReferenceTravelMode[] = [
  'walking',
  'cycling',
  'transit',
  'train',
  'driving',
];

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
      mode: isTravelMode(candidate['mode']) ? candidate['mode'] : 'transit',
    });
  }
  return points;
}

/**
 * Vitesses moyennes retenues pour convertir une distance en durée, en km/h.
 *
 * ELLES VIVAIENT DANS LE COLLECTEUR, qui seul en avait besoin tant que la durée
 * se calculait une fois pour toutes. Le filtre de trajet laisse maintenant
 * choisir le mode : l'interface doit convertir, et elle ne peut pas importer le
 * collecteur — d'où leur place ici, à côté des modes qu'elles chiffrent.
 *
 * Ces valeurs incluent volontairement une marge : en ville, le trajet réel est
 * plus long que la ligne droite.
 *
 * LE TRAIN N'EST PAS DU TRANSPORT URBAIN. Sur la Côte d'Azur, une commune
 * desservie par le TER est souvent plus proche EN TEMPS qu'un quartier voisin
 * aux heures de pointe. La valeur reste prudente : elle inclut l'accès à la
 * gare et l'attente, que la ligne droite ignore.
 */
export const TRAVEL_SPEED_KMH: Readonly<Record<ReferenceTravelMode, number>> = {
  walking: 4.5,
  cycling: 14,
  transit: 18,
  train: 45,
  driving: 22,
};

/**
 * Convertit une durée ESTIMÉE d'un mode vers un autre.
 *
 * C'EST EXACT, ET CE N'EST PAS UNE APPROXIMATION DE PLUS. Une estimation vaut
 * `distance × détour ÷ vitesse` : la distance et le détour ne dépendent pas du
 * mode, seule la vitesse change. Le rapport des deux vitesses suffit donc, et
 * l'on n'a besoin ni de la distance — qui ne quitte pas le collecteur (§26) —
 * ni d'un nouveau calcul d'itinéraire.
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
  if (from === to) return minutes;
  return Math.round((minutes * TRAVEL_SPEED_KMH[from]) / TRAVEL_SPEED_KMH[to]);
}
