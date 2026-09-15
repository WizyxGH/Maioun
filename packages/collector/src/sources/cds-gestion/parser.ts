/**
 * Source : CDS Gestion (cdsgestion.fr, fiches sur cdsgestion.com) — WordPress,
 * thème RealHomes (ancienne version), rendu serveur.
 *
 * La recherche `?status=a-louer` liste les locations en cartes `rh_list_card`
 * (identifiant WordPress `post-N`, statut). La fiche donne titre, adresse
 * « rue, CP Ville, France », statut et loyer, chambres et surface, et une
 * description où l'agence écrit loyer charges comprises, dépôt et honoraires.
 *
 * Aucune location ouverte au 2026-09-15 : la fixture est une location déjà
 * « Loué! », restée en ligne avec son gabarit de location.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'CDS Gestion';
export const LIST_URL = 'https://cdsgestion.fr/annonces-immobilieres/?status=a-louer';

const FICHE = /^https:\/\/(?:www\.)?cdsgestion\.(?:com|fr)\/property\/[\w%-]+\/$/;

/** « À louer » ouvre la candidature ; « Loué! » et « À vendre » non. */
const OPEN_RENTAL = (status: string): boolean =>
  /louer/i.test(status) && !/lou[ée]\s*!?$/i.test(status);

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('article.rh_list_card').each((_i, el) => {
    const card = $(el);
    const reference = /\bpost-(\d+)\b/.exec(card.attr('class') ?? '')?.[1];
    const link = card.find('h3 a').first();
    const sourceUrl = link.attr('href') ?? '';
    const status = cleanText(card.find('.status').first().text());
    if (reference === undefined || !FICHE.test(sourceUrl) || !OPEN_RENTAL(status)) return;
    if (byRef.has(reference)) return;
    const type = /\bproperty-type-([a-z-]+)/.exec(card.attr('class') ?? '')?.[1];
    const title = cleanText(link.text());
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        propertyTypeText: type?.replace(/-/g, ' '),
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/** Alerte « Aucun résultat » que RealHomes met à la place des cartes. */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  return $('article.rh_list_card').length === 0 && $('.rh_page__listing .no-results').length > 0;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location ouverte. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const status = cleanText($('.rh_page__property_price .status').first().text());
  const price = cleanText($('.rh_page__property_price .price').first().text());
  // Un tarif à la semaine passe : la normalisation l'écarte.
  if (!OPEN_RENTAL(status) || !/\d/.test(price)) return null;

  const meta = new Map<string, string>();
  $('.rh_property__meta_wrap .rh_property__meta').each((_i, el) => {
    const label = cleanText($(el).find('h4').text()).toLowerCase();
    const value = cleanText($(el).find('div').first().text());
    if (label !== '' && value !== '') meta.set(label, value);
  });
  const description = htmlToText($, '.rh_content');
  const title = cleanText($('h1.rh_page__title').first().text());
  // « 146 Rue de France, 06000 Nice, France » ; le thème met une adresse de
  // démonstration américaine quand l'agence n'en saisit pas.
  const address = /^(?:(.+?),\s*)?(\d{5})\s+([^,]+?)(?:,\s*France)?$/.exec(
    cleanText($('.rh_page__property_address').first().text()),
  );
  const imageUrls = [
    ...new Set(
      [
        ...$('a.swipebox')
          .toArray()
          .map((a) => $(a).attr('href') ?? ''),
        // Galerie WordPress dans la description : vignettes ramenées à l'original.
        ...$('.rh_content .gallery img')
          .toArray()
          .map((img) => ($(img).attr('src') ?? '').replace(/-\d+x\d+(\.\w+)$/, '$1')),
      ].filter((url) => /\/wp-content\/uploads\//.test(url)),
    ),
  ];
  const reference = cleanText($('.rh_property__id .id').first().text());
  const bedrooms = meta.get('chambres');
  const features = $('.rh_property__features li')
    .toArray()
    .map((li) => cleanText($(li).text()));

  const extra: Record<string, string> = {};
  if (reference !== '' && reference !== 'None') extra['reference'] = reference;
  if (features.length > 0) extra['features'] = features.join(', ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: /charges comprises/i.test(description) ? `${price} CC` : price,
    chargesText: afterLabel(description, String.raw`Provision (?:sur|pour) charges|Charges`),
    depositText: afterLabel(description, String.raw`Dépôt de garantie|Caution`, AMOUNT),
    feesText: afterLabel(description, 'Honoraires', AMOUNT),
    areaText: meta.get('surface'),
    roomsText: bedrooms !== undefined ? `${bedrooms} chambres` : undefined,
    furnishedText: features.some((feature) => /^meublé$/i.test(feature))
      ? 'meublé'
      : `${title} ${description}`,
    addressText: address?.[1],
    cityText: address?.[3],
    postalCodeText: address?.[2],
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
