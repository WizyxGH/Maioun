/**
 * La fiche telle que la LISTE la transporte, préparée à l'écriture.
 *
 * La liste la recopie octet pour octet dans sa réponse (voir `listItemJson`
 * dans `server/routes.ts`) : analyser puis réémettre des centaines de fiches à
 * chaque chargement dépassait le budget de processeur du Worker.
 *
 * Même contenu que la migration 0040 pour l'existant : les deux doivent rester
 * le miroir l'une de l'autre.
 */

/**
 * Ce que la liste ne transporte pas.
 *
 * La description n'est pas affichée sur une carte. Scores et trajets sont
 * PERSONNELS : ils se joignent depuis le score du lecteur, et les laisser ici
 * les enverrait deux fois — ou ceux d'un autre compte.
 */
const OMITTED: ReadonlySet<string> = new Set(['description', 'scores', 'distances']);

export interface ListColumns {
  /** La fiche sérialisée, sans les champs de `OMITTED`. */
  readonly payload: string;
  /** Les scores communs, raisons vidées ; `null` si la fiche n'en porte pas. */
  readonly scores: string | null;
}

/** Colonnes `list_payload` et `list_scores` d'une fiche sérialisée. */
export function listColumns(serialized: Readonly<Record<string, unknown>>): ListColumns {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(serialized)) {
    if (!OMITTED.has(key)) kept[key] = value;
  }
  return { payload: JSON.stringify(kept), scores: reasonlessScores(serialized['scores']) };
}

/**
 * Les scores sans leurs raisons, comme la liste les a toujours rendus.
 *
 * Vidées et non retirées : l'écran lit `reasons` comme une liste, et la fiche
 * complète les recharge à l'ouverture.
 */
export function reasonlessScores(scores: unknown): string | null {
  if (scores === null || typeof scores !== 'object') return null;
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(scores).map(([name, score]) => [
        name,
        { ...(score as Record<string, unknown>), reasons: [] },
      ]),
    ),
  );
}
