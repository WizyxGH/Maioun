/**
 * Source : Cabinet Loquis (loquis.fr) — WordPress, thème Beaver Builder et
 * extension WPCasa, rendu serveur.
 *
 * `/location/` est un code court WPCasa filtré sur l'offre « à louer » : cartes
 * `#listing-{id}` avec badge de statut. La fiche ne rappelle pas l'offre ; elle
 * donne titre, prix (et période de location quand il y en a une), détails
 * éventuels « libellé / valeur », description où l'agence écrit charges, dépôt,
 * DPE, et une galerie de photos.
 *
 * Aucune location au 2026-09-15 : écrit sur une fiche de VENTE (même gabarit)
 * et la page de location vide ; la liste, seule à connaître l'offre, écarte les
 * ventes à leur badge.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { AMOUNT, afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Cabinet Loquis';
export const SITE = 'https://loquis.fr';
export const LIST_URL = `${SITE}/location/`;

const FICHE = /^https:\/\/loquis\.fr\/listing\/[\w%-]+\/$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.wpsight-listings .listing[id^="listing-"]').each((_i, el) => {
    const card = $(el);
    const reference = /^listing-(\d+)$/.exec(card.attr('id') ?? '')?.[1];
    const link = card.find('.wpsight-listing-title a').first();
    const sourceUrl = link.attr('href') ?? '';
    const badge = card.find('.wpsight-listing-status .badge').first();
    const status = `${badge.attr('class') ?? ''} ${cleanText(badge.text())}`;
    if (reference === undefined || !FICHE.test(sourceUrl) || byRef.has(reference)) return;
    if (/badge-sale|vendre|vendu|lou[ée]\b/i.test(status)) return;
    const title = cleanText(link.text());
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

/** Message « aucun résultat » que WPCasa met à la place de la liste. */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  const list = $('.wpsight-listings-sc');
  return (
    list.find('.listing').length === 0 &&
    /aucune\s+annonce\s+ne\s+correspond/i.test(cleanText(list.text()))
  );
}

/** Communes voisines que les annonces nomment quand le bien n'est pas à Nice. */
const OTHER_TOWNS =
  /\b(Saint[- ]Laurent[- ]du[- ]Var|Cagnes[- ]sur[- ]Mer|Villeneuve[- ]Loubet|Villefranche[- ]sur[- ]Mer|Beaulieu[- ]sur[- ]Mer|Saint[- ]Jean[- ]Cap[- ]Ferrat|[ÈE]ze|La Trinit[ée]|Falicon|Aspremont|Colomars|Vence|Menton|Monaco|Antibes|Cannes)\b/i;

/**
 * Le gabarit n'a pas de champ ville. Le cabinet travaille à Nice et titre ses
 * annonces par quartier (« CIMIEZ », « ST SYLVESTRE ») : Nice, sauf commune
 * voisine nommée.
 */
function cityOf(text: string): string {
  return OTHER_TOWNS.exec(text)?.[1] ?? 'Nice';
}

/**
 * Ce que la fiche apprend ; `null` sans loyer lisible. La période reste dans le
 * prix : la normalisation écarte un loyer à la semaine.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const box = $('.wpsight-listing').first();
  const price = box.find('.wpsight-listing-price').first();
  const amount = cleanText(price.find('.listing-price-value').text());
  const period = cleanText(price.find('.listing-rental-period').text());
  if (!/\d/.test(amount)) return null;

  const details = new Map<string, string>();
  box.find('.listing-details-detail, .listing-detail').each((_i, el) => {
    const label = cleanText($(el).find('[class*="label"]').text()).toLowerCase();
    const value = cleanText($(el).find('[class*="value"]').text());
    if (label !== '' && value !== '') details.set(label, value);
  });
  const title = cleanText(box.find('h1.entry-title').first().text());
  const description = htmlToText($, '.wpsight-listing-description');
  const imageUrls = [
    ...new Set(
      [
        box.find('.main-image .wpsight-listing-thumbnail img').attr('src') ?? '',
        ...box
          .find('.galerie a[href]')
          .toArray()
          .map((a) => $(a).attr('href') ?? ''),
      ]
        // Les photos arrivent en « -1024x577 » : l'original n'a pas de suffixe.
        .map((url) => url.replace(/-\d+x\d+(\.\w+)$/, '$1'))
        .filter((url) => url.startsWith(`${SITE}/wp-content/uploads/`)),
    ),
  ];
  const text = `${title}\n${description}`;
  const dpe = /DPE\s*:?\s*([A-G])\b/.exec(description)?.[1];

  // Aucune `reference` : l'identifiant Apimo se devinait dans le NOM DE FICHIER
  // d'une photo. Le site ne l'affiche nulle part, et l'agence ne le reconnaît
  // pas — une valeur devinée n'est pas une donnée publiée (§17).
  const extra: Record<string, string> = {};
  if (dpe !== undefined) extra['dpe'] = dpe;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${amount} € ${period}`.trim(),
    chargesText: details.get('charges') ?? afterLabel(description, 'Charges'),
    depositText:
      details.get('dépôt de garantie') ??
      afterLabel(description, String.raw`Dépôt de garantie|Caution`, AMOUNT),
    feesText:
      details.get('honoraires') ??
      afterLabel(description, String.raw`Honoraires(?: locataire)?`, AMOUNT),
    areaText: details.get('surface') ?? details.get('surface habitable'),
    roomsText: details.get('pièces'),
    propertyTypeText: details.get('type'),
    furnishedText: text,
    cityText: cityOf(text),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
