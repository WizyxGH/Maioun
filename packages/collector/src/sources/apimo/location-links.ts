/**
 * Liens des fiches de location d'une page `/fr/locations` Apimo.
 *
 * Sites à l'ANCIEN schéma (Agence Privilège, Cabinet Reynier…) : fiches
 * `/fr/propriété/{id}` (accentué, souvent %-encodé), sans slug ville/type, et
 * sitemap mêlant ventes et locations sans marqueur. La page `/fr/locations`
 * est alors la seule liste fiable. Les sites récents y mettent des liens
 * `/fr/propriete/location+{type}+{ville}+…+{id}`, reconnus aussi : ils
 * donnent en plus le type et la commune.
 *
 * Ce module ne fait QUE l'extraction des liens ; les fiches sont lues par
 * `parseApimoDetail`.
 */

import * as cheerio from 'cheerio';
import { parseListingUrl } from './parser.js';

export interface LocationLink {
  readonly reference: string;
  readonly canonicalUrl: string;
  /** Slugs de l'URL récente ; vides pour l'ancien schéma. */
  readonly typeSlug: string;
  readonly citySlug: string;
}

/** `/fr/propriété/{id}` avec accent littéral, %-encodé (`%C3%A9`) ou absent (Immo Idéal). */
const PROPERTY_HREF = /\/fr\/propri(?:%C3%A9|é|e)t(?:%C3%A9|é|e)\/(\d{4,})(?:[/?#]|$)/i;

function linkFrom(href: string, pageUrl: string): LocationLink | null {
  let absolute: string;
  try {
    absolute = new URL(href, pageUrl).toString().replace(/[?#].*$/, '');
  } catch {
    return null;
  }
  const parsed = parseListingUrl(absolute);
  if (parsed !== null) {
    if (parsed.transaction !== 'location') return null;
    const { reference, canonicalUrl, typeSlug, citySlug } = parsed;
    return { reference, canonicalUrl, typeSlug, citySlug };
  }
  const reference = PROPERTY_HREF.exec(href)?.[1];
  return reference === undefined
    ? null
    : { reference, canonicalUrl: absolute, typeSlug: '', citySlug: '' };
}

/** Liens de fiches de location trouvés sur la page `/fr/locations`. */
export function parseLocationLinks(html: string, pageUrl: string): LocationLink[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, LocationLink>();

  $('a[href]').each((_i, el) => {
    const link = linkFrom($(el).attr('href') ?? '', pageUrl);
    if (link !== null && !byRef.has(link.reference)) byRef.set(link.reference, link);
  });

  return [...byRef.values()];
}
