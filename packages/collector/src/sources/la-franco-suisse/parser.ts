/**
 * Source : La Franco Suisse (lafrancosuisse.com) — 19 rue de l'Hôtel des
 * Postes, 06000 Nice. Site On'App (ColdFusion), rendu serveur, sans JSON-LD.
 *
 * `/fr/immobilier-nice/locations/` liste toutes les locations, chaque carte
 * deux fois (bureau et mobile, casse de `reference-` différente). La fiche
 * `/fr/location/{type}/{ville}/{pièces}/{quartier}/reference-{id}/` porte un
 * titre « appartement de 3 Pièces à Nice Quartier Lepante », un tableau
 * « Détails » (prix, charges, surface, type, chambres) et une description où
 * l'agence écrit dépôt, honoraires et DPE.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'La Franco Suisse';
export const SITE = 'https://www.lafrancosuisse.com';
export const LIST_URL = `${SITE}/fr/immobilier-nice/locations/`;

const FICHE = /^\/fr\/location\/(?:[\w-]+\/){3,4}reference-(\d+)\/$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('a[href]').each((_i, el) => {
    const path = ($(el).attr('href') ?? '').replace(SITE, '').toLowerCase();
    const reference = FICHE.exec(path)?.[1];
    if (reference === undefined || byRef.has(reference)) return;
    const sourceUrl = `${SITE}${path}`;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/** Le premier tableau « Détails » (il est répété pour mobile). */
function details($: cheerio.CheerioAPI): Map<string, string> {
  const fields = new Map<string, string>();
  $('.ct-productDetails')
    .first()
    .find('.ct-u-displayTableRow')
    .each((_i, row) => {
      const cells = $(row).find('.ct-u-displayTableCell');
      const label = cleanText(cells.first().text());
      if (label !== '' && !fields.has(label)) fields.set(label, cleanText(cells.last().text()));
    });
  return fields;
}

const pick = (text: string, pattern: string): string | undefined =>
  new RegExp(pattern, 'i').exec(text)?.[1]?.trim();

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const fields = details($);
  const price = fields.get('Prix');
  if (price === undefined || !/\/\s*mois$/i.test(price)) return null;

  const amount = price.replace(/\s*\/\s*mois$/i, '');
  // Le prix est hors charges quand une ligne « Charges » l'accompagne.
  const charges = fields.get('Charges');
  const heading = $('h1').first();
  const title = cleanText(heading.text());
  // Type, ville puis quartier sont en gras dans le titre.
  const bold = heading
    .find('b')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  const district = /Quartier/i.test(title) ? bold[2] : undefined;
  const description = htmlToText(
    $,
    $('h3')
      .filter((_i, el) => cleanText($(el).text()) === 'Description')
      .closest('.ct-heading')
      .nextAll('p')
      .first() as cheerio.Cheerio<never>,
  );
  const area = fields.get('Surface');
  const bedrooms = fields.get('Chambres');
  const reference = pick(
    cleanText($('.ct-productID').first().text()),
    String.raw`Référence : (\d+)`,
  );
  const dpe = pick(description, String.raw`\bDPE\s*:?\s*([A-G])\b`);
  const imageUrls = [
    ...new Set(
      $('a[rel^="prettyPhoto"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get()
        .filter((href) => /^\/photos\/[\w-]+\.jpe?g$/i.test(href))
        .map((href) => `${SITE}${href}`),
    ),
  ];

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${amount} ${charges !== undefined ? 'hors charges ' : ''}par mois`,
    chargesText: charges,
    depositText: pick(description, String.raw`Dépôt de garantie[^€\n]*?(${AMOUNT})`),
    feesText: pick(description, String.raw`Honoraires[^\n]*?(${AMOUNT})(?![^\n]*€)`),
    // Un garage affiche « 0,00 m² ».
    areaText: area !== undefined && !/^0+(?:,0+)?\s*m/.test(area) ? area : undefined,
    roomsText: pick(title, String.raw`(\d+ Pièces?)`),
    propertyTypeText: fields.get('Type') ?? bold[0],
    furnishedText: /\bmeubl[ée]/i.test(description) ? 'meublé' : undefined,
    cityText: bold[1],
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      ...(reference !== undefined ? { reference } : {}),
      ...(district !== undefined ? { district } : {}),
      ...(bedrooms !== undefined && bedrooms !== '0' ? { bedrooms } : {}),
      ...(dpe !== undefined ? { dpe: dpe.toUpperCase() } : {}),
    },
  };
}
