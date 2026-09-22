/**
 * Source : lesiteimmo.com — portail régional PACA. Demandé par son nom.
 *
 * SON SITEMAP MENT PAR OMISSION, et c'est la troisième source de suite à le
 * faire. `sitemap-annonces.xml.gz` ne liste que SEPT locations niçoises ; la
 * page publique `/louer/appartement/nice-06000` en annonce **255**. Le sitemap
 * n'est pas un inventaire, c'est une déclaration — 123Loger et Square Habitat
 * avaient déjà coûté cette leçon.
 *
 * LA PAGE PORTE TOUT, EN JSON-LD. Un bloc `CollectionPage` dont `mainEntity`
 * est la liste des annonces affichées, chacune avec son loyer, ses pièces, ses
 * chambres, sa surface, sa description ENTIÈRE, ses photos, son adresse, sa
 * DATE DE PUBLICATION et l'AGENCE qui la publie. C'est la source la mieux
 * renseignée du projet, et elle ne demande aucune visite de fiche.
 *
 * LES DEUX CHAMPS QUI VALENT LE DÉTOUR :
 *
 *   - `datePosted` : la date de publication manque aux deux tiers de nos
 *     fiches, et c'est elle que le tri « plus récentes » préfère ;
 *   - `seller.name` : le nom de l'agence, qui rapproche l'annonce de la source
 *     d'origine quand nous la collectons déjà (voir le signal `relayedAgency`
 *     du dédoublonnage) et nomme les agences qui nous manquent.
 *
 * `robots.txt` (vérifié le 2026-09-22) ferme `/recherche`, `/recherche-avancee`,
 * `/recherche-agences`, `/api`, `/a/`, `/honoraires` et `/index.php`. Les
 * chemins `/louer/…` et leur pagination `?page=N` restent ouverts.
 *
 * DE SECONDE MAIN POUR L'ESSENTIEL, et il faut le dire : sur trois annonces
 * niçoises examinées, deux venaient d'agences que nous lisons déjà en direct
 * (Optimmo, Agir). La troisième venait de Sixième Avenue, dont le site répond
 * 403 — et pour celle-là, ce portail est le SEUL chemin conforme.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

/** L'identifiant du bien, en queue de l'URL de la fiche. */
const REFERENCE = /\/(\d{6,})\/?$/;

interface Offer {
  readonly price?: unknown;
}
interface Offered {
  readonly numberOfRooms?: unknown;
  readonly numberOfBedrooms?: unknown;
  readonly floorSize?: { readonly value?: unknown };
}
interface Seller {
  readonly name?: unknown;
}
interface Address {
  readonly addressLocality?: unknown;
  readonly postalCode?: unknown;
}
interface Item {
  readonly '@type'?: unknown;
  readonly name?: unknown;
  readonly description?: unknown;
  readonly url?: unknown;
  readonly image?: unknown;
  readonly datePosted?: unknown;
  readonly address?: Address;
  readonly offers?: Offer;
  readonly itemOffered?: Offered;
  readonly seller?: Seller;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Les annonces déclarées par la page, quelle que soit la profondeur du JSON-LD.
 *
 * On cherche l'`ItemList` plutôt que de suivre un chemin fixe : le portail l'a
 * déjà déplacée une fois sous `mainEntity`, et un chemin en dur se serait tu.
 */
export function listedItems(html: string): Item[] {
  const $ = cheerio.load(html);
  const found: Item[] = [];
  $('script[type="application/ld+json"]').each((_, node) => {
    let data: unknown;
    try {
      data = JSON.parse($(node).text());
    } catch {
      return;
    }
    collect(data, found);
  });
  return found;
}

function collect(node: unknown, out: Item[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record['@type'] === 'RealEstateListing' && typeof record['url'] === 'string') {
    out.push(record as Item);
    return;
  }
  for (const value of Object.values(record)) collect(value, out);
}

/** Le total ANNONCÉ par la page — il dit combien de pages il reste à lire. */
export function announcedTotal(html: string): number | null {
  const match = /(\d[\d\s  ]*)\s*annonces/i.exec(cheerio.load(html)('body').text());
  if (match?.[1] === undefined) return null;
  const parsed = Number.parseInt(match[1].replace(/[\s  ]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param cityAllowed le périmètre, jugé sur le NOM de la commune : Nice a
 *   quatre codes postaux, et la pagination mélange parfois les voisines.
 */
export function parseListPage(
  html: string,
  cityAllowed: (city: string) => boolean,
): ParsedList & { readonly total: number | null } {
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  let horsPerimetre = 0;

  for (const item of listedItems(html)) {
    const url = text(item.url);
    const reference = url === undefined ? undefined : REFERENCE.exec(url)?.[1];
    if (url === undefined || reference === undefined) continue;

    const city = text(item.address?.addressLocality);
    if (city === undefined || !cityAllowed(city)) {
      horsPerimetre += 1;
      continue;
    }

    const area = num(item.itemOffered?.floorSize?.value);
    const rooms = num(item.itemOffered?.numberOfRooms);
    const price = num(item.offers?.price);
    const images = Array.isArray(item.image)
      ? item.image.filter((src): src is string => typeof src === 'string')
      : [];

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl: url,
        title: text(item.name),
        description: text(item.description),
        priceText: price === undefined ? undefined : `${price} €`,
        areaText: area === undefined ? undefined : `${area} m²`,
        roomsText: rooms === undefined ? undefined : `${rooms} pièces`,
        cityText: city,
        postalCodeText: text(item.address?.postalCode),
        // LA DATE DE PUBLICATION, qui manque aux deux tiers de nos fiches.
        publishedAtText: text(item.datePosted),
        // L'AGENCE, qui rattache l'annonce à la source d'origine.
        agencyName: text(item.seller?.name),
        ...(images.length > 0 ? { imageUrls: images } : {}),
      }),
    );
  }

  if (horsPerimetre > 0) {
    warnings.push(`${horsPerimetre} annonce(s) hors périmètre écartées`);
  }
  return { listings, warnings, total: announcedTotal(html) };
}
