/**
 * Source : Nicolas Pisani Real Estate (nicolaspisani.com) — groupe « Nicolas
 * Pisani & Laurent Romor / & Associés », Beaulieu-sur-Mer et Villefranche.
 * Site Webflow alimenté par Apimo, rendu serveur.
 *
 * La page des locations mélange l'année (`cat-2`) et le saisonnier (`cat-3`),
 * affichés tous deux « € / Mois » : seule la classe de la carte les distingue.
 * On lit donc `?cc=2` et on garde les cartes `cat-2` à loyer mensuel — « Nous
 * contacter » n'apprend rien et coûterait une fiche à chaque passage. La fiche
 * donne titre, loyer, description, pictogrammes (étage, surface, chambres,
 * pièces), une liste « Libellé : valeur » (type, ville, dépôt) et les valeurs
 * du DPE.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { dpeFromValues } from '../agence-castel/parser.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Nicolas Pisani Real Estate';
export const SITE = 'https://www.nicolaspisani.com';
export const LIST_URL = `${SITE}/fr/locations-villas-appartements-exceptionnel.cfm?cc=2`;

const FICHE = /^\/fr\/detail-location\/[a-z-]+\/(\d+)-[\w-]+\.cfm$/;

/** Un loyer au mois, jamais à la semaine ni sur demande. */
const MONTHLY = /\d\s*€\s*\/\s*mois/i;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.div-block-result-ventes.cat-2').each((_i, el) => {
    const card = $(el);
    const href = card.find('a.link-block-vente').attr('href') ?? '';
    const reference = FICHE.exec(href)?.[1];
    const price = cleanText(card.find('.text-prix-vente').text());
    if (reference === undefined || !MONTHLY.test(price) || byRef.has(reference)) return;
    const title = cleanText(card.find('.titre-annonce-vente').text());
    const sourceUrl = `${SITE}${href}`;
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

/** Valeur d'un pictogramme, reconnu au nom de son image. */
function picto($: cheerio.CheerioAPI, image: string): string | undefined {
  const value = cleanText(
    $(`.block-picto-vente-detail img[src*="${image}"]`)
      .first()
      .siblings('.text-picto-detail')
      .text(),
  );
  return value === '' ? undefined : value;
}

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const price = cleanText($('.div-block-text-descdetail .caption-crit-prix-loc').first().text());
  if (!MONTHLY.test(price)) return null;

  const criteria = new Map<string, string>();
  $('.text-crit').each((_i, el) => {
    const [label, ...rest] = cleanText($(el).text()).split(/\s*:\s*/);
    if (label !== undefined && rest.length > 0) criteria.set(label.toLowerCase(), rest.join(':'));
  });
  const features = $('.text-crit')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((text) => !text.includes(':'));
  const title = cleanText($('h1.text-titre-bien').first().text());
  const description = htmlToText($, '.text-block-desc-detail');
  const imageUrls = [
    ...new Set(
      $('.header-detail .slide-detail')
        .toArray()
        .map((el) => /url\('?(https:[^')]+)'?\)/.exec($(el).attr('style') ?? '')?.[1] ?? ''),
    ),
  ].filter(Boolean);
  const kwh = /DPE\s*:\s*(\d+(?:\.\d+)?)/.exec($('.data-dpe').text())?.[1];
  const co2 = /GES\s*:\s*(\d+(?:\.\d+)?)/.exec($('.data-ges').text())?.[1];
  const rooms = picto($, 'pieces');
  const bedrooms = picto($, 'chambre');
  const reference = /REF\s*:\s*(.+)$/.exec(
    $('.text-crit')
      .toArray()
      .map((el) => cleanText($(el).text()))
      .find((text) => text.startsWith('REF')) ?? '',
  )?.[1];

  const extra: Record<string, string> = {};
  if (reference !== undefined) extra['reference'] = reference;
  if (kwh !== undefined && co2 !== undefined)
    extra['dpe'] = dpeFromValues(Number(kwh), Number(co2));
  if (features.length > 0) extra['features'] = features.join(', ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    chargesText: criteria.get('charges') ?? criteria.get('provision sur charges'),
    depositText: criteria.get('dépôt de garantie'),
    feesText: criteria.get('honoraires') ?? criteria.get('honoraires locataire'),
    areaText: picto($, 'surface-habitable')?.replace(/m2$/, ' m²'),
    roomsText: [
      rooms !== undefined ? `${rooms} pièces` : undefined,
      bedrooms !== undefined ? `${bedrooms} chambres` : undefined,
    ]
      .filter(Boolean)
      .join(', '),
    propertyTypeText: criteria.get('types de bien'),
    furnishedText: `${title} ${description}`,
    cityText: criteria.get('ville'),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
