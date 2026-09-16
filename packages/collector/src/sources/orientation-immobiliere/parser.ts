/**
 * Source : L'Orientation Immobilière (orimnice.fr) — site vitrine alimenté par
 * le logiciel ICS, gabarit « neocs » rendu serveur (sans le JSON embarqué que
 * lit l'adaptateur `../ics/`).
 *
 * La liste `resultats?transac=location` porte une carte par bien (commune,
 * loyer, surface, pièces). La fiche donne description, caractéristiques
 * (honoraires, dépôt, surface, pièces), photos et étiquette DPE, dont l'adresse
 * d'image encode la classe (`nouveau-dpe-C-118-D-28.jpg`).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'L’Orientation Immobilière';
export const SITE = 'https://www.orimnice.fr';
export const LIST_URL = `${SITE}/resultats?transac=location`;

/** `location-appartement-1piece-nice-GES00290121_821` */
const FICHE = /^location-[a-z_]+-[a-z0-9_]+-[a-z0-9_]+-([A-Z]{3}\d+_\d+)$/;

/** « Appartement en location à Nice / 1 pièce 37 m² » */
const HEADER = /^(.+?) en location à (.+?) \//;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.result-card-neocs--r').each((_i, el) => {
    const card = $(el);
    const link = card.find('.card-type-neocs--r a').first();
    const href = link.attr('href') ?? '';
    const reference = FICHE.exec(href)?.[1];
    if (reference === undefined || byRef.has(reference)) return;

    const title = cleanText(link.text());
    const header = HEADER.exec(title);
    const sourceUrl = `${SITE}/${href}`;
    const surface = card.attr('data-surface')?.trim() ?? '';
    const amenities = cleanText(card.find('.card-amenities-neocs--r').text());
    const rooms = /(\d+)\s*pièces?/.exec(amenities)?.[1];
    const price = cleanText(card.find('.card-grid-price-neocs--r').first().text());
    const city = cleanText(card.find('.card-city-neocs--r').first().text());

    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        priceText: price === '' ? undefined : price.replace(/^LOYER\s*:\s*/i, ''),
        propertyTypeText: header?.[1],
        cityText: city === '' ? header?.[2] : city,
        areaText:
          /^\d+(?:[.,]\d+)?$/.test(surface) && surface !== '0' ? `${surface} m²` : undefined,
        roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/** Ce que la fiche apprend ; `null` si elle n'a pas de loyer. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const price = cleanText($('.print-block-price-neocs--fiche').first().text());
  if (!/€/.test(price)) return null;

  const details = new Map<string, string>();
  $('.details-grid-neocs--fiche li').each((_i, el) => {
    const label = cleanText($(el).find('.dt-neocs--fiche').text())
      .replace(/\s*:$/, '')
      .toLowerCase();
    const value = cleanText($(el).find('.dd-neocs--fiche').text());
    if (label !== '' && value !== '') details.set(label, value);
  });
  const description = htmlToText($, '.description-card-neocs--fiche p');
  const title = cleanText($('h1.fiche-hero-title-neocs--fiche').first().text());
  const imageUrls = [
    ...new Set(
      $('#splide-main-neocs--fiche img')
        .toArray()
        .map((el) => $(el).attr('src') ?? ''),
    ),
  ]
    .filter((src) => src !== '')
    .map((src) => new URL(src, `${SITE}/`).toString());
  const etiquettes = $('img[src*="dpe.ics.fr"]').attr('src') ?? '';
  const dpe = /nouveau-dpe-([A-G])-/.exec(etiquettes)?.[1];
  const ges = /nouveau-dpe-[A-G]-[\d.,]+-([A-G])-/.exec(etiquettes)?.[1];
  const rooms = details.get('nombre de pièce(s)');
  const reference = cleanText($('.print-block-ref-neocs--fiche span').eq(1).text()).replace(
    /^Réf\.\s*/,
    '',
  );

  const extra: Record<string, string> = {};
  if (reference !== '') extra['reference'] = reference;
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (ges !== undefined) extra['ges'] = ges;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    // « 800 € CC* » : l'astérisque renvoie à « CC = Charges Comprises ».
    priceText: price.replace(/\*$/, ''),
    chargesText: /provision (?:sur|pour) charges\s*:?\s*(\d[\d\s.,]*\s*€)/i.exec(description)?.[1],
    feesText: details.get('honoraires de location'),
    depositText: details.get('dépôt de garantie'),
    areaText: details.get('surface habitable'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    furnishedText: `${title} ${description}`,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
