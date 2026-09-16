/**
 * Source : Imodirect (annonces.imodirect.com) — gestionnaire locatif en ligne,
 * national, rendu serveur.
 *
 * `/annonces` affiche TOUTES les locations de France sur une page (≈ 270 au
 * relevé) : on n'en garde que les cartes dont le code postal est dans la zone,
 * pour ne visiter que leurs fiches. La fiche donne loyer charges comprises,
 * quartier, disponibilité, description, loyer hors charges et charges, frais
 * d'agence et classe énergie ; aucun dépôt de garantie n'est publié.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, firstMatch } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Imodirect';
export const SITE = 'https://annonces.imodirect.com';
export const LIST_URL = `${SITE}/annonces`;

/** Codes postaux de Nice et des communes voisines suivies. */
export const AREA_POSTAL_CODES: ReadonlySet<string> = new Set([
  '06000',
  '06100',
  '06200',
  '06300',
  '06700',
  '06800',
  '06270',
  '06230',
  '06310',
  '06320',
  '06340',
  '06360',
  '06390',
  '06510',
  '06690',
  '06730',
]);

const FICHE = /^\/annonces\/annonceview\/(\d+)\/[a-z0-9-]+$/;

/** « NICE (06100) » */
const PLACE = /^(.+?)\s*\((\d{5})\)$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.shadow-panel-annonce').each((_i, el) => {
    const card = $(el);
    const href = card.find('a[href^="/annonces/annonceview/"]').first().attr('href') ?? '';
    const id = FICHE.exec(href)?.[1];
    const place = PLACE.exec(cleanText(card.find('.degrade-rouge').first().text()));
    if (id === undefined || place?.[2] === undefined || !AREA_POSTAL_CODES.has(place[2])) return;
    if (byRef.has(id)) return;
    const sourceUrl = `${SITE}${href}`;
    byRef.set(
      id,
      compactListing({
        sourceRef: id,
        sourceUrl,
        cityText: place[1],
        postalCodeText: place[2],
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/** Ce que la fiche apprend ; `null` si elle n'a pas de loyer. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const header = $('.header-annonce').first();
  const price = cleanText(header.find('span.en-tete').last().text());
  if (!/€/.test(price)) return null;

  // « 2 pièces - Meublé - 53,01 m² - 2ème étage - Colocation non autorisée »
  const summary = header.next('.en-tete');
  const reference = cleanText(summary.find('span').text()).replace(/^réf\.\s*/i, '');
  summary.find('span').remove();
  const features = cleanText(summary.text());
  const place = PLACE.exec(cleanText($('.degrade-rouge').first().text()));
  const district = cleanText(summary.nextAll('span.en-tete').first().text());
  const available = firstMatch(
    cleanText($('body').text()),
    String.raw`Dispo le (\d{2}/\d{2}/\d{2,4})`,
  );

  const panels = $('.annonce-description-div .shadow-panel');
  const describe = panels.first().clone();
  const figures = cleanText(describe.find('b').last().text());
  describe.find('b').last().remove();
  const description = htmlToText($, describe as cheerio.Cheerio<never>).replace(
    /^IMODIRECT vous présente\s*:\s*/i,
    '',
  );
  const more = cleanText(
    panels
      .toArray()
      .map((el) => $(el).text())
      .join(' '),
  );
  const imageUrls = [
    ...new Set(
      $('.owl-carousel img[src*="docfo.imodirect.com"]')
        .toArray()
        .map((el) => $(el).attr('src') ?? ''),
    ),
  ].filter((url) => url.startsWith('https://'));
  const title = cleanText($('title').first().text());
  const dpe = firstMatch(more, String.raw`Classe énergétique\s*:\s*([A-G])\b`);
  // Le GES n'est que dans l'échelle : la case retenue porte son identifiant.
  const ges = /^ges-([a-g])$/.exec($('.ges .selected').first().attr('id') ?? '')?.[1];

  const extra: Record<string, string> = {};
  if (reference !== '') extra['reference'] = reference;
  if (district !== '') extra['quartier'] = district;
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (ges !== undefined) extra['ges'] = ges.toUpperCase();

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    chargesText: firstMatch(figures, String.raw`Charges\s*:\s*(${AMOUNT})`),
    feesText: firstMatch(more, String.raw`frais d'agence sont de (${AMOUNT})`),
    areaText: firstMatch(features, String.raw`(\d+(?:[.,]\d+)?\s*m²)`),
    roomsText: firstMatch(features, String.raw`(\d+ pièces?)`),
    propertyTypeText: cleanText(header.find('span.en-tete').first().text()) || undefined,
    furnishedText: features,
    cityText: place?.[1],
    postalCodeText: place?.[2],
    availableAtText: available,
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
