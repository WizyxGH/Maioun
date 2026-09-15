/**
 * Source : Immobilière Grand Métropole (gdmetropole.com) — « Le Métropole »,
 * 8 boulevard Victor Hugo, 06000 Nice ; même équipe que le Cabinet Immobilier
 * Milhot. WordPress + Elementor + JetEngine, biens `admo-biens`.
 *
 * La page `/locations/` liste toutes les locations d'un bloc, louées comprises
 * (étiquette « Loué »). La fiche porte ses statuts dans les classes du gabarit
 * (`statut-du-bien-location`, `loue-vendu-loue`) et chaque valeur dans un champ
 * JetEngine précédé d'une icône : « Réf. X », « Surface : 58 M2 », « 3 pièces ».
 * Les montants s'écrivent « 1.400,00 € ».
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Grand Métropole';
export const LIST_URL = 'https://gdmetropole.com/locations/';

const FICHE = /^https:\/\/gdmetropole\.com\/admo-biens\/[^/?#]+\/$/;

/** Biens hors logement, écartés dès la liste. */
const NOT_HOUSING = /^(bureaux?|local|commerce|parking|garage|cave|terrain)/i;

/** « 1.400,00 € » → « 1400 € ». */
function euros(value: string | undefined): string | undefined {
  const match = /(\d[\d.\s]*)(?:,(\d{1,2}))?\s*€/.exec(value ?? '');
  if (match?.[1] === undefined) return undefined;
  const whole = match[1].replace(/[.\s]/g, '');
  const cents = match[2] !== undefined && !/^0+$/.test(match[2]) ? `,${match[2]}` : '';
  return `${whole}${cents} €`;
}

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.jet-listing-grid__item[data-post-id]').each((_i, el) => {
    const item = $(el);
    const ref = item.attr('data-post-id') ?? '';
    const href = item.find('h2 a[href]').first().attr('href') ?? '';
    if (ref === '' || !FICHE.test(href) || byRef.has(ref)) return;
    const terms = item
      .find('.jet-listing-dynamic-terms__link')
      .map((_j, term) => cleanText($(term).text()))
      .get();
    if (terms.includes('Loué') || !terms.includes('Location')) return;
    if (terms.some((term) => NOT_HOUSING.test(term))) return;
    byRef.set(
      ref,
      compactListing({
        sourceRef: ref,
        sourceUrl: href,
        title: cleanText(item.find('h2').first().text()) || undefined,
        agencyName: AGENCY_NAME,
        contactFormUrl: href,
      }),
    );
  });
  return [...byRef.values()];
}

/** Ce que la fiche apprend ; `null` si le bien n'est pas une location disponible. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const root = $('[data-elementor-type="single-post"]').first();
  const classes = root.attr('class') ?? '';
  if (!/\bstatut-du-bien-location\b/.test(classes) || /\bloue-vendu-loue\b/.test(classes)) {
    return null;
  }
  // Les « autres biens » en bas de fiche ont les mêmes champs : on les retire.
  root.find('.jet-listing-grid').remove();

  const fields = root
    .find('.jet-listing-dynamic-field__content')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  const labelled = (label: RegExp): string | undefined =>
    fields
      .find((text) => label.test(text))
      ?.replace(label, '')
      .trim() || undefined;
  const counted = (noun: RegExp): string | undefined =>
    fields.find((text) => noun.test(text))?.match(/^\d+/)?.[0];

  const type = root
    .find('a[href*="/types-de-bien/"]')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  const city = cleanText(
    root
      .find('.fa-map-marker-alt')
      .first()
      .parent()
      .find('.jet-listing-dynamic-field__content')
      .text(),
  );
  const area = labelled(/^Surface\s*:\s*/i);
  const rooms = counted(/^\d+\s+pièces?$/i);
  const bedrooms = counted(/^\d+\s+chambres?$/i);
  const reference = labelled(/^Réf\.\s*/i);
  const available = labelled(/^Dispo le\s*:\s*/i);
  const description = htmlToText($, '.elementor-widget-theme-post-content');
  const imageUrls = [
    ...new Set(
      root
        .find('.jet-engine-gallery-slider a[href*="/wp-content/uploads/"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get(),
    ),
  ];

  return {
    title: cleanText(root.find('h1').first().text()) || undefined,
    priceText: euros(fields.find((text) => /^\d[\d.\s]*(?:,\d+)?\s*€$/.test(text))),
    chargesText: euros(labelled(/^Charges\s*:\s*/i)),
    depositText: euros(labelled(/^Dépôt de garantie\s*:\s*/i)),
    feesText: euros(labelled(/^Honoraires\s*:\s*/i)),
    areaText: area !== undefined ? area.replace(/M2$/i, 'm²') : undefined,
    roomsText:
      rooms !== undefined
        ? `${rooms} pièces${bedrooms !== undefined ? ` ${bedrooms} chambres` : ''}`
        : undefined,
    propertyTypeText: type.at(-1),
    description: description === '' ? undefined : description,
    furnishedText: `${cleanText(root.find('h1').first().text())} ${description}`,
    cityText: city === '' ? undefined : city,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    availableAtText: available,
    agencyName: AGENCY_NAME,
    extra: reference !== undefined ? { reference } : undefined,
  };
}
