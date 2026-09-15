/**
 * Source : Barbera Gestion & Patrimoine (barbera-gestion.com) — 29 avenue Jean
 * Médecin, 06000 Nice. Site maison (agence 29ter) alimenté par Apimo : photos
 * sur media.apimo.pro, identifiant Apimo en fin d'adresse de fiche.
 *
 * `/nos-biens-1` liste ventes et locations sur une seule page ; chaque carte dit
 * « Vente » ou « Location ». La fiche `/offre/propriete-{n}-{apimo}` porte la
 * description, un tableau « Tarifs et frais » et un tableau « Pièces ».
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Barbera Gestion & Patrimoine';
export const LIST_URL = 'https://www.barbera-gestion.com/nos-biens-1';

const FICHE = /^https:\/\/www\.barbera-gestion\.com\/offre\/propriete-\d+-(\d+)$/;

/** Les locations de la page de liste. */
export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();

  $('.offer').each((_i, el) => {
    const card = $(el);
    const items = card
      .find('.iconlist li')
      .map((_j, li) => cleanText($(li).text()))
      .get();
    if (!items.includes('Location')) return;
    const href = card.find('a.offer-btn').attr('href') ?? '';
    const ref = FICHE.exec(href)?.[1];
    if (ref === undefined || byRef.has(ref)) return;

    // « Nice, Le Port » puis « Appartement, 42m² ».
    const [city, district] = (items[0] ?? '').split(/\s*,\s*/);
    const [type] = (items[1] ?? '').split(/\s*,\s*/);
    const price = card.attr('data-price');
    const area = card.attr('data-surface');
    const image = card.find('img.offer-thumbnail').attr('src');

    byRef.set(
      ref,
      compactListing({
        sourceRef: ref,
        sourceUrl: href,
        title: type !== undefined && city !== undefined ? `${type} à louer — ${city}` : undefined,
        priceText: price !== undefined && price !== '' ? `${price} € par mois` : undefined,
        areaText: area !== undefined && area !== '' ? `${area} m²` : undefined,
        propertyTypeText: type,
        cityText: city,
        agencyName: AGENCY_NAME,
        contactFormUrl: href,
        imageUrls: image !== undefined ? [image] : undefined,
        extra: district !== undefined && district !== '' ? { quartier: district } : undefined,
      }),
    );
  });

  return [...byRef.values()];
}

/** Valeur d'une ligne de tableau « libellé | valeur ». */
function row($: cheerio.CheerioAPI, label: RegExp): string | undefined {
  let value: string | undefined;
  $('table tr').each((_i, tr) => {
    const cells = $(tr).find('td');
    if (cells.length !== 2 || !label.test(cleanText(cells.first().text()))) return;
    const text = cleanText(cells.last().text());
    if (text !== '') value = text;
    return false;
  });
  return value;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const leads = $('.lead')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  if (!leads.includes('Location')) return null;
  const rent = row($, /^Prix hors charges$/i);
  if (rent === undefined || !/\/\s*mois/i.test(rent)) return null;

  const heading = cleanText($('.offer-detail h2').first().text());
  const place = cleanText($('.offer-detail h3').first().text());
  const [city, district] = place.split(/\s*,\s*/);
  const subtitle = cleanText($('.text-justify-area').prev('.mb-4').find('h3').text());
  const body = htmlToText($, '.text-justify-area');
  const description = [subtitle, body].filter((part) => part !== '').join('\n\n');

  const reference = /,\s*(\d+),\s*Barbera/.exec($('title').text())?.[1];
  const dpe = row($, /^DPE\b/);
  const rooms = row($, /^Nombre de pièces$/i);
  const imageUrls = [
    ...new Set(
      $('[data-lightbox="gallery-item"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get()
        .filter((url) => url.startsWith('https://media.apimo.pro/')),
    ),
  ];

  return {
    title: heading === '' ? undefined : heading,
    description: description === '' ? undefined : description,
    priceText: `${rent} hors charges`,
    chargesText: row($, /^Charges/i),
    depositText: row($, /^Dépôt de garantie$/i),
    feesText: row($, /^Frais d'agence$/i),
    areaText: row($, /^Surface total/i),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: leads[1],
    cityText: city === '' ? undefined : city,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      ...(reference !== undefined ? { reference } : {}),
      ...(district !== undefined && district !== '' ? { quartier: district } : {}),
      ...(dpe !== undefined && /^[A-G]$/.test(dpe) ? { dpe } : {}),
    },
  };
}
