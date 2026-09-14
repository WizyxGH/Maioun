/**
 * Source : Concept Patrimoine (conceptpatrimoine.fr) — 10 rue Guiglia, Nice ;
 * `conceptpatrimoineimmobilier.fr` y redirige. WordPress, annonces importées
 * de Netty par une extension maison (références `LA2469`).
 *
 * La page `/locations/` porte tout le stock en cartes `article.netty-item` :
 * type, titre, commune, pièces, surface, loyer « €/mois CC ». La fiche ajoute
 * la description, la référence, les charges et les honoraires (bloc « Mentions
 * légales ») et la galerie.
 *
 * Le site est celui du GROUPE : ses agences y publient ensemble, sans marque
 * qui les distingue. Les bureaux et locaux s'y mêlent aux logements ; le
 * scoring les écarte.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Concept Patrimoine';
export const LIST_URL = 'https://www.conceptpatrimoine.fr/locations/';

const FICHE = /^https:\/\/www\.conceptpatrimoine\.fr\/proprietes\/([^/?#]+)\/?$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const bySlug = new Map<string, RawListing>();
  $('article.netty-item').each((_i, el) => {
    const card = $(el);
    const href = card.find('a.netty-item__link').attr('href') ?? '';
    const slug = FICHE.exec(href)?.[1];
    if (slug === undefined || bySlug.has(slug)) return;
    const text = (selector: string): string | undefined =>
      cleanText(card.find(selector).first().text()) || undefined;
    const price = text('.netty-item__price');
    bySlug.set(
      slug,
      compactListing({
        sourceRef: slug,
        sourceUrl: href,
        title: text('.netty-item__title'),
        // Seul un loyer au mois est une location comparable.
        priceText: price !== undefined && /mois/i.test(price) ? price : undefined,
        propertyTypeText: text('.netty-item__type'),
        cityText: text('.netty-item__location'),
        roomsText: text('.netty-item__rooms'),
        areaText: text('.netty-item__specs .netty-item__surface'),
        agencyName: AGENCY_NAME,
        contactFormUrl: href,
        imageUrls:
          card.find('img').attr('src') !== undefined
            ? [card.find('img').attr('src') ?? '']
            : undefined,
      }),
    );
  });
  return [...bySlug.values()];
}

/** Ce que la fiche ajoute à la carte. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const mentions = flatText($, '#property-legal-mentions');
  const reference = /Réf\.\s*(\w+)/.exec(flatText($, '.main-informations'))?.[1];
  const description = htmlToText($, '.property-description-content');
  // Les vignettes déclinent chaque photo en plusieurs tailles : on garde l'original.
  const imageUrls = [
    ...new Set(
      html.match(
        /https:\/\/www\.conceptpatrimoine\.fr\/wp-content\/uploads\/\d{4}\/\d{2}\/[\w-]+_original\.jpg/g,
      ),
    ),
  ];
  const draft: RawDraft = {
    description: description === '' ? undefined : description,
    chargesText: afterLabel(mentions, 'Charges mensuelles', AMOUNT),
    feesText: afterLabel(mentions, 'Honoraires', AMOUNT),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: reference !== undefined ? { reference } : undefined,
  };
  return Object.values(draft).some((value) => value !== undefined) ? draft : null;
}
