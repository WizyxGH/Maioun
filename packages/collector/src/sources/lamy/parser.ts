/**
 * Source : Lamy Immobilier (réseau national, agences à Nice).
 *
 * Site sur Ibexa (CMS open source), server-rendered — aucun JS requis.
 * robots.txt permissif (seuls /is_admin/ et /login/ interdits), sitemap déclaré
 * (vérifié le 2026-08-17). ~3 200 fiches de location dans le sitemap, dont une
 * douzaine dans les Alpes-Maritimes.
 *
 * URLs de fiche :
 *   /louer/louer-un-bien/annonces-de-biens-a-louer/{région}/{département}/
 *     {ville}-{CP}/{type}-{ville}-{CP}-{référence}
 * avec une référence `flXXXXXXX`. Fiche ancrée sur les classes `estate__*` :
 * titre, localisation, prix (« par mois / CC »), référence, description,
 * caractéristiques, DPE/GES.
 *
 * PHOTOS INAFFICHABLES AILLEURS. Le CDN (res.cloudinary.com, type `private`)
 * ne les sert qu'aux pages de lamy-immobilier.fr : sans ce référent il répond
 * 401 « ACL deny », quelle que soit l'adresse. Nous enregistrons donc les
 * adresses que la fiche publie, mais aucune ne s'affichera hors du site de
 * l'agence tant qu'un relais ne les rapatrie pas.
 */

import * as cheerio from 'cheerio';
import { sitemapUrls } from '../shared/sitemap.js';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';

/** Forme d'une URL de fiche Lamy. Le CP capture le département via son préfixe. */
const LISTING_URL_PATTERN =
  /^https?:\/\/(?:www\.)?lamy-immobilier\.fr\/louer\/louer-un-bien\/annonces-de-biens-a-louer\/[a-z0-9-]+\/[a-z0-9-]+\/([a-z0-9-]+)-(\d{5})\/([a-z0-9-]+)-\2-(fl\d+)\/?$/i;

export interface ParsedLamyUrl {
  readonly citySlug: string;
  readonly postalCode: string;
  readonly reference: string;
  readonly canonicalUrl: string;
}

/** Analyse une URL de fiche de location. `null` si ce n'en est pas une. */
export function parseListingUrl(href: string): ParsedLamyUrl | null {
  const match = LISTING_URL_PATTERN.exec(href.trim());
  if (match === null) return null;
  const [, citySlug, postalCode, , reference] = match;
  if (citySlug === undefined || postalCode === undefined || reference === undefined) return null;
  return {
    citySlug: citySlug.toLowerCase(),
    postalCode,
    reference: reference.toLowerCase(),
    canonicalUrl: href.trim().replace(/[?#].*$/, ''),
  };
}

export interface LamySitemapEntry {
  readonly url: ParsedLamyUrl;
  readonly lastmod: string | null;
}

/** Extrait les fiches de location d'un sitemap urlset. */
export function parseSitemap(xml: string): LamySitemapEntry[] {
  const entries: LamySitemapEntry[] = [];
  for (const { loc, lastmod } of sitemapUrls(xml)) {
    const url = parseListingUrl(loc);
    if (url === null) continue;
    entries.push({ url, lastmod });
  }
  return entries;
}

export interface ParsedDetail {
  readonly listing: RawListing | null;
  readonly warnings: readonly string[];
}

/**
 * Photos du bien, en pleine taille.
 *
 * LE CARROUSEL N'EN MONTRE QU'UNE VIGNETTE RECADRÉE en 700×346 — un bandeau
 * deux fois plus large que haut, où la moitié de la pièce est coupée — et
 * c'est elle que nous gardions. Le lien du diaporama qui l'enveloppe porte la
 * même photo entière, en 1600 px : c'est celle-là. La vignette reste le repli
 * pour une photo sans lien. Les adresses sont enregistrées, jamais l'image.
 */
function photos($: cheerio.CheerioAPI): string[] {
  const imageUrls: string[] = [];
  $('img.estate__img').each((_i, el) => {
    const entiere = $(el).closest('a[data-fancybox]').attr('href');
    const src = (entiere ?? $(el).attr('src') ?? '').trim();
    if (src.startsWith('https://') && !imageUrls.includes(src)) imageUrls.push(src);
  });
  return imageUrls;
}

/**
 * « Référence FL0000001 » : le code que l'agence cite au téléphone.
 *
 * Il ressemble à l'identifiant d'URL, mais c'est la fiche qui le publie, et
 * avec sa casse. Absent de la page, il reste absent.
 */
function publishedReference($: cheerio.CheerioAPI): string | undefined {
  const written = cleanText($('.estate__reference').first().text());
  return /^R[ée]f[ée]rence\s+(\S+)$/i.exec(written)?.[1];
}

/** Ce que la fiche apprend au-delà des champs communs — un absent reste absent. */
function extra(
  citySlug: string,
  features: readonly string[],
  dpe: string | undefined,
  reference: string | undefined,
): Record<string, string> {
  return {
    citySlug,
    ...(reference !== undefined ? { reference } : {}),
    ...(features.length > 0 ? { features: features.join(' · ') } : {}),
    ...(dpe !== undefined ? { dpe } : {}),
  };
}

/** Analyse une fiche bien et en extrait l'annonce. */
export function parseDetailPage(html: string, pageUrl: string): ParsedDetail {
  const parsedUrl = parseListingUrl(pageUrl);
  if (parsedUrl === null) {
    return { listing: null, warnings: [`URL inattendue pour une fiche : ${pageUrl}`] };
  }

  const $ = cheerio.load(html);
  const warnings: string[] = [];

  // « Appartement · Location » → le type est le premier segment.
  const titleBlock = cleanText($('.estate__title').first().text());
  const propertyTypeText = titleBlock.split('·')[0]?.trim() ?? '';
  // « Nice (06200) »
  const location = cleanText($('.estate__location').first().text());
  const cityText = location.replace(/\s*\(\d{5}\)\s*/, '').trim();
  // « 3 pièces · 59m² »
  const mainInfos = cleanText($('.estate__main-infos').first().text());
  const roomsText = mainInfos.match(/\d+\s*pièces?/i)?.[0];
  const areaText = mainInfos.match(/\d+(?:[.,]\d+)?\s*m²/i)?.[0];

  // Prix : « 1 230 € » + mention « par mois / CC » (charges comprises).
  const priceText = cleanText($('.estate__price p').first().text());
  const priceMention = cleanText($('.estate__price span').first().text());
  if (priceText === '') warnings.push(`Fiche sans prix : ${pageUrl}`);

  const description = htmlToText($, '.estate__description');
  const availability = cleanText($('.estate__availability').first().text());

  // Caractéristiques : paires titre/valeur (« Étage : 2 », « Meublé : oui »…).
  const features: string[] = [];
  $('.estate__feature').each((_i, el) => {
    const feature = cleanText($(el).text().replace(/\s+/g, ' '));
    if (feature !== '') features.push(feature);
  });

  const imageUrls = photos($);
  const reference = publishedReference($);

  // DPE : la lettre active de l'échelle (« estate__score-dpe--e ») ; le texte
  // « DPE : E - 314 kWh/m².an » sert de secours.
  const dpeClass = $('.estate__score-dpe--active').attr('class') ?? '';
  const dpe =
    /score-dpe--([a-g])\b/.exec(dpeClass)?.[1]?.toUpperCase() ??
    /DPE\)?\s*:\s*([A-G])\b/.exec($('body').text())?.[1];

  const title = cleanText(
    `${propertyTypeText || 'Bien'} ${roomsText ?? ''} ${areaText ?? ''} — ${location}`.replace(
      /\s+/g,
      ' ',
    ),
  );

  const listing: RawListing = {
    sourceRef: parsedUrl.reference,
    sourceUrl: parsedUrl.canonicalUrl,
    title,
    ...(description !== '' ? { description } : {}),
    ...(priceText !== '' ? { priceText: `${priceText} ${priceMention}`.trim() } : {}),
    ...(areaText !== undefined ? { areaText } : {}),
    ...(roomsText !== undefined ? { roomsText } : {}),
    ...(propertyTypeText !== '' ? { propertyTypeText } : {}),
    furnishedText: `${title} ${description} ${features.join(' ')}`,
    cityText: cityText !== '' ? cityText : parsedUrl.citySlug.replace(/-/g, ' '),
    postalCodeText: parsedUrl.postalCode,
    agencyName: 'Lamy Immobilier',
    // §23 : le formulaire de la fiche est le canal de contact prévu.
    contactFormUrl: parsedUrl.canonicalUrl,
    ...(availability !== '' ? { availableAtText: availability } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    extra: extra(parsedUrl.citySlug, features, dpe, reference),
  };

  return { listing, warnings };
}
