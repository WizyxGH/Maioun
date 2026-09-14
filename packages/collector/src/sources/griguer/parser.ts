/**
 * Source : Cabinet Griguer (griguer-immobilier.com) — 9-11 boulevard Victor
 * Hugo, 06000 Nice. WordPress + extension Essential Real Estate.
 *
 * La recherche `/recherche-avancee/?status=location` liste les fiches
 * `/biens/{slug}/`. La fiche décrit le bien par ses classes (`property-status-
 * location`, `property-city-nice`) et une liste « Vue d'ensemble »
 * `<strong>libellé</strong><span>valeur</span>`. Les montants y sont écrits à
 * l'anglaise (« 1,160€ ») : la virgule des milliers est retirée avant lecture.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Cabinet Griguer';
export const LIST_URL = 'https://griguer-immobilier.com/recherche-avancee/?status=location';

const FICHE = /^https:\/\/griguer-immobilier\.com\/biens\/([a-z0-9-]+)\/?$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const bySlug = new Map<string, RawListing>();
  $('a[href*="/biens/"]').each((_i, el) => {
    const slug = FICHE.exec($(el).attr('href') ?? '')?.[1];
    if (slug === undefined || bySlug.has(slug)) return;
    const sourceUrl = `https://griguer-immobilier.com/biens/${slug}/`;
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

/** « 1,160€ » → « 1160 € » ; une valeur sans unité reçoit l'euro. */
function euros(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const digits = /\d[\d,.\s]*/.exec(value.replace(/,(?=\d{3}\b)/g, ''))?.[0]?.trim();
  return digits === undefined ? undefined : `${digits} €`;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location disponible. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const wrapper = $('.ere__single-property').first().attr('class') ?? '';
  if (!/\bproperty-status-location\b/.test(wrapper) || /\bproperty-label-lou/.test(wrapper)) {
    return null;
  }

  const field = (label: string): string | undefined => {
    const item = $('#overview li, .ere__property-address-list li').filter(
      (_i, el) => cleanText($(el).find('strong').first().text()) === label,
    );
    const value = cleanText(
      item.first().find('span').first().text() || item.first().text().replace(label, ''),
    );
    return value === '' ? undefined : value;
  };

  const price = field('Prix');
  if (price === undefined || !/charges comprises/i.test(price)) return null;

  const title = cleanText($('h1').first().text());
  const description = htmlToText($, '.ere__single-property-description').replace(
    /^Description\s*/,
    '',
  );
  const imageUrls = [
    ...new Set(
      $('.ere__single-property-gallery a[href*="/wp-content/uploads/"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get(),
    ),
  ];
  const rooms = field('Pièces');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${euros(price) ?? price} CC par mois`,
    chargesText: euros(field('Charges mensuelles')),
    depositText: euros(field('Montant dépôt de garantie')),
    feesText: euros(field("Honoraires d'agence")),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: field('Type de bien'),
    cityText: field('City/Town'),
    postalCodeText: field('Postal code/ZIP'),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      reference: field('Numéro du bien') ?? '',
      ...(field('Quartier') !== undefined ? { district: field('Quartier') ?? '' } : {}),
    },
  };
}
