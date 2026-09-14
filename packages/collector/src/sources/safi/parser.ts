/**
 * Source : SAFI Méditerranée (safimediterranee.fr) — 44 bis avenue de la
 * République, 06300 Nice. WordPress + thème Houzez, alimenté par Apimo.
 *
 * `/status/location/` liste les fiches `/property/{slug}/`. La fiche décrit le
 * bien dans une liste Houzez `<strong>Libellé:</strong> valeur` (« Prix : cc /
 * mois 1.400€ », « dont charges par mois: 220€ », « Taille du bien: 61.15 m² »,
 * « Ville: Nice ») et l'adresse de rue dans `address.item-address`. Les chalets
 * loués à la semaine y figurent aussi : seul un prix « / mois » est retenu.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'SAFI Méditerranée';
export const LIST_URL = 'https://safimediterranee.fr/status/location/';

const FICHE = /^https:\/\/safimediterranee\.fr\/property\/([^/?#]+)\/?$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const bySlug = new Map<string, RawListing>();
  $('a[href*="/property/"]').each((_i, el) => {
    const slug = FICHE.exec($(el).attr('href') ?? '')?.[1];
    // Les séjours à la semaine se déclarent dans l'adresse : inutile de les visiter.
    if (slug === undefined || bySlug.has(slug) || /semaine|saisonn/.test(slug)) return;
    const sourceUrl = `https://safimediterranee.fr/property/${slug}/`;
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

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const fields = new Map<string, string>();
  $('.detail-wrap li').each((_i, el) => {
    const label = cleanText($(el).find('strong').first().text()).replace(/\s*:$/, '');
    const value = cleanText($(el).text())
      .slice(cleanText($(el).find('strong').first().text()).length)
      .trim();
    if (label !== '' && value !== '' && !fields.has(label)) fields.set(label, value);
  });

  const price = fields.get('Prix');
  if (price === undefined || !/mois/i.test(price)) return null;
  const amount = /\d[\d.\s]*(?:,\d+)?\s*€/.exec(price)?.[0];
  if (amount === undefined) return null;

  const rooms = fields.get('Pièces');
  const street = cleanText($('address.item-address').first().text());
  const description = htmlToText($, '#property-description-wrap .block-content-wrap');
  const imageUrls = [
    ...new Set(
      html.match(/https:\/\/safimediterranee\.fr\/wp-content\/uploads\/[\w-]+-original\.jpg/g),
    ),
  ];
  const title = cleanText($('h1').first().text());

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${amount} ${/cc/i.test(price) ? 'CC ' : ''}par mois`,
    chargesText: fields.get('dont charges par mois'),
    areaText: fields.get('Taille du bien'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: fields.get('Type de bien'),
    cityText: fields.get('Ville'),
    addressText: street === '' ? undefined : street,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };
}
