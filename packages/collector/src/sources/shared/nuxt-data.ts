/**
 * Lecture de l'état qu'une page Nuxt 3 embarque dans `<script id="__NUXT_DATA__">`.
 *
 * Ce n'est pas du JSON directement exploitable : Nuxt le sérialise avec
 * `devalue`, en un tableau plat où chaque objet renvoie par INDICE à ses
 * valeurs. Un même objet peut donc être partagé, voire cyclique. On le
 * reconstitue une fois, puis le parseur de la source lit un objet ordinaire.
 */

/** Le contenu brut du script, ou `null` si la page n'en porte pas. */
const NUXT_DATA = /<script\b[^>]*\bid="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/** Indices réservés par `devalue` pour les valeurs que JSON ne sait pas écrire. */
const SPECIAL: ReadonlyMap<number, unknown> = new Map<number, unknown>([
  [-1, undefined],
  [-2, null],
  [-3, Number.NaN],
  [-4, Number.POSITIVE_INFINITY],
  [-5, Number.NEGATIVE_INFINITY],
  [-6, -0],
  [-7, undefined],
]);

/** Enveloppes de réactivité Vue : seule la valeur enveloppée compte. */
const WRAPPERS = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'Object']);

/**
 * L'état Nuxt de la page, reconstitué ; `null` si le script manque ou ne se
 * lit pas.
 */
export function readNuxtData(html: string): unknown {
  const raw = NUXT_DATA.exec(html)?.[1];
  if (raw === undefined) return null;
  try {
    return unflattenNuxtPayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Reconstitue un tableau `devalue` en valeur ordinaire. */
export function unflattenNuxtPayload(flat: unknown): unknown {
  if (!Array.isArray(flat) || flat.length === 0) return null;
  const values: readonly unknown[] = flat;
  const done = new Map<number, unknown>();

  const hydrate = (index: unknown): unknown => {
    if (typeof index !== 'number' || !Number.isInteger(index)) return undefined;
    if (index < 0) return SPECIAL.get(index);
    if (done.has(index)) return done.get(index);
    const value = values[index];

    if (value === null || typeof value !== 'object') {
      done.set(index, value);
      return value;
    }

    if (Array.isArray(value)) {
      const items: readonly unknown[] = value;
      // Un tableau qui commence par une chaîne est un type étiqueté : un vrai
      // tableau ne porte que des indices.
      const tag = items[0];
      if (typeof tag === 'string') return hydrateTagged(index, tag, items);
      const out: unknown[] = [];
      done.set(index, out);
      for (const item of items) out.push(hydrate(item));
      return out;
    }

    const out: Record<string, unknown> = {};
    done.set(index, out);
    for (const [key, item] of Object.entries(value)) {
      if (key !== '__proto__') out[key] = hydrate(item);
    }
    return out;
  };

  const hydrateTagged = (index: number, tag: string, items: readonly unknown[]): unknown => {
    if (WRAPPERS.has(tag)) {
      const inner = hydrate(items[1]);
      done.set(index, inner);
      return inner;
    }
    if (tag === 'Set') {
      const out: unknown[] = [];
      done.set(index, out);
      for (const item of items.slice(1)) out.push(hydrate(item));
      return out;
    }
    if (tag === 'Map' || tag === 'null') {
      const out: Record<string, unknown> = {};
      done.set(index, out);
      for (let i = 1; i + 1 < items.length; i += 2) {
        const key = tag === 'Map' ? hydrate(items[i]) : items[i];
        if (typeof key === 'string' && key !== '__proto__') out[key] = hydrate(items[i + 1]);
      }
      return out;
    }
    // `Date`, `BigInt`, `RegExp`, `EmptyRef`… : la valeur écrite, ou rien.
    const out = typeof items[1] === 'string' ? items[1] : undefined;
    done.set(index, out);
    return out;
  };

  return hydrate(0);
}
