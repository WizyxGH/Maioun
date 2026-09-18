/**
 * Lecture des blocs JSON-LD schema.org d'une page (§6, §47).
 *
 * Mutualise ce que plusieurs sources font à l'identique : localiser les
 * `<script type="application/ld+json">`, les parser sans planter sur un bloc
 * malformé, aplatir un éventuel `@graph`, et lire les champs de façon tolérante
 * (le `@type` peut être une chaîne ou un tableau ; une valeur peut être un
 * nombre ou une chaîne). Utilisé par les sources dont le HTML porte un JSON-LD
 * exploitable (Mirabello, Citya…).
 */

import type * as cheerio from 'cheerio';

/** Un nœud schema.org quelconque (forme volontairement lâche). */
export type JsonLdNode = Record<string, unknown>;

/**
 * Tous les nœuds JSON-LD d'une page, `@graph` aplati et blocs multiples
 * fusionnés. Les blocs illisibles sont ignorés (§17 : on n'invente rien).
 */
export function collectJsonLdNodes($: cheerio.CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text();
    if (raw.trim() === '') return;
    try {
      const parsed: unknown = JSON.parse(raw);
      const graph =
        typeof parsed === 'object' && parsed !== null && '@graph' in parsed
          ? (parsed as { '@graph': unknown })['@graph']
          : parsed;
      if (Array.isArray(graph)) nodes.push(...(graph as JsonLdNode[]));
      else if (typeof graph === 'object' && graph !== null) nodes.push(graph as JsonLdNode);
    } catch {
      /* JSON-LD illisible : bloc ignoré */
    }
  });
  return nodes;
}

/** `@type` d'un nœud, en minuscules (le champ peut être une chaîne ou un tableau). */
export function jsonLdType(node: JsonLdNode): string {
  const type = node['@type'];
  const value = Array.isArray(type) ? type[0] : type;
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/** Premier nœud dont le `@type` (minuscules) figure dans `types`. */
export function findJsonLdNode(
  nodes: readonly JsonLdNode[],
  types: readonly string[],
): JsonLdNode | undefined {
  return nodes.find((node) => types.includes(jsonLdType(node)));
}

/** Lecture tolérante d'un champ : chaîne non vide, ou nombre rendu en chaîne. */
export function jsonLdString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * Coordonnées d'un nœud `geo` schema.org.
 *
 * C'est la position que l'agence a saisie pour sa carte : elle vaut mieux qu'un
 * géocodage, et elle existe sur des fiches qui ne publient aucune rue. Les deux
 * valeurs doivent être lisibles et dans les bornes, sinon on ne rend rien —
 * un `0` est le champ vide de la plupart des gabarits, pas le golfe de Guinée.
 */
export function jsonLdGeo(node: JsonLdNode): { latitude?: number; longitude?: number } {
  const geo = node['geo'] as JsonLdNode | undefined;
  const read = (key: string): number | undefined => {
    const raw = geo?.[key];
    const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
    return Number.isFinite(value) && value !== 0 ? value : undefined;
  };
  const latitude = read('latitude');
  const longitude = read('longitude');
  if (latitude === undefined || longitude === undefined) return {};
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return {};
  return { latitude, longitude };
}
