/**
 * Source : Parnasse Immobilier (parnasse-immobilier.com) — WordPress, thème
 * WPResidence, rendu serveur.
 *
 * La liste `/nos-annonces-location/` porte une carte par bien, avec l'identifiant
 * WordPress (`data-listid`) et l'adresse de fiche. La fiche range ses chiffres
 * dans des blocs `listing_detail` (prix, provision, honoraires, surface, pièces,
 * ville, code postal, DPE) ; le dépôt de garantie n'est que dans le texte.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { NUMBER, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Parnasse Immobilier';
export const SITE = 'https://parnasse-immobilier.com';
export const LIST_URL = `${SITE}/nos-annonces-location/`;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('[data-listid][data-modal-link]').each((_i, el) => {
    const reference = $(el).attr('data-listid')?.trim() ?? '';
    const sourceUrl = $(el).attr('data-modal-link')?.trim() ?? '';
    if (!/^\d+$/.test(reference) || !sourceUrl.startsWith(`${SITE}/immobilier/`)) return;
    if (byRef.has(reference)) return;
    const title = cleanText($(el).attr('data-modal-title') ?? '');
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/** Texte d'un bloc `listing_detail`, libellé compris. */
const detail = ($: cheerio.CheerioAPI, selector: string): string =>
  cleanText($(selector).first().text());

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const isRental = $('.property_title_label.actioncat')
    .toArray()
    .some((el) => /location/i.test($(el).text()));
  const price = afterLabel(detail($, '.property_default_price'), 'Prix');
  if (!isRental || price === undefined) return null;

  const description = htmlToText($, '#wpestate_property_description_section .panel-body');
  const details = $('.listing_detail')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .join(' · ');
  // Galerie de la fiche : une vignette `.item` par photo, en image de fond.
  const imageUrls = [
    ...new Set(
      $('.item[href^="#"][style*="background-image"]')
        .toArray()
        .map((el) => /url\((https:[^)]+)\)/.exec($(el).attr('style') ?? '')?.[1] ?? ''),
    ),
  ].filter(Boolean);
  const apimoRef = cleanText(
    $('.first_overview')
      .filter((_i, el) => /ID de la propriété/i.test($(el).text()))
      .first()
      .next('.first_overview_date')
      .text(),
  );
  const dpe = /DPE \(Diagnostic de Performance Energétique\) : ([A-G])\b/.exec(details)?.[1];
  const rooms = afterLabel(detail($, '.property_default_rooms'), 'Pièces', NUMBER);
  const title = cleanText($('h1.entry-title').first().text());

  const extra: Record<string, string> = {};
  if (apimoRef !== '') extra['reference'] = apimoRef;
  if (dpe !== undefined) extra['dpe'] = dpe;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    // Le site écrit « TTC » ; la description précise « Loyer CC » quand c'est le cas.
    priceText: /loyer\s+cc/i.test(description) ? `${price} CC` : price,
    chargesText: afterLabel(details, 'Provision'),
    feesText: afterLabel(details, 'Honoraire Locataire'),
    depositText: afterLabel(description, String.raw`Caution|Dépôt de garantie`),
    areaText: afterLabel(detail($, '.property_default_property_size'), 'Surface habitable', NUMBER)
      ?.replace(',', '.')
      .concat(' m²'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText:
      cleanText($('.property_title_label').not('.actioncat').first().text()) || undefined,
    furnishedText: `${title} ${description}`,
    cityText: afterLabel(detail($, '.wpresidence-detail-ville'), 'Ville', '[^·]+'),
    postalCodeText: afterLabel(
      detail($, '.wpresidence-detail-code-postal'),
      'Code Postal',
      String.raw`\d{5}`,
    ),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
