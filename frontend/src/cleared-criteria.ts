/**
 * LA SECONDE CHANCE D'« EFFACER TOUT », gardée dans ce navigateur.
 *
 * La rangée « Critères levés : … / Annuler » ne s'efface pas d'elle-même : une
 * seconde chance qui expire n'en est pas une. Elle ne vivait pourtant qu'en
 * mémoire de page — un rechargement, un onglet déchargé par le téléphone, et
 * quatre-vingt-sept quartiers cochés un à un n'avaient plus aucun chemin de
 * retour. C'est exactement la perte silencieuse que la rangée existe pour
 * éviter.
 *
 * ELLE NE SE RÉTABLIT QUE SI RIEN N'A BOUGÉ DEPUIS. On garde aussi les
 * critères tels que l'effacement les a laissés : au rechargement, on les
 * compare à ceux du compte. Différents, c'est qu'on a réglé autre chose entre
 * temps — depuis le panneau, une autre machine, une recherche enregistrée — et
 * « Annuler » écraserait ce réglage-là au lieu de défaire l'effacement. Le
 * souvenir est alors jeté.
 *
 * TOLÉRANT PAR CONCEPTION : stockage refusé, valeur illisible, forme d'une
 * version antérieure — on oublie sans bruit. Perdre le retour arrière ramène
 * au comportement d'avant ; le rendre faux remplacerait des critères justes.
 */

import type { FilterConfig } from './types.js';

const KEY = 'maioun.clearedCriteria';

/** Ce qu'un « Effacer tout » a levé, et de quoi le remettre. */
export interface ClearedCriteria {
  /** Les critères d'avant l'effacement : ce que « Annuler » rétablit. */
  readonly previous: FilterConfig;
  /** Le nom des critères levés, tel que la rangée les annonce. */
  readonly labels: readonly string[];
  /** Les critères tels que l'effacement les a laissés. */
  readonly cleared: FilterConfig;
}

/**
 * Signature d'un jeu de critères, insensible à l'ordre des clés.
 *
 * Le serveur rend le réglage tel qu'il l'a reçu, mais rien ne garantit l'ordre
 * dans lequel un objet a été bâti : comparer deux `JSON.stringify` bruts
 * déclarerait différents deux réglages identiques, et jetterait le retour
 * arrière à chaque rechargement.
 */
function signature(criteria: FilterConfig): string {
  const entries = Object.entries(criteria)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries);
}

/** La forme attendue, ou `null` : on ne fait confiance à rien de ce qui est stocké. */
function parse(raw: string): ClearedCriteria | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const stored = value as Record<string, unknown>;
  const { previous, cleared, labels } = stored;
  if (previous === null || typeof previous !== 'object') return null;
  if (cleared === null || typeof cleared !== 'object') return null;
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) return null;
  return {
    previous: previous as FilterConfig,
    cleared: cleared as FilterConfig,
    labels: labels as readonly string[],
  };
}

/** Retient de quoi annuler l'effacement qui vient d'avoir lieu. */
export function rememberCleared(memo: ClearedCriteria): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(memo));
  } catch {
    // Stockage refusé : le retour arrière ne vivra que le temps de la page.
  }
}

/** Oublie l'effacement : plus rien à annuler. */
export function forgetCleared(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Rien à faire : il n'y avait de toute façon rien à lire.
  }
}

/**
 * Le retour arrière encore valable, au vu des critères du compte.
 *
 * @param current Les critères que le compte porte MAINTENANT. Le souvenir
 *   n'est rendu que s'ils sont restés ceux que l'effacement avait laissés.
 */
export function recallCleared(current: FilterConfig): ClearedCriteria | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const memo = parse(raw);
  if (memo === null || signature(memo.cleared) !== signature(current)) {
    forgetCleared();
    return null;
  }
  return memo;
}
