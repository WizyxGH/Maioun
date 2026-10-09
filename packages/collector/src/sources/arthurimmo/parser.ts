/**
 * Source : Arthurimmo.com (Nice et périphérie).
 *
 * Réseau national d'agences immobilières avec plusieurs agences à Nice
 * (Arthurimmo Nice Nord, Nice Transactions Est, Agence des Beaux Arts, etc.).
 * Recherche par `recherche,basic.htm?transactions=louer&types[]=appartement&types[]=maison&localization=Nice&extends=10000`.
 */

import * as cheerio from 'cheerio';
import type { PropertyType, RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';

export const ARTHURIMMO_SEARCH_URL =
  'https://www.arthurimmo.com/recherche,basic.htm?transactions=louer&types%5B%5D=appartement&types%5B%5D=maison&localization=Nice&extends=10000';

export interface ParsedList {
  readonly listings: readonly RawListing[];
  readonly warnings: readonly string[];
}

export const AD_URL_REGEX =
  /(?:\/annonces\/location\/(?:appartement|maison)\/([a-z0-9-]+)\/(\d+)\.htm)/i;

function propertyTypeOf(text: string): PropertyType | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('appartement') || lower.includes('studio')) return 'apartment';
  if (lower.includes('maison') || lower.includes('villa')) return 'house';
  return undefined;
}

type CheerioSelection = ReturnType<cheerio.CheerioAPI>;
type CheerioElement = Parameters<cheerio.CheerioAPI>[0];

function extractCardPostalCode(citySlug: string | undefined, cardText: string): string | undefined {
  const cpMatch = (citySlug ?? '').match(/(\d{5})/);
  if (cpMatch) return cpMatch[1];
  const cpTextMatch = cardText.match(/\b(06\d{3})\b/);
  return cpTextMatch?.[1];
}

function extractCardPhotos(
  $: cheerio.CheerioAPI,
  card: CheerioSelection,
  sourceRef: string,
): string[] {
  return card
    .find(
      `img[src*="/biens/${sourceRef}/"], img[src*="media.studio-net.fr"], img[src*="arthurimmo"]`,
    )
    .map((_, img) => $(img).attr('src'))
    .get()
    .filter((src): src is string => typeof src === 'string' && src.startsWith('http'))
    .map((src) => src.replace(/width=\d+&height=\d+/, 'width=1920&height=1440'));
}

function buildCardTitle(
  card: CheerioSelection,
  propertyType: string,
  roomsText?: string,
  areaText?: string,
  postalCodeText?: string,
): string {
  const h2Text = cleanText(card.find('h2').text());
  if (h2Text) return h2Text;
  const titleParts = [
    propertyType === 'house' ? 'Maison' : 'Appartement',
    roomsText ? `${roomsText} pièce${Number(roomsText) > 1 ? 's' : ''}` : null,
    areaText ? `${areaText} m²` : null,
    'à Nice',
    postalCodeText ? `(${postalCodeText})` : null,
  ].filter(Boolean);
  return titleParts.join(' ');
}

function parseCardElement(
  $: cheerio.CheerioAPI,
  element: CheerioElement,
  listings: Map<string, RawListing>,
): void {
  const href = $(element).attr('href');
  if (!href) return;

  const match = href.match(AD_URL_REGEX);
  if (!match) return;

  const [, citySlug, sourceRef] = match;
  if (!sourceRef) return;

  const sourceUrl = href.startsWith('http') ? href : `https://www.arthurimmo.com${href}`;

  // Trouver le conteneur principal de la carte
  // Attention : ne pas cibler div.relative seul car il attrape le badge photo "3"
  const card = $(element).closest(
    'div.relative.z-0.flex.flex-col, div[class*="rounded-50"], article, div.relative.group',
  );
  if (card.length === 0) return;

  const cardText = cleanText(card.text());
  const priceMatch = cardText.match(/(\d[\d\s]*)\s*€/);
  const priceText = priceMatch ? priceMatch[1]?.replace(/\s/g, '') : undefined;

  const roomsMatch = cardText.match(/(\d+)\s*pièce/i);
  const roomsText = roomsMatch ? roomsMatch[1] : undefined;

  const areaMatch = cardText.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const areaText = areaMatch ? areaMatch[1] : undefined;

  // Si on a déjà vu cette annonce avec des infos complètes, on évite d'écraser
  const existing = listings.get(sourceRef);
  if (existing && existing.priceText && existing.areaText && (!priceText || !areaText)) {
    return;
  }

  const postalCodeText = extractCardPostalCode(citySlug, cardText);
  const propertyType = propertyTypeOf(cardText) ?? 'apartment';
  const photoUrls = extractCardPhotos($, card, sourceRef);
  const title = buildCardTitle(card, propertyType, roomsText, areaText, postalCodeText);
  const desc = cleanText(card.find('p').text()) || cardText.slice(0, 300);

  listings.set(sourceRef, {
    sourceRef,
    sourceUrl,
    title,
    priceText,
    areaText,
    roomsText,
    postalCodeText,
    cityText: 'Nice',
    propertyTypeText: propertyType,
    imageUrls: [...new Set(photoUrls)],
    agencyName: 'Arthurimmo.com',
    description: desc || undefined,
  });
}

export function parseList(html: string): ParsedList {
  const $ = cheerio.load(html);
  const listings = new Map<string, RawListing>();
  const warnings: string[] = [];

  $('a[href*="/annonces/location/"]').each((_index, element) => {
    parseCardElement($, element, listings);
  });

  return { listings: [...listings.values()], warnings };
}

function extractDetailDescription($: cheerio.CheerioAPI): string {
  let description = '';
  $('div.text-gray-900 p').each((_, p) => {
    const t = cleanText($(p).text());
    if (t.length > description.length) description = t;
  });
  if (!description) {
    description = cleanText($('meta[name="description"]').attr('content') ?? '');
  }
  return description;
}

function extractFinancials($: cheerio.CheerioAPI) {
  let chargesText: string | undefined;
  let depositText: string | undefined;
  let tenantFeesText: string | undefined;
  $('div.flex-1.text-right').each((_, el) => {
    const row = cleanText($(el).parent().text());
    const valMatch = row.match(/(\d[\d\s]*)\s*€/);
    if (!valMatch) return;
    const val = valMatch[1]?.replace(/\s/g, '');
    if (/^charges\b/i.test(row)) chargesText = val;
    else if (/dépôt de garantie/i.test(row)) depositText = val;
    else if (/honoraires locataire/i.test(row)) tenantFeesText = val;
  });
  return { chargesText, depositText, tenantFeesText };
}

function extractAgencyAndContact($: cheerio.CheerioAPI) {
  let agencyName = 'Arthurimmo.com';
  let contactName: string | undefined;
  $('h2').each((_, el) => {
    if ($(el).text().includes('Ce bien vous est proposé par')) {
      const parent = $(el).closest('section, div[class*="shadow"], div[class*="border"]');
      const siblingText = cleanText($(el).next().text());
      const ctText =
        parent.length > 0 ? cleanText(parent.text()) : `${cleanText($(el).text())} ${siblingText}`;
      const agMatch = ctText.match(/(Arthurimmo\.com[^\n\r.]+?)(?:Voir|$)/i);
      if (agMatch) agencyName = agMatch[1]?.trim() ?? agencyName;
      const contMatch = ctText.match(
        /proposé par\s*(?:image\/svg\+xml\s*)?([A-ZÀ-ÿ\s'-]+?)(?:\s+(?:Commercial|Agent|Négociateur|Arthurimmo|Voir)|$)/i,
      );
      if (contMatch) {
        contactName = contMatch[1]?.trim();
      }
    }
  });
  return { agencyName, contactName };
}

function extractEnergyRatings(html: string) {
  let dpe: string | undefined;
  const dpeSvg = html.match(/Diagnostic de performance énergétique[\s\S]*?<\/svg>/i);
  if (dpeSvg) {
    const letterMatch = dpeSvg[0].match(/font-size=["']54["'][^>]*><tspan[^>]*>([A-G])<\/tspan>/i);
    if (letterMatch) dpe = letterMatch[1]?.toUpperCase();
  }

  let ges: string | undefined;
  const gesSvg = html.match(/Indice d'émission de gaz à effet de serre[\s\S]*?<\/svg>/i);
  if (gesSvg) {
    const letterMatch = gesSvg[0].match(/font-size=["']54["'][^>]*><tspan[^>]*>([A-G])<\/tspan>/i);
    if (letterMatch) ges = letterMatch[1]?.toUpperCase();
  }
  return { dpe, ges };
}

export function parseDetail(html: string, pageUrl: string): RawListing | null {
  const match = pageUrl.match(AD_URL_REGEX);
  const sourceRef = match?.[2];
  if (!sourceRef) return null;

  const $ = cheerio.load(html);
  const h1 = cleanText($('h1').text());
  const description = extractDetailDescription($);

  // Prix principal
  const priceEl = cleanText($('div.text-4xl, div.text-2xl').first().text());
  const priceMatch = priceEl.match(/(\d[\d\s]*)\s*€/);
  const priceText = priceMatch ? priceMatch[1]?.replace(/\s/g, '') : undefined;

  const { chargesText, depositText, tenantFeesText } = extractFinancials($);

  // Caractéristiques du bien
  const fullText = cleanText($('body').text());
  const areaMatch =
    h1.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i) ||
    fullText.match(/Surface\s*habitable\s*(\d+(?:[.,]\d+)?)\s*m[²2]/i) ||
    fullText.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const areaText = areaMatch ? areaMatch[1] : undefined;

  const roomsMatch =
    h1.match(/(\d+)\s*pièce/i) ||
    fullText.match(/Nombre de pièces\s*(\d+)/i) ||
    fullText.match(/(\d+)\s*pièce/i);
  const roomsText = roomsMatch
    ? `${roomsMatch[1]} pièce${Number(roomsMatch[1]) > 1 ? 's' : ''}`
    : undefined;

  const isFurnished =
    /Meublé\s*Oui/i.test(fullText) || /meublé/i.test(h1) || /meublé/i.test(description);
  const hasElevator = /Ascenseur\s*Oui/i.test(fullText);
  const floorMatch = fullText.match(/Etage\s*(\d+(?:er|ème|eme)?|RDC)/i);

  const { agencyName, contactName } = extractAgencyAndContact($);

  // Référence
  const refMatch = html.match(/Référence\s*(\d+)/i) || html.match(/ref\.(\d+)/i);
  const reference = refMatch ? refMatch[1] : undefined;

  const { dpe, ges } = extractEnergyRatings(html);

  // Photos propres à cette annonce
  const imageUrls = $(`img[src*="/biens/${sourceRef}/"]`)
    .map((_, img) => $(img).attr('src'))
    .get()
    .filter((src): src is string => typeof src === 'string' && src.startsWith('http'))
    .map((src) => src.replace(/width=\d+&height=\d+/, 'width=1920&height=1440'));

  return {
    sourceRef,
    sourceUrl: pageUrl,
    title: h1 || undefined,
    description: description || undefined,
    priceText,
    chargesText,
    depositText,
    areaText,
    roomsText,
    furnishedText: isFurnished ? 'Meublé' : undefined,
    agencyName,
    contactName,
    imageUrls: [...new Set(imageUrls)],
    extra: {
      ...(reference ? { reference } : {}),
      ...(floorMatch ? { floor: floorMatch[1] } : {}),
      ...(hasElevator ? { elevator: 'true' } : {}),
      ...(dpe ? { dpe } : {}),
      ...(ges ? { ges } : {}),
      ...(tenantFeesText ? { tenantFees: tenantFeesText } : {}),
    },
  };
}
