/**
 * Source : Bien'ici — portail national, collecté par son API de recherche.
 *
 * POURQUOI CETTE SOURCE REVIENT. Elle avait été écartée le 2026-08-15, et pour
 * une bonne raison : `/recherche/…` sert une coquille vide de 5 Ko, sans une
 * seule annonce dans le HTML. Le verdict disait « SPA, réévaluer si un flux
 * apparaît ». Le flux était là — c'est la même adresse que celle qu'ouvre le
 * navigateur en arrivant sur la page, et elle rend du JSON.
 *
 * CE QUE DIT LE robots.txt, relu le 2026-09-08. Il interdit les chemins de
 * contact, `/*?mode=*`, `/recherche/*&*`, `/recherche/*,*`, `/annonces-*` et
 * tout ce qui porte `tri=`.
 * `/realEstateAds.json` n'y figure pas, et notre requête ne porte aucun de ces
 * paramètres. On ne contourne donc rien (§10) — même lecture que pour
 * l'API Studapart, seule autre source du projet collectée par ce moyen.
 *
 * CE QU'ELLE APPORTE, et c'est sans équivalent ici : 512 locations à Nice en
 * six requêtes, avec surface, DPE, quartier nommé, meublé, dépôt de garantie,
 * honoraires, date de parution ET nom de l'agence. Les autres portails du
 * projet n'arrivent que par digest e-mail, où l'annonce n'a ni surface fiable
 * ni adresse dans 181 cas sur 187.
 *
 * DEUX PRÉCAUTIONS, détaillées à leur place plus bas : la POSITION n'est
 * publiée que lorsque le site la déclare fiable, et le PRIX est charges
 * comprises — vérifié par l'arithmétique, pas supposé.
 */

import type { RawListing } from '@maioun/shared';
import { compactListing } from '../shared/raw-listing.js';

const SITE = 'https://www.bienici.com';
export const SEARCH_PATH = '/realEstateAds.json';

/** Identifiant de zone Bien'ici pour Nice, relevé via `suggest.json?q=nice`. */
export const NICE_ZONE_ID = '-170100';

/** L'API honore `size=100` ; six pages couvrent le stock niçois. */
export const PAGE_SIZE = 100;

/**
 * AU-DELÀ DE CE RAYON, ON NE PUBLIE PAS DE COORDONNÉES.
 *
 * Bien'ici DÉCLARE la précision de chaque position dans `blurInfo` : `exact`,
 * ou un disque dont il donne le rayon — 50 m, 100 m, ou 1 000 m quand il ne
 * situe le bien que dans la commune. Le troisième cas n'est pas une position
 * imprécise, c'est l'absence de position : à un kilomètre près, le temps de
 * trajet calculé (§20) est faux et le rapprochement « même endroit » (§14)
 * devient du hasard. On préfère ne rien dire (§17).
 */
const MAX_BLUR_RADIUS_M = 100;

/** Types de biens que le portail publie, dans le vocabulaire du normaliseur. */
const TYPE_FR: Readonly<Record<string, string>> = {
  flat: 'Appartement',
  house: 'Maison',
  loft: 'Loft',
  townhouse: 'Maison de ville',
  castle: 'Château',
  mansion: 'Hôtel particulier',
  chalet: 'Chalet',
  duplex: 'Duplex',
  parking: 'Parking',
  terrain: 'Terrain',
  others: '',
};

/**
 * Comptes que le portail tient pour des professionnels.
 *
 * `accountType` est le seul endroit du projet où particulier et professionnel
 * sont DITS plutôt que devinés dans le texte. On s'en sert pour ce qu'il est :
 * une déclaration de la source, reprise telle quelle (§17).
 */
const PRO_ACCOUNTS = new Set(['agency', 'mandatary', 'network', 'developer', 'pro']);

interface BlurInfo {
  readonly type?: string;
  readonly radius?: number;
  readonly position?: { readonly lat?: number; readonly lon?: number };
}

interface Photo {
  readonly url_photo?: string;
  readonly url?: string;
}

export interface BieniciAd {
  readonly id?: string;
  readonly reference?: string;
  readonly title?: string;
  readonly description?: string;
  readonly propertyType?: string;
  readonly price?: number;
  readonly charges?: number;
  readonly surfaceArea?: number;
  readonly roomsQuantity?: number;
  readonly bedroomsQuantity?: number;
  readonly isFurnished?: boolean;
  readonly city?: string;
  readonly postalCode?: string;
  readonly district?: { readonly name?: string };
  readonly blurInfo?: BlurInfo;
  readonly accountType?: string;
  readonly accountDisplayName?: string;
  readonly publicationDate?: string;
  readonly availableDate?: string;
  readonly energyClassification?: string;
  readonly floor?: number;
  readonly hasElevator?: boolean;
  readonly hasTerrace?: boolean;
  readonly hasCellar?: boolean;
  readonly hasPool?: boolean;
  readonly safetyDeposit?: number;
  readonly photos?: readonly Photo[];
}

/** L'URL d'une page de résultats, telle que le site l'appelle lui-même. */
export function buildSearchUrl(zoneId: string, page: number, size = PAGE_SIZE): string {
  const filters = {
    size,
    from: (page - 1) * size,
    filterType: 'rent',
    propertyType: ['flat', 'house'],
    page,
    sortBy: 'publicationDate',
    sortOrder: 'desc',
    onTheMarket: [true],
    zoneIdsByTypes: { zoneIds: [zoneId] },
  };
  return `${SITE}${SEARCH_PATH}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
}

/** Le texte d'une description HTML légère (`<br>`, `<span>`), sans balises. */
function plainText(html: string | undefined): string | undefined {
  if (html === undefined || html === '') return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return text === '' ? undefined : text;
}

/**
 * La position, seulement si la source la déclare assez précise.
 *
 * `exact` est cru sur parole ; un disque n'est retenu qu'en deçà de
 * `MAX_BLUR_RADIUS_M`. Rien d'autre ne passe.
 */
function positionOf(blur: BlurInfo | undefined): { lat: number; lon: number } | undefined {
  const lat = blur?.position?.lat;
  const lon = blur?.position?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  if (blur?.type === 'exact') return { lat, lon };
  const radius = blur?.radius;
  if (typeof radius === 'number' && radius <= MAX_BLUR_RADIUS_M) return { lat, lon };
  return undefined;
}

/**
 * Les photos, à leur adresse D'ORIGINE quand le portail la donne.
 *
 * Chaque cliché arrive en deux exemplaires : celui du logiciel de l'agence
 * (`img.netty.immo`, `apimo`…) et la copie de Bien'ici. On garde l'original —
 * c'est la vraie provenance (§11), et surtout c'est l'URL que publie AUSSI le
 * site de l'agence, que le projet collecte souvent en direct : deux annonces
 * qui la partagent sont le même bien (§14).
 */
function photoUrls(photos: readonly Photo[] | undefined): readonly string[] | undefined {
  if (photos === undefined) return undefined;
  const urls: string[] = [];
  for (const photo of photos) {
    const url = photo.url_photo ?? photo.url;
    if (typeof url === 'string' && url.startsWith('https://') && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls.length > 0 ? urls : undefined;
}

/** Les atouts que l'annonce déclare par un booléen, en toutes lettres. */
function featuresOf(ad: BieniciAd): string | undefined {
  const parts: string[] = [];
  if (ad.bedroomsQuantity !== undefined) parts.push(`${ad.bedroomsQuantity} chambres`);
  if (ad.floor !== undefined && ad.floor > 0) parts.push(`${ad.floor}e étage`);
  if (ad.hasElevator === true) parts.push('Ascenseur');
  if (ad.hasTerrace === true) parts.push('Terrasse');
  if (ad.hasCellar === true) parts.push('Cave');
  if (ad.hasPool === true) parts.push('Piscine');
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Transforme une annonce de l'API en `RawListing`. `null` si inexploitable. */
function toRawListing(ad: BieniciAd): RawListing | null {
  const id = ad.id;
  if (typeof id !== 'string' || id === '') return null;

  const position = positionOf(ad.blurInfo);
  const isPro = ad.accountType !== undefined && PRO_ACCOUNTS.has(ad.accountType);
  const typeText = ad.propertyType !== undefined ? (TYPE_FR[ad.propertyType] ?? '') : '';

  return compactListing({
    sourceRef: id,
    sourceUrl: `${SITE}/annonce/${id}`,
    title: ad.title,
    description: plainText(ad.description),
    /**
     * LE PRIX EST CHARGES COMPRISES, et ce n'est pas une supposition : trois
     * annonces du relevé du 2026-09-08 le démontrent par l'addition — « Loyer
     * hors charges: 785€ » pour `price: 900, charges: 115`. Le champ `charges`
     * dit la part incluse, il ne s'ajoute pas.
     */
    priceText: ad.price !== undefined ? `${ad.price} € CC` : undefined,
    chargesText: ad.charges !== undefined ? `${ad.charges} €` : undefined,
    areaText: ad.surfaceArea !== undefined ? `${ad.surfaceArea} m²` : undefined,
    roomsText: ad.roomsQuantity !== undefined ? `${ad.roomsQuantity} pièces` : undefined,
    propertyTypeText: `${typeText} ${ad.title ?? ''}`.trim(),
    furnishedText: ad.isFurnished === true ? 'meublé' : undefined,
    cityText: ad.city,
    postalCodeText: ad.postalCode,
    latitude: position?.lat,
    longitude: position?.lon,
    // Le nom du compte n'est repris comme agence que s'il EST une agence : un
    // particulier porté au champ « agence » ferait mentir `landlord` (§21).
    agencyName: isPro ? ad.accountDisplayName : undefined,
    contactFormUrl: `${SITE}/annonce/${id}`,
    publishedAtText: ad.publicationDate,
    availableAtText: ad.availableDate,
    imageUrls: photoUrls(ad.photos),
    extra: compactExtra({
      reference: ad.reference ?? id,
      quartier: ad.district?.name,
      dpe: ad.energyClassification,
      features: featuresOf(ad),
      landlord: ad.accountType === undefined ? undefined : isPro ? 'agency' : 'private',
    }),
  });
}

/** Retire les clés `undefined` d'un `extra` (voir `compactListing`). */
function compactExtra(
  draft: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface ParsedSearch {
  readonly listings: readonly RawListing[];
  readonly warnings: readonly string[];
  /** Nombre total d'annonces annoncé par l'API, pour borner la pagination. */
  readonly total: number | null;
}

/** Analyse une réponse `realEstateAds.json`. */
export function parseSearchResponse(body: string): ParsedSearch {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { listings: [], warnings: ['Réponse Bien’ici illisible (JSON invalide)'], total: null };
  }

  const payload = parsed as { total?: unknown; realEstateAds?: unknown };
  const ads = payload.realEstateAds;
  if (!Array.isArray(ads)) {
    return { listings: [], warnings: ['Réponse Bien’ici sans tableau d’annonces'], total: null };
  }

  const listings: RawListing[] = [];
  let skipped = 0;
  for (const ad of ads) {
    const listing = toRawListing(ad as BieniciAd);
    if (listing === null) skipped += 1;
    else listings.push(listing);
  }

  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`${skipped} annonce(s) Bien’ici sans identifiant, ignorée(s)`);

  return {
    listings,
    warnings,
    total: typeof payload.total === 'number' ? payload.total : null,
  };
}
