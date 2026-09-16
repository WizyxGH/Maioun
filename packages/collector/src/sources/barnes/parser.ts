/**
 * Source : BARNES (barnes-international.com) — réseau international de
 * prestige, gabarit maison rendu serveur.
 *
 * `/fr/location/france/alpes-maritimes.html` liste les locations longue durée
 * du département (le saisonnier est sous `/fr/location-saisonniere`) : cartes
 * `article#property-{réf}` dans `#content_annonces`. Le bloc voisin
 * `#content_annonces_proximite` (« Ces propriétés pourraient vous intéresser »)
 * n'appartient pas aux résultats et n'est pas lu. La fiche range ses chiffres
 * dans un tableau libellé/valeur (loyer, charges, surface, pièces, DPE) ; le
 * dépôt et les honoraires ne sont que dans le texte.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';
import { htmlToText } from '../shared/html-text.js';
import { afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'BARNES';
export const SITE = 'https://www.barnes-international.com';
export const LIST_URL = `${SITE}/fr/location/france/alpes-maritimes.html`;

/** Communes suivies, en slug d'URL, élargies aux voisines que la liste commune n'a pas. */
const ZONE_SLUGS: ReadonlySet<string> = new Set([
  ...NICE_AREA_SLUGS,
  'vence',
  'eze',
  'falicon',
  'saint-jean-cap-ferrat',
]);

/** `/fr/location/france/{commune}/ref-{réf}.html` */
const FICHE =
  /^https:\/\/www\.barnes-international\.com\/fr\/location\/france\/([a-z0-9-]+)\/ref-([A-Za-z0-9-]+)\.html$/;

/** Loyer au mois seulement : « 8 060 € / mois CC ». « Prix sur demande » n'en est pas un. */
function monthlyPrice(text: string): string | undefined {
  const clean = cleanText(text);
  return /\d\s*€\s*\/\s*mois/i.test(clean) ? clean : undefined;
}

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('#content_annonces article[id^="property-"]').each((_i, el) => {
    const card = $(el);
    const link = card.find('a.bc-015-content-link').first();
    const sourceUrl = link.attr('href') ?? '';
    const match = FICHE.exec(sourceUrl);
    if (match?.[1] === undefined || match[2] === undefined || byRef.has(match[2])) return;
    const reference = match[2];
    // « À louer Maison | Roquebrune-Cap-Martin »
    const heading = cleanText(link.children('div').first().text());
    const type = /^À louer\s+(.+?)\s*\|/i.exec(heading)?.[1];
    const place = cleanText(link.children('p').first().text()).split(',');
    const criteria = card
      .find('.bc-015-criteria span')
      .toArray()
      .map((span) => cleanText($(span).text()));
    const image = card.find('img[data-src]').first().attr('data-src');
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: heading || undefined,
        priceText: monthlyPrice(card.find('.bc-015-prix').text()),
        areaText: criteria.find((c) => /^[\d\s,.]+m²$/.test(c)),
        propertyTypeText: type,
        cityText: cleanText(place[0]) || undefined,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
        imageUrls: image !== undefined ? [image] : undefined,
        extra: { reference, communeSlug: match[1] },
      }),
    );
  });
  return [...byRef.values()];
}

/** Bandeau « La recherche n'indique aucun résultat » d'une liste réellement vide. */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  return /n.indique aucun résultat/i.test($('#list-results').text());
}

/** Seules les fiches de la zone sont lues : le reste du département est écarté au scoring. */
export function detailUrl(listing: RawListing): string | null {
  const slug = FICHE.exec(listing.sourceUrl)?.[1];
  return slug !== undefined && ZONE_SLUGS.has(slug) ? listing.sourceUrl : null;
}

/**
 * Les deux étiquettes du tableau, chacune écrite « 122 (C) ». Les lignes
 * « Non communiqué » ne livrent aucune lettre, et n'en inventent donc pas.
 */
function etiquettes(table: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(
    ['dpe', 'ges']
      .map((key) => [key, /\(([A-G])\)/.exec(table.get(key) ?? '')?.[1]])
      .filter(([, letter]) => letter !== undefined),
  ) as Record<string, string>;
}

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const table = new Map<string, string>();
  $('#propertyInformation .fw-bold').each((_i, el) => {
    table.set(cleanText($(el).text()).toLowerCase(), cleanText($(el).next().text()));
  });
  const price = monthlyPrice(table.get('loyer') ?? '');
  if (price === undefined) return null;

  const description = htmlToText($, 'section.bg-white > p');
  // Galerie en images de fond, servies par le stock de photos des biens.
  const imageUrls = [
    ...new Set(
      $('[style*="/bdata/property/"]')
        .toArray()
        .map((el) => /url\((https:[^)]+)\)/.exec($(el).attr('style') ?? '')?.[1] ?? '')
        .map((url) => url.replace(/\?width=\d+$/, ''))
        .filter(Boolean),
    ),
  ];
  const presenter = $('h3')
    .filter((_i, el) => /présenté par/i.test($(el).text()))
    .first()
    .parent();
  const office = cleanText(presenter.find('span.text-uppercase').first().text());
  const phone = (presenter.find('a[href^="tel:"]').first().attr('href') ?? '').replace(/^tel:/, '');
  const rooms = table.get('pièces');
  const floor = table.get('étage');

  const extra: Record<string, string> = { ...etiquettes(table) };
  const reference = table.get('référence');
  if (reference !== undefined && reference !== '') extra['reference'] = reference;
  if (floor !== undefined && floor !== '') extra['etage'] = floor;
  if (office !== '') extra['agence'] = office;

  return {
    title: cleanText($('h1').first().text()) || undefined,
    description: description || undefined,
    priceText: price,
    chargesText: table.get('charges mensuelles') || undefined,
    depositText: afterLabel(description, 'Dépôt de garantie'),
    // « Honoraires Code Civil : 10% du loyer annuel HC + TVA (20%) soit : 10 886,40 € TTC »
    feesText: afterLabel(description, 'Honoraires[^€]*?'),
    areaText: table.get('surface') || undefined,
    roomsText: rooms !== undefined && rooms !== '' ? `${rooms} pièces` : undefined,
    propertyTypeText: table.get('type') || undefined,
    furnishedText: description || undefined,
    cityText: table.get('localisation')?.split(',')[0] || undefined,
    agencyName: AGENCY_NAME,
    phoneText: phone || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
