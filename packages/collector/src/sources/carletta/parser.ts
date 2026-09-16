/**
 * Source : Carletta Immobilier (carletta.fr) — 1 rue de l'Hôtel de Ville,
 * 06300 Nice. Site Bexter, en windows-1252 (le client HTTP le décode).
 *
 * Le sitemap `/ftp/sitemap-fr.xml` liste chaque fiche avec son adresse
 * `/location/{type}-{commune}-{cp}/{réf}.htm` : type, commune et code postal
 * sans visite. La fiche porte le reste en toutes lettres (« Loyer charges
 * comprises : 1008 € / mois », « Provisions charges », « Dépôt de garantie »,
 * « Honoraires charge locataire ») et un tableau `champsSPEC` (pièces, surface).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { sitemapUrls } from '../shared/sitemap.js';

export const AGENCY_NAME = 'Carletta Immobilier';
export const SITEMAP_URL = 'https://www.carletta.fr/ftp/sitemap-fr.xml';

const LISTING_PATH =
  /^https?:\/\/www\.carletta\.fr\/location\/([a-z-]+?)-([a-z-]+)-(\d{5})\/(\d+)\.htm$/i;

/** Les locations du sitemap, esquissées depuis leur adresse. */
export function parseSitemap(xml: string): RawListing[] {
  const listings: RawListing[] = [];
  for (const { loc } of sitemapUrls(xml)) {
    const match = LISTING_PATH.exec(loc);
    if (match === null) continue;
    const [, type, city, postalCode, reference] = match;
    if (reference === undefined) continue;
    // Le site redirige http vers https : on garde l'adresse finale.
    const sourceUrl = loc.replace(/^http:/, 'https:');
    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl,
        propertyTypeText: type,
        cityText: city?.replace(/-/g, ' '),
        postalCodeText: postalCode,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  }
  return listings;
}

/** Valeur d'une ligne du tableau `champsSPEC`. */
function spec($: cheerio.CheerioAPI, label: string): string | undefined {
  const row = $('.champsSPEC-row').filter(
    (_i, el) => cleanText($(el).find('.champsSPEC-element').text()) === label,
  );
  const value = cleanText(row.first().find('.champsSPEC-value').text());
  return value === '' ? undefined : value;
}

/** Ce que la fiche apprend. `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const text = flatText($);

  const rent = afterLabel(text, 'Loyer charges comprises', AMOUNT);
  // Le prix affiché dit la période : une location saisonnière ne se compare pas.
  const shownPrice = cleanText($('#prix-immobilier-detail').text());
  if (rent === undefined || (shownPrice !== '' && !/mois/i.test(shownPrice))) return null;

  $('#texte-detail .georisques').remove();
  const description = htmlToText($, '#texte-detail');
  const place = /^(.+?)\s*-\s*(\d{5})$/.exec(cleanText($('#lieu-detail').text()));
  const rooms = spec($, 'Nombre de pièces');
  const area = spec($, 'Surface habitable');
  const imageUrls = [
    ...new Set(
      $('a.swipebox[href*="/photos/biens/"]')
        .map((_i, el) => ($(el).attr('href') ?? '').replace(/^http:/, 'https:'))
        .get(),
    ),
  ];

  return {
    title: cleanText($('h1').first().text()) || undefined,
    description: description === '' ? undefined : description,
    priceText: `${rent} CC par mois`,
    chargesText: afterLabel(text, 'Provisions charges', AMOUNT),
    depositText: afterLabel(text, 'Dépôt de garantie', AMOUNT),
    feesText: afterLabel(text, 'Honoraires charge locataire', AMOUNT),
    areaText: area,
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    cityText: place?.[1],
    postalCodeText: place?.[2],
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };
}
