/**
 * Quelles sources la liste retient — l'INTENTION, et non la photographie.
 *
 * ON NE GARDAIT QU'UN ENSEMBLE DE SOURCES RETENUES. Exclure LocService revenait
 * donc à cocher les 211 autres, et cette liste figée écartait en silence toute
 * source ajoutée ENSUITE — il en arrive plusieurs par jour. On voyait des
 * agences apparaître déjà décochées, sans l'avoir demandé et sans que rien ne
 * le dise.
 *
 * Le mode dit ce qu'on a voulu : « seulement celles-ci » ou « toutes sauf
 * celles-ci ». Une source nouvelle entre alors d'elle-même dans le second cas,
 * et reste dehors dans le premier — ce qui est cohérent avec le geste d'origine
 * dans les deux cas.
 */

import { formatSourceName } from './format.js';
import { SOURCES } from './sources.generated.js';

export type SourceMode = 'only' | 'except';

/**
 * Le filtre par source.
 *
 * `ids` NOMME des sources ; `mode` dit ce qu'on en fait. « Sauf » sans nom
 * retenu, c'est toutes les sources ; « seulement » sans nom retenu, aucune.
 */
export interface SourceSelection {
  readonly mode: SourceMode;
  readonly ids: ReadonlySet<string>;
}

/** Aucune restriction : toutes les sources, y compris celles à venir. */
export const ALL_SOURCES: SourceSelection = { mode: 'except', ids: new Set() };

/**
 * Aucune source — et le geste qui sert à repartir d'une liste vide.
 *
 * Il s'écrit forcément en mode « seulement » : « toutes sauf les 216 » se
 * périmerait à la source suivante, alors que « seulement, et rien de nommé »
 * reste vrai quoi qu'on ajoute.
 */
export const NO_SOURCES: SourceSelection = { mode: 'only', ids: new Set() };

/** `true` si la sélection écarte quoi que ce soit de la liste. */
export function restrictsSources(selection: SourceSelection): boolean {
  return selection.mode === 'only' || selection.ids.size > 0;
}

/** `true` si cette source passe le filtre. */
export function sourceAllowed(selection: SourceSelection, sourceId: string): boolean {
  return selection.mode === 'only' ? selection.ids.has(sourceId) : !selection.ids.has(sourceId);
}

/**
 * Fait entrer ou sortir des sources de la liste, le mode gardé.
 *
 * C'est le geste des cases à cocher : cocher = la source s'affiche. En mode
 * « sauf », l'ensemble nomme les ÉCARTÉES — inclure, c'est donc l'en retirer.
 */
export function includeSources(
  selection: SourceSelection,
  sourceIds: readonly string[],
  included: boolean,
): SourceSelection {
  const named = new Set(selection.ids);
  const listed = selection.mode === 'only' ? included : !included;
  for (const id of sourceIds) {
    if (listed) named.add(id);
    else named.delete(id);
  }
  return { mode: selection.mode, ids: named };
}

/**
 * Change de mode.
 *
 * LA LISTE REPART À VIDE. Reprendre les cases cochées pour en faire une liste
 * « seulement » recréerait exactement la photographie qu'on cherche à éviter :
 * 211 sources nommées une à une, et la 212e exclue le lendemain. Les deux modes
 * disent des choses opposées ; on repart de l'état franc — toutes les sources
 * en mode « sauf », aucune en mode « seulement » — et on désigne ensuite.
 */
export function withSourceMode(selection: SourceSelection, mode: SourceMode): SourceSelection {
  return selection.mode === mode ? selection : { mode, ids: new Set() };
}

/** Au-delà, le résumé dit combien d'autres plutôt que de tout énumérer. */
const MAX_SOURCES_SHOWN = 2;

/**
 * Le résumé du filtre, tel qu'il s'écrit dans le menu, sur la puce de la barre
 * de filtres et sur la carte d'une recherche enregistrée.
 *
 * IL DIT LE MODE. « 19 sources » ne disait pas qu'une recherche était
 * restreinte, ni dans quel sens : rappelée, elle écartait en silence tout ce
 * qu'elle ne nommait pas, agences ajoutées depuis comprises.
 */
export function describeSourceSelection(selection: SourceSelection): string {
  if (selection.ids.size === 0) {
    return selection.mode === 'only' ? 'Aucune source' : 'Toutes les sources';
  }
  const names = [...selection.ids].map(formatSourceName).sort((a, b) => a.localeCompare(b));
  const rest = names.length - MAX_SOURCES_SHOWN;
  const list = `${names.slice(0, MAX_SOURCES_SHOWN).join(', ')}${rest > 0 ? ` +${rest}` : ''}`;
  return selection.mode === 'only' ? `Seulement ${list}` : `Sauf ${list}`;
}

/**
 * Part des sources connues au-delà de laquelle un ancien tableau ne peut plus
 * vouloir dire « seulement celles-ci » : personne n'en coche 200 à la main.
 */
const LEGACY_EXCEPT_RATIO = 0.8;
/** Et il ne doit en manquer qu'une poignée — le geste était « j'en retire une ». */
const LEGACY_EXCEPT_MAX_MISSING = 5;

/**
 * Relit un réglage d'avant les modes : un simple tableau de sources retenues.
 *
 * Il voulait dire « seulement celles-ci » — SAUF quand il les nomme presque
 * toutes, ce qui était l'unique façon d'en exclure une : le menu cochait alors
 * tout le reste. On le relit dans ce cas comme « sauf les manquantes », faute
 * de quoi les sources ajoutées depuis resteraient exclues sans que personne
 * l'ait demandé.
 */
export function legacySourceSelection(ids: readonly string[]): SourceSelection {
  const kept = new Set(ids);
  if (kept.size === 0) return ALL_SOURCES;
  const known = Object.keys(SOURCES);
  const missing = known.filter((id) => !kept.has(id));
  const almostAll =
    kept.size >= known.length * LEGACY_EXCEPT_RATIO && missing.length <= LEGACY_EXCEPT_MAX_MISSING;
  if (!almostAll) return { mode: 'only', ids: kept };
  return missing.length === 0 ? ALL_SOURCES : { mode: 'except', ids: new Set(missing) };
}

/** Relit un filtre écrit ailleurs (navigateur, recherche enregistrée). */
export function readSourceSelection(ids: unknown, mode: unknown): SourceSelection {
  const named = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  if (mode === 'only' || mode === 'except') return { mode, ids: new Set(named) };
  // Pas de mode enregistré : le réglage vient d'avant, et se relit comme tel.
  return legacySourceSelection(named);
}
