/**
 * Immobilière Pujol — agence marseillaise, avec un portefeuille niçois.
 *
 * DIX-HUIT ANNONCES SUR QUATRE MILLE SIX CENT QUATRE-VINGT-UNE concernent Nice.
 * C'est peu, et c'est mieux que zéro : deux sont des locations en cours, les
 * seize autres sont clôturées et portent le loyer RÉELLEMENT OBTENU, à une
 * adresse exacte. Le projet n'a rien d'autre de cette nature — partout
 * ailleurs, il ne voit que des loyers demandés.
 *
 * LE TITRE MENT SUR LA VILLE, et c'est le piège de cette source. Le gabarit du
 * site écrit « Appartement T2 à louer, 06300, Marseille » sur un bien qui est
 * à Nice — l'agence est marseillaise, et son modèle de page l'a figé. Le code
 * postal, lui, est juste. On ne lit donc JAMAIS la ville dans le titre : elle
 * vient de l'adresse de la fiche, qui se termine par la commune.
 *
 * TOUT LE RESTE VIENT DU JSON-LD `Accommodation` : loyer, surface, pièces,
 * adresse de rue, photos. Deux exceptions cependant. Sa `availability` annonce
 * `InStock` même sur un bien loué : la clôture se lit dans la page, où elle
 * est écrite en toutes lettres. Et sa `description` est coupée à 500
 * caractères, balises `<BR>` brutes comprises : le texte entier se lit dans
 * le corps de la fiche.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing } from '../shared/raw-listing.js';

const ORIGIN = 'https://www.immobiliere-pujol.fr';

/** Les cinq plans de site qui énumèrent les annonces. */
export const SITEMAPS = [1, 2, 3, 4, 5].map((n) => `${ORIGIN}/ads-sitemap${n}.xml`);

/** Codes postaux de Nice, seuls retenus. */
const NICE_POSTAL = /\b(06000|06100|06200|06300)\b/;

/**
 * Une annonce niçoise dans un plan de site.
 *
 * LE CODE POSTAL DE L'ADRESSE N'EST PAS FIABLE : le site écrit « 6000 » sans
 * son zéro de tête, et « 0600 » ailleurs. On ne retient donc de l'adresse que
 * la COMMUNE, qui s'y trouve en toutes lettres ; le code postal est lu plus
 * tard dans le titre de la fiche, où il est correct.
 */
export function niceListingUrls(sitemapXml: string): readonly string[] {
  const urls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1] ?? '');
  return urls.filter((u) => /\/annonces\/[^/]*-nice(?:-france)?\/?$/i.test(u));
}

/** La référence de l'agence, en tête du chemin : `l003048`, `1089neot`. */
export function referenceOf(url: string): string | null {
  return /\/annonces\/([a-z0-9]+)-/i.exec(url)?.[1]?.toLowerCase() ?? null;
}

/** Contenu d'une balise `meta`, ou `''`. */
function meta(html: string, name: string): string {
  return (
    new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`, 'i').exec(html)?.[1] ?? ''
  );
}

/** Rend les entités d'un attribut HTML. */
function decode(text: string): string {
  return text
    .replace(/&#0?39;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Le nœud `Accommodation` du JSON-LD, s'il existe. */
interface Accommodation {
  readonly name?: string;
  readonly description?: string;
  readonly floorSize?: { readonly value?: number };
  readonly numberOfRooms?: number;
  readonly address?: { readonly streetAddress?: string };
  readonly offers?: { readonly price?: number };
  readonly image?: string | readonly string[];
}

function accommodation(html: string): Accommodation | null {
  for (const block of html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed: unknown = JSON.parse(block[1] ?? '');
      const nodes = Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
        ? ((parsed as { '@graph': unknown[] })['@graph'] as Record<string, unknown>[])
        : [parsed as Record<string, unknown>];
      for (const node of nodes) {
        if (node['@type'] === 'Accommodation') return node as Accommodation;
      }
    } catch {
      // Un bloc illisible n'empêche pas de lire les suivants.
    }
  }
  return null;
}

/**
 * `true` si la fiche annonce que le bien N'EST PLUS à louer.
 *
 * On lit la PAGE et non le JSON-LD : celui-ci déclare `InStock` même sur un
 * bien loué depuis des années, tandis que le bandeau, lui, dit la vérité.
 */
export function isClosed(html: string): boolean {
  return /Location\s+cl[oô]tur[ée]e|Ce bien a [ée]t[ée] lou[ée]/i.test(html);
}

/**
 * La description ENTIÈRE, retours à la ligne compris.
 *
 * Le bloc `.annonce-desc` porte tout le texte ; le JSON-LD n'en garde que
 * 500 caractères, et ne sert que si le gabarit perd ce bloc.
 */
export function descriptionOf(html: string, jsonLd: string | undefined): string | undefined {
  const body = htmlToText(cheerio.load(html), '.annonce-desc');
  if (body !== '') return body;
  if (jsonLd === undefined) return undefined;
  return cleanMultiline(jsonLd.replace(/<br\s*\/?>/gi, '\n')) || undefined;
}

export interface PujolListing {
  readonly listing: RawListing;
  /** `true` quand la fiche porte le bandeau de clôture. */
  readonly closed: boolean;
}

/** Une fiche complète. `null` si la page ne porte pas d'annonce exploitable. */
export function parseDetail(html: string, url: string): PujolListing | null {
  const reference = referenceOf(url);
  const bien = accommodation(html);
  if (reference === null || bien === null) return null;

  const price = bien.offers?.price;
  const area = bien.floorSize?.value;
  if (typeof price !== 'number' && typeof area !== 'number') return null;

  // Le code postal vient du TITRE, où il est juste — jamais de l'adresse, qui
  // perd son zéro de tête. La ville, elle, vient de l'adresse.
  const postalCode = NICE_POSTAL.exec(decode(meta(html, 'og:title')))?.[1];
  const photos = [
    ...new Set(
      html.match(/https:\/\/pub-[a-z0-9]+\.r2\.dev\/[^"'\s]+\.(?:jpe?g|png|webp)/gi) ?? [],
    ),
    // Le logo de l'agence vit sur le même serveur : il n'illustre aucun bien.
  ].filter((u) => !/logo/i.test(u));

  const $ = cheerio.load(html);
  const details = definitionList($);
  const dpe = /classe\s+([A-G])\b/.exec(
    $('svg[aria-label^="Performance énergétique"]').first().attr('aria-label') ?? '',
  )?.[1];
  // « 7-9, rue de Dijon, 6100 Nice — Vernier » : le quartier suit le tiret long,
  // parfois redoublé de la commune (« Thiers Nice »).
  const district = /\s[—–]\s*(.+)$/
    .exec(cleanText($('.annonce-hero__loc').first().text()))?.[1]
    ?.replace(/\s+Nice$/i, '');

  return {
    closed: isClosed(html),
    listing: compactListing({
      chargesText: details.get('dont charges') ?? details.get('charges'),
      depositText: details.get('dépôt de garantie'),
      feesText: details.get("honoraires d'agence (ttc)"),
      furnishedText: furnishedOf(details.get('meublé')),
      sourceRef: reference,
      sourceUrl: url,
      title: bien.name !== undefined ? decode(bien.name) : undefined,
      description: descriptionOf(html, bien.description),
      priceText: typeof price === 'number' ? `${price} €` : undefined,
      areaText: typeof area === 'number' ? `${area} m²` : undefined,
      roomsText:
        typeof bien.numberOfRooms === 'number' ? `${bien.numberOfRooms} pièces` : undefined,
      propertyTypeText: bien.name !== undefined ? decode(bien.name) : undefined,
      addressText: bien.address?.streetAddress,
      cityText: 'Nice',
      postalCodeText: postalCode,
      agencyName: 'Immobilière Pujol',
      contactFormUrl: url,
      imageUrls: photos.length > 0 ? photos : undefined,
      // Pas de `reference` : `reference` est l'identifiant d'URL, pas une
      // référence publiée par l'agence (§17).
      extra: compactExtra({ dpe, quartier: district }),
    }),
  };
}

/**
 * Les listes `dt`/`dd` de la fiche — « Caractéristiques techniques »,
 * « Aspects financiers » —, libellé en minuscules. L'ancien gabarit des
 * annonces clôturées écrit les mêmes paires.
 */
function definitionList($: cheerio.CheerioAPI): Map<string, string> {
  const pairs = new Map<string, string>();
  $('dl dt').each((_i, dt) => {
    const label = cleanText($(dt).text()).toLowerCase().replace(/[’`]/g, "'");
    const value = cleanText($(dt).next('dd').text());
    if (label !== '' && value !== '' && !pairs.has(label)) pairs.set(label, value);
  });
  return pairs;
}

/** « Meublé : Oui / Non » de la fiche, dans les mots que la normalisation lit. */
function furnishedOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (/^oui$/i.test(value)) return 'Meublé';
  if (/^non$/i.test(value)) return 'Non meublé';
  return undefined;
}

function compactExtra(extra: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(extra).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
