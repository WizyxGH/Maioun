/**
 * Source : MK Immo (mk-immo.fr) — 165 avenue de Nice, 06800 Cagnes-sur-Mer ;
 * `mce-immo.com` y redirige. Site Twimmo, rendu serveur, sans JSON-LD.
 *
 * `/toutes-locations.html` liste toutes les locations sur une page ; la
 * référence termine l'adresse de fiche (`…-1-795l1111a.html`). La fiche écrit
 * ses montants en phrases engendrées par le logiciel : « Loyer mensuel 1 190 €
 * charges comprises dont 200 € de provisions pour charges … 455 € TTC
 * d'honoraires … 1 980 € de dépôt de garantie ».
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, NUMBER, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'MK Immo';
export const SITE = 'https://www.mk-immo.fr';
export const LIST_URL = `${SITE}/toutes-locations.html`;

/** Référence Twimmo d'une location : `795l1111a` (le `l` dit location). */
const FICHE = /^\/[^/?#]+-\d+-(\d+l\d+[a-z])\.html$/i;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('a[href]').each((_i, el) => {
    const href = ($(el).attr('href') ?? '').replace(SITE, '');
    const reference = FICHE.exec(href)?.[1]?.toUpperCase();
    if (reference === undefined || byRef.has(reference)) return;
    const sourceUrl = `${SITE}${href}`;
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

const pick = (text: string, pattern: string): string | undefined =>
  new RegExp(pattern, 'i').exec(text)?.[1]?.trim();

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const text = flatText($);
  const rent = pick(text, String.raw`Loyer mensuel (${AMOUNT}) charges comprises`);
  if (rent === undefined) return null;

  // « Location rez-de-jardin - Nice (06100) - réf. 795L1111A »
  const header = /Location (.+?) - (.+?) \((\d{5})\) - réf\./.exec(
    cleanText($('.detail-header-titre').first().text()),
  );
  // Le <title> est engendré : « Location rez-de-jardin 2 pièces Nice Centre-ville 35 m² ».
  const title = cleanText($('title').first().text());
  const description = htmlToText($, '.detail-offre-texte');
  const imageUrls = [
    ...new Set(
      html.match(/https:\/\/medias\.twimmopro\.com\/visueloffre\/[\w/-]+-photo-hd\.webp/g),
    ),
  ];
  const dpe = pick(text, String.raw`Classe énergie \(dpe\) ([A-G])\b`);

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${rent} CC par mois`,
    chargesText: pick(text, String.raw`dont (${AMOUNT}) de provisions pour charges`),
    feesText: pick(text, String.raw`(${AMOUNT}) TTC d'honoraires`),
    depositText: pick(text, String.raw`(${AMOUNT}) de dépôt de garantie`),
    areaText: pick(title, String.raw`(${NUMBER}) m²`)?.concat(' m²'),
    roomsText: pick(title, String.raw`(\d+ pièces?)`),
    propertyTypeText: title === '' ? header?.[1] : title,
    cityText: header?.[2],
    postalCodeText: header?.[3],
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: dpe !== undefined ? { dpe: dpe.toUpperCase() } : undefined,
  };
}
