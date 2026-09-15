/**
 * Source : Azurimmo (azurimmo06.net) — Le Stanesco, 170 boulevard Napoléon III,
 * 06200 Nice. Site maison (Foxy Emy), rendu côté serveur.
 *
 * La recherche `?category=location` liste des fiches `/biens/{operation}-{type}-
 * {n}piece(s)-{commune}-{cp}-{id}`. La fiche porte le loyer charges comprises en
 * titre, et une ligne « Informations légales » (charges, honoraires, dépôt).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, NUMBER, afterLabel, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Azurimmo';
const ORIGIN = 'https://www.azurimmo06.net';
export const LIST_URL = `${ORIGIN}/nos-biens-en-vente-ou-location/?category=location`;

/** `location-appartement-1piece-nice-06200-87286959` → type, commune, cp, id. */
const SLUG = /^\/biens\/location-([a-z]+)-\d+pieces?-([a-z-]+)-(\d{5})-(\d+)$/;

/** Les locations de la page de résultats. */
export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();

  $('.container-feature a[href^="/biens/location-"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const match = SLUG.exec(href);
    if (match === null) return;
    const [, , , postalCode, ref] = match;
    if (ref === undefined || byRef.has(ref)) return;

    const sourceUrl = `${ORIGIN}${href}`;
    const heading = cleanText($(el).find('.content span').first().text());
    const city = cleanText($(el).find('.content p').first().text());
    const price = cleanText($(el).find('.price-bis').text());
    const specs = cleanText($(el).find('.content > span').last().text());

    byRef.set(
      ref,
      compactListing({
        sourceRef: ref,
        sourceUrl,
        title: heading === '' ? undefined : heading,
        priceText: price === '' ? undefined : price,
        areaText: new RegExp(`(${NUMBER})\\s*m2`).exec(specs)?.[1]?.concat(' m²'),
        roomsText: /\d+\s*pièces?/.exec(specs)?.[0],
        propertyTypeText: heading === '' ? undefined : heading,
        cityText: city === '' ? undefined : city,
        postalCodeText: postalCode,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });

  return [...byRef.values()];
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string, listing: RawListing): RawDraft | null {
  const $ = cheerio.load(html);
  const match = SLUG.exec(new URL(listing.sourceUrl).pathname);
  if (match === null) return null;
  const [, type, citySlug, postalCode] = match;

  const heading = $('h1').first().clone();
  // Le titre embarque le loyer dans un `<span>` : on les sépare.
  const rent = cleanText(heading.find('span').text()).replace(/\s*€$/, ' €');
  heading.find('span').remove();
  const title = cleanText(heading.text());
  if (!/^\d[\d\s]*\s€$/.test(rent)) return null;

  const legal = flatText($, '.legal');
  const body = htmlToText($, '.description-property');
  const services = cleanText($('.description-property').eq(1).text());
  const description = [body, services !== '' ? `Prestations : ${services}` : '']
    .filter((part) => part !== '')
    .join('\n\n');
  const summary = cleanText($('#resume-property p').first().text());
  const reference = /Référence\s+(\S+)/.exec($('#resume-property small').text())?.[1];
  const imageUrls = [
    ...new Set(
      $('a[data-lightbox="property"]')
        .map((_i, el) => $(el).attr('href') ?? '')
        .get()
        .filter((href) => href.startsWith('/assets/uploads/'))
        .map((href) => `${ORIGIN}${href}`),
    ),
  ];

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    // « si location : redéfinition du prix + charges mensuelles » (commentaire du site).
    priceText: `${rent} charges comprises`,
    chargesText: afterLabel(legal, 'Charges'),
    depositText: afterLabel(legal, 'D[ée]p[ôo]t de garantie'),
    feesText: afterLabel(legal, 'Honoraires d.agence', AMOUNT),
    areaText: new RegExp(`(${NUMBER})\\s*m²`).exec(summary)?.[1]?.concat(' m²'),
    roomsText: /\d+\s*pièces?/.exec(summary)?.[0],
    propertyTypeText: type,
    furnishedText: /\bMeublé\b/.test(services) ? 'Meublé' : undefined,
    // « saint-laurent-du-var » : la normalisation ignore casse et tirets.
    cityText: citySlug,
    postalCodeText: postalCode,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: reference !== undefined ? { reference } : undefined,
  };
}
