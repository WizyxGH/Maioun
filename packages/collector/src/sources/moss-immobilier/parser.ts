/**
 * Source : Moss Immobilier (mossimmobilier.com) — 2 rue Beethoven, 06000 Nice.
 * WordPress avec l'extension Apimo, rendu serveur.
 *
 * `/location/` porte toutes les locations en cartes `a.Pro-content` vers
 * `/properties/{slug}/`, chacune avec sa référence Apimo. La fiche donne le
 * titre, le prix (`€ 1.100`), la ville et son code postal, une liste
 * « Libellé: valeur » (`Catégorie`, `Type`, `Surfaces`, `Pièces`) et une
 * description où l'agence écrit charges, caution et honoraires.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Moss Immobilier';
export const SITE = 'https://mossimmobilier.com';
export const LIST_URL = `${SITE}/location/`;

const FICHE = /^https:\/\/mossimmobilier\.com\/properties\/[\w-]+\/$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('a.Pro-content[href]').each((_i, el) => {
    const card = $(el);
    const sourceUrl = card.attr('href') ?? '';
    const reference = cleanText(card.find('.apimo-property-reference').text());
    if (!FICHE.test(sourceUrl) || !/^\d+$/.test(reference) || byRef.has(reference)) return;
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

/** La liste « Libellé: valeur » de la fiche. */
function properties($: cheerio.CheerioAPI): Map<string, string> {
  const fields = new Map<string, string>();
  $('dl.apimo_property').each((_i, el) => {
    const label = cleanText($(el).find('dt').text()).replace(/\s*:$/, '');
    if (label !== '' && !fields.has(label)) fields.set(label, cleanText($(el).find('dd').text()));
  });
  return fields;
}

const pick = (text: string, pattern: string): string | undefined =>
  new RegExp(pattern, 'i').exec(text)?.[1]?.trim();

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const fields = properties($);
  const amount = /(\d[\d.\s]*)/.exec(cleanText($('.apimo_price').first().text()))?.[1]?.trim();
  if (fields.get('Catégorie') !== 'Location' || amount === undefined) return null;

  const title = cleanText($('h1.apimo_title').first().text());
  const description = htmlToText($, '.apimo_compagne_describe');
  // « Loyer : 1350 € (dont 113€ de charges…) » : le prix affiché est charges comprises.
  const charges = pick(description, String.raw`dont (${AMOUNT}) de (?:charges|provisions)`);
  const withCharges = charges !== undefined || /charges comprises/i.test(description);
  // « Nice - 06300 »
  const place = /^(.+?) - (\d{5})$/.exec(
    cleanText($('.apimo_location_info .value').first().text()),
  );
  const type = fields.get('Type')?.split('/')[0]?.trim();
  const rooms = fields.get('Pièces');
  const imageUrls = [
    ...new Set(
      $('a[data-fslightbox="gallery"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get()
        // La couverture n'y figure qu'en vignette « -original-1065x710 ».
        .map((href) => href.replace(/-original-\d+x\d+(\.jpe?g)$/, '-original$1'))
        .filter((href) => /\/wp-content\/uploads\/.+-original\.jpe?g$/.test(href)),
    ),
  ];
  const reference = /(\d+)/.exec($('.apimo_location_info .apimo_color').first().text())?.[1];

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${amount} € ${withCharges ? 'CC ' : ''}par mois`,
    chargesText: charges,
    depositText: pick(description, String.raw`(?:Caution|Dépôt de garantie)[^€\n]*?(${AMOUNT})`),
    // « Honoraires 13€/M2 : (…) : 546€ » : le dernier montant de la ligne.
    feesText: pick(description, String.raw`Honoraires[^\n]*?(${AMOUNT})(?![^\n]*€)`),
    areaText: fields.get('Surfaces'),
    roomsText: rooms !== undefined && rooms !== '0' ? `${rooms} pièces` : undefined,
    // Le plugin type « Appartement » un local commercial : le titre le dit.
    propertyTypeText: /local commercial|bureaux?\b/i.test(title) ? 'local commercial' : type,
    furnishedText: /\bmeubl[ée]/i.test(title) ? 'meublé' : undefined,
    cityText: place?.[1],
    postalCodeText: place?.[2],
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: reference !== undefined ? { reference } : undefined,
  };
}
