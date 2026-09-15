/**
 * Liens vers la recherche des portails, déjà filtrée selon les critères du
 * compte.
 *
 * Créer une alerte sur Leboncoin, SeLoger ou Bien'ici demande de refaire sa
 * recherche chez eux : ville, loyer, surface, location. Ouvrir leur page avec
 * ces filtres déjà posés ne laisse qu'un geste, « créer une alerte ». On ne
 * fait QUE composer une adresse publique : rien n'est lu ni automatisé chez eux.
 *
 * Les formats sont ceux que ces sites affichent eux-mêmes dans la barre
 * d'adresse. S'ils changent, le lien ouvre une recherche moins filtrée, jamais
 * une erreur : chaque portail ignore un paramètre qu'il ne connaît pas.
 */

import type { FilterConfig } from './types.js';

export type PortalId = 'leboncoin' | 'seloger' | 'bienici';

/** Ce que les portails savent situer. Ajouter une commune = une ligne ici. */
interface Commune {
  readonly postalCode: string;
  readonly lat: number;
  readonly lng: number;
  /** Rayon Leboncoin, en mètres : de quoi couvrir la commune sans ses voisines. */
  readonly radius: number;
  /** Identifiant de lieu SeLoger, relevé dans ses propres adresses. */
  readonly seloger?: string;
  /** Segment d'URL Bien'ici, ex. « nice-06000 ». */
  readonly bienici: string;
  readonly label: string;
}

const COMMUNES: Readonly<Record<string, Commune>> = {
  nice: {
    label: 'Nice',
    postalCode: '06000',
    lat: 43.70313,
    lng: 7.26608,
    radius: 6000,
    seloger: 'AD08FR2038',
    bienici: 'nice-06000',
  },
  'saint laurent du var': {
    label: 'Saint-Laurent-du-Var',
    postalCode: '06700',
    lat: 43.6734,
    lng: 7.1904,
    radius: 3000,
    bienici: 'saint-laurent-du-var-06700',
  },
  'cagnes sur mer': {
    label: 'Cagnes-sur-Mer',
    postalCode: '06800',
    lat: 43.6637,
    lng: 7.1489,
    radius: 3500,
    bienici: 'cagnes-sur-mer-06800',
  },
  'villefranche sur mer': {
    label: 'Villefranche-sur-Mer',
    postalCode: '06230',
    lat: 43.704,
    lng: 7.3111,
    radius: 2000,
    bienici: 'villefranche-sur-mer-06230',
  },
  antibes: {
    label: 'Antibes',
    postalCode: '06600',
    lat: 43.5808,
    lng: 7.1239,
    radius: 5000,
    bienici: 'antibes-06600',
  },
  cannes: {
    label: 'Cannes',
    postalCode: '06400',
    lat: 43.5513,
    lng: 7.0128,
    radius: 4000,
    bienici: 'cannes-06400',
  },
};

function communeKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Les communes des critères que l'on sait situer, dans leur ordre. */
function knownCommunes(criteria: FilterConfig): Commune[] {
  return criteria.cities
    .map((city) => COMMUNES[communeKey(city)])
    .filter((commune): commune is Commune => commune !== undefined);
}

/** Un loyer ou une surface exploitable : positif et fini. */
function positive(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * Leboncoin : catégorie 10 (locations), bornes en « min-700 », lieu en
 * « Ville_codepostal__lat_lng_rayon ».
 */
export function leboncoinSearchUrl(criteria: FilterConfig): string {
  const params = new URLSearchParams({ category: '10' });
  const places = knownCommunes(criteria).map(
    (c) => `${c.label}_${c.postalCode}__${c.lat}_${c.lng}_${c.radius}`,
  );
  if (places.length > 0) params.set('locations', places.join(','));
  const low = positive(criteria.minPrice);
  const high = positive(criteria.maxPrice);
  if (low !== null || high !== null) params.set('price', `${low ?? 'min'}-${high ?? 'max'}`);
  const area = positive(criteria.minArea);
  if (area !== null) params.set('square', `${area}-max`);
  if (criteria.landlordFilter === 'private') params.set('owner_type', 'private');
  if (criteria.landlordFilter === 'agency') params.set('owner_type', 'pro');
  return `https://www.leboncoin.fr/recherche?${params.toString()}`;
}

/** SeLoger : formulaire « classified-search », lieux par identifiant maison. */
export function selogerSearchUrl(criteria: FilterConfig): string {
  const params = new URLSearchParams({
    distributionTypes: 'Rent',
    estateTypes: 'Apartment,House',
  });
  const places = knownCommunes(criteria)
    .map((c) => c.seloger)
    .filter((id): id is string => id !== undefined);
  if (places.length > 0) params.set('locations', places.join(','));
  const low = positive(criteria.minPrice);
  const high = positive(criteria.maxPrice);
  if (low !== null) params.set('priceMin', String(low));
  if (high !== null) params.set('priceMax', String(high));
  const area = positive(criteria.minArea);
  if (area !== null) params.set('spaceMin', String(area));
  return `https://www.seloger.com/classified-search?${params.toString()}`;
}

/**
 * Bien'ici : le lieu est dans le chemin, un seul par recherche — on prend la
 * première commune connue, les autres se font en une alerte de plus.
 */
export function bieniciSearchUrl(criteria: FilterConfig): string {
  const place = knownCommunes(criteria)[0];
  const params = new URLSearchParams();
  const low = positive(criteria.minPrice);
  const high = positive(criteria.maxPrice);
  if (low !== null) params.set('prix-min', String(low));
  if (high !== null) params.set('prix-max', String(high));
  const area = positive(criteria.minArea);
  if (area !== null) params.set('surface-min', String(area));
  if (criteria.furnishedFilter === 'furnished') params.set('meuble', 'oui');
  if (criteria.furnishedFilter === 'unfurnished') params.set('meuble', 'non');
  const path = place === undefined ? '' : `/${place.bienici}`;
  const query = params.toString();
  return `https://www.bienici.com/recherche/location${path}${query === '' ? '' : `?${query}`}`;
}

export function portalSearchUrl(portal: PortalId, criteria: FilterConfig): string {
  if (portal === 'leboncoin') return leboncoinSearchUrl(criteria);
  if (portal === 'seloger') return selogerSearchUrl(criteria);
  return bieniciSearchUrl(criteria);
}

/**
 * `true` quand une ville des critères n'a pas pu être posée sur ce portail :
 * l'écran le dit, pour qu'on la choisisse chez eux avant de créer l'alerte.
 */
export function portalMissesCity(portal: PortalId, criteria: FilterConfig): boolean {
  const cities = criteria.cities.filter((city) => city.trim() !== '');
  const known = knownCommunes(criteria);
  if (portal === 'seloger')
    return known.filter((c) => c.seloger !== undefined).length < cities.length;
  if (portal === 'bienici') return cities.length > 0 && (known.length === 0 || cities.length > 1);
  return known.length < cities.length;
}
