/**
 * Source : AFEDIM (afedim.fr), filiale de Crédit Mutuel Alliance Fédérale. Ses
 * locations sont gérées par AFEDIM Gestion, et presque toutes sont des
 * logements Pinel : loyer plafonné, locataire sous plafond de ressources.
 *
 * Le site tourne sur le cadre maison d'Euro-Information. Les pages sont
 * rendues côté serveur ET portent leurs données en JSON dans un script
 * (`$dv.I('…allProduits',function(){this._json=[…]`) : on lit ce JSON, pas le
 * balisage, qui est fait d'identifiants générés (`C:F4_4.P3`).
 *
 * La liste d'un département porte TOUT son stock dans ce JSON — 99 biens pour
 * la Loire-Atlantique, quand vingt cartes seulement sont affichées. Une seule
 * requête suffit donc à l'inventaire.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

const ORIGIN = 'https://www.afedim.fr';

/**
 * Toutes les locations des Alpes-Maritimes. C'est l'URL que le plan du site
 * publie lui-même ; « 0-100 m² » et « 1-5 pièces » y sont les bornes du
 * curseur, pas des filtres (la liste de Loire-Atlantique porte un 102 m²).
 */
export const LIST_URL =
  `${ORIGIN}/fr/location/annonces/Appartement-Maison-Parking-Garage/Alpes-Maritimes-France/` +
  '1-5-pieces/surface-0-100-m2/budget-0-20000-euros/rayon-0-km/disponible-/options-/Resultats';

/** `/fr/location/annonces/{nature}/{commune}-{dépt}/{pièces}/{réf}/Fiche` */
const FICHE_PATH =
  /^\/fr\/location\/annonces\/[^/]+\/([a-z0-9-]+)-(\d[\dab])\/[^/]+\/(\d+)\/Fiche$/i;

/**
 * Le JSON d'un script `$dv.I('<id>',function(){this._json=…` dont l'identifiant
 * se termine par `name`. `undefined` si le script est absent ou illisible.
 *
 * On découpe à la main, en suivant les chaînes : le JSON est suivi de code, et
 * une expression régulière s'arrêterait au premier `}` d'une description.
 */
export function readScriptJson(html: string, name: string): unknown {
  const head = new RegExp(`\\$dv\\.I\\('[^']*\\b${name}',function\\(\\)\\{this\\._json=`).exec(
    html,
  );
  if (head === null) return undefined;
  const start = head.index + head[0].length;
  const open = html[start];
  if (open !== '[' && open !== '{') return undefined;
  const close = open === '[' ? ']' : '}';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as unknown;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const cleaned = cleanText(value);
  return cleaned === '' ? undefined : cleaned;
};

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const euros = (value: unknown): string | undefined => {
  const amount = positive(value);
  return amount === undefined ? undefined : `${amount} €`;
};

/** Somme des montants positifs ; `undefined` s'il n'y en a aucun. */
function sumOf(...values: unknown[]): number | undefined {
  const amounts = values.map(positive).filter((v): v is number => v !== undefined);
  return amounts.length === 0 ? undefined : Math.round(amounts.reduce((a, b) => a + b) * 100) / 100;
}

/** « 3ème étage » → `3`, « 1er étage » → `1`, « Rez-de-chaussée » → `0`. */
export function floorOf(text: unknown): string | undefined {
  const value = str(text);
  if (value === undefined) return undefined;
  if (/rez.de.chauss/i.test(value)) return '0';
  return /^(\d{1,2})\s*(?:er|e|ème|eme)?\s+étage/i.exec(value)?.[1];
}

/** `/Date(1788818400000+0200)/` → date ISO. */
function dateOf(value: unknown): string | undefined {
  const ms = typeof value === 'string' ? /\/Date\((\d+)/.exec(value)?.[1] : undefined;
  return ms === undefined ? undefined : new Date(Number(ms)).toISOString();
}

/** Ce qu'on tire de l'URL d'une fiche, `null` si ce n'en est pas une. */
export function parseFicheUrl(
  path: string,
): { readonly citySlug: string; readonly department: string; readonly reference: string } | null {
  const match = FICHE_PATH.exec(path);
  if (match?.[1] === undefined || match[2] === undefined || match[3] === undefined) return null;
  return {
    citySlug: match[1].toLowerCase(),
    department: match[2].toLowerCase(),
    reference: match[3],
  };
}

export interface AfedimListItem {
  readonly listing: RawListing;
  readonly citySlug: string;
}

export interface ParsedAfedimList {
  /** `null` quand le JSON manque : la page a changé, ce n'est pas un stock vide. */
  readonly items: readonly AfedimListItem[] | null;
  readonly warnings: readonly string[];
}

/** Lit la liste d'un département. */
export function parseListPage(html: string, agencyName: string): ParsedAfedimList {
  const data = readScriptJson(html, 'allProduits');
  if (!Array.isArray(data)) {
    return { items: null, warnings: ['Liste AFEDIM : données « allProduits » introuvables'] };
  }

  const warnings: string[] = [];
  const items: AfedimListItem[] = [];
  for (const product of data) {
    if (!isObject(product)) continue;
    const path = str(product['UrlProduct']);
    const url = path === undefined ? null : parseFicheUrl(path);
    const reference = str(product['Reference']);
    if (url === null || reference === undefined || url.reference !== reference) {
      warnings.push(`Bien AFEDIM illisible : ${path ?? '(sans URL)'}`);
      continue;
    }

    const rooms = positive(product['NbrPieces']);
    const surface = positive(product['Surface']);
    const dpe = /\b([A-G])\s*$/.exec(str(product['PerfEnergetique']) ?? '')?.[1];
    const coords = isObject(product['Coordonnees']) ? product['Coordonnees'] : {};
    const image = str(product['ImagePath']);

    items.push({
      citySlug: url.citySlug,
      listing: compactListing({
        sourceRef: reference,
        sourceUrl: `${ORIGIN}${path}`,
        title: str(product['LibelleBien']),
        // Le « Prix » de la liste est celui de la fiche, « charges comprises ».
        priceText: positive(product['Prix']) !== undefined ? `${product['Prix']} € CC` : undefined,
        areaText: surface !== undefined ? `${surface} m²` : undefined,
        roomsText: rooms !== undefined ? `${rooms} pièces` : undefined,
        propertyTypeText: str(product['Nature']),
        ...furnished(product['EstMeuble']),
        cityText: str(product['Ville']),
        postalCodeText: str(product['CodePostal']),
        latitude: typeof coords['Latitude'] === 'number' ? coords['Latitude'] : undefined,
        longitude: typeof coords['Longitude'] === 'number' ? coords['Longitude'] : undefined,
        agencyName,
        contactFormUrl: `${ORIGIN}${path}`,
        publishedAtText: dateOf(product['DateCreation']),
        imageUrls: image !== undefined ? [image] : undefined,
        extra: compactExtra({
          reference,
          etage: floorOf(product['Etage']),
          dpe,
        }),
      }),
    });
  }
  return { items, warnings };
}

/** « N biens disponibles » affiché en tête de liste, pour vérifier le JSON. */
export function announcedCount(html: string): number | undefined {
  const match = /(\d+)\s+biens?\s+disponibles?/i.exec(html);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** Un booléen explicite de la source ; tout le reste vaut « inconnu ». */
function furnished(value: unknown): RawDraft {
  if (value === true) return { furnishedText: 'Meublé' };
  if (value === false) return { furnishedText: 'Non meublé' };
  return {};
}

function compactExtra(
  entries: Record<string, string | undefined>,
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) out[key] = value;
  return Object.keys(out).length === 0 ? undefined : out;
}

/** Textes d'une liste `[{ Text: "Ascenseur" }, …]` du JSON de la fiche. */
function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const text = isObject(entry) ? str(entry['Text']) : undefined;
    return text === undefined ? [] : [text];
  });
}

/**
 * Ce que la fiche apprend : texte entier, adresse de rue, charges, dépôt,
 * honoraires, DPE, photos, et l'état de la candidature en ligne.
 *
 * Le loyer n'y est PAS repris : la liste le donne à chaque passage, et la
 * mémoire des fiches le figerait. `null` si la page n'est pas la fiche
 * attendue — un bien retiré redirige vers « bien non trouvé ».
 */
export function parseDetail(html: string, expectedReference: string): RawDraft | null {
  const data = readScriptJson(html, 'DonneesBien');
  if (!isObject(data) || str(data['RefExtLot']) !== expectedReference) return null;

  const $ = cheerio.load(html);
  const programme = str(data['NomPgm']);
  const nom = str(data['Nom']);
  const description = cleanMultiline(
    typeof data['Commentaire'] === 'string' ? data['Commentaire'] : '',
  );
  const photos = Array.isArray(data['ListeCarouselElement'])
    ? data['ListeCarouselElement'].flatMap((photo) => {
        const url = isObject(photo) ? str(photo['PhotoMedium']) : undefined;
        return url === undefined ? [] : [url];
      })
    : [];
  const incomeCap = data['AvecConditionsRessources'] === true;
  const features = [
    ...texts(data['CaracteristiqueImmeubleList']),
    ...texts(data['CaracteristiqueBienList']),
    ...texts(data['AnnexesList']),
    ...texts(data['ConditionFinanciereList']),
    ...(incomeCap ? ['Location soumise à un plafond de ressources'] : []),
  ];

  return {
    title: programme !== undefined && nom !== undefined ? `${programme} - ${nom}` : undefined,
    description: description === '' ? undefined : description,
    chargesText: euros(data['ProviCharges']),
    depositText: euros(data['Garantie']),
    // Honoraires de location (10 €/m²) et d'état des lieux (3 €/m²) sont donnés
    // à part : le locataire paie les deux.
    feesText: euros(sumOf(data['HonLocLct'], data['HonEdlLct'])),
    addressText: str(data['AdresseComplete']),
    availableAtText: str(data['Disponibilite']),
    ...furnished(data['EstMeuble']),
    imageUrls: photos.length > 0 ? photos : undefined,
    phoneText: $('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/, '').trim(),
    extra: compactExtra({
      reference: expectedReference,
      dpe: str(data['IndiceDpe']),
      ges: str(data['IndiceGes']),
      etage: floorOf(data['Etage']),
      ascenseur: data['Ascenceur'] === true ? '1' : undefined,
      features: features.length > 0 ? features.join(' · ') : undefined,
      loyerHorsCharges: euros(data['Prix2']),
      plafondRessources: incomeCap ? 'oui' : undefined,
      regimeFiscal: str(data['RegimeFiscStr']),
      // Posé par la fiche : « le dépôt de nouvelles candidatures est
      // actuellement suspendu » quand `ArretDepotDossier` est vrai.
      applicationStatus:
        data['ArretDepotDossier'] === true
          ? 'full'
          : data['ArretDepotDossier'] === false
            ? 'open'
            : undefined,
    }),
  };
}
