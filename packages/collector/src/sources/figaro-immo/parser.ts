/**
 * Source : Figaro Immobilier (immobilier.lefigaro.fr), portail qui relaie les
 * annonces d'agences et celles de LocService.
 *
 * LISTES SEULES. Le robots.txt ferme `/annonce/`, `/rest/`, `/s/`, les
 * paramètres `?pagination=` et toute querystring sous `/annonces/` SAUF
 * `page=` : on lit donc les pages de résultats et leur pagination `?page=N`,
 * rien d'autre. Ce n'est pas une perte : la liste porte la description
 * entière, toutes les photos, le DPE, l'agence et son téléphone.
 *
 * ANCRAGE : l'état Nuxt embarqué (`__NUXT_DATA__`), plus riche que le JSON-LD
 * de la page, qui ne donne ni loyer, ni agence, ni DPE, et coupe la
 * description à 120 caractères.
 */

import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { readNuxtData } from '../shared/nuxt-data.js';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

export const ORIGIN = 'https://immobilier.lefigaro.fr';

/**
 * Les recherches lues. « appartement » comprend les chambres (sept sur sept
 * retrouvées dans la recherche « chambre » au relevé du 2026-09-15) ; les
 * maisons et villas ont la leur. « bien » les réunit mais ajoute parkings et
 * bureaux, pour trois pages de plus.
 */
export const SEARCHES = ['appartement', 'maison'] as const;
export type FigaroSearch = (typeof SEARCHES)[number];

/**
 * URL de la page N d'une recherche à Nice.
 *
 * « nice+06000 » est la page de la VILLE : elle porte aussi les 06100, 06200
 * et 06300. La forme sans code postal répond 410.
 */
export function listUrl(search: FigaroSearch, page: number): string {
  const base = `${ORIGIN}/annonces/immobilier-location-${search}-nice+06000.html`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

export interface FigaroPage extends ParsedList {
  /** Nombre d'annonces que la recherche annonce, toutes pages confondues. */
  readonly total: number | null;
  readonly hasNext: boolean;
}

/** Libellés des types du portail, dans le vocabulaire du normaliseur. */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  appartement: 'Appartement',
  maison: 'Maison',
  villa: 'Villa',
  chambre: 'Chambre',
  studio: 'Studio',
  loft: 'Loft',
  duplex: 'Duplex',
  parking: 'Parking',
  bureau: 'Bureau',
  local_commercial: 'Local commercial',
  terrain: 'Terrain',
};

/**
 * Équipements retenus parmi les `options`. Les autres sont des étiquettes de
 * recherche (« petit_prix », « etudiant », « colocation »…) : « colocation »
 * recopié ferait passer un logement entier pour une chambre partagée.
 */
const OPTION_LABELS: Readonly<Record<string, string>> = {
  terrasse: 'Terrasse',
  balcon: 'Balcon',
  ascenseur: 'Ascenseur',
  climatisation: 'Climatisation',
  interphone: 'Interphone',
  digicode: 'Digicode',
  visiophone: 'Visiophone',
  gardien: 'Gardien',
  alarme: 'Alarme',
  cave: 'Cave',
  garage: 'Garage',
  parking: 'Parking',
  piscine: 'Piscine',
  jardin: 'Jardin',
  rez_de_jardin: 'Rez-de-jardin',
  plain_pied: 'Plain-pied',
  sous_sol: 'Sous-sol',
  vue_degagee: 'Vue dégagée',
  cheminee: 'Cheminée',
  dependance: 'Dépendance',
  salle_d_eau: 'Salle d’eau',
  salle_de_bain: 'Salle de bains',
};

type Obj = Readonly<Record<string, unknown>>;

const asObj = (value: unknown): Obj | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : undefined;

const asStr = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return clean === '' ? undefined : clean;
};

const asPositive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/** La réponse de recherche dans l'état Nuxt, où qu'elle soit rangée. */
function listResponseOf(state: unknown): Obj | undefined {
  const data = asObj(asObj(state)?.['data']);
  return asObj(data?.['classifiedsListResponse']);
}

function photosOf(images: Obj | undefined): string[] | undefined {
  const photos = images?.['photos'];
  if (!Array.isArray(photos)) return undefined;
  const ordered = photos
    .map((photo) => asObj(photo))
    .filter((photo): photo is Obj => photo !== undefined)
    .sort((a, b) => Number(a['order'] ?? 0) - Number(b['order'] ?? 0));
  const urls: string[] = [];
  for (const photo of ordered) {
    const url = asStr(asObj(photo['url'])?.['medium']);
    if (url?.startsWith('https://') === true && !urls.includes(url)) urls.push(url);
  }
  return urls.length > 0 ? urls : undefined;
}

function featuresOf(options: unknown): string | undefined {
  if (!Array.isArray(options)) return undefined;
  const labels = options
    .map((option) => (typeof option === 'string' ? OPTION_LABELS[option] : undefined))
    .filter((label): label is string => label !== undefined);
  return labels.length > 0 ? [...new Set(labels)].join(' · ') : undefined;
}

/**
 * Le quartier, quand il est crédible.
 *
 * Les annonces relayées de LocService sont TOUTES posées au même point, et
 * donc au même quartier (Saint-Pierre-de-Féric pour neuf sur neuf) : c'est
 * une position par défaut, pas une adresse. Un quartier que le portail a lu
 * dans le texte (`isAiDistrict`) reste valable.
 */
function districtOf(location: Obj | undefined, isPrivate: boolean): string | undefined {
  const district = asStr(location?.['district']);
  if (district === undefined) return undefined;
  return location?.['isAiDistrict'] === true || !isPrivate ? district : undefined;
}

const plural = (count: number, word: string): string => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Type, pièces et chambres, et le titre qu'ils composent. */
function shapeOf(classified: Obj): {
  typeLabel: string;
  title: string | undefined;
  areaText: string | undefined;
  roomsText: string | undefined;
} {
  const type = asStr(classified['type']) ?? '';
  const typeLabel = TYPE_LABELS[type] ?? cleanText(type.replace(/_/g, ' '));
  const area = asPositive(classified['area']);
  const roomCount = Array.isArray(classified['roomCount'])
    ? asPositive(classified['roomCount'][0])
    : undefined;
  const bedrooms = asPositive(classified['bedRoomCount']);
  const rooms = roomCount !== undefined ? plural(roomCount, 'pièce') : undefined;
  const areaText = area !== undefined ? `${area} m²` : undefined;
  const title = [typeLabel, rooms, areaText].filter(Boolean).join(' ');
  const roomsText = [rooms, bedrooms !== undefined ? plural(bedrooms, 'chambre') : undefined]
    .filter(Boolean)
    .join(', ');
  return {
    typeLabel,
    title: title !== '' ? title : undefined,
    areaText,
    roomsText: roomsText !== '' ? roomsText : undefined,
  };
}

/**
 * L'agence et ses coordonnées. Un particulier relayé porte le nom du relais
 * (LocService) : ce n'est pas son agence, on le garde à part.
 */
function contactOf(classified: Obj): {
  agencyName?: string | undefined;
  phoneText?: string | undefined;
  emailText?: string | undefined;
  landlord: string | undefined;
  relais: string | undefined;
} {
  const client = asObj(classified['client']);
  const origin = asStr(classified['origin']);
  const name = asStr(client?.['name']);
  if (origin === 'particulier') return { landlord: 'private', relais: name };
  return {
    agencyName: name,
    phoneText: asStr(client?.['phoneNumber']),
    emailText: asStr(client?.['email']),
    landlord: origin === 'professionnel' ? 'agency' : undefined,
    relais: undefined,
  };
}

/** L'ancien loyer, seulement quand il était plus haut. */
function previousPriceOf(classified: Obj, price: number | undefined): string | undefined {
  const before = asPositive(classified['priceBefore']);
  return before !== undefined && price !== undefined && before > price ? `${before} €` : undefined;
}

/** Une annonce de la liste, ou `null` si ce n'est pas une location lisible. */
function toListing(classified: Obj): RawListing | null {
  const id = asStr(classified['id']);
  if (id === undefined || !/^\d+$/.test(id)) return null;
  if (asStr(classified['transaction']) !== 'location') return null;

  const shape = shapeOf(classified);
  const price = asPositive(classified['price']);
  const location = asObj(classified['location']);
  const { landlord, relais, ...contact } = contactOf(classified);
  const dpe = asStr(asObj(classified['dpe'])?.['energyCategory']);
  const recordLink = asStr(classified['recordLink']);
  // L'annonce s'ouvre chez le portail ; on n'y renvoie que sur son domaine.
  const sourceUrl =
    recordLink?.startsWith(`${ORIGIN}/`) === true
      ? recordLink
      : `${ORIGIN}/annonces/annonce-${id}.html`;

  return compactListing({
    sourceRef: id,
    sourceUrl,
    title: shape.title,
    description: asStr(classified['description']),
    /**
     * CHARGES COMPRISES : onze descriptions du relevé du 2026-09-15 écrivent
     * « charges comprises » du même montant que `price`, dont « 555 € hors
     * charges + 65 € de charges soit 620 € » pour `price: 620`. Deux agences
     * y mettent pourtant un hors charges ; la description les trahit.
     */
    priceText: price !== undefined ? `${price} € CC` : undefined,
    areaText: shape.areaText,
    roomsText: shape.roomsText,
    propertyTypeText: shape.typeLabel !== '' ? shape.typeLabel : undefined,
    // « Nice (06) » : le département n'est pas le nom de la ville.
    cityText: asStr(location?.['city'])?.replace(/\s*\(\d{2,3}\)$/, ''),
    postalCodeText: asStr(location?.['postalCode']),
    // Les coordonnées publiées sont le centre-ville ou un point par défaut :
    // elles ne situent pas le bien, on ne les reprend pas.
    ...contact,
    contactFormUrl: sourceUrl,
    publishedAtText: asStr(classified['firstPublicationDate']) ?? asStr(classified['creationDate']),
    imageUrls: photosOf(asObj(classified['images'])),
    extra: compactExtra({
      reference: asStr(classified['reference']),
      quartier: districtOf(location, landlord === 'private'),
      dpe: dpe !== undefined && /^[A-G]$/.test(dpe) ? dpe : undefined,
      features: featuresOf(classified['options']),
      landlord,
      previousPrice: previousPriceOf(classified, price),
      updatedAt: asStr(classified['updatedAt']),
      relais,
    }),
  });
}

function compactExtra(
  entries: Readonly<Record<string, string | undefined>>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) out[key] = value;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Extrait les annonces d'une page de résultats. */
export function parseListPage(html: string): FigaroPage {
  const response = listResponseOf(readNuxtData(html));
  if (response === undefined) {
    return {
      listings: [],
      warnings: ['État Nuxt introuvable : gabarit changé ?'],
      total: null,
      hasNext: false,
    };
  }

  const listings: RawListing[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const classifieds = Array.isArray(response['classifieds']) ? response['classifieds'] : [];
  for (const item of classifieds) {
    const classified = asObj(item);
    if (classified === undefined) continue;
    const listing = toListing(classified);
    if (listing === null) {
      warnings.push(`Annonce ignorée : ${asStr(classified['id']) ?? 'sans identifiant'}`);
      continue;
    }
    if (seen.has(listing.sourceRef)) continue;
    seen.add(listing.sourceRef);
    listings.push(listing);
  }

  const total = typeof response['total'] === 'number' ? response['total'] : null;
  const pagination = asObj(response['pagination']);
  const current = pagination?.['currentPage'];
  const last = pagination?.['totalPage'];
  const hasNext =
    typeof current === 'number' && typeof last === 'number'
      ? current < last
      : /<link\b[^>]*\brel="next"/.test(html);

  return { listings, warnings, total, hasNext };
}
