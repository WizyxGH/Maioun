/**
 * Source : Oqoro (oqoro.com) — gestionnaire locatif en ligne, qui publie son
 * parc géré sur son propre site. Étude du 2026-09-16, fiche dans
 * `docs/sources-enquetes.md`.
 *
 * LE SITE PUBLIE TOUT SON PARC, LOUÉ COMPRIS. Sur les quarante-sept biens des
 * Alpes-Maritimes relevés le 2026-09-16, quarante-quatre portent le bandeau
 * « Occupé » : ce sont des pages de référencement, pas des offres. Seul le
 * bandeau de la carte dit ce qui se loue — « Disponible », ou « Dispo le
 * 01/10 » pour un préavis en cours. La fiche d'un bien occupé le confirme en
 * creux : son JSON-LD perd son bloc `offers`, et la page n'affiche plus ni
 * loyer, ni honoraires, ni dépôt.
 *
 * L'ENTRÉE EST DÉPARTEMENTALE, pas communale. Chaque commune de France a sa
 * page — `/locations/contes` existe et annonce « 0 appartements » — mais lire
 * les treize du périmètre coûtait treize pages de 113 Ko à chaque passage, sans
 * en-tête de cache : le site ne renvoie jamais 304. La liste du département
 * tient en trois pages, contient les mêmes annonces, et fait apparaître d'elle
 * même une commune où Oqoro n'a encore rien. On filtre ensuite sur le périmètre.
 *
 * LE BAILLEUR EST UN PROFESSIONNEL, même si le propriétaire ne l'est pas.
 * Oqoro gère pour des particuliers, mais c'est lui qui publie, lui qui détient
 * la carte professionnelle, et lui qui facture des honoraires au locataire
 * (306,13 € sur la fiche lue). Le locataire n'a jamais le propriétaire en face :
 * annoncer « particulier » serait faux, et fausserait le filtre qui les cherche.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { portalCommuneSlugs } from '../shared/communes.js';
import { htmlToText } from '../shared/html-text.js';
import {
  collectJsonLdNodes,
  findJsonLdNode,
  jsonLdString as asString,
  type JsonLdNode,
} from '../shared/json-ld.js';
import { AMOUNT, NUMBER, afterLabel, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const ORIGIN = 'https://www.oqoro.com';

/** La liste du département : une seule entrée pour les treize communes suivies. */
const DEPARTMENT_LIST = `${ORIGIN}/locations-departement/alpes-maritimes`;

/** Annonces par page, mesuré le 2026-09-16 : une page plus courte est la dernière. */
export const CARDS_PER_PAGE = 20;

/** Page `n` de la liste départementale (la première n'a pas de suffixe). */
export function listUrl(page: number): string {
  return page <= 1 ? DEPARTMENT_LIST : `${DEPARTMENT_LIST}/page/${page}`;
}

/**
 * Une fiche : `/location/nice/t2-24-rue-gounod-0fcb5f72`, ou `/colocation/...`
 * pour une chambre. Le dernier segment hexadécimal est l'identifiant du lot —
 * celui-là même que le bouton « Candidater » passe en paramètre.
 */
const LISTING_PATH = /^\/(?:location|colocation)\/([a-z0-9-]+)\/.*?-([0-9a-f]{8})$/;

/** Les communes du périmètre, écrites comme Oqoro les écrit : slug canonique. */
const PERIMETER = new Set(portalCommuneSlugs());

/** Ce qu'une adresse de fiche apprend. `null` si ce n'en est pas une. */
export function parseListingUrl(href: string): {
  readonly sourceRef: string;
  readonly commune: string;
  readonly url: string;
} | null {
  let resolved: URL;
  try {
    resolved = new URL(href, ORIGIN);
  } catch {
    return null;
  }
  if (resolved.hostname !== new URL(ORIGIN).hostname) return null;
  const [, ville, id] = LISTING_PATH.exec(resolved.pathname) ?? [];
  if (ville === undefined || id === undefined) return null;
  return {
    sourceRef: id,
    // Les grandes villes portent leur code postal (« lyon-69000 ») ; aucune du
    // périmètre ne le fait, mais l'usage du site peut changer sans prévenir.
    commune: ville.replace(/-\d{5}$/, ''),
    url: `${ORIGIN}${resolved.pathname}`,
  };
}

/** Ce que dit le bandeau d'une carte. */
type Availability =
  /** « Disponible » : à louer tout de suite. */
  | { readonly state: 'now' }
  /** « Dispo le 01/10 » : préavis en cours, la date est celle de l'entrée. */
  | { readonly state: 'soon'; readonly text: string }
  /** « Occupé », « Occupée » : le bien est loué. */
  | { readonly state: 'rented' };

/** Lit le bandeau. `null` quand la carte n'en porte aucun — gabarit inattendu. */
export function parseBadge(label: string): Availability | null {
  const text = cleanText(label);
  if (/^Occup/i.test(text)) return { state: 'rented' };
  if (/^Dispo\s+(le|à|a)\b/i.test(text)) return { state: 'soon', text };
  if (/^Disponible\b/i.test(text)) return { state: 'now' };
  return null;
}

export interface OqoroList {
  /** Les annonces À LOUER du périmètre, telles que la carte les donne. */
  readonly listings: readonly RawListing[];
  /** Les références du périmètre que le site affiche LOUÉES. */
  readonly rentedRefs: readonly string[];
  /** Cartes lues, tous états et toutes communes : dit si la page était pleine. */
  readonly cards: number;
  readonly warnings: readonly string[];
}

/**
 * Les cartes d'une page de liste.
 *
 * La carte est répétée trois fois par le gabarit responsive : on garde la
 * première, elles sont identiques.
 */
export function parseListPage(html: string, pageUrl: string): OqoroList {
  const $ = cheerio.load(html);
  const listings = new Map<string, RawListing>();
  const rented = new Set<string>();
  const warnings: string[] = [];
  const seen = new Set<string>();

  $('a[href]').each((_i, el) => {
    const card = $(el);
    const parsed = parseListingUrl(card.attr('href') ?? '');
    if (parsed === null || seen.has(parsed.sourceRef)) return;
    seen.add(parsed.sourceRef);

    const badge = parseBadge(card.find('.oq-badge').first().text());
    if (badge === null) {
      warnings.push(`Carte sans bandeau de disponibilité : ${parsed.url}`);
      return;
    }
    if (!PERIMETER.has(parsed.commune)) return;
    if (badge.state === 'rented') {
      rented.add(parsed.sourceRef);
      return;
    }

    const listing = cardListing(card as cheerio.Cheerio<never>, parsed, badge);
    if (listing === null) {
      warnings.push(`Carte sans loyer : ${parsed.url}`);
      return;
    }
    listings.set(parsed.sourceRef, listing);
  });

  if (seen.size === 0) warnings.push(`Aucune carte sur la liste : ${pageUrl}`);

  return {
    listings: [...listings.values()],
    rentedRefs: [...rented],
    cards: seen.size,
    warnings,
  };
}

/** Ce que porte une carte : loyer charges comprises, surface, adresse, photo. */
function cardListing(
  card: cheerio.Cheerio<never>,
  parsed: NonNullable<ReturnType<typeof parseListingUrl>>,
  badge: Availability,
): RawListing | null {
  const text = cleanText(card.text());
  const price = new RegExp(`(${AMOUNT})\\s*/\\s*mois(\\s*cc)?`, 'i').exec(text);
  if (price?.[1] === undefined) return null;

  const photo = card.find('[role="img"]').first();
  // « Photo du 7 Chemin du Mont-Gros, Nice » : la voie ET le numéro, ce que la
  // plupart des sources ne donnent qu'à l'intérieur de la fiche, quand elles le
  // donnent.
  const address = /^Photo du\s+(.*?),\s*([^,]+)$/.exec(cleanText(photo.attr('aria-label')));
  const image = /background-image:\s*url\(([^)]+)\)/.exec(photo.attr('style') ?? '');
  const title = cleanText(card.find('span.font-semibold.text-primary').first().text());

  return compactListing({
    sourceRef: parsed.sourceRef,
    sourceUrl: parsed.url,
    title: title === '' ? undefined : title,
    priceText: `${price[1]} par mois${price[2] === undefined ? '' : ' charges comprises'}`,
    areaText: new RegExp(`${NUMBER}\\s*m²`, 'i').exec(text)?.[0],
    addressText: address?.[1],
    cityText: address?.[2] ?? cleanText(card.find('span.text-ellipsis').first().text()),
    availableAtText: badge.state === 'soon' ? badge.text : 'Disponible',
    imageUrls: image?.[1] === undefined ? undefined : [image[1]],
  });
}

/**
 * La fiche, qui porte tout le reste : honoraires, dépôt, provision sur charges,
 * DPE ET GES chiffrés, position du bien, description et galerie.
 *
 * On ne rejette JAMAIS une fiche ici, même occupée entre-temps : ce qu'elle dit
 * de l'adresse ou du diagnostic reste vrai, et c'est la liste — relue à chaque
 * passage — qui décide seule de ce qui est à louer.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const text = flatText($);
  const residence = findJsonLdNode(collectJsonLdNodes($), ['residence', 'apartment', 'house']);
  // Pas de logement décrit : page d'erreur ou gabarit changé. On n'apprend rien
  // plutôt que d'effacer ce qu'un passage précédent avait lu.
  if (residence === undefined) return null;
  const address = residence['address'] as JsonLdNode | undefined;
  const geo = residence['geo'] as JsonLdNode | undefined;
  const latitude = geo?.['latitude'];
  const longitude = geo?.['longitude'];

  const badges = $('.oq-badge')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  /** Les pastilles de la fiche : « T4 », « Chambre », « Meublé ». */
  const badge = (pattern: RegExp): string | undefined => badges.find((one) => pattern.test(one));

  const description = htmlToText($, labelled($, 'Le logement'));

  const rooms = badge(/^(?:T\d+|Studio)$/i);
  const bedrooms = afterLabel(text, 'Nombre de chambres', NUMBER);
  // « T4 3 chambres » : la normalisation y lit les pièces ET les chambres.
  const roomsText = [rooms, bedrooms === undefined ? undefined : `${bedrooms} chambres`]
    .filter((one) => one !== undefined)
    .join(' ');
  const publisher = cleanText(labelled($, 'Publié par').text());

  const draft: RawDraft = {
    description: blank(description),
    // La carte donne déjà le loyer charges comprises ; la provision, le dépôt
    // et les honoraires n'existent que sur la fiche.
    chargesText: afterLabel(text, 'Provision'),
    depositText: afterLabel(text, 'D[ée]p[ôo]t de garantie'),
    feesText: afterLabel(text, 'Honoraires charge locataire'),
    areaText: area(residence),
    roomsText: blank(roomsText),
    furnishedText: badge(/^(?:Meubl|Non meubl|Vide)/i),
    propertyTypeText: badge(/^(?:Chambre|Logement entier|Coliving)$/i),
    addressText: asString(address?.['streetAddress']),
    cityText: asString(address?.['addressLocality']),
    postalCodeText: asString(address?.['postalCode']),
    latitude: typeof latitude === 'number' ? latitude : undefined,
    longitude: typeof longitude === 'number' ? longitude : undefined,
    // C'est Oqoro qui publie, et c'est lui que le locataire aura en face.
    agencyName: blank(publisher),
    imageUrls: galleryImages($),
  };

  const extra = compactExtra({
    reference: referenceOf($),
    features: featureList($),
    // Les deux étiquettes sont lues chacune sur son échelle, jamais l'une
    // déduite de l'autre : elles divergent d'un cran dès qu'on chauffe à
    // l'électricité.
    dpe: scaleLetter(text, 'kWhep'),
    ges: scaleLetter(text, 'kg\\s*eqCO2'),
    etage: afterLabel(text, 'Étage', NUMBER),
    /** La part privative d'une chambre en colocation : la surface reste celle du logement. */
    surfacePrivative: privateArea(text),
  });

  return Object.keys(extra).length === 0 ? draft : { ...draft, extra };
}

/** Une chaîne vide vaut « pas de valeur » : un champ absent n'est jamais rendu. */
function blank(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/**
 * Le bloc qui suit un intitulé donné. Certains titres sont seuls dans leur
 * conteneur — « Équipements et commodités » — et c'est alors le conteneur qui a
 * le contenu pour voisin.
 */
function labelled($: cheerio.CheerioAPI, label: string): cheerio.Cheerio<never> {
  const heading = $('span')
    .filter((_i, el) => cleanText($(el).text()) === label)
    .first();
  const next = heading.next();
  return (next.length > 0 ? next : heading.parent().next()) as cheerio.Cheerio<never>;
}

/** La surface habitable, prise au JSON-LD où elle est déjà un nombre. */
function area(residence: JsonLdNode | undefined): string | undefined {
  const size = residence?.['floorSize'];
  const value =
    typeof size === 'object' && size !== null
      ? asString((size as JsonLdNode)['value'])
      : asString(size);
  return value === undefined ? undefined : `${value} m²`;
}

/** « Superficie 70 m2 (dont 10 m2 privatifs) » : la part réservée au locataire. */
function privateArea(text: string): string | undefined {
  const match = new RegExp(`Superficie[^(]*\\(dont\\s*(${NUMBER})\\s*m\\s*2?`, 'i').exec(text);
  return match?.[1] === undefined ? undefined : `${match[1]} m²`;
}

/**
 * L'étiquette d'une échelle énergétique.
 *
 * L'échelle dessine ses sept lettres l'une sous l'autre et pose la valeur
 * chiffrée sur la SEULE ligne qui compte : c'est donc la lettre qui précède le
 * chiffre qui donne la classe. Rien n'est déduit quand le diagnostic manque —
 * l'échelle est alors dessinée vide, et une lettre inventée vaudrait moins que
 * l'absence.
 */
function scaleLetter(text: string, unit: string): string | undefined {
  return new RegExp(`\\b([A-G])\\s+${NUMBER}\\s*${unit}`, 'i').exec(text)?.[1]?.toUpperCase();
}

/** Un `extra` sans ses trous : la fusion des fiches n'y remet jamais `undefined`. */
function compactExtra(
  fields: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

/** « Référence : OQ6686W », la référence interne du gestionnaire. */
function referenceOf($: cheerio.CheerioAPI): string | undefined {
  const holder = $('.oq-badge')
    .filter((_i, el) => /^Référence\s*:/.test(cleanText($(el).text())))
    .first();
  const reference = cleanText(holder.find('span').last().text());
  return reference === '' ? undefined : reference;
}

/** Les commodités listées sous la description (« Balcon », « Internet (Fibre) »). */
function featureList($: cheerio.CheerioAPI): string | undefined {
  const features = htmlToText($, labelled($, 'Équipements et commodités'))
    .split('\n')
    .map((one) => cleanText(one))
    .filter((one) => one !== '');
  return features.length === 0 ? undefined : features.join(', ');
}

/**
 * La galerie, déclarée en JSON dans l'attribut du carrousel. La visite virtuelle
 * y figure avec les photos (`content_type` « vr ») : elle n'est pas une image.
 */
function galleryImages($: cheerio.CheerioAPI): readonly string[] | undefined {
  const raw = $('[data-controller~="gallery--component"][data-files]').first().attr('data-files');
  if (raw === undefined) return undefined;
  let files: unknown;
  try {
    files = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(files)) return undefined;
  const urls = files
    .filter(
      (file): file is { url: string; content_type: string } =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as { url?: unknown }).url === 'string' &&
        typeof (file as { content_type?: unknown }).content_type === 'string',
    )
    .filter((file) => file.content_type.startsWith('image/'))
    .map((file) => file.url);
  return urls.length === 0 ? undefined : urls;
}
