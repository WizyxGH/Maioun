import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';

const LISTING_URL = /^https?:\/\/(?:www\.)?rentola\.fr\/listings\/.*?-([a-z0-9]+)\/?(?:[?#].*)?$/i;

export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
}

interface JsonLdListItem {
  '@type'?: string;
  position?: number;
  url?: string;
  item?: JsonLdRealEstate;
}

interface JsonLdRealEstate {
  '@type'?: string;
  name?: string;
  url?: string;
  description?: string;
  datePosted?: string;
  image?: string | readonly string[];
  offers?: {
    '@type'?: string;
    price?: number;
    priceCurrency?: string;
    validFrom?: string;
    itemOffered?: {
      '@type'?: string;
      address?: {
        streetAddress?: string;
        addressCountry?: string;
        addressLocality?: string;
        postalCode?: string;
      };
      geo?: {
        latitude?: number;
        longitude?: number;
      };
      floorSize?: {
        value?: number;
        unitCode?: string;
      };
      numberOfBedrooms?: {
        value?: number;
      };
    };
  };
}

export function listingReference(href: string): string | null {
  const match = LISTING_URL.exec(href.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

function extractPostalCode(text?: string): string | undefined {
  if (!text) return undefined;
  const match = /\b(06\d{3})\b/.exec(text);
  return match?.[1];
}

function listingFromJsonLd(item: JsonLdRealEstate, fallbackUrl: string): RawListing | null {
  const url = item.url ?? fallbackUrl;
  const reference = listingReference(url);
  if (!reference) return null;

  const offers = item.offers;
  const itemOffered = offers?.itemOffered;
  const address = itemOffered?.address;
  const geo = itemOffered?.geo;
  const floorSize = itemOffered?.floorSize;
  const bedrooms = itemOffered?.numberOfBedrooms?.value;

  const images: string[] = [];
  if (Array.isArray(item.image)) {
    for (const img of item.image) {
      if (typeof img === 'string' && img.startsWith('http')) images.push(img);
    }
  } else if (typeof item.image === 'string' && item.image.startsWith('http')) {
    images.push(item.image);
  }

  const rawTitle = item.name ? cleanText(item.name) : undefined;
  const street = address?.streetAddress ? cleanText(address.streetAddress) : undefined;
  const postalCode = address?.postalCode ?? extractPostalCode(street);
  const city = address?.addressLocality ? cleanText(address.addressLocality) : 'Nice';

  const isFurnished =
    (item.description && /meubl[ée]|\bfurnished\b/i.test(item.description)) ||
    (rawTitle && /meubl[ée]|\bfurnished\b/i.test(rawTitle));

  return {
    sourceRef: reference,
    sourceUrl: url.replace(/[?#].*$/, ''),
    ...(rawTitle ? { title: rawTitle } : {}),
    ...(item.description ? { description: cleanText(item.description) } : {}),
    ...(offers?.price !== undefined ? { priceText: `${offers.price} € / mois` } : {}),
    ...(floorSize?.value !== undefined ? { areaText: `${floorSize.value} m²` } : {}),
    ...(bedrooms !== undefined
      ? { roomsText: `${bedrooms} ${bedrooms > 1 ? 'chambres' : 'chambre'}` }
      : {}),
    propertyTypeText: itemOffered?.['@type'] === 'House' ? 'Maison' : 'Appartement',
    furnishedText: isFurnished ? 'Meublé' : undefined,
    ...(street ? { addressText: street } : {}),
    cityText: city,
    ...(postalCode ? { postalCodeText: postalCode } : {}),
    ...(geo?.latitude !== undefined ? { latitude: geo.latitude } : {}),
    ...(geo?.longitude !== undefined ? { longitude: geo.longitude } : {}),
    ...(images.length > 0 ? { imageUrls: images } : {}),
    ...(offers?.validFrom || item.datePosted
      ? { publishedAt: offers?.validFrom ?? item.datePosted }
      : {}),
    extra: {
      reference,
      aggregator: 'rentola',
    },
  };
}

/**
 * Images D'ILLUSTRATION, et non de biens.
 *
 * Le repli HTML ramassait toutes les images de la carte. Or une carte de site
 * d'agrégateur sert d'abord ses propres images : logo, badge de exclusivity,
 * flèche de pagination, icône de débit. Elles partaient en base comme photos du
 * bien — ce que l'utilisateur voit alors comme « il manque des photos et il y
 * en a de mauvaises ».
 */
function isIllustration(src: string): boolean {
  return (
    /avatar|icon|logo|sprite|placeholder|banner|badge|arrow|chevron|placeholder/i.test(src) ||
    /\.(?:svg|gif)(?:\?|$)/i.test(src)
  );
}

/**
 * La carte la PLUS ÉTROITE qui porte encore le lien : la plus petite possible.
 *
 * Remonter trop loin avale les voisins — c'est ainsi qu'une annonce héritait des
 * photos de la carte d'à côté. On s'arrête dès qu'un parent en contient deux.
 */
function cardOf($: cheerio.CheerioAPI, element: unknown) {
  let node = $(element as never) as cheerio.Cheerio<never>;
  for (let depth = 0; depth < 4; depth += 1) {
    const parent = node.parent() as cheerio.Cheerio<never>;
    if (parent.length === 0) break;
    if (parent.find('a[href*="/listings/"]').length > 1) break;
    node = parent;
  }
  return node;
}

/**
 * Les photos du BIEN dans un morceau de page.
 *
 * @param card Un sélecteur, ou la carte à examiner.
 */
function imagesOf(
  $: cheerio.CheerioAPI,
  card: string | cheerio.Cheerio<never>,
  pageUrl: string,
): string[] {
  const found: string[] = [];
  const scope = typeof card === 'string' ? $(card) : card;
  scope.find('img[src], img[data-src], source[srcset]').each((_index, image) => {
    const el = $(image);
    for (const attr of ['src', 'data-src', 'srcset']) {
      const raw = el.attr(attr);
      if (raw === undefined) continue;
      for (const candidate of raw.split(',').map((part) => part.trim().split(' ')[0] ?? '')) {
        const absolute = candidate.startsWith('http') ? candidate : safeUrl(candidate, pageUrl);
        if (absolute === null || absolute === '' || isIllustration(absolute)) continue;
        if (!found.includes(absolute)) found.push(absolute);
      }
    }
  });
  return found;
}

/** L'URL absolue d'une source relative, ou `null` si elle n'en est pas une. */
function safeUrl(href: string, pageUrl: string): string | null {
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const listings = new Map<string, RawListing>();
  const warnings: string[] = [];

  // 1. Essai d'extraction via JSON-LD (SearchPage)
  const jsonLdMatches = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const match of jsonLdMatches) {
    try {
      const rawJson = match[1];
      if (!rawJson) continue;
      const data = JSON.parse(rawJson);
      if (data['@type'] === 'SearchResultsPage' || data.mainEntity?.itemListElement) {
        const items: JsonLdListItem[] = data.mainEntity?.itemListElement ?? [];
        for (const entry of items) {
          const item = entry.item ?? (entry as unknown as JsonLdRealEstate);
          const url = entry.url ?? item.url;
          if (!url) continue;
          const listing = listingFromJsonLd(item, url);
          if (listing && !listings.has(listing.sourceRef)) {
            listings.set(listing.sourceRef, listing);
          }
        }
      }
    } catch {
      // Ignorer les blocs JSON invalides
    }
  }

  // 2. Repli HTML si aucun JSON-LD n'a produit de résultat
  if (listings.size === 0) {
    const $ = cheerio.load(html);
    $('a[href*="/listings/"]').each((_index, element) => {
      const rawHref = $(element).attr('href');
      if (!rawHref) return;
      const href = safeUrl(rawHref, pageUrl);
      const reference = href === null ? null : listingReference(href);
      if (!reference || listings.has(reference)) return;

      const card = cardOf($, element);
      const text = cleanText(card.text());
      const title =
        cleanText(card.find('h2, h3, h4').first().text()) || cleanText($(element).text());

      const priceMatch = /(\d[\d\s.,]*)\s*€/i.exec(text);
      const areaMatch = /(\d[\d\s.,]*)\s*m(?:²|2)/i.exec(text);
      const roomsMatch = /(\d+)\s*(?:pi[èe]ce|chambre|p\b)/i.exec(text);
      // Le code postal est écrit dans le texte de la carte ; on le cherche là,
      // pas dans le titre, qui ne le porte pas toujours.
      const postal = /\b(06\d{3})\b/.exec(text)?.[1];

      const images = imagesOf($, card, pageUrl);

      listings.set(reference, {
        sourceRef: reference,
        sourceUrl: (href as string).replace(/[?#].*$/, ''),
        ...(title ? { title } : {}),
        ...(priceMatch?.[1] ? { priceText: `${priceMatch[1].replace(/\s/g, '')} € / mois` } : {}),
        ...(areaMatch?.[1] ? { areaText: `${areaMatch[1].replace(/\s/g, '')} m²` } : {}),
        ...(roomsMatch?.[1] ? { roomsText: roomsMatch[1] } : {}),
        propertyTypeText: 'Appartement',
        cityText: 'Nice',
        ...(postal ? { postalCodeText: postal } : {}),
        ...(images.length > 0 ? { imageUrls: images } : {}),
        extra: { reference, aggregator: 'rentola' },
      });
    });
  }

  if (listings.size === 0) {
    warnings.push('Aucune annonce Rentola reconnue sur la page');
  }

  // Détection de page suivante :
  // Si au moins 20 annonces ont été extraites ou si un lien ?page= existe
  const hasPageLink = /[?&]page=\d+/i.test(html);
  const hasNextPage = listings.size >= 20 || hasPageLink;

  return {
    listings: [...listings.values()],
    hasNextPage,
    warnings,
  };
}

export function parseDetailPage(html: string, pageUrl: string): RawListing | null {
  const reference = listingReference(pageUrl);
  if (!reference) return null;

  // 1. Essai JSON-LD
  const jsonLdMatches = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const match of jsonLdMatches) {
    try {
      const rawJson = match[1];
      if (!rawJson) continue;
      const data = JSON.parse(rawJson);
      if (data['@type'] === 'RealEstateListing' || data['@type'] === 'Apartment') {
        const listing = listingFromJsonLd(data, pageUrl);
        if (listing) return listing;
      }
    } catch {
      // continuer
    }
  }

  // 2. Repli HTML
  const $ = cheerio.load(html);
  const title = cleanText($('h1').first().text());
  const bodyText = cleanText($('body').text());
  const description =
    cleanText($('[class*="description"], #description, p').first().text()) || bodyText;

  const priceMatch = /(\d[\d\s.,]*)\s*€/i.exec(bodyText);
  const areaMatch = /(\d[\d\s.,]*)\s*m(?:²|2)/i.exec(bodyText);
  const roomsMatch = /(\d+)\s*(?:pi[èe]ce|chambre|p\b)/i.exec(bodyText);
  const postal = extractPostalCode(bodyText);

  const images = imagesOf($, 'body', pageUrl);

  return {
    sourceRef: reference,
    sourceUrl: pageUrl.replace(/[?#].*$/, ''),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(priceMatch?.[1] ? { priceText: `${priceMatch[1].replace(/\s/g, '')} € / mois` } : {}),
    ...(areaMatch?.[1] ? { areaText: `${areaMatch[1].replace(/\s/g, '')} m²` } : {}),
    ...(roomsMatch?.[1] ? { roomsText: roomsMatch[1] } : {}),
    propertyTypeText: 'Appartement',
    cityText: 'Nice',
    // ÉCRIT EN DUR AVANT, SUR TOUTE FICHE : une annonce de Cagnes ou de
    // Menton entrait à Nice, au 06000, sans que rien ne le dise. Le repli ne
    // vaut qu'à ce que la page porte (§17).
    ...(postal ? { postalCodeText: postal } : {}),
    ...(images.length > 0 ? { imageUrls: images } : {}),
    extra: { reference, aggregator: 'rentola' },
  };
}
