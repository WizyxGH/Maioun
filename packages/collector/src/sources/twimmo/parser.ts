/**
 * Plateforme Twimmo : sites d'agence rendus serveur, sans JSON-LD.
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
import { AMOUNT, NUMBER, firstMatch, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const LIST_PATH = '/toutes-locations.html';

/** Référence Twimmo d'une location : `795l1111a` (le `l` dit location). */
const FICHE = /^\/[^/?#]+-\d+-(\d+l\d+[a-z])\.html$/i;

/** Fiches de la page de liste ; l'origine du site vient de `listUrl`. */
export function parseTwimmoList(html: string, listUrl: string, agencyName: string): RawListing[] {
  const { origin } = new URL(listUrl);
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('a[href]').each((_i, el) => {
    let url: URL;
    try {
      url = new URL($(el).attr('href') ?? '', listUrl);
    } catch {
      return;
    }
    if (url.origin !== origin) return;
    const reference = FICHE.exec(url.pathname)?.[1]?.toUpperCase();
    if (reference === undefined || byRef.has(reference)) return;
    const sourceUrl = `${origin}${url.pathname}`;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        agencyName,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

const PHONE = String.raw`(\+?\d[\d .]{7,}\d)`;

/**
 * Le négociateur du bien, encadré à côté du formulaire : « Mobile 06… -
 * Bureau 04… ». Sa ligne directe passe avant le standard, qui reste le repli ;
 * le standard seul vaut mieux que rien quand le mobile manque.
 */
function negotiator($: cheerio.CheerioAPI): { name?: string; phone?: string } {
  const card = $('.widget-testimonial-content').first();
  if (card.length === 0) return {};
  const lines = cleanText(card.find('.contact-box').first().text());
  const name = cleanText(card.find('h4').first().text());
  return {
    name: name === '' ? undefined : name,
    phone:
      firstMatch(lines, String.raw`(?:Mobile|Portable)\s*:?\s*${PHONE}`) ??
      firstMatch(lines, String.raw`Bureau\s*:?\s*${PHONE}`),
  };
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseTwimmoDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const text = flatText($);
  const rent = firstMatch(text, String.raw`Loyer mensuel (${AMOUNT}) charges comprises`);
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
  const dpe = firstMatch(text, String.raw`Classe énergie \(dpe\) ([A-G])\b`);
  const ges = firstMatch(text, String.raw`Classe climat \(ges\) ([A-G])\b`);
  const contact = negotiator($);

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${rent} CC par mois`,
    chargesText: firstMatch(text, String.raw`dont (${AMOUNT}) de provisions pour charges`),
    feesText: firstMatch(text, String.raw`(${AMOUNT}) TTC d'honoraires`),
    depositText: firstMatch(text, String.raw`(${AMOUNT}) de dépôt de garantie`),
    areaText: firstMatch(title, String.raw`(${NUMBER}) m²`)?.concat(' m²'),
    roomsText: firstMatch(title, String.raw`(\d+ pièces?)`),
    propertyTypeText: title === '' ? header?.[1] : title,
    cityText: header?.[2],
    postalCodeText: header?.[3],
    contactName: contact.name,
    phoneText: contact.phone,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra:
      dpe === undefined && ges === undefined
        ? undefined
        : {
            ...(dpe !== undefined ? { dpe: dpe.toUpperCase() } : {}),
            ...(ges !== undefined ? { ges: ges.toUpperCase() } : {}),
          },
  };
}
