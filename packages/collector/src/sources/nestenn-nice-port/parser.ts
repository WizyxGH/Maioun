/**
 * Source : Nestenn Nice Port - Riquier (immobilier-nice-port.nestenn.com) —
 * site d'agence du réseau Nestenn, logiciel Immo-Facile, rendu serveur.
 *
 * `/louer` liste les locations de l'agence ; l'identifiant termine l'adresse de
 * fiche (`…-ref-39646335`). Le JSON-LD de la fiche n'est pas du JSON valide
 * (deux objets juxtaposés) : on lit le bloc `#description`. Loyer charges
 * comprises, commune, pièces et surface y sont balisés ; dépôt et honoraires ne
 * sont que dans le texte (« Caution: 1300€ », « Honoraires: 918.79€ »).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Nestenn Nice Port - Riquier';
export const SITE = 'https://immobilier-nice-port.nestenn.com';
export const LIST_URL = `${SITE}/louer`;

const FICHE = /^https:\/\/immobilier-nice-port\.nestenn\.com\/[a-z0-9-]+-ref-(\d+)$/;

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
export function parseDetail(html: string, reference: string): RawDraft | null {
  const $ = cheerio.load(html);
  const block = $('#description').first();
  const kind = cleanText(block.find('.titre2.blue_color').first().text());
  const price = cleanText(block.find('.titre1').first().text());
  if (!/à louer/i.test(kind) || !/€.*mois/i.test(price)) return null;

  const figures = new Map<string, string>();
  block.find('.cracteristiques').each((_i, el) => {
    const value = cleanText($(el).prev().text());
    figures.set(cleanText($(el).text()).toLowerCase(), value);
  });
  const place = /^(\d{5})\s+(.+)$/.exec(cleanText(block.find('.titre3').first().text()));
  const description = htmlToText($, block.find('p.description') as cheerio.Cheerio<never>);
  const title = cleanText(block.find('h1').first().text());
  const mandate = /N° Mandat\s*:\s*([^/]+?)\s*\/\s*Réf\s*:\s*(\S+)/.exec(
    cleanText(block.find('p').first().text()),
  );
  // Photos du bien : `…/pr_p/3/9/6/4/6/3/3/5/39646335a.jpg`, une lettre par vue.
  const photo = new RegExp(
    String.raw`https://media-nestenn\.immo-facile\.com/[^'"\s)]+/${reference}[a-z]\.jpg`,
    'g',
  );
  const imageUrls = [...new Set(html.match(photo) ?? [])];
  const rooms = figures.get('pièces');

  const extra: Record<string, string> = {};
  if (mandate?.[2] !== undefined) extra['reference'] = mandate[2];
  if (mandate?.[1] !== undefined) extra['mandat'] = mandate[1];

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    depositText: afterLabel(description, String.raw`Caution|Dépôt de garantie`),
    feesText: afterLabel(description, 'Honoraires'),
    areaText: figures.get('habitables'),
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: kind.replace(/\s*à louer$/i, ''),
    furnishedText: `${title} ${description}`,
    cityText: place?.[2],
    postalCodeText: place?.[1],
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
