/**
 * Source : Forimmo (forimmo.fr) — site vitrine du logiciel ICS, gabarit à
 * `resultat.php`, distinct de celui que lit l'adaptateur `../ics/` (pas de
 * JSON embarqué).
 *
 * La liste des locations porte déjà l'essentiel : « Appartement en location à
 * Nice / 2 pièces 44 m² (ref: 0006) », le loyer et la description entière. La
 * fiche ajoute code postal, charges, honoraires, dépôt de garantie et photos.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Forimmo';
export const SITE = 'https://www.forimmo.fr';
export const LIST_URL = `${SITE}/resultat.php?transac=location`;

const FICHE = /^location-[a-z_]+-[a-z_]+-[a-z0-9]+-fiche-([A-Za-z0-9]+)\.html$/;

/** « Appartement en location à Nice / 2 pièces 44 m² (ref: 0006) » */
const HEADER =
  /^(.+?) en location à (.+?) \/ (?:(\d+) pièces? )?(\d+(?:[.,]\d+)?) m² \(ref: ([A-Za-z0-9]+)\)/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.txtContent').each((_i, el) => {
    const card = $(el);
    const href = card.find('a.btn_detail').attr('href') ?? '';
    const reference = FICHE.exec(href)?.[1];
    if (reference === undefined || byRef.has(reference)) return;

    const body = card.clone();
    body.find('div, a').remove();
    const lines = htmlToText($, body as cheerio.Cheerio<never>).split('\n');
    const header = HEADER.exec(cleanText(lines[0] ?? ''));
    const price = afterLabel(cleanText(card.find('strong').first().text()), 'LOYER');
    // Ligne 1 : l'en-tête ; puis « LOYER : … » ; puis la description.
    const description = lines
      .slice(1)
      .join('\n')
      .replace(/^\s*LOYER\s*:[^\n]*/i, '')
      .trim();
    const sourceUrl = `${SITE}/${href}`;
    const rooms = header?.[3];
    const area = header?.[4];

    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title:
          header !== null ? cleanText(lines[0] ?? '').replace(/\s*\(ref: .*\)$/, '') : undefined,
        description: description === '' ? undefined : description,
        priceText: price,
        propertyTypeText: header?.[1],
        cityText: header?.[2],
        roomsText: rooms !== undefined && rooms !== '0' ? `${rooms} pièces` : undefined,
        areaText: area !== undefined && area !== '0' ? `${area} m²` : undefined,
        furnishedText: description,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/**
 * Ce que la fiche apprend ; `null` si elle n'a pas de loyer.
 *
 * La « Localisation » de la fiche retombe parfois sur le siège (un parking de
 * Cagnes y est « Nice (06000) ») : la commune de la carte prime, et le code
 * postal n'est repris que s'il porte sur la même commune.
 */
export function parseDetail(html: string, card?: RawListing): RawDraft | null {
  const $ = cheerio.load(html);
  const rent = cleanText($('.titre').first().text());
  if (!/^LOYER\s*:/i.test(rent)) return null;

  const details = $('.uldetails li')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .join(' · ');
  const place = /Localisation : (.+?) \((\d{5})\)/.exec(details);
  const sameCity =
    card?.cityText === undefined ||
    (place?.[1] ?? '').toLowerCase() === card.cityText.toLowerCase();
  const imageUrls = [
    ...new Set(
      $('#thumbs img')
        .toArray()
        .map((el) => $(el).attr('rel') ?? $(el).attr('src') ?? ''),
    ),
  ].filter((url) => url.startsWith('https://'));

  return {
    // « LOYER : 1 160 € / mois CC »
    priceText: rent.replace(/^LOYER\s*:\s*/i, ''),
    chargesText: afterLabel(details, 'Charges', AMOUNT),
    feesText: afterLabel(details, 'Honoraires TTC à la charge du locataire', AMOUNT),
    depositText: afterLabel(details, 'Dépôt de garantie', AMOUNT),
    cityText: card?.cityText === undefined ? place?.[1] : undefined,
    postalCodeText: sameCity ? place?.[2] : undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };
}
