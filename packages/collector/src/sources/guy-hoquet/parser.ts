/**
 * Guy Hoquet (guy-hoquet.com) — site national du réseau, rendu serveur.
 *
 * La recherche du site est en JavaScript, mais chaque commune a une page SEO
 * `/location/annonces-{commune}-{code postal}` entièrement rendue : cartes
 * `.resultat-item[data-id]`, pagination `?page=N`, bandeau « Aucun résultat... »
 * quand la commune n'a rien. Un slug inconnu redirige vers `/biens/result`,
 * qui ne porte aucune carte.
 *
 * La fiche `/location/{slug}-{id}` donne le JSON-LD (pièces, commune, loyer),
 * le détail des charges, du dépôt et des honoraires en clair, la galerie et
 * l'étiquette DPE.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, NUMBER, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.guy-hoquet.com';
export const NETWORK_NAME = 'Guy Hoquet';

/** Communes cibles, au slug et au code postal que le site emploie. */
export const COMMUNES = [
  'nice-06000',
  'saint-laurent-du-var-06700',
  'cagnes-sur-mer-06800',
  'villeneuve-loubet-06270',
  'villefranche-sur-mer-06230',
  'beaulieu-sur-mer-06310',
  'eze-06360',
  'la-trinite-06340',
  'saint-andre-de-la-roche-06730',
  'carros-06510',
  'vence-06140',
] as const;

export const LIST_URLS = COMMUNES.map((commune) => `${SITE}/location/annonces-${commune}`);

/** Codes postaux acceptés sur une carte : ceux des communes, plus les quatre de Nice. */
const TARGET_POSTAL_CODES = new Set([
  ...COMMUNES.map((commune) => commune.slice(-5)),
  '06100',
  '06200',
  '06300',
]);

const DETAIL_URL = /^https:\/\/www\.guy-hoquet\.com\/location\/[a-z0-9-]+-(\d+)$/;

/** Bandeau affiché par le site quand la commune n'a aucune location. */
export function isEmptyList(html: string): boolean {
  return /class="[^"]*no-result-h2[^"]*"[^>]*>\s*Aucun résultat/i.test(html);
}

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.results-search .resultat-item[data-id]').each((_i, el) => {
    const card = $(el);
    const href = card.find('a.property_link_block').attr('href')?.trim() ?? '';
    const match = DETAIL_URL.exec(href);
    const reference = match?.[1];
    if (reference === undefined || reference !== card.attr('data-id')?.trim()) return;

    // « NICE 06000 » : la commune, puis son code postal.
    const place = cleanText(card.find('.resultat-info .text-truncate').first().text());
    const placeMatch = /^(.+?)\s+(\d{5})$/.exec(place);
    const postalCode = placeMatch?.[2];
    if (postalCode === undefined || !TARGET_POSTAL_CODES.has(postalCode)) return;

    const info = card.find('.resultat-info').not('.resultat-info-mobile').first();
    const name = cleanText(info.find('.property-name').first().text());
    const image = card.find('img[data-src]').first().attr('data-src')?.trim();
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl: href,
        title: name === '' ? undefined : name,
        priceText: cleanText(info.find('.price').first().text()) || undefined,
        areaText: new RegExp(String.raw`${NUMBER}\s*m²`).exec(name)?.[0],
        roomsText: /(\d+)\s*pièces?/i.exec(name)?.[0],
        propertyTypeText: /^\S+/.exec(name)?.[0],
        cityText: placeMatch?.[1],
        postalCodeText: postalCode,
        agencyName: NETWORK_NAME,
        contactFormUrl: href,
        imageUrls: image?.startsWith('https://') === true ? [image] : undefined,
      }),
    );
  });
  return [...byRef.values()];
}

/** Valeur d'une ligne de la « Fiche technique du bien ». */
function technical($: cheerio.CheerioAPI, label: string): string | undefined {
  const row = $('.technique-wrap .horaires-item')
    .toArray()
    .find((el) => cleanText($(el).find('.horaires-ttl').text()) === label);
  const value = row === undefined ? '' : cleanText($(row).find('.horaires-time').text());
  return value === '' ? undefined : value;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const block = $('.de-biens-info').first();
  const price = cleanText(block.find('.price').first().text());
  // Bandeau « Location meublée NICE 06000 », « Location saisonnière… ».
  const heading = cleanText($('.head-back .head-ttl').first().text());
  if (!/€\s*\/\s*mois/.test(price) || /saisonni/i.test(heading)) return null;

  const desc = cleanText(block.find('.desc').first().text());
  const title = cleanText(block.find('h1.property-name').first().text());
  const description = htmlToText($, '.description-more');
  const facts = $('.biens-list .biens-item .ttl')
    .toArray()
    .map((el) => cleanText($(el).text()));
  const place = /^(.+?)\s+(\d{5})$/.exec(cleanText(block.find('.add').first().text()));
  const agency = cleanText(block.find('.contact-agence .name').first().text());
  const phone = cleanText(block.find('a.agency-phone-link').first().text());
  const reference = /Réf\s*:\s*(\S+)/.exec(cleanText($('.code').first().text()))?.[1];
  const alt = (folder: string): string =>
    $(`img[src*="/dpe-ges/${folder}/"]`).first().attr('alt') ?? '';
  const dpe = /Note\s*:\s*([A-G])\b/.exec(alt('dpe'));
  const ges = /Note\s*:\s*([A-G])\b/.exec(alt('ges'));
  const imageUrls = [
    ...new Set(
      $('[data-fancybox="images"][href^="https://"]')
        .toArray()
        .map((el) => ($(el).attr('href') ?? '').replace(/\?.*$/, '')),
    ),
  ];
  const features = $('.technique-wrap .horaires-item')
    .toArray()
    .map(
      (el) =>
        `${cleanText($(el).find('.horaires-ttl').text())} : ${cleanText($(el).find('.horaires-time').text())}`,
    )
    .join(' · ');

  const extra: Record<string, string> = {};
  if (reference !== undefined) extra['reference'] = reference;
  if (dpe?.[1] !== undefined) extra['dpe'] = dpe[1];
  if (ges?.[1] !== undefined) extra['ges'] = ges[1];
  if (features !== '') extra['features'] = features;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    chargesText: afterLabel(desc, 'charges récupérables') ?? technical($, 'Provision sur charges'),
    depositText: afterLabel(desc, 'Dépôt de garantie'),
    feesText: afterLabel(desc, 'Honoraires charges locataires', AMOUNT),
    areaText: facts.find((fact) => /m²$/.test(fact)),
    roomsText: facts.find((fact) => /pièce/.test(fact)),
    propertyTypeText: /^\S+/.exec(title)?.[0],
    furnishedText: `${heading} ${title} ${description}`,
    cityText: place?.[1],
    postalCodeText: place?.[2],
    agencyName: agency === '' ? NETWORK_NAME : agency,
    phoneText: phone === '' ? undefined : phone,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
