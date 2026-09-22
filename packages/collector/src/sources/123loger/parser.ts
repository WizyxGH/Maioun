import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';

const LISTING_URL =
  /^https?:\/\/(?:www\.)?123loger\.com\/location\/nice-06000\/[^/]+\/([a-z0-9]+)\/?(?:[?#].*)?$/i;

export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
}

function listingReference(href: string): string | null {
  return LISTING_URL.exec(href.trim())?.[1]?.toLowerCase() ?? null;
}

function textOf(value: string): string {
  return cleanText(value.replace(/\s+/g, ' '));
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? undefined;
}

function numberMatch(text: string, pattern: RegExp): string | undefined {
  return firstMatch(text, pattern)?.replace(/\s/g, '');
}

function listingFromCard(
  card: cheerio.Cheerio<never>,
  href: string,
  reference: string,
): RawListing {
  const text = textOf(card.text());
  const title = textOf(card.find('h2, h3, h4').first().text());
  const imageUrls = card
    .find('img[src], img[data-src]')
    .map((_index, image) => card.find(image).attr('src') ?? card.find(image).attr('data-src') ?? '')
    .get()
    .filter((url) => url.startsWith('http'));

  return {
    sourceRef: reference,
    sourceUrl: href,
    ...(title !== '' ? { title } : {}),
    ...(numberMatch(text, /(\d[\d\s.,]*)\s*€\s*\/\s*mois/i) !== undefined
      ? { priceText: `${numberMatch(text, /(\d[\d\s.,]*)\s*€\s*\/\s*mois/i)} € / mois` }
      : {}),
    ...(numberMatch(text, /(\d[\d\s.,]*)\s*m(?:²|2)/i) !== undefined
      ? { areaText: numberMatch(text, /(\d[\d\s.,]*)\s*m(?:²|2)/i) }
      : {}),
    ...(numberMatch(text, /(10|[1-9])\s*pi/i) !== undefined
      ? { roomsText: numberMatch(text, /(10|[1-9])\s*pi/i) }
      : {}),
    propertyTypeText: 'Appartement',
    cityText: 'Nice',
    postalCodeText: '06000',
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
  };
}

export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const listings = new Map<string, RawListing>();
  const warnings: string[] = [];

  $('a[href]').each((_index, element) => {
    const rawHref = $(element).attr('href');
    if (rawHref === undefined) return;
    const href = new URL(rawHref, pageUrl).toString();
    const reference = listingReference(href);
    if (reference === null || listings.has(reference)) return;
    const card = $(element).closest('article, li, .property-card, .listing-card');
    const container = card.length > 0 ? card : $(element).parent();
    listings.set(reference, listingFromCard(container as cheerio.Cheerio<never>, href, reference));
  });

  if (listings.size === 0) warnings.push('Aucune annonce 123Loger reconnue');
  const next = $('a[href*="page="]')
    .get()
    .some((element) => {
      const href = $(element).attr('href') ?? '';
      return /[?&]page=\d+/i.test(href);
    });
  return { listings: [...listings.values()], hasNextPage: next, warnings };
}

export function parseDetailPage(html: string, pageUrl: string): RawListing | null {
  const reference = listingReference(pageUrl);
  if (reference === null) return null;
  const $ = cheerio.load(html);
  const text = textOf($('body').text());
  const title = textOf($('h1').first().text());
  const imageUrls = $('img[src], img[data-src]')
    .map((_index, image) => $(image).attr('src') ?? $(image).attr('data-src') ?? '')
    .get()
    .filter((url) => url.startsWith('http') && !url.includes('/assets/'));

  return {
    sourceRef: reference,
    sourceUrl: pageUrl.replace(/[?#].*$/, ''),
    ...(title !== '' ? { title } : {}),
    ...(text !== '' ? { description: text } : {}),
    ...(numberMatch(text, /(\d[\d\s.,]*)\s*€\s*\/\s*mois/i) !== undefined
      ? { priceText: `${numberMatch(text, /(\d[\d\s.,]*)\s*€\s*\/\s*mois/i)} € / mois` }
      : {}),
    ...(numberMatch(text, /(\d[\d\s.,]*)\s*m(?:²|2)/i) !== undefined
      ? { areaText: numberMatch(text, /(\d[\d\s.,]*)\s*m(?:²|2)/i) }
      : {}),
    ...(numberMatch(text, /(10|[1-9])\s*pi/i) !== undefined
      ? { roomsText: numberMatch(text, /(10|[1-9])\s*pi/i) }
      : {}),
    propertyTypeText: 'Appartement',
    furnishedText: /meubl[ée]|\bfurnished\b/i.test(text) ? 'Meublé' : undefined,
    cityText: 'Nice',
    postalCodeText: '06000',
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    extra: { reference },
  };
}
