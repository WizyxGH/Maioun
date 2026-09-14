/**
 * Source : Cabinet Crouzet & Breil (crouzet-breil.com) — 134 boulevard
 * Gambetta, Nice. WordPress + Elementor, alimenté par Apimo (la référence
 * affichée est l'identifiant Apimo).
 *
 * La page `/type-offre/location/` liste les fiches `/l_immobilier/{slug}/`.
 * La fiche porte une ligne résumé engendrée (« 2 pièces • 41.3 m 2 • 995 €
 * CC/mois • ref. 86674738 ») et une liste « Libellé: valeur » (provision,
 * honoraires, dépôt, classe énergie). La commune n'y figure qu'en tête de la
 * description (« NICE NORD – 36 BD GORBELLA »), qui est lue telle quelle.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, NUMBER, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Cabinet Crouzet & Breil';
export const LIST_URL = 'https://crouzet-breil.com/type-offre/location/';

const FICHE = /^https:\/\/crouzet-breil\.com\/l_immobilier\/([a-z0-9-]+)\/?$/;

/** Communes de la zone qu'une description peut nommer en tête. */
const LEADING_CITY =
  /^(nice|saint-laurent-du-var|cagnes-sur-mer|villeneuve-loubet|beaulieu-sur-mer|cap-d'ail|villefranche-sur-mer|la trinité|drap|carros|contes)\b/i;

/** Les fiches de la page de liste. */
export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const bySlug = new Map<string, RawListing>();
  $('a[href*="/l_immobilier/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const slug = FICHE.exec(href)?.[1];
    if (slug === undefined || bySlug.has(slug)) return;
    const sourceUrl = `https://crouzet-breil.com/l_immobilier/${slug}/`;
    bySlug.set(
      slug,
      compactListing({
        sourceRef: slug,
        sourceUrl,
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...bySlug.values()];
}

/** Valeur d'une ligne « Libellé: valeur » du bloc de détails. */
function detail($: cheerio.CheerioAPI, label: string): string | undefined {
  const line = $('.detail_property li')
    .map((_i, el) => cleanText($(el).text()))
    .get()
    .find((text) => text.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  const value = line?.slice(label.length + 1).trim();
  return value === undefined || value === '' ? undefined : value;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const text = flatText($);
  const summary = new RegExp(
    String.raw`(?:(\d+) pièces? • )?(?:(${NUMBER}) m 2 • )?(${AMOUNT}) CC\/mois • ref\. (\d+)`,
  ).exec(text);
  if (summary === null) return null;
  const [, rooms, area, rent, reference] = summary;

  // La description est le seul bloc de texte libre un peu long hors pied de page.
  const editor = $('.elementor-widget-text-editor')
    .filter((_i, el) => {
      const own = cleanText($(el).text());
      return own.length > 120 && !/Statuts de la propriété|Mentions légales/.test(own);
    })
    .first();
  const description = editor.length > 0 ? htmlToText($, editor as cheerio.Cheerio<never>) : '';
  const city = LEADING_CITY.exec(description)?.[1];

  const dpe = detail($, 'Énergie - Consommation conventionnelle');
  const imageUrls = [
    ...new Set(
      html.match(
        /https:\/\/crouzet-breil\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/[\w-]+-original\.jpg/g,
      ),
    ),
  ];
  const title = cleanText($('title').first().text()).replace(
    /\s*-\s*Cabinet Crouzet et Breil$/i,
    '',
  );

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${rent} CC par mois`,
    chargesText: detail($, 'Provision sur charges mensuelle'),
    depositText: detail($, 'Dépôt de garantie'),
    feesText: detail($, 'Honoraires'),
    areaText: area !== undefined ? `${area} m²` : undefined,
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText: title,
    cityText: city,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      reference: reference ?? '',
      ...(dpe !== undefined && /^[A-G]$/.test(dpe) ? { dpe } : {}),
    },
  };
}
