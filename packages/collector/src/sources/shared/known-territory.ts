/**
 * Arrêt de la pagination quand la page ne montre plus que du déjà-vu.
 *
 * POURQUOI ICI. Laforêt et PAP portaient la MÊME constante, le MÊME calcul et
 * le MÊME piège, recopiés : une page vide compte pour du terrain connu, sans
 * quoi `0 / 0` donne `NaN` et la comparaison est fausse — la boucle continuerait
 * indéfiniment sur des pages sans annonces. Deux copies, c'est deux endroits où
 * corriger le jour où le seuil bouge, et un seul qu'on pense à relire.
 *
 * CE N'EST PAS UNE PREUVE D'EXHAUSTIVITÉ. S'arrêter ici dit « inutile d'aller
 * plus loin », jamais « j'ai tout vu » : le `stopReason` `knownTerritory` reste
 * un passage sain, et les annonces non revues ne sont pas pour autant retirées.
 */

/**
 * Proportion de déjà-vu au-delà de laquelle on cesse de paginer.
 *
 * Les listes visées rangent les nouveautés en tête : à quatre annonces connues
 * sur cinq, on est descendu assez loin dans l'historique pour que les requêtes
 * suivantes ne rapportent presque rien.
 */
export const KNOWN_RATIO_STOP = 0.8;

/**
 * Part des annonces d'une page qui étaient déjà connues.
 *
 * UNE PAGE SANS ANNONCE REND 1, et non `NaN` : elle n'apprend rien, donc elle
 * ne justifie pas d'en demander une de plus.
 */
export function knownRatio(found: number, known: number): number {
  return found === 0 ? 1 : known / found;
}

/** `true` si la page est assez connue pour arrêter là la pagination. */
export function isKnownTerritory(found: number, known: number): boolean {
  return knownRatio(found, known) >= KNOWN_RATIO_STOP;
}
