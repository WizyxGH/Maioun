/**
 * Source : Côte d'Azur Properties (immobilierniceouest.com) — WordPress, thème
 * Houzez (fiche v6), annonces importées d'un logiciel de transaction.
 *
 * La recherche `?status[]=a-louer` rend des cartes `item-listing-wrap` à
 * identifiant WordPress (`data-hz-id`) et étiquette de statut. La fiche donne
 * statut, prix (et suffixe `/mois`), « Quartier, Ville », type, pictogrammes
 * (chambres, pièces, surface, identifiant du bien), description suivie d'un
 * bloc « Informations légales » (honoraires, dépôt, charges), adresse et
 * galerie complète dans la visionneuse.
 *
 * Aucune location au 2026-09-15 : écrit sur une fiche de VENTE (même gabarit)
 * et la recherche vide.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = "Côte d'Azur Properties";
export const SITE = 'https://immobilierniceouest.com';
// Adresse d'arrivée de la redirection de /status/a-louer/.
export const LIST_URL = `${SITE}/search-results/?status%5B%5D=a-louer`;

const FICHE = /^https:\/\/immobilierniceouest\.com\/property\/[\w%-]+\/$/;

/** Statut de location à l'année (ni vente, ni saisonnier, ni déjà loué). */
const isRental = (status: string): boolean =>
  /louer|location/i.test(status) && !/saisonn|vacances|lou[ée]\b/i.test(status);

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.item-listing-wrap[data-hz-id]').each((_i, el) => {
    const card = $(el);
    const reference = card.attr('data-hz-id') ?? '';
    const link = card.find('.item-title a').first();
    const sourceUrl = link.attr('href') ?? '';
    const statuses = card
      .find('.label-status')
      .toArray()
      .map((label) => cleanText($(label).text()));
    if (!/^\d+$/.test(reference) || !FICHE.test(sourceUrl) || !statuses.some(isRental)) return;
    if (byRef.has(reference)) return;
    const title = cleanText(link.text());
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

/** « Libellé : valeur » du bloc d'informations légales. */
function legalLines($: cheerio.CheerioAPI): Map<string, string> {
  const lines = new Map<string, string>();
  $('.mls-legal-information p').each((_i, el) => {
    const label = cleanText($(el).find('strong').text()).replace(/\s*:$/, '').toLowerCase();
    const value = cleanText($(el).clone().children('strong').remove().end().text());
    if (label !== '' && value !== '') lines.set(label, value);
  });
  return lines;
}

const amountOf = (text: string | undefined): string | undefined =>
  text === undefined ? undefined : new RegExp(AMOUNT).exec(text)?.[0]?.trim();

const lineMatching = (lines: Map<string, string>, pattern: RegExp): string | undefined =>
  [...lines].find(([label]) => pattern.test(label))?.[1];

/** Ce que la fiche apprend ; `null` si ce n'est pas une location à l'année. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const header = $('.property-header-wrap').first();
  const statuses = header
    .find('.label-status')
    .toArray()
    .map((label) => cleanText($(label).text()));
  const amount = cleanText(header.find('.item-price .price').first().text());
  const postfix = cleanText(header.find('.item-price .price-postfix').first().text());
  if (!statuses.some(isRental) || !/\d/.test(amount) || /semaine|nuit|jour/i.test(postfix)) {
    return null;
  }

  const legal = legalLines($);
  const content = $('.fw-property-description-content').first().clone();
  content.find('.mls-legal-information').remove();
  const description = htmlToText($, content as cheerio.Cheerio<never>);
  const title = cleanText(header.find('h1').first().text());
  const amenities = new Map<string, string>();
  $('.fw-property-amenities-data').each((_i, el) => {
    const value = cleanText($(el).find('strong').text());
    const label = cleanText($(el).clone().children('strong').remove().end().text()).toLowerCase();
    if (label !== '' && value !== '') amenities.set(label, value);
  });
  const address = new Map<string, string>();
  $('#property-address-wrap li').each((_i, el) => {
    const label = cleanText($(el).find('strong').text()).replace(/\s*:$/, '').toLowerCase();
    const value = cleanText($(el).find('span').text());
    if (label !== '' && value !== '') address.set(label, value);
  });
  const imageUrls = [
    ...new Set(
      $('#lightbox-slider-js img')
        .toArray()
        .map((img) => $(img).attr('src') ?? '')
        .filter((src) => src.startsWith(`${SITE}/wp-content/uploads/`)),
    ),
  ];
  const rooms = amenities.get('pièces') ?? amenities.get('pièce');
  const bedrooms = amenities.get('chambres') ?? amenities.get('chambre');
  const dpe =
    /(?:DPE|performance énergétique|classe énergétique)[^.\n]{0,30}?(?:en|:)\s*([A-G])\b/i.exec(
      description,
    )?.[1];

  const extra: Record<string, string> = {};
  const reference = amenities.get('id du bien');
  if (reference !== undefined) extra['reference'] = reference;
  const district = address.get('quartier');
  if (district !== undefined) extra['quartier'] = district;
  if (dpe !== undefined) extra['dpe'] = dpe.toUpperCase();

  // Le suffixe dit rarement « CC » ; le bloc légal, lui, nomme le loyer charges comprises.
  const withCharges = lineMatching(legal, /loyer.*charges comprises/) !== undefined;
  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${amount} ${postfix}${withCharges ? ' CC' : ''}`.trim(),
    chargesText: amountOf(lineMatching(legal, /provision|charges locatives/)),
    depositText: amountOf(lineMatching(legal, /dépôt de garantie/)),
    feesText: amountOf(lineMatching(legal, /honoraires.*locataire/)),
    areaText: amenities.get('taille du bien'),
    roomsText: [
      rooms !== undefined ? `${rooms} pièces` : undefined,
      bedrooms !== undefined ? `${bedrooms} chambres` : undefined,
    ]
      .filter(Boolean)
      .join(', '),
    propertyTypeText:
      cleanText($('.property-overview-type').first().next('li').text()) || undefined,
    furnishedText: `${title} ${description}`,
    cityText: address.get('ville'),
    postalCodeText: address.get('code postal'),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
