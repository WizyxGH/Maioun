/**
 * Source : French Riviera Studios (studios-nice.com) — 2 place Magenta, 06000
 * Nice. WordPress, thème Houzez, rendu serveur.
 *
 * `/status/location/` liste sur une page les locations au mois (meublées ou
 * étudiantes pour la plupart) ; les cartes portent l'identifiant WordPress
 * (`data-listid`). La fiche a un JSON-LD `RealEstateListing` (titre,
 * description, photos, surface, commune, coordonnées) doublé du JSON-LD Yoast
 * qui date la mise en ligne, et un tableau « Détails » en deux parties : prix
 * « 710.00€/mois », charges, dépôt de garantie, référence d'agence, puis
 * « Détails supplémentaires » — étage, honoraires, état des lieux.
 *
 * Le site ne publie AUCUNE rue : le bloc Adresse s'arrête à la commune et au
 * code postal. Les coordonnées du JSON-LD sont donc le seul repère précis.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { parseFrenchNumber } from '../../normalization/parse-number.js';
import { htmlToText } from '../shared/html-text.js';
import { fieldMatching } from '../shared/labels.js';
import { collectJsonLdNodes, findJsonLdNode, jsonLdGeo, jsonLdString } from '../shared/json-ld.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'French Riviera Studios';
export const SITE = 'https://studios-nice.com';
export const LIST_URL = `${SITE}/status/location/`;

const FICHE = /^https:\/\/studios-nice\.com\/property\/[a-z0-9-]+\/$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.item-listing-wrap').each((_i, card) => {
    const href = $(card).find('.item-title a[href]').first().attr('href') ?? '';
    const reference = $(card).find('[data-listid]').first().attr('data-listid');
    if (!FICHE.test(href) || reference === undefined || byRef.has(reference)) return;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl: href,
        agencyName: AGENCY_NAME,
        contactFormUrl: href,
      }),
    );
  });
  return [...byRef.values()];
}

/** Tableau « libellé → valeur » des blocs Détails et Adresse. */
function detailTable($: cheerio.CheerioAPI): Map<string, string> {
  const table = new Map<string, string>();
  $('#property-detail-wrap li, #property-address-wrap li').each((_i, li) => {
    const label = cleanText($(li).find('strong').first().text()).replace(/:$/, '');
    const value = cleanText($(li).find('span').last().text());
    if (label !== '' && value !== '' && !table.has(label)) table.set(label, value);
  });
  return table;
}

/**
 * Montants à l'anglaise : « 1,160.00€ » → « 1160 € ». Laissé tel quel, le point
 * décimal serait lu comme séparateur de milliers.
 */
function euros(value: string | undefined): string | undefined {
  const match = /(\d[\d\s]*)(?:\.(\d+))?\s*€/.exec((value ?? '').replace(/,(?=\d{3}\b)/g, ''));
  if (match?.[1] === undefined) return undefined;
  const cents = match[2] !== undefined && Number(match[2]) > 0 ? `,${match[2]}` : '';
  return `${match[1].trim()}${cents} €`;
}

/**
 * Un nombre du tableau, `0` écarté : le thème imprime `0` dans tout champ que
 * l'agence n'a pas rempli — « Chambre 0 » sur un trois-pièces de 71 m². Rien ne
 * distingue ce zéro d'un vrai rez-de-chaussée, donc il ne vaut pas réponse.
 */
function positiveCount(value: string | undefined): string | undefined {
  const count = parseFrenchNumber(value ?? '');
  return count !== null && count > 0 ? String(count) : undefined;
}

/**
 * Honoraires du locataire, état des lieux compris : c'est la somme versée à
 * l'entrée. La fiche les publie sur deux lignes, et l'état des lieux seul ne
 * dit pas ce que coûte la mise en location.
 */
function feesText(table: ReadonlyMap<string, string>): string | undefined {
  const fees = parseFrenchNumber(fieldMatching(table, /^Honoraires/i) ?? '');
  if (fees === null) return undefined;
  const inventory = parseFrenchNumber(fieldMatching(table, /^[EÉ]tat des lieux/i) ?? '') ?? 0;
  return `${Math.round((fees + inventory) * 100) / 100} €`;
}

/** Pièces déduites du titre : « F2 », « T3 », « 2 pièces », « studio ». */
function roomsFromTitle(title: string): string | undefined {
  const typed = /\b[FT]\s?(\d)\b/i.exec(title) ?? /\b(\d)\s*pi[eè]ces?\b/i.exec(title);
  if (typed?.[1] !== undefined) return `${typed[1]} pièces`;
  return /\bstudio/i.test(title) ? '1 pièce' : undefined;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const table = detailTable($);
  const price = table.get('Prix');
  if (price === undefined || !/\/\s*mois/i.test(price)) return null;

  const nodes = collectJsonLdNodes($);
  const node = findJsonLdNode(nodes, ['realestatelisting']) ?? {};
  // Yoast date la mise en ligne du bien ; le tableau n'affiche que la dernière
  // retouche, la même pour tout l'inventaire après une reprise en masse.
  const page = findJsonLdNode(nodes, ['webpage']) ?? {};
  const address = (node['address'] ?? {}) as Record<string, unknown>;
  const floor = (node['floorSize'] ?? {}) as Record<string, unknown>;
  const images = Array.isArray(node['image'])
    ? node['image'].filter((url): url is string => typeof url === 'string')
    : [];

  const title = cleanText(jsonLdString(node['name']) ?? $('h1').first().text());
  const description = htmlToText($, '#property-description-wrap .description-content');
  const labels = $('.property-labels-wrap')
    .first()
    .find('a')
    .map((_i, a) => cleanText($(a).text()))
    .get();
  const area =
    jsonLdString(floor['value']) ?? /(\d+(?:[.,]\d+)?)/.exec(table.get('Surface') ?? '')?.[1];
  const extra: Record<string, string> = {};
  const reference = table.get('Référence');
  if (reference !== undefined) extra['reference'] = reference;
  const etage = positiveCount(table.get('Étage'));
  if (etage !== undefined) extra['etage'] = etage;
  // « Location meublée » s'écrit en étiquette de statut ET dans le tableau :
  // l'une manque parfois. Rien n'est conclu de l'absence des deux.
  const furnished = `${labels.join(' ')} ${table.get('Statut de propriété') ?? ''}`;

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    priceText: `${euros(price) ?? price} par mois`,
    // « Charges de copropriété » est la quote-part du propriétaire, pas la
    // provision du locataire : seule « Charges » est la sienne.
    chargesText: euros(table.get('Charges')),
    depositText: euros(table.get('Dépôt de garantie')),
    feesText: feesText(table),
    areaText: area !== undefined ? `${area} m²` : undefined,
    roomsText: roomsFromTitle(title),
    propertyTypeText: table.get('Type de bien'),
    furnishedText: /meubl/i.test(furnished) ? 'Meublé' : undefined,
    cityText: jsonLdString(address['addressLocality']) ?? table.get('Ville'),
    postalCodeText: jsonLdString(address['postalCode']) ?? table.get('Zip/Postal Code'),
    ...jsonLdGeo(node),
    publishedAtText: jsonLdString(page['datePublished']),
    imageUrls: images.length > 0 ? images : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
