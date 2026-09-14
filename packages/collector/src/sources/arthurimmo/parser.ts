/**
 * Arthurimmo — agence de Nice du réseau (groupenicetransactions).
 *
 * DEUX ÉTAPES, ET C'EST LA PAGE DE LISTE QUI L'IMPOSE. Son balisage est du
 * Tailwind engendré, sans classe stable à quoi s'accrocher : une carte n'y est
 * qu'une pile de `flex items-center`. La seule chose solide qu'elle porte est
 * l'ADRESSE CANONIQUE de chaque fiche, qui dit déjà la transaction, le type et
 * la commune :
 *
 *   /annonces/location/appartement/nice-06000/33699516.htm
 *
 * On y lit donc les liens, et rien d'autre. Tout le reste vient de la fiche,
 * dont l'en-tête est autrement plus lisible que son corps.
 *
 * LE TITRE SOCIAL PORTE TOUT, d'un seul tenant et dans un ordre constant :
 *
 *   « Louer appartement de 5 pièces 128 m² 2 950 € à Nice (06000) : … »
 *
 * C'est un texte composé par le site pour être lu par des machines, pas un
 * titre saisi par un agent — il ne varie donc pas d'une annonce à l'autre, là
 * où le titre visible, lui, est libre.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { htmlToText } from '../shared/html-text.js';
import { compactListing } from '../shared/raw-listing.js';

const ORIGIN = 'https://groupenicetransactions.arthurimmo.com';

/** La recherche est le SEUL chemin qui liste : les chemins nus rendent zéro. */
export const LIST_URL = `${ORIGIN}/recherche,basic.htm?transactions=louer`;

/**
 * Les espaces que le site glisse entre les milliers, en ÉCHAPPEMENT.
 *
 * « 2 950 » est séparé par une insécable, invisible à la relecture et refusée
 * par le linter — qui a raison : un caractère qu'on ne voit pas est un
 * caractère qu'on ne corrige pas. On couvre l'insécable ordinaire et la fine.
 */
const THIN_SPACES = '\\s\\u00a0\\u202f';

/**
 * Forme d'une adresse de fiche en LOCATION.
 *
 * `location` est exigé dans le chemin : la même page de résultats sert aussi
 * les ventes quand on change de paramètre, et une vente collectée serait
 * écartée plus loin, mais après avoir coûté une requête.
 */
const DETAIL_URL =
  /https:\/\/[a-z0-9.-]*arthurimmo\.com\/annonces\/location\/[a-z-]+\/([a-z-]+)-(\d{5})\/(\d{4,})\.htm/gi;

export interface ArthurimmoLink {
  readonly url: string;
  readonly reference: string;
  readonly city: string;
  readonly postalCode: string;
}

/** Les fiches de location listées par la page de résultats, dédoublonnées. */
export function parseListPage(html: string): readonly ArthurimmoLink[] {
  const found = new Map<string, ArthurimmoLink>();
  for (const match of html.matchAll(DETAIL_URL)) {
    const [url, city, postalCode, reference] = match;
    if (city === undefined || postalCode === undefined || reference === undefined) continue;
    if (!found.has(reference)) {
      found.set(reference, { url, reference, city: city.replace(/-/g, ' '), postalCode });
    }
  }
  return [...found.values()];
}

/**
 * Les fiches listées, en ébauches que la lecture de la fiche complétera.
 *
 * Sans loyer, elles ne sont pas publiées : seule la fiche le donne.
 */
export function parseList(html: string): readonly RawListing[] {
  return parseListPage(html).map((link) =>
    compactListing({
      sourceRef: link.reference,
      sourceUrl: link.url,
      cityText: link.city,
      postalCodeText: link.postalCode,
    }),
  );
}

/** Le lien d'origine, reconstitué depuis l'ébauche de la liste. */
export function linkOf(listing: RawListing): ArthurimmoLink {
  return {
    url: listing.sourceUrl,
    reference: listing.sourceRef,
    city: listing.cityText ?? '',
    postalCode: listing.postalCodeText ?? '',
  };
}

/**
 * Un `<br />` suivi d'un saut de ligne : c'est ainsi que la fiche rend CHAQUE
 * retour à la ligne. Les deux comptés, chaque ligne était suivie d'une vide.
 */
const BR_THEN_NEWLINE = /(<br\s*\/?>)[^\S\n]*\r?\n/gi;

/**
 * Le texte entier de l'annonce, dans le corps de la fiche.
 *
 * Les balises `og:description` et le JSON-LD le coupent vers 150 caractères,
 * points de suspension compris ; le bloc « Détails de l'annonce » le porte en
 * entier, simplement replié à l'affichage (`x-ref="content"`).
 */
function fullDescription(html: string): string {
  const $ = cheerio.load(html.replace(BR_THEN_NEWLINE, '$1'));
  return htmlToText($, '[x-ref="content"]');
}

/** Contenu d'une balise `meta`, ou `''`. */
function meta(html: string, name: string): string {
  const found = new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`, 'i').exec(html);
  return found?.[1] ?? '';
}

/** Rend les entités HTML d'un attribut : `&#039;` et compagnie. */
function decode(text: string): string {
  return text
    .replace(/&#0?39;|&apos;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Ce que le titre social énonce, dans son ordre invariable.
 *
 * « Louer appartement de 5 pièces 128 m² 2 950 € à Nice (06000) »
 *
 * Chaque morceau est facultatif : une annonce sans surface existe, et il vaut
 * mieux la rendre incomplète que de ne pas la rendre.
 */
interface TitleFacts {
  readonly propertyType?: string;
  readonly rooms?: string;
  readonly area?: string;
  readonly price?: string;
}

export function parseSocialTitle(title: string): TitleFacts {
  const type = /^Louer\s+([a-zà-ÿ' -]+?)\s+de\s|^Louer\s+([a-zà-ÿ' -]+?)\s+\d/i.exec(title);
  const rooms = /(\d+)\s*pièces?/i.exec(title);
  const area = /(\d+(?:[.,]\d+)?)\s*m²/i.exec(title);
  // Le loyer est le montant en euros qui PRÉCÈDE « à <ville> » : les autres
  // montants de la page — honoraires, dépôt — n'apparaissent pas dans ce titre.
  const price = new RegExp(`([\\d${THIN_SPACES}]{3,10})€\\s*(?:à|$)`, 'i').exec(title);
  const montant = price?.[1]?.replace(new RegExp(`[${THIN_SPACES}]`, 'g'), '');

  return {
    ...(type?.[1] !== undefined || type?.[2] !== undefined
      ? { propertyType: (type[1] ?? type[2] ?? '').trim() }
      : {}),
    ...(rooms?.[1] !== undefined ? { rooms: `${rooms[1]} pièces` } : {}),
    ...(area?.[1] !== undefined ? { area: `${area[1]} m²` } : {}),
    ...(montant !== undefined && montant !== '' ? { price: `${montant} €` } : {}),
  };
}

/**
 * Une fiche complète, à partir de son en-tête et du lien qui y menait.
 *
 * `null` quand le titre social ne dit ni loyer ni surface : la page n'est alors
 * pas une annonce — page d'erreur, bien retiré — et l'inventer serait pire que
 * de l'omettre.
 */
export function parseDetail(html: string, link: ArthurimmoLink): RawListing | null {
  const title = decode(meta(html, 'og:title'));
  const facts = parseSocialTitle(title);
  if (facts.price === undefined && facts.area === undefined) return null;

  // L'en-tête ne sert plus que de secours, si le gabarit du corps change.
  const description = fullDescription(html) || decode(meta(html, 'og:description'));
  const photos = [
    ...new Set(html.match(/https:\/\/media\.studio-net\.fr\/biens\/[^"'\s]+/g) ?? []),
  ];
  // Ancien badge : `?dpe=D` ; actuel : `?dpe=199.6&…&letter=D`.
  const badge = /dpe\.lesiteimmo\.com\/badge\/dpe\?([^"'\s]+)/i.exec(html)?.[1] ?? '';
  const dpe = (/(?:^|&(?:amp;)?)letter=([A-G])\b/i.exec(badge) ??
    /^dpe=([A-G])\b/i.exec(badge))?.[1];

  return compactListing({
    sourceRef: link.reference,
    sourceUrl: link.url,
    // Le titre VISIBLE est libre et souvent vide ; le social est composé par le
    // site et dit toujours la même chose dans le même ordre.
    title: title.replace(/\s*:\s*une annonce Arthurimmo\.com\s*$/i, '').trim() || undefined,
    description: description !== '' ? description : undefined,
    priceText: facts.price,
    areaText: facts.area,
    roomsText: facts.rooms,
    propertyTypeText: `${facts.propertyType ?? ''} ${title}`.trim(),
    cityText: link.city,
    postalCodeText: link.postalCode,
    agencyName: 'Arthurimmo.com Nice Transactions',
    contactFormUrl: link.url,
    imageUrls: photos.length > 0 ? photos : undefined,
    extra: {
      reference: link.reference,
      ...(dpe !== undefined ? { dpe } : {}),
    },
  });
}
