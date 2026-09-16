/**
 * Source : Miramar Real Estate (miramarimmo.com) — WordPress + Elementor Pro,
 * type de contenu « biens » et taxonomie `type_transaction`, rendu serveur.
 *
 * La page `/locations/` est une grille Elementor de cartes `e-loop-item-{id}`
 * dont la classe porte la transaction. La fiche marque la sienne sur son
 * gabarit (`type_transaction-…`), affiche le prix en intertitre, une suite
 * d'intertitres « Libellé : valeur » (type, ville, quartier, pièces, chambres,
 * surface, charges, référence, classe énergétique), la description et la
 * galerie en visionneuse.
 *
 * Aucune location au 2026-09-15 (grille vide) : écrit sur une fiche de VENTE
 * du même gabarit ; les ventes sont écartées par leur transaction.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Miramar Real Estate';
export const SITE = 'https://miramarimmo.com';
export const LIST_URL = `${SITE}/locations/`;

const FICHE = /^https:\/\/miramarimmo\.com\/biens\/[\w%-]+\/$/;

/** Transactions qui ne sont pas une location à l'année. */
const NOT_RENTAL = /\btype_transaction-[\w-]*(?:vente|vendu|viager|saison)/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.e-loop-item').each((_i, el) => {
    const card = $(el);
    const classes = card.attr('class') ?? '';
    const reference = /\be-loop-item-(\d+)\b/.exec(classes)?.[1];
    const sourceUrl = card.find('a[href*="/biens/"]').first().attr('href') ?? '';
    if (reference === undefined || !FICHE.test(sourceUrl) || NOT_RENTAL.test(classes)) return;
    if (byRef.has(reference)) return;
    const title = cleanText(card.find('img').first().attr('alt') ?? '');
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

/**
 * Elementor n'écrit ce bloc que si la requête de la grille ne rend aucun bien ;
 * l'agence l'a laissé sans texte, d'où la lecture de la classe.
 */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  return $('.e-loop-item').length === 0 && $('.e-loop-nothing-found-message').length > 0;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const page = $('[data-elementor-type="single-page"]').first();
  const classes = page.attr('class') ?? '';
  if (!/\btype_transaction-/.test(classes) || NOT_RENTAL.test(classes)) return null;

  const fields = new Map<string, string>();
  const headings: string[] = [];
  page.find('.elementor-heading-title').each((_i, el) => {
    const text = cleanText($(el).text());
    headings.push(text);
    const match = /^([^:]{2,40}?)\s*:\s*(.+)$/.exec(text);
    if (match?.[1] !== undefined && match[2] !== undefined && !fields.has(match[1].toLowerCase())) {
      fields.set(match[1].toLowerCase(), match[2]);
    }
  });
  const price = headings.find((text) => /^\d[\d\s.]*€/.test(text));
  // Un tarif à la semaine passe : la normalisation l'écarte.
  if (price === undefined) return null;

  const title = cleanText($('title').first().text()).replace(/\s*-\s*MIRAMAR REAL ESTATE$/i, '');
  const description = htmlToText($, '.elementor-widget-theme-post-content');
  const imageUrls = [
    ...new Set(
      page
        .find('a[data-elementor-open-lightbox][href*="/wp-content/uploads/"]')
        .toArray()
        .map((a) => $(a).attr('href') ?? ''),
    ),
  ];
  const get = (label: string): string | undefined => fields.get(label);
  const rooms = get('pièce(s)') ?? get('pièces');
  const bedrooms = get('chambre(s)') ?? get('chambres');

  const extra: Record<string, string> = {};
  const reference = get('référence');
  if (reference !== undefined) extra['reference'] = reference;
  const district = get('quartier');
  if (district !== undefined) extra['quartier'] = district;
  const dpe = get('classe énergétique');
  if (dpe !== undefined && /^[A-G]$/i.test(dpe)) extra['dpe'] = dpe.toUpperCase();
  const ges = get('classe ges');
  if (ges !== undefined && /^[A-G]$/i.test(ges)) extra['ges'] = ges.toUpperCase();
  const features = page
    .find('.miramar-plus-bien-pill')
    .toArray()
    .map((li) => cleanText($(li).text()));
  if (features.length > 0) extra['features'] = features.join(', ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: price,
    chargesText: get('charges') ?? get('provision sur charges'),
    depositText: get('dépôt de garantie') ?? get('caution'),
    feesText: get('honoraires') ?? get('honoraires locataire'),
    areaText: get('surface'),
    roomsText: [
      rooms !== undefined ? `${rooms} pièces` : undefined,
      bedrooms !== undefined ? `${bedrooms} chambres` : undefined,
    ]
      .filter(Boolean)
      .join(', '),
    propertyTypeText: get('type'),
    furnishedText: `${get('meublé') !== undefined ? 'meublé ' : ''}${title} ${description}`,
    cityText: get('ville'),
    availableAtText: get('disponibilité'),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
