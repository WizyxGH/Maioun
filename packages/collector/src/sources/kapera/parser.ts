/**
 * Source : Kapera Immobilier (kapera-immobilier.com) — 2 rue Valperga, 06000
 * Nice. WordPress + Elementor, alimenté par Apimo.
 *
 * `/location-appartement-nice/` liste toutes les locations (Nice et au-delà)
 * vers des fiches `/biens/{slug}/`. La fiche écrit chaque caractéristique en
 * intertitre « Libellé : valeur » (`Loyer hors charges : 1 190 € / Mois`,
 * `Ville : Nice`, `Pièce(s) : 3`…), et les atouts en liste (`Meublé`).
 *
 * Le loyer est repris tel que le site le qualifie, même quand la description
 * dit autre chose : la source parle, on ne recalcule pas.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Kapera Immobilier';
export const LIST_URL = 'https://kapera-immobilier.com/location-appartement-nice/';

const FICHE = /^https:\/\/kapera-immobilier\.com\/biens\/([^/?#]+)\/?$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const bySlug = new Map<string, RawListing>();
  $('a[href*="/biens/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const slug = FICHE.exec(href)?.[1];
    if (slug === undefined || bySlug.has(slug)) return;
    const sourceUrl = `https://kapera-immobilier.com/biens/${slug}/`;
    bySlug.set(
      slug,
      compactListing({
        sourceRef: slug,
        sourceUrl,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...bySlug.values()];
}

/** Les intertitres « Libellé : valeur » de la fiche. */
function headings($: cheerio.CheerioAPI): Map<string, string> {
  const fields = new Map<string, string>();
  $('.elementor-heading-title').each((_i, el) => {
    const match = /^([^:]{2,40}?)\s*:\s*(.+)$/.exec(cleanText($(el).text()));
    if (match?.[1] !== undefined && match[2] !== undefined && !fields.has(match[1])) {
      fields.set(match[1], match[2]);
    }
  });
  return fields;
}

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const fields = headings($);
  const withCharges = fields.get('Loyer charges comprises');
  const withoutCharges = fields.get('Loyer hors charges');
  const rent = withCharges ?? withoutCharges;
  if (rent === undefined || !/mois/i.test(rent)) return null;

  const amount = rent.replace(/\s*\/\s*mois$/i, '');
  const description = htmlToText($, '.elementor-widget-theme-post-content');
  const features = $('ul.plus-bien li')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  const rooms = fields.get('Pièce(s)');
  const dpe = fields.get('Classe énergétique');
  const ges = fields.get('Classe GES');
  const reference = fields.get('Référence');
  const district = fields.get('Quartier');
  const imageUrls = [
    ...new Set(
      html.match(
        /https:\/\/kapera-immobilier\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/[\w-]+-original\.jpg/g,
      ),
    ),
  ];

  return {
    title:
      cleanText($('title').first().text()).replace(/\s*-\s*Kapera Immobilier$/, '') || undefined,
    description: description === '' ? undefined : description,
    priceText: `${amount} ${withCharges !== undefined ? 'CC' : 'hors charges'} par mois`,
    chargesText: fields.get('Charges locatives'),
    depositText: fields.get('Dépôt de garantie'),
    feesText: fields.get('Honoraires locataire'),
    areaText: fields.get('Surface'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: fields.get('Type'),
    furnishedText: features.includes('Meublé') ? 'meublé' : undefined,
    cityText: fields.get('Ville'),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      ...(reference !== undefined ? { reference } : {}),
      ...(district !== undefined ? { district } : {}),
      ...(dpe !== undefined && /^[A-G]$/.test(dpe) ? { dpe } : {}),
      ...(ges !== undefined && /^[A-G]$/.test(ges) ? { ges } : {}),
    },
  };
}
