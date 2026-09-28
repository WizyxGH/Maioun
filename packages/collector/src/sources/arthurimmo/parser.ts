/**
 * Source : Arthurimmo.com (Nice et périphérie).
 *
 * Réseau national d'agences immobilières avec plusieurs agences à Nice
 * (Arthurimmo Nice Nord, Nice Transactions Est, etc.).
 * Recherche par `recherche,basic.htm?transactions=louer&types[]=appartement&types[]=maison&localization=Nice&extends=10000`.
 */

import * as cheerio from 'cheerio';
import type { PropertyType, RawListing } from '@maioun/shared';

export const ARTHURIMMO_SEARCH_URL =
  'https://www.arthurimmo.com/recherche,basic.htm?transactions=louer&types%5B%5D=appartement&types%5B%5D=maison&localization=Nice&extends=10000';

export interface ParsedList {
  readonly listings: readonly RawListing[];
  readonly warnings: readonly string[];
}

const AD_URL_REGEX = /\/annonces\/location\/(?:appartement|maison)\/([a-z0-9-]+)\/(\d+)\.htm/i;

function propertyTypeOf(text: string): PropertyType | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('appartement') || lower.includes('studio')) return 'apartment';
  if (lower.includes('maison') || lower.includes('villa')) return 'house';
  return undefined;
}

export function parseList(html: string): ParsedList {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  const seenRefs = new Set<string>();

  $('a[href*="/annonces/location/"]').each((_index, element) => {
    const href = $(element).attr('href');
    if (!href) return;

    const match = href.match(AD_URL_REGEX);
    if (!match) return;

    const [fullMatch, citySlug, sourceRef] = match;
    if (!sourceRef || seenRefs.has(sourceRef)) return;
    seenRefs.add(sourceRef);

    const sourceUrl = href.startsWith('http') ? href : `https://www.arthurimmo.com${href}`;

    // Trouver le conteneur de la carte d'annonce
    const card = $(element).closest('article, div[class*="group"], div.relative');
    const cardText = card.text().replace(/\s+/g, ' ').trim();

    // Prix : e.g. "700 € /mois" ou "700 €"
    const priceMatch = cardText.match(/(\d[\d\s]*)\s*€/);
    const priceText = priceMatch ? priceMatch[1]?.replace(/\s/g, '') : undefined;

    // Pièces : e.g. "1 pièces" ou "3 pièces"
    const roomsMatch = cardText.match(/(\d+)\s*pièce/i);
    const roomsText = roomsMatch ? roomsMatch[1] : undefined;

    // Surface : e.g. "14,05 m²" ou "70 m²"
    const areaMatch = cardText.match(/(\d+(?:[.,]\d+)?)\s*m²/i);
    const areaText = areaMatch ? areaMatch[1] : undefined;

    // Code postal & Ville depuis citySlug (ex: "nice-06000") ou cardText
    let postalCodeText: string | undefined;
    let cityText = 'Nice';

    const cpMatch = (citySlug ?? '').match(/(\d{5})/);
    if (cpMatch) {
      postalCodeText = cpMatch[1];
    } else {
      const cpTextMatch = cardText.match(/\b(06\d{3})\b/);
      if (cpTextMatch) postalCodeText = cpTextMatch[1];
    }

    // Type de bien
    const propertyType = propertyTypeOf(cardText) ?? 'apartment';

    // Photos
    const photoUrls = card
      .find('img[src*="media.studio-net.fr"], img[src*="arthurimmo"]')
      .map((_, img) => $(img).attr('src'))
      .get()
      .filter((src): src is string => typeof src === 'string' && src.startsWith('http'))
      .map((src) => src.replace(/width=\d+&height=\d+/, 'width=1920&height=1440'));

    // Titre
    const titleParts = [
      propertyType === 'house' ? 'Maison' : 'Appartement',
      roomsText ? `${roomsText} pièce${Number(roomsText) > 1 ? 's' : ''}` : null,
      areaText ? `${areaText} m²` : null,
      'à Nice',
      postalCodeText ? `(${postalCodeText})` : null,
    ].filter(Boolean);

    const title = titleParts.join(' ');

    listings.push({
      sourceRef,
      sourceUrl,
      title,
      priceText,
      areaText,
      roomsText,
      postalCodeText,
      cityText,
      propertyTypeText: propertyType,
      imageUrls: [...new Set(photoUrls)],
      agencyName: 'Arthurimmo.com',
      description: cardText.slice(0, 300),
    });
  });

  return { listings, warnings };
}
