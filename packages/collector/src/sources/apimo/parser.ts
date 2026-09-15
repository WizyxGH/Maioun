/**
 * Adaptateur générique des sites d'agences sur la plateforme Apimo/Cello
 * (§5, §47 : un seul parser pour de nombreuses agences).
 *
 * Ces sites partagent la même structure :
 *   - `robots.txt` permissif (seul `/app_dev.php` interdit) + sitemap déclaré ;
 *   - URLs de fiches `/fr/propriete/{transaction}+{type}+{ville}+…+{réf}` ;
 *   - fiche avec JSON-LD schema.org `@graph` (RealEstateAgent + bien).
 *
 * Le domaine n'est PAS ancré dans le motif d'URL : `parseListingUrl` ne reçoit
 * que des URLs issues du sitemap du site lui-même. Chaque agence est déclarée
 * comme une instance via `makeApimoScraper` (voir `scraper.ts`).
 *
 * Instances connues : BEP Logement, D'Azur Immobilier.
 */

import * as cheerio from 'cheerio';
import { sitemapIndexUrls, sitemapUrls } from '../shared/sitemap.js';
import { formatCommune, type RawListing } from '@maioun/shared';
import { cleanText, comparable } from '../../normalization/text.js';
import { parsePropertyType } from '../../normalization/parse-listing-fields.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing } from '../shared/raw-listing.js';
import { collectJsonLdNodes, findJsonLdNode, type JsonLdNode } from '../shared/json-ld.js';
import {
  apimoBedrooms,
  apimoDpe,
  apimoMoney,
  apimoFloor,
  apimoFurnished,
  criterion,
  extractCriteria,
  type ApimoCriteria,
} from './criteria.js';

/**
 * Formes d'une URL de fiche, tout domaine Apimo confondu :
 * `/fr/propriete/{transaction}+{type}+{ville}+{slug…}+{référence}`, ou « à
 * barres » `/fr/propriete/{transaction}/{type}/{ville}/{slug}/{référence}`.
 */
const LISTING_URL_PATTERNS = [
  /^https?:\/\/(?:www\.)?[a-z0-9.-]+\/fr\/propriete\/(location|vente)\+([^+]+)\+([^+]+)\+(?:.*\+)?(\d{6,})\/?$/i,
  /^https?:\/\/(?:www\.)?[a-z0-9.-]+\/fr\/propriete\/(location|vente)\/([^/+]+)\/([^/+]+)\/(?:[^/]+\/)?(\d{6,})\/?$/i,
];

export interface ParsedListingUrl {
  readonly transaction: 'location' | 'vente';
  readonly typeSlug: string;
  readonly citySlug: string;
  readonly reference: string;
  readonly canonicalUrl: string;
}

/** Analyse une URL de fiche. `null` si ce n'en est pas une. */
export function parseListingUrl(href: string): ParsedListingUrl | null {
  const trimmed = href.trim();
  let match: RegExpExecArray | null = null;
  for (const pattern of LISTING_URL_PATTERNS) {
    match = pattern.exec(trimmed);
    if (match !== null) break;
  }
  if (match === null) return null;
  const [, transaction, typeSlug, citySlug, reference] = match;
  if (
    transaction === undefined ||
    typeSlug === undefined ||
    citySlug === undefined ||
    reference === undefined
  ) {
    return null;
  }
  return {
    transaction: transaction.toLowerCase() as 'location' | 'vente',
    typeSlug: typeSlug.toLowerCase(),
    citySlug: citySlug.toLowerCase(),
    reference,
    canonicalUrl: trimmed.replace(/[?#].*$/, ''),
  };
}

export interface SitemapEntry {
  readonly url: ParsedListingUrl;
  /** Date `lastmod` du sitemap (ISO simple `AAAA-MM-JJ`), sinon `null`. */
  readonly lastmod: string | null;
}

/**
 * Extrait les fiches de LOCATION d'un sitemap (les `<loc>` sont en CDATA).
 * Les fiches de vente et les pages éditoriales sont ignorées.
 */
export function parseSitemap(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const { loc, lastmod } of sitemapUrls(xml)) {
    const url = parseListingUrl(loc);
    if (url === null || url.transaction !== 'location') continue;
    entries.push({ url, lastmod });
  }
  return entries;
}

export function parseSitemapIndex(xml: string): string[] {
  return sitemapIndexUrls(xml);
}

/** Sous-ensemble utile du JSON-LD d'une fiche. */
interface JsonLdData {
  readonly name?: string;
  readonly description?: string;
  readonly rooms?: number;
  readonly bedrooms?: number;
  readonly area?: number;
  readonly city?: string;
  readonly postalCode?: string;
  readonly streetAddress?: string;
  readonly datePosted?: string;
  readonly dateModified?: string;
  readonly offerPrice?: string;
  readonly imageUrls?: readonly string[];
  readonly agencyName?: string;
  readonly agencyPhone?: string;
  readonly agencyEmail?: string;
}

/** Champs `string` d'un nœud, lus de façon tolérante. */
function str(node: JsonLdNode | undefined, key: string): string | undefined {
  const value = node?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** Mappe les nœuds `bien` + `agence` du graphe vers `JsonLdData`. */
function mapApimoJsonLd(property: JsonLdNode, agent: JsonLdNode | undefined): JsonLdData {
  const address = property['address'] as JsonLdNode | undefined;
  const floorSize = property['floorSize'] as JsonLdNode | undefined;
  const price = (property['offers'] as JsonLdNode | undefined)?.['price'];
  const name = str(property, 'name');
  return {
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(str(property, 'description') !== undefined
      ? { description: str(property, 'description') }
      : {}),
    ...(typeof property['numberOfRooms'] === 'number' ? { rooms: property['numberOfRooms'] } : {}),
    ...(typeof property['numberOfBedrooms'] === 'number'
      ? { bedrooms: property['numberOfBedrooms'] }
      : {}),
    ...(typeof floorSize?.['value'] === 'number' ? { area: floorSize['value'] } : {}),
    ...(str(address, 'addressLocality') !== undefined
      ? { city: str(address, 'addressLocality') }
      : {}),
    ...(str(address, 'postalCode') !== undefined ? { postalCode: str(address, 'postalCode') } : {}),
    ...(str(address, 'streetAddress') !== undefined
      ? { streetAddress: str(address, 'streetAddress') }
      : {}),
    ...(str(property, 'datePosted') !== undefined
      ? { datePosted: str(property, 'datePosted') }
      : {}),
    ...(str(property, 'dateModified') !== undefined
      ? { dateModified: str(property, 'dateModified') }
      : {}),
    ...(typeof price === 'string' || typeof price === 'number'
      ? { offerPrice: String(price) }
      : {}),
    ...(Array.isArray(property['image'])
      ? { imageUrls: property['image'].filter((u): u is string => typeof u === 'string') }
      : {}),
    ...(str(agent, 'name') !== undefined ? { agencyName: str(agent, 'name') } : {}),
    ...(str(agent, 'telephone') !== undefined ? { agencyPhone: str(agent, 'telephone') } : {}),
    ...(str(agent, 'email') !== undefined ? { agencyEmail: str(agent, 'email') } : {}),
  };
}

/**
 * Décode le graphe JSON-LD d'une fiche. `null` si aucun bien. On cherche le
 * nœud qui porte le bien (pas l'Organization ni le Product SEO générique).
 */
function parseJsonLd($: cheerio.CheerioAPI): JsonLdData | null {
  const nodes = collectJsonLdNodes($);
  const property = findJsonLdNode(nodes, ['apartment', 'house', 'residence']);
  if (property === undefined) return null;
  return mapApimoJsonLd(property, findJsonLdNode(nodes, ['realestateagent']));
}

export interface ParsedDetail {
  readonly listing: RawListing | null;
  readonly warnings: readonly string[];
  /** `true` si la fiche affiche « déjà Loué/Vendu » : à marquer `rented`. */
  readonly rented?: boolean;
}

/**
 * Rend la plus récente de deux dates ISO (`AAAA-MM-JJ`), en ignorant celles qui
 * sont absentes ou illisibles. `undefined` si aucune n'est exploitable.
 */
export function mostRecentDate(a?: string, b?: string): string | undefined {
  const candidates = [a, b].filter(
    (value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)),
  );
  if (candidates.length === 0) return undefined;
  return candidates.reduce((latest, current) =>
    Date.parse(current) > Date.parse(latest) ? current : latest,
  );
}

/**
 * Analyse une fiche bien et en extrait l'annonce.
 *
 * @param html contenu HTML brut de la fiche
 * @param pageUrl URL de la fiche (déjà validée par `parseListingUrl`)
 * @param defaultAgencyName agence à afficher si le JSON-LD ne la nomme pas
 */
/** Slugs de type d'URL désignant un bien NON résidentiel. */
const COMMERCIAL_SLUGS =
  /commerce|bureau|local|atelier|entrepot|fonds|professionnel|industriel|terrain|hangar/;

/** `true` si le type d'URL désigne un bien non résidentiel : inutile de visiter. */
export function isCommercialSlug(typeSlug: string): boolean {
  return COMMERCIAL_SLUGS.test(comparable(typeSlug));
}

/** `true` si la fiche décrit un bien à usage commercial/professionnel. */
function isCommercial($: cheerio.CheerioAPI, typeSlug: string): boolean {
  if (isCommercialSlug(typeSlug)) return true;
  // Adresse sans type (`/fr/propriété/8188166`, Groupe Picado, Cabinet Cordier) :
  // le titre de la page le dit — « Local commercial Ariane ».
  if (parsePropertyType(pageTitle($) ?? '') === 'commercial') return true;
  // Type schema.org du JSON-LD : `CommercialProperty` (le graphe peut aussi le
  // porter alors que le repli résidentiel a échoué).
  return /"@type"\s*:\s*"CommercialProperty"/.test($.html());
}

/**
 * Statut bloquant d'une fiche, avant tout parsing : bien DÉJÀ LOUÉ/VENDU
 * (bandeau `.propertySold`, alors que le JSON-LD dit encore `InStock` → on
 * signale `rented`, §32/§33) ou bien NON RÉSIDENTIEL (commerce, bureau…, hors
 * périmètre). Retourne le `ParsedDetail` à renvoyer, ou `null` si rien ne bloque.
 */
function apimoBlockingStatus(
  $: cheerio.CheerioAPI,
  typeSlug: string,
  pageUrl: string,
): ParsedDetail | null {
  const soldSticker = comparable($('.propertySold, .sticker').text());
  if (/deja loue|deja louee|\bloue\b|\blouee\b|\bvendu\b|\bvendue\b/.test(soldSticker)) {
    return { listing: null, rented: true, warnings: [`Bien déjà loué/vendu : ${pageUrl}`] };
  }
  if (isCommercial($, typeSlug)) {
    return { listing: null, warnings: [`Bien à usage commercial (ignoré) : ${pageUrl}`] };
  }
  return null;
}

/** Intertitres de section du gabarit, jamais le titre de l'annonce. */
const SECTION_HEADING =
  /^(sommaire|surfaces?|prestations|proximites?|description|details?|caracteristiques|diagnostics?|mentions legales|informations?(?: complementaires)?)$/;

/** Premier texte de ces éléments qui n'est pas un intertitre. */
function firstHeading($: cheerio.CheerioAPI, selector: string): string | undefined {
  return $(selector)
    .toArray()
    .map((element) => cleanText($(element).text()))
    .find((text) => text !== '' && !SECTION_HEADING.test(comparable(text)));
}

/**
 * Le titre de l'annonce : `og:title`, puis le h1 de la fiche, puis le premier
 * `.title` qui n'est pas un intertitre. Le premier `.title` seul donnait
 * « Sommaire » à dix annonces (relevé du 2026-09-14). Un `og:title` à barre
 * est celui du site (« Propriété | ERIC IMMO », fiches sans JSON-LD) : écarté.
 */
function pageTitle($: cheerio.CheerioAPI): string | undefined {
  const og = cleanText($('meta[property="og:title"]').attr('content') ?? '');
  if (og !== '' && !og.includes('|') && !SECTION_HEADING.test(comparable(og))) return og;
  return (
    firstHeading($, '.module-property-info h1.title, .module-property-info h1') ??
    firstHeading($, '.module-property-info .title, .title')
  );
}

/** « Garage parking Nice » : dernier recours, type et commune de la fiche. */
function typeAndCityTitle(
  parsedUrl: ParsedListingUrl,
  city: string | undefined,
): string | undefined {
  const type = parsedUrl.typeSlug.replace(/-/g, ' ');
  const town = city ?? parsedUrl.citySlug.replace(/-/g, ' ');
  const words = [
    type.charAt(0).toUpperCase() + type.slice(1),
    town === '' ? '' : formatCommune(town),
  ]
    .filter((word) => word !== '')
    .join(' ');
  return words === '' ? undefined : words;
}

/** Champs métier d'une fiche Apimo : JSON-LD prioritaire, HTML en secours. */
function extractApimoContent(
  $: cheerio.CheerioAPI,
  jsonLd: JsonLdData | null,
): {
  priceText?: string;
  title?: string;
  description?: string;
  areaText?: string;
  roomsText?: string;
} {
  const infoText = cleanText($('.module-property-info').first().text().replace(/\s+/g, ' '));
  // Prix : le bloc affiché d'abord (mention des charges), le JSON en secours.
  const htmlPrice = cleanText($('.module-property-info .price').first().text());
  let priceText: string | undefined;
  if (htmlPrice !== '') priceText = htmlPrice;
  else if (jsonLd?.offerPrice !== undefined) priceText = `${jsonLd.offerPrice} €`;

  return {
    priceText,
    title: jsonLd?.name ?? pageTitle($),
    description: jsonLd?.description ?? htmlToText($, '#description') ?? undefined,
    areaText:
      jsonLd?.area !== undefined
        ? `${jsonLd.area} m²`
        : infoText.match(/[\d][\d\s.,]*\s*m\s*(?:²|2)(?!\d)/i)?.[0],
    roomsText:
      jsonLd?.rooms !== undefined
        ? `${jsonLd.rooms} pièces`
        : infoText.match(/\d+\s*pièces?/i)?.[0],
  };
}

/** Convention « N pièces M chambres », lue telle quelle par la normalisation. */
function withBedrooms(
  roomsText: string | undefined,
  jsonLd: JsonLdData | null,
  criteria: ApimoCriteria,
): string | undefined {
  const bedrooms = jsonLd?.bedrooms ?? apimoBedrooms(criteria);
  if (bedrooms === undefined) return roomsText;
  return `${roomsText ?? ''} ${bedrooms} chambre${bedrooms > 1 ? 's' : ''}`.trim();
}

/**
 * Attributs structurés de la fiche → `extra`.
 *
 * `features` est le champ que la normalisation FOUILLE : elle y cherche
 * l'étage, l'ascenseur, le balcon, le DPE et le caractère meublé. Y verser les
 * critères et les prestations revient à récolter tout le bloc d'un coup.
 */
function apimoExtra(
  $: cheerio.CheerioAPI,
  criteria: ApimoCriteria,
  parsedUrl: ParsedListingUrl,
): Record<string, string> {
  const lines = criteria.pairs.map(([label, value]) => `${label} : ${value}`);
  if (criteria.services.length > 0) lines.push(`Prestations : ${criteria.services.join(', ')}`);
  const extra: Record<string, string> = {
    // La référence affichée par l'agence, qui peut différer de l'identifiant d'URL.
    reference: criterion(criteria, [/^reference$/]) ?? parsedUrl.reference,
    citySlug: parsedUrl.citySlug,
  };
  if (lines.length > 0) extra['features'] = lines.join(' · ');
  const floor = apimoFloor(criteria);
  if (floor !== undefined) extra['etage'] = floor;
  if (criteria.services.some((service) => /^ascenseur$/i.test(service))) extra['ascenseur'] = '1';
  const dpe = apimoDpe($);
  if (dpe !== undefined) extra['dpe'] = dpe;
  return extra;
}

/** `true` si la page est une fiche retirée / introuvable (§17). */
function isRemovedListing(
  $: cheerio.CheerioAPI,
  jsonLd: JsonLdData | null,
  priceText: string | undefined,
): boolean {
  const canonical =
    $('link[rel="canonical"]').attr('href') ?? $('meta[property="og:url"]').attr('content') ?? '';
  // Redirection vers une page « not found », OU absence totale de signal (ni
  // JSON-LD de bien, ni prix — une vraie location a un loyer).
  return (
    /\/(not-?found|introuvable|404)\b/i.test(canonical) ||
    (jsonLd === null && priceText === undefined)
  );
}

export function parseDetailPage(
  html: string,
  pageUrl: string,
  defaultAgencyName: string,
): ParsedDetail {
  const parsedUrl = parseListingUrl(pageUrl);
  if (parsedUrl === null) {
    return { listing: null, warnings: [`URL inattendue pour une fiche : ${pageUrl}`] };
  }
  return parseApimoDetail(html, parsedUrl, defaultAgencyName);
}

/**
 * Parse une fiche Apimo à partir d'une URL DÉJÀ analysée. Permet aux sites au
 * schéma d'URL non standard (ex. Privilège : `/fr/propriété/{id}`, sans slug
 * ville/type) de réutiliser toute l'extraction JSON-LD/HTML en fournissant une
 * `ParsedListingUrl` construite à la main — `typeSlug`/`citySlug` peuvent être
 * vides, la ville et le type viennent alors du JSON-LD et du titre.
 */
export function parseApimoDetail(
  html: string,
  parsedUrl: ParsedListingUrl,
  defaultAgencyName: string,
): ParsedDetail {
  const pageUrl = parsedUrl.canonicalUrl;
  const $ = cheerio.load(html);
  const blocked = apimoBlockingStatus($, parsedUrl.typeSlug, pageUrl);
  if (blocked !== null) return blocked;

  const warnings: string[] = [];
  const jsonLd = parseJsonLd($);
  if (jsonLd === null) warnings.push('JSON-LD absent ou illisible — repli sur le HTML seul');

  const { priceText, title, description, areaText, roomsText } = extractApimoContent($, jsonLd);
  const criteria = extractCriteria($);

  // Fiche retirée : on ne produit rien plutôt qu'une fiche fantôme (§17).
  if (isRemovedListing($, jsonLd, priceText)) {
    return {
      listing: null,
      warnings: [...warnings, `Fiche retirée ou introuvable (ignorée) : ${pageUrl}`],
    };
  }
  if (priceText === undefined) warnings.push(`Fiche sans prix : ${pageUrl}`);

  // Date effective = la plus récente entre publication et dernière modif : sur
  // ces sites, `datePosted` peut être ancien pour une annonce rafraîchie.
  const publishedAtText = mostRecentDate(jsonLd?.datePosted, jsonLd?.dateModified);

  const listing = compactListing({
    sourceRef: parsedUrl.reference,
    sourceUrl: parsedUrl.canonicalUrl,
    title: title !== undefined && title !== '' ? title : typeAndCityTitle(parsedUrl, jsonLd?.city),
    description: description !== undefined && description !== '' ? description : undefined,
    priceText,
    areaText,
    roomsText: withBedrooms(roomsText, jsonLd, criteria),
    propertyTypeText: parsedUrl.typeSlug,
    ...apimoMoney(criteria),
    furnishedText: apimoFurnished(criteria),
    // §21 : adresse exacte + coordonnées d'agence, publiées dans le JSON-LD.
    addressText: jsonLd?.streetAddress,
    cityText: jsonLd?.city ?? parsedUrl.citySlug.replace(/-/g, ' '),
    postalCodeText: jsonLd?.postalCode,
    agencyName: jsonLd?.agencyName ?? defaultAgencyName,
    phoneText: jsonLd?.agencyPhone,
    emailText: jsonLd?.agencyEmail,
    contactFormUrl: parsedUrl.canonicalUrl,
    publishedAtText,
    imageUrls:
      jsonLd?.imageUrls !== undefined && jsonLd.imageUrls.length > 0 ? jsonLd.imageUrls : undefined,
    extra: apimoExtra($, criteria, parsedUrl),
  });

  return { listing, warnings };
}
