/**
 * Travail en parallèle, BORNÉ.
 *
 * La collecte attendait chaque source, puis chaque lecture de cache, l'une après
 * l'autre : six sites différents, dont aucun ne ralentit l'autre, et un
 * aller-retour vers la base par adresse. Relevé du 2026-09-14 : 12 minutes par
 * passage, dont 4 à relire des caches déjà remplis.
 */

/**
 * Applique `task` à chaque élément, `limit` à la fois au plus. Les résultats
 * gardent l'ordre des éléments. Une tâche qui lève fait échouer l'ensemble,
 * comme `Promise.all` : à l'appelant d'attraper ce qui ne doit pas l'arrêter.
 */
export async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Exécute des tâches groupées par clé : les groupes avancent en parallèle
 * (`limit` à la fois), les tâches d'un même groupe l'une après l'autre.
 *
 * Deux sources sur un même site restent en file : leur politesse vaut pour le
 * site, pas pour la source.
 */
export async function runGrouped<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  await mapLimited([...groups.values()], limit, async (group) => {
    for (const item of group) await task(item);
  });
}

/**
 * Un cache clé-valeur dont chaque clé n'est lue qu'une fois par passage.
 *
 * Le pipeline lisait l'entrée pour décider s'il fallait un appel réseau, puis
 * le géocodeur la relisait : deux allers-retours par adresse.
 */
export function memoizeStore<V>(store: {
  get(key: string): Promise<V | null>;
  set(key: string, value: V): Promise<void>;
}): { get(key: string): Promise<V | null>; set(key: string, value: V): Promise<void> } {
  const seen = new Map<string, Promise<V | null>>();
  return {
    get(key) {
      const known = seen.get(key);
      if (known !== undefined) return known;
      const read = store.get(key);
      seen.set(key, read);
      return read;
    },
    async set(key, value) {
      seen.set(key, Promise.resolve(value));
      await store.set(key, value);
    },
  };
}
