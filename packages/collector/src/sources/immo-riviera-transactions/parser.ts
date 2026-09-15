/**
 * Gabarit Apimo « free7 » d'Immo Riviera Transactions (immoriviera.fr).
 *
 * Plus ancien que les deux autres gabarits Apimo du dépôt : recherche
 * `/fr/search/?nature=2` en cartes `ul.list > li.nature_N`, fiches
 * `/fr/search/{transaction}-{type}-…-{cp}-{id}` dont l'article porte aussi sa
 * nature (1 vente, 2 location, 3 saisonnier). Chiffres en listes
 * « Libellé : valeur » (Résumé, Informations légales) ; le DPE n'existe qu'en
 * images `/fr/diagnostic/{id}/1/{kWh}` et `/2/{CO₂}`, dont on lit l'adresse
 * sans les charger (robots.txt les interdit).
 *
 * Aucune location au 2026-09-15 : parseur écrit sur les ventes du même gabarit.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { dpeFromValues } from '../../normalization/parse-listing-fields.js';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export interface ApimoFree7Site {
  readonly agencyName: string;
  /** Origine du site, sans barre finale. */
  readonly origin: string;
}

/** Recherche filtrée sur la location à l'année. */
export const listUrl = (site: ApimoFree7Site): string => `${site.origin}/fr/search/?nature=2`;

/** Identifiant Apimo en fin d'adresse, sinon le slug (quelques fiches n'en ont pas). */
export function referenceOf(href: string): string | null {
  const slug = href
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
    .pop();
  if (slug === undefined || slug === '') return null;
  return /-\d{5}-(\d+)$/.exec(slug)?.[1] ?? slug;
}

/** « Location Appartement - Nice Carras - Ferber » → type, commune, quartier. */
export function placeOf(title: string): { type?: string; city?: string; district?: string } {
  const [head, ...rest] = title.split(' - ');
  const type = cleanText(head).replace(/^(?:vente|location(?: saisonnière)?|viager)\s+/i, '');
  const place = cleanText(rest.join(' - '));
  // Communes composées écrites avec des traits d'union ; seul l'article se sépare.
  const city = /^(?:(?:la|le|les)\s+|l['’])?\S+/i.exec(place)?.[0];
  const district = city !== undefined ? place.slice(city.length).trim() : '';
  return {
    ...(type !== '' ? { type } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(district !== '' ? { district } : {}),
  };
}

/** Cartes de location de la recherche. */
export function parseList(html: string, site: ApimoFree7Site): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('ul.list > li').each((_i, el) => {
    const card = $(el);
    if (!card.hasClass('nature_2')) return;
    const link = card.find('h2 a[href^="/fr/"]').first();
    const href = link.attr('href');
    const reference = href !== undefined ? referenceOf(href) : null;
    if (href === undefined || reference === null || byRef.has(reference)) return;
    const title = cleanText(link.text());
    const { type, city } = placeOf(title);
    // « 2 pièces • 40 m² »
    const facts = cleanText(card.children('p').not('.soleagent').first().text());
    const sourceUrl = `${site.origin}${href}`;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        propertyTypeText: type,
        cityText: city,
        roomsText: /\d+\s*pièces?/.exec(facts)?.[0],
        areaText: /\d+(?:[.,]\d+)?\s*m²/.exec(facts)?.[0],
        postalCodeText: /-(\d{5})(?:-\d+)?$/.exec(href)?.[1],
        agencyName: site.agencyName,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/**
 * Recherche de location rendue sans aucune carte. Le gabarit n'affiche pas de
 * message : le signe est la liste présente mais vide, nature 2 sélectionnée.
 */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  const list = $('section.listing ul.list');
  return (
    $('body').hasClass('estate-index') &&
    list.length === 1 &&
    list.children('li').length === 0 &&
    $('select#nature option[value="2"]').is('[selected]')
  );
}

/** « Libellé : valeur » d'un bloc de la fiche. */
function labelled($: cheerio.CheerioAPI, block: string): Map<string, string> {
  const fields = new Map<string, string>();
  $(`article .${block} li`).each((_i, el) => {
    const text = cleanText($(el).text());
    const colon = text.indexOf(':');
    if (colon <= 0) {
      if (text !== '') fields.set(text.toLowerCase(), '');
      return;
    }
    const label = text.slice(0, colon).trim().toLowerCase();
    if (!fields.has(label)) fields.set(label, text.slice(colon + 1).trim());
  });
  return fields;
}

const find = (fields: Map<string, string>, pattern: RegExp): string | undefined =>
  [...fields].find(([label, value]) => pattern.test(label) && value !== '')?.[1];

function dpeOf($: cheerio.CheerioAPI): string | undefined {
  const value = (kind: 1 | 2): number | undefined => {
    const src = $('article img[src*="/fr/diagnostic/"]')
      .toArray()
      .map((img) => $(img).attr('src') ?? '')
      .find((path) => new RegExp(`/${kind}/\\d+(?:\\.\\d+)?$`).test(path));
    const number = Number(src?.split('/').pop());
    return src !== undefined && Number.isFinite(number) ? number : undefined;
  };
  const kwh = value(1);
  const co2 = value(2);
  return kwh !== undefined && co2 !== undefined ? dpeFromValues(kwh, co2) : undefined;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location à l'année. */
export function parseDetail(
  html: string,
  listing: RawListing,
  site: ApimoFree7Site,
): RawDraft | null {
  const $ = cheerio.load(html);
  const article = $('section.main.show article').first();
  if (!article.hasClass('nature_2')) return null;
  const price = cleanText(article.find('h2.price').first().text());
  if (!/\d.*€|€.*\d/.test(price)) return null;

  const summary = labelled($, 'infos');
  const legal = labelled($, 'legals');
  const title = cleanText(article.find('h1').first().text());
  const { type, city, district } = placeOf(title);

  // « Référence 87288922 • NICE OUEST / CARRAS » puis la description.
  const intro = article.find('.content').first().children('p').first();
  const reference = /Référence\s+(\S+)/.exec(intro.find('.reference').text())?.[1];
  const description = htmlToText($, intro as cheerio.Cheerio<never>)
    .replace(/^Référence\s+\S+\s*(?:•[^\n]*)?\n?/, '')
    .trim();
  const services = cleanText(article.find('.services p').first().text())
    .split('•')
    .map((s) => s.trim())
    .filter(Boolean);
  const imageUrls = [
    ...new Set(
      $('#showSlider a.showLarge')
        .toArray()
        .map((a) => $(a).attr('href') ?? '')
        .filter((href) => href.startsWith('https://')),
    ),
  ];
  const dpe = dpeOf($);
  const chargesIncluded =
    /\bCC\b|charges comprises/i.test(price) ||
    [...legal.keys()].some((label) => /charges comprises/.test(label));

  const extra: Record<string, string> = {};
  if (reference !== undefined) extra['reference'] = reference;
  if (district !== undefined) extra['quartier'] = district;
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (services.length > 0) extra['features'] = services.join(', ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: chargesIncluded && !/\bCC\b/.test(price) ? `${price} CC` : price,
    chargesText: find(legal, /provision|charges locatives|^charges$/),
    depositText: find(legal, /dépôt de garantie/),
    feesText: find(legal, /honoraires/),
    areaText: find(summary, /^surface$/),
    roomsText: [find(summary, /^pièces$/), find(summary, /^chambres$/)].filter(Boolean).join(', '),
    propertyTypeText: type,
    furnishedText: services.some((s) => /^meublé$/i.test(s)) ? 'meublé' : `${title} ${description}`,
    cityText: city ?? listing.cityText,
    postalCodeText: /-(\d{5})(?:-\d+)?$/.exec(listing.sourceUrl)?.[1] ?? listing.postalCodeText,
    availableAtText: find(summary, /^disponibilit/),
    agencyName: site.agencyName,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
