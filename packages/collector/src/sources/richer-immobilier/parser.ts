/**
 * Source : Richer Immobilier (richerimmobilier.com) — 50 boulevard Stalingrad,
 * 06300 Nice. WordPress + extension « Retro Listings ».
 *
 * La liste `/rl_property/?filter_cat=2` (catégorie Location) donne les fiches
 * `/rl_property/{slug}/`. La fiche porte le titre, le prix, la catégorie, la
 * description, et des lignes `<strong>Libellé:</strong>&nbsp;valeur` (ville,
 * code postal, quartier, référence, surface, pièces).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Richer Immobilier';
export const LIST_URL = 'https://www.richerimmobilier.com/rl_property/?filter_cat=2';

const FICHE = /^https:\/\/www\.richerimmobilier\.com\/rl_property\/([^/?#]+)\/?$/i;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.list_item_holder[data-listid]').each((_i, el) => {
    const item = $(el);
    const ref = item.attr('data-listid') ?? '';
    const href = item.find('h4 a[href]').first().attr('href') ?? '';
    if (ref === '' || !FICHE.test(href) || byRef.has(ref)) return;
    if (cleanText(item.find('.action_tag_wrapper').text()) !== 'Location') return;
    byRef.set(
      ref,
      compactListing({
        sourceRef: ref,
        sourceUrl: href,
        title: cleanText(item.find('h4').first().text()) || undefined,
        agencyName: AGENCY_NAME,
        contactFormUrl: href,
      }),
    );
  });
  return [...byRef.values()];
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  if (cleanText($('.property_categs').first().text()) !== 'Location') return null;

  const field = (label: string): string | undefined => {
    const item = $('.listing_detail').filter((_i, el) =>
      cleanText($(el).find('strong').first().text()).startsWith(label),
    );
    const value = cleanText(item.first().text()).replace(/^[^:]*:+\s*/, '');
    return value === '' ? undefined : value;
  };

  const description = htmlToText($, '.rl_detail_box').replace(/^Description\s*/, '');
  const amount = (label: RegExp): string | undefined => {
    // « 2.000 € » : le point sépare les milliers.
    const digits = label
      .exec(description)?.[1]
      ?.trim()
      .replace(/(\d)\.(?=\d{3}\b)/g, '$1');
    return digits === undefined ? undefined : `${digits} €`;
  };
  const street = cleanText($('.adres_area').first().text()).split(',')[0];
  const district = field('District');
  const reference = field('Reference');
  const imageUrls = [
    ...new Set(
      $('#big a.prettygalery[href*="/wp-content/uploads/"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get(),
    ),
  ];

  return {
    title: cleanText($('h1.entry-prop').first().text()) || undefined,
    priceText: field('Prix') ?? (cleanText($('.price_area').first().text()) || undefined),
    chargesText: amount(/charges\s*:\s*([\d .]+)\s*€/i),
    depositText: amount(/garantie\s*:\s*([\d .]+)\s*€/i),
    feesText: amount(/honoraires\s*:\s*([\d .]+)\s*€/i),
    areaText: field('Surface'),
    roomsText: field('Pièces') !== undefined ? `${field('Pièces')} pièces` : undefined,
    propertyTypeText: field('Type'),
    description: description === '' ? undefined : description,
    furnishedText: description,
    addressText: street !== undefined && /\d/.test(street) ? street : undefined,
    cityText: field('Ville'),
    postalCodeText: field('Zipcode'),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    agencyName: AGENCY_NAME,
    extra: {
      ...(reference !== undefined ? { reference } : {}),
      ...(district !== undefined ? { district } : {}),
    },
  };
}
