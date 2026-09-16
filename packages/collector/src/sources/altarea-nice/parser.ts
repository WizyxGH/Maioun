/**
 * Source : Altarea Gestion Immobilière - Nice (altarea.flatbay.fr) — vitrine
 * Flatbay du gestionnaire, rendu serveur.
 *
 * La recherche accepte `etablissementId` : l'agence de Nice (8) a sa propre
 * liste, qui déborde sur le Var et Mougins (écartés au scoring). Chaque carte
 * porte `data-url` et `data-address` (« Nice 06200 »). La fiche publie un
 * JSON-LD `RealEstateListing` valide (adresse, surface, pièces, description),
 * les conditions de location en blocs `info-label`/`info-value` et ses photos
 * dans un tableau `propertyImages` du script de page.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { energyLabel } from '../shared/labels.js';

export const AGENCY_NAME = 'Altarea Gestion Immobilière - Nice';
export const SITE = 'https://altarea.flatbay.fr';
export const LIST_URL = `${SITE}/fr/search?etablissementId=8&rentsellType=property.rentsellType.rent`;

const FICHE = /^\/fr\/property\/show\/(\d+)$/;

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('[data-url^="/fr/property/show/"]').each((_i, el) => {
    const href = $(el).attr('data-url') ?? '';
    const reference = FICHE.exec(href)?.[1];
    if (reference === undefined || byRef.has(reference)) return;
    const place = /^(.+?)\s+(\d{5})$/.exec(cleanText($(el).attr('data-address') ?? ''));
    const sourceUrl = `${SITE}${href}`;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        cityText: place?.[1],
        postalCodeText: place?.[2],
        agencyName: AGENCY_NAME,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

interface ListingLd {
  readonly name?: string;
  readonly description?: string;
  readonly datePosted?: string;
  readonly mainEntity?: {
    readonly '@type'?: string;
    readonly floorSize?: { readonly value?: string };
    readonly numberOfRooms?: string;
  };
  readonly contentLocation?: {
    readonly address?: {
      readonly streetAddress?: string;
      readonly addressLocality?: string;
      readonly postalCode?: string;
    };
    readonly geo?: { readonly latitude?: string; readonly longitude?: string };
  };
}

function listingLd($: cheerio.CheerioAPI): ListingLd | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).text()) as { '@type'?: string } & ListingLd;
      if (data['@type'] === 'RealEstateListing') return data;
    } catch {
      /* bloc illisible : on essaie le suivant */
    }
  }
  return null;
}

/** Photos du bien : `const propertyImages = [{"url":"/fr/document/picture/…"}]`. */
function propertyImages(html: string): string[] {
  const raw = /const propertyImages = (\[[^;]*\]);/.exec(html)?.[1];
  if (raw === undefined) return [];
  try {
    const items = JSON.parse(raw) as { url?: string }[];
    return [
      ...new Set(items.map((item) => item.url ?? '').filter((url) => url.startsWith('/'))),
    ].map((url) => `${SITE}${url}`);
  } catch {
    return [];
  }
}

const toNumber = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : undefined;
};

/** Ce que le JSON-LD apprend : bien, adresse, coordonnées, date. */
function fromLd(ld: ListingLd | null): RawDraft {
  const area = ld?.mainEntity?.floorSize?.value ?? '';
  const rooms = ld?.mainEntity?.numberOfRooms ?? '';
  const description = ld?.description?.replace(/\r\n?/g, '\n').trim() ?? '';
  return {
    description: description === '' ? undefined : description,
    areaText: area === '' ? undefined : `${area} m²`,
    // Un box déclare « 0 » pièce : ce n'est pas une information.
    roomsText: /^[1-9]\d*$/.test(rooms) ? `${rooms} pièces` : undefined,
    // « Appartement 2 pièces à Nice » : le type schema.org range un box en « Room ».
    propertyTypeText: ld?.name ?? ld?.mainEntity?.['@type'],
    publishedAtText: ld?.datePosted,
    ...placeFromLd(ld),
  };
}

function placeFromLd(ld: ListingLd | null): RawDraft {
  const address = ld?.contentLocation?.address;
  const geo = ld?.contentLocation?.geo;
  return {
    addressText: address?.streetAddress,
    cityText: address?.addressLocality,
    postalCodeText: address?.postalCode,
    latitude: toNumber(geo?.latitude),
    longitude: toNumber(geo?.longitude),
  };
}

/** Blocs « Conditions de location » : libellé en minuscules → valeur. */
function readConditions($: cheerio.CheerioAPI): Map<string, string> {
  const conditions = new Map<string, string>();
  $('#conditionsContent .info-item').each((_i, el) => {
    const label = cleanText($(el).find('.info-label').text()).toLowerCase();
    const value = cleanText($(el).find('.info-value').text());
    if (label !== '' && value !== '') conditions.set(label, value);
  });
  return conditions;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const price = cleanText($('#conditionsContent .price-main').first().text());
  if (!/€\s*\/\s*mois/i.test(price)) return null;

  const conditions = readConditions($);
  const ld = listingLd($);
  const draft = fromLd(ld);
  const features = $('#infosContent .feature-item span')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .join(' · ');
  const title = cleanText($('h1.property-title').first().text());
  const dpe = cleanText($('.dpe-bar .energy-item.active').first().text());
  const imageUrls = propertyImages(html);
  const reference = /Référence\s*:\s*(\d+)/.exec(cleanText($('body').text()))?.[1];

  const extra: Record<string, string> = {};
  if (reference !== undefined) extra['reference'] = reference;
  const dpeLabel = energyLabel(dpe);
  if (dpeLabel !== undefined) extra['dpe'] = dpeLabel;
  const lease = conditions.get('durée du bail');
  if (lease !== undefined) extra['bail'] = lease;

  return {
    ...draft,
    title: title === '' ? ld?.name : title,
    priceText: price,
    chargesText: conditions.get('charges'),
    depositText: conditions.get('dépôt de garantie'),
    feesText: conditions.get('honoraires agence')?.replace(/\s*\*$/, ''),
    furnishedText: `${title} ${features} ${draft.description ?? ''}`,
    availableAtText: conditions.get('disponibilité'),
    agencyName: AGENCY_NAME,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
