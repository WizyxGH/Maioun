/**
 * Source : Agence Californie (agencecalifornie.fr) — WordPress, thème
 * RealHomes, rendu serveur.
 *
 * La recherche `?status=a-louer` liste les locations sur deux pages ; la
 * référence Apimo termine l'adresse de fiche (`/bien/t4-86586398-06200/`). La
 * fiche donne prix, adresse « 06200 Nice, France », description, galerie et une
 * liste « Détails supplémentaires » (surface, pièces, provision, honoraires,
 * dépôt de garantie).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Agence Californie';
export const SITE = 'https://www.agencecalifornie.fr';
export const LIST_URLS = [
  `${SITE}/recherche-de-biens/?status=a-louer`,
  `${SITE}/recherche-de-biens/page/2/?status=a-louer`,
] as const;

const FICHE = /^https:\/\/www\.agencecalifornie\.fr\/bien\/[a-z0-9-]*?-(\d{6,})-\d{5}(?:-\d+)?\/$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('a[href]').each((_i, el) => {
    const sourceUrl = $(el).attr('href') ?? '';
    const reference = FICHE.exec(sourceUrl)?.[1];
    if (reference === undefined || byRef.has(reference)) return;
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

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const status = cleanText($('.rh_page__property_price .status').first().text());
  const price = cleanText($('.rh_page__property_price .price').first().text());
  if (!/louer/i.test(status) || !/€/.test(price)) return null;

  const details = new Map<string, string>();
  $('.rh_property__additional li').each((_i, el) => {
    const label = cleanText($(el).find('.title').text()).replace(/\s*:$/, '').toLowerCase();
    const value = cleanText($(el).find('.value').text());
    if (label !== '' && value !== '') details.set(label, value);
  });

  // La description s'arrête au premier intertitre (DPE, détails, carte).
  const content = $('.rh_content').first().clone();
  content.find('h4').first().nextAll().remove();
  content.find('h4').remove();
  const description = htmlToText($, content as cheerio.Cheerio<never>);

  const address = cleanText($('.rh_page__property_address').first().text());
  const place = /^(\d{5})\s+(.+?)(?:,\s*France)?$/.exec(address);
  const title = cleanText($('h1.rh_page__title').first().text());
  // Première ligne de la description : « T4 – Nice (06200) – 2500€ par mois ».
  const type = /^([^–-]+?)\s+[–-]/.exec(description)?.[1];
  const imageUrls = [
    ...new Set(
      $('a.slider-img[data-fancybox="gallery"]')
        .toArray()
        .map((el) => $(el).attr('href') ?? ''),
    ),
  ].filter((url) => url.startsWith('https://'));
  const dpe = /\bdpe-([A-G])\b/.exec($('.details-dpe').first().attr('class') ?? '')?.[1];
  const rooms = details.get('nombre de pièces');

  const extra: Record<string, string> = {};
  const reference = details.get('référence');
  if (reference !== undefined) extra['reference'] = reference;
  if (dpe !== undefined) extra['dpe'] = dpe;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    chargesText: details.get('provision sur charges'),
    feesText: details.get('honoraires'),
    depositText: details.get('dépôt de garantie'),
    areaText: details.get('surface habitable'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: type,
    furnishedText: `${title} ${description}`,
    cityText: place?.[2],
    postalCodeText: place?.[1] ?? details.get('code postal'),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
