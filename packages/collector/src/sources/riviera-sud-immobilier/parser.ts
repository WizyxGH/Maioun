/**
 * Riviera Sud Immobilier (rsi-immo.com) : site Next.js d'IWS Création.
 *
 * La page de liste embarque, dans son flux React Server Components
 * (`self.__next_f.push([1, "…"])`), les biens complets de la page : loyer
 * charges comprises et hors charges, honoraires, surface, pièces, meublé,
 * adresse, DPE, nombre de photos. Les fiches n'apprennent rien de plus : on
 * s'en passe. Le HTML ne sert qu'à retrouver le lien public de chaque bien.
 */

import type { RawListing } from '@maioun/shared';
import { dpeFromValues } from '../../normalization/parse-listing-fields.js';
import { cleanMultiline, cleanText, decodeEntities } from '../../normalization/text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

/** Catégorie IWS de la location à l'année (1 vente, 3 saisonnier). */
const RENTAL_CATEGORY = 2;

/** Libellés des types IWS, repris du dictionnaire du site. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  apartment: 'Appartement',
  'studio-apartment': 'Appartement T1 & Studio',
  '1-bedroom-apartment': 'Appartement T2',
  '2-bedroom-apartment': 'Appartement T3',
  '3-bedroom-apartment': 'Appartement T4',
  '4-and-more-bedroom-apartment': 'Appartement T5 & Plus',
  loft: 'Loft',
  house: 'Maison',
  villa: 'Villa',
  'townhouse-country-house': 'Maison de Village / Ville',
  'farm-bastide': 'Mas / Bastide',
  building: 'Immeuble',
  land: 'Terrain',
  'parking-space': 'Garage / Parking',
  office: 'Bureau',
  'commercial-property': 'Local commercial',
  warehouse: 'Entrepôt / Activité',
};

export interface IwsEstate {
  readonly id: number;
  readonly reference: number;
  readonly customerId: number;
  readonly categoryId: number;
  readonly typeId: number;
  readonly city?: string;
  readonly address?: string;
  readonly zipCode?: string;
  readonly roomsCount?: number;
  readonly bedroomsCount?: number;
  readonly livingArea?: number;
  readonly hasFurniture?: boolean;
  readonly picturesCount?: number;
  readonly price?: number;
  readonly priceNet?: number;
  readonly isPriceHidden?: boolean;
  readonly fees?: number;
  readonly epcEnergyLevel?: number;
  readonly epcEmissionsLevel?: number;
  readonly description?: string;
  readonly createdAt?: string;
}

export interface IwsListPage {
  readonly estates: readonly IwsEstate[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  /** Identifiant de type → nom IWS (`studio-apartment`). */
  readonly types: ReadonlyMap<number, string>;
}

/** Le flux RSC de la page, chaînes `__next_f` recollées. */
export function readFlightStream(html: string): string {
  let stream = '';
  for (const match of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      stream += JSON.parse(match[1] ?? '""') as string;
    } catch {
      // Un morceau illisible n'empêche pas de lire les autres.
    }
  }
  return stream;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Premier objet portant `estates.data` et `estates.meta`, en profondeur. */
function findEstatesProps(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 40 || typeof node !== 'object' || node === null) return null;
  if (isRecord(node)) {
    const estates = node['estates'];
    if (isRecord(estates) && Array.isArray(estates['data']) && isRecord(estates['meta'])) {
      return node;
    }
  }
  for (const child of Object.values(node)) {
    const found = findEstatesProps(child, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Biens et pagination de la page ; `null` si le flux n'en porte pas (gabarit changé). */
export function parseListPage(html: string): IwsListPage | null {
  for (const line of readFlightStream(html).split('\n')) {
    const row = /^[0-9a-f]+:(\[.*)$/.exec(line)?.[1];
    if (row === undefined || !row.includes('"estates"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row);
    } catch {
      continue;
    }
    const props = findEstatesProps(parsed);
    if (props === null) continue;
    const estates = props['estates'] as { data: unknown[]; meta: Record<string, unknown> };
    const params = isRecord(props['params']) ? props['params'] : {};
    const types = new Map<number, string>();
    for (const type of Array.isArray(props['types']) ? props['types'] : []) {
      if (isRecord(type) && typeof type['id'] === 'number' && typeof type['name'] === 'string') {
        types.set(type['id'], type['name']);
      }
    }
    return {
      estates: estates.data.filter(
        (estate): estate is IwsEstate =>
          isRecord(estate) &&
          typeof estate['reference'] === 'number' &&
          typeof estate['categoryId'] === 'number',
      ),
      total: asNumber(estates.meta['total'], 0),
      page: asNumber(estates.meta['page'], 1),
      limit: asNumber(params['limit'], 10),
      types,
    };
  }
  return null;
}

/** Liens des cartes par référence : `/fr/estate/…/1397-726945-1074376`. */
function cardLinks(html: string): Map<number, string> {
  const links = new Map<number, string>();
  for (const match of html.matchAll(/href="(\/fr\/estate\/[^"]*?-(\d+)-(\d+))"/g)) {
    const reference = Number(match[2]);
    if (!links.has(reference)) links.set(reference, decodeEntities(match[1] ?? ''));
  }
  return links;
}

/** Montant positif en euros, virgule décimale ; rien pour 0 ou absent. */
const euros = (amount: number | undefined): string | undefined =>
  amount !== undefined && amount > 0 ? `${String(amount).replace('.', ',')} €` : undefined;

/** DPE depuis les valeurs ; 2002 et 0 sont des bouche-trous de la plateforme. */
function dpeOf(estate: IwsEstate): string | undefined {
  const kwh = estate.epcEnergyLevel ?? 0;
  const co2 = estate.epcEmissionsLevel ?? -1;
  return kwh > 0 && kwh < 1000 && co2 >= 0 && co2 < 500 ? dpeFromValues(kwh, co2) : undefined;
}

/** Loyer CC, charges (écart avec le hors-charges) et honoraires. */
function moneyOf(estate: IwsEstate): RawDraft {
  const price = estate.isPriceHidden === true ? undefined : estate.price;
  const net = estate.priceNet ?? 0;
  const priceText = euros(price);
  return {
    priceText: priceText !== undefined ? `${priceText} CC / mois` : undefined,
    chargesText:
      price !== undefined && net > 0 ? euros(Math.round((price - net) * 100) / 100) : undefined,
    feesText: euros(estate.fees),
  };
}

/** Surface et pièces, quand la plateforme les renseigne. */
function sizeOf(estate: IwsEstate): RawDraft {
  const rooms = estate.roomsCount ?? 0;
  const bedrooms = estate.bedroomsCount ?? 0;
  return {
    areaText: (estate.livingArea ?? 0) > 0 ? `${estate.livingArea} m²` : undefined,
    roomsText:
      rooms > 0
        ? `${rooms} pièce${rooms > 1 ? 's' : ''}${bedrooms > 0 ? `, ${bedrooms} chambres` : ''}`
        : undefined,
  };
}

function listingOf(
  estate: IwsEstate,
  url: string,
  page: IwsListPage,
  origin: string,
  agencyName: string,
): RawListing {
  const typeName = page.types.get(estate.typeId);
  const description = cleanMultiline(estate.description);
  const firstLine = cleanText(description.split('\n')[0]);
  const imageUrls = Array.from(
    { length: Math.min(estate.picturesCount ?? 0, 30) },
    (_v, i) =>
      `${origin}/api/v2/estate-pictures/${estate.customerId}/${estate.reference}/${i + 1}.webp`,
  );
  const dpe = dpeOf(estate);
  return compactListing({
    sourceRef: String(estate.reference),
    sourceUrl: url,
    title: firstLine !== '' && firstLine.length <= 120 ? firstLine : undefined,
    description: description === '' ? undefined : description,
    ...moneyOf(estate),
    ...sizeOf(estate),
    propertyTypeText: typeName !== undefined ? (TYPE_LABELS[typeName] ?? typeName) : undefined,
    // `false` est aussi la valeur par défaut de la plateforme : il ne prouve rien.
    furnishedText: estate.hasFurniture === true ? 'meublé' : undefined,
    addressText: cleanText(estate.address) || undefined,
    cityText: cleanText(estate.city) || undefined,
    postalCodeText: estate.zipCode,
    agencyName,
    contactFormUrl: url,
    publishedAtText: estate.createdAt,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: {
      reference: `${estate.customerId}/${estate.reference}`,
      ...(dpe !== undefined ? { dpe } : {}),
    },
  });
}

/** Locations à l'année de la page, prêtes pour la normalisation. */
export function listingsOf(
  html: string,
  page: IwsListPage,
  origin: string,
  agencyName: string,
): RawListing[] {
  const links = cardLinks(html);
  return page.estates.flatMap((estate) => {
    const path = links.get(estate.reference);
    if (estate.categoryId !== RENTAL_CATEGORY || path === undefined) return [];
    return [listingOf(estate, `${origin}${path}`, page, origin, agencyName)];
  });
}
