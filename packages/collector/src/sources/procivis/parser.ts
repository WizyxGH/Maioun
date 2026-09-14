/**
 * Source : Procivis (procivis.fr), réseau qui a repris l'enseigne Immo de
 * France ; son agence niçoise est Immo de France Nice.
 *
 * Les pages par type et par commune (`/louer/appartements/…/nice`) listent les
 * fiches `/louer/{type}/…/{commune}/{id}` en rendu serveur. La fiche porte un
 * JSON-LD `RealEstateListing` complet (loyer, adresse, surface, pièces, charges,
 * meublé, date de parution, agence) ; honoraires, dépôt et DPE ne sont que dans
 * le texte.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanMultiline } from '../../normalization/text.js';
import { AMOUNT, afterLabel, flatText } from '../shared/labels.js';
import {
  collectJsonLdNodes,
  findJsonLdNode,
  jsonLdString,
  type JsonLdNode,
} from '../shared/json-ld.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.procivis.fr';
const REGION = 'provence-alpes-cote-d-azur/alpes-maritimes';

/** Pages de liste retenues : logements de Nice. */
export const LIST_URLS = ['appartements', 'maisons'].map(
  (type) => `${SITE}/louer/${type}/${REGION}/nice`,
);

/** Identifiant de fiche : huit caractères, dont au moins un chiffre (`2dh7jsqs`). */
const FICHE =
  /^(?:https:\/\/www\.procivis\.fr)?(\/louer\/[a-z-]+\/[a-z-]+\/[a-z-]+\/[a-z-]+\/((?=[a-z]*\d)[a-z0-9]{8}))$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byId = new Map<string, RawListing>();
  $('a[href*="/louer/"]').each((_i, el) => {
    const match = FICHE.exec($(el).attr('href') ?? '');
    if (match === null) return;
    const [, path, id] = match;
    if (path === undefined || id === undefined || byId.has(id)) return;
    const sourceUrl = `${SITE}${path}`;
    byId.set(id, compactListing({ sourceRef: id, sourceUrl, contactFormUrl: sourceUrl }));
  });
  return [...byId.values()];
}

const node = (value: unknown): JsonLdNode | undefined =>
  typeof value === 'object' && value !== null ? (value as JsonLdNode) : undefined;

/** Valeur d'une caractéristique `amenityFeature` par son nom. */
function amenity(entity: JsonLdNode | undefined, name: string): unknown {
  const list = entity?.['amenityFeature'];
  if (!Array.isArray(list)) return undefined;
  return (list as JsonLdNode[]).find((item) => item['name'] === name)?.['value'];
}

/** « immo-de-france-nice » → Immo de France ; sinon le réseau. */
function agencyFrom(provider: string | undefined): string {
  return provider?.includes('/immo-de-france') === true ? 'Immo de France' : 'Procivis';
}

/** Photos de la galerie : chaque `srcset` finit par la plus grande taille. */
function galleryUrls($: cheerio.CheerioAPI): string[] {
  const largest = $('img.object-contain[srcset^="/medias/"]')
    .map((_i, el) => ($(el).attr('srcset') ?? '').split(',').pop()?.trim().split(/\s+/)[0] ?? '')
    .get()
    .filter((src) => src !== '');
  return [...new Set(largest)].map((src) => `${SITE}${src}`);
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const listing = findJsonLdNode(collectJsonLdNodes($), ['realestatelisting']);
  const offer = node(listing?.['offers']);
  const price = jsonLdString(offer?.['price']);
  if (
    listing === undefined ||
    price === undefined ||
    !/LeaseOut/.test(String(offer?.['businessFunction']))
  ) {
    return null;
  }
  const text = flatText($);
  const dpe = /DPE\s*:\s*([A-G])\b/.exec(text)?.[1];
  const reference = /Réf\.\s*:\s*(\w+)/.exec(text)?.[1];
  const imageUrls = galleryUrls($);
  const description = cleanMultiline(jsonLdString(listing['description']) ?? '');

  return {
    ...entityFields(node(listing['mainEntity'])),
    title: jsonLdString(listing['name']),
    description: description === '' ? undefined : description,
    priceText: `${price} € CC par mois`,
    depositText: afterLabel(text, 'D[ée]p[ôo]t de garantie', AMOUNT),
    feesText: afterLabel(text, 'Honoraires à la charge du locataire', AMOUNT),
    publishedAtText: jsonLdString(listing['datePosted']),
    agencyName: agencyFrom(jsonLdString(listing['provider'])),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      ...(reference !== undefined ? { reference } : {}),
      ...(dpe !== undefined ? { dpe } : {}),
    },
  };
}

/** Le bien lui-même, tel que le décrit `mainEntity`. */
function entityFields(entity: JsonLdNode | undefined): RawDraft {
  const address = node(entity?.['address']);
  const area = jsonLdString(node(entity?.['floorSize'])?.['value']);
  const rooms = jsonLdString(entity?.['numberOfRooms']);
  const charges = jsonLdString(amenity(entity, 'Charges locatives'));
  const furnished = amenity(entity, 'Location meublée');
  return {
    chargesText: charges !== undefined ? `${charges} €` : undefined,
    areaText: area !== undefined ? `${area} m²` : undefined,
    roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
    propertyTypeText:
      jsonLdString(entity?.['accomodationCategory']) ?? jsonLdString(entity?.['@type']),
    furnishedText: furnished === true ? 'meublé' : furnished === false ? 'non meublé' : undefined,
    cityText: jsonLdString(address?.['addressLocality']),
    postalCodeText: jsonLdString(address?.['postalCode']),
  };
}
