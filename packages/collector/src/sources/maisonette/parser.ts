import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';

const DETAIL_URL = /^https?:\/\/lamaisonette\.fr\/logements\/([a-f0-9-]+)\/?(?:[?#].*)?$/i;

export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly warnings: readonly string[];
}

function textOf(value: string): string {
  return cleanText(value.replace(/\s+/g, ' '));
}

function numberMatch(text: string, pattern: RegExp): string | undefined {
  const value = pattern.exec(text)?.[1];
  return value?.replace(/\s/g, '').replace(',', '.') ?? undefined;
}

function detailReference(href: string): string | null {
  return DETAIL_URL.exec(href.trim())?.[1]?.toLowerCase() ?? null;
}

function listingFromText(text: string, href: string, reference: string): RawListing {
  const title = textOf(text.split(/\s+Ville\s+·|\s+Nice\s+·/i)[0] ?? '');
  const area = numberMatch(text, /(?<![A-Za-z0-9])(\d[\d\s.,]*)\s*m²/i);
  const price = numberMatch(text, /(\d[\d\s.,]*)\s*€\s*\/\s*mois/i);
  const rooms = text.match(/\b(T[1-4]\+?|Studio|Chambre)\b/i)?.[1];
  const city = text.match(/\b(Villefranche-sur-Mer|Nice|Antibes|Saint-Raphaël)\b/i)?.[1];
  return {
    sourceRef: reference,
    sourceUrl: href,
    ...(title !== '' ? { title } : {}),
    ...(price !== undefined ? { priceText: `${price} € / mois` } : {}),
    ...(area !== undefined ? { areaText: `${area} m²` } : {}),
    ...(rooms !== undefined ? { roomsText: rooms } : {}),
    propertyTypeText: `${rooms ?? ''} ${text}`,
    furnishedText: /meubl/i.test(text) ? 'Meublé' : undefined,
    availableAtText: text.match(/Disponible(?: dès maintenant|\s+[^€]+)?/i)?.[0],
    cityText: city,
    extra: { leaseType: 'bail mobilité' },
  };
}

export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const listings = new Map<string, RawListing>();
  const warnings: string[] = [];

  $('a[href*="/logements/"]').each((_index, element) => {
    const rawHref = $(element).attr('href');
    if (rawHref === undefined) return;
    const href = new URL(rawHref, pageUrl).toString();
    const reference = detailReference(href);
    if (reference === null || listings.has(reference)) return;
    const text = textOf($(element).text());
    if (!/€\s*\/\s*mois/i.test(text)) return;
    listings.set(reference, listingFromText(text, href, reference));
  });

  if (listings.size === 0) warnings.push('Aucune annonce Maisonette reconnue');
  return { listings: [...listings.values()], warnings };
}

export function parseDetailPage(html: string, pageUrl: string): RawListing | null {
  const reference = detailReference(pageUrl);
  if (reference === null) return null;
  const $ = cheerio.load(html);
  const text = textOf($('body').text());
  const listing = listingFromText(text, pageUrl.replace(/[?#].*$/, ''), reference);
  const title = textOf($('h1').first().text());
  return title === '' ? listing : { ...listing, title, description: text };
}
