/**
 * Parser des pages « ville » de orpi.com (`/location-immobiliere-{ville}/`).
 *
 * STRATÉGIE D'ANCRAGE — à lire avant toute modification.
 *
 * Les cartes d'annonces sont des `<article data-test-estate
 * data-reference="…">` : on s'ancre sur ces attributs de données, posés pour
 * l'outillage du site lui-même, donc bien plus stables que les classes CSS.
 *
 * Chaque carte porte en plus, sur son bouton « favoris », un attribut
 * `data-eulerian-action` contenant un JSON riche (référence, prix, surface,
 * pièces, GPS, quartier, agence, date de création). C'est une AUBAINE pour le
 * dédoublonnage (§14 : les coordonnées GPS sont un signal très fort), mais
 * c'est un attribut de *tracking*, pas une API : il peut disparaître sans
 * préavis. Le parser le traite donc comme un ENRICHISSEMENT — le HTML visible
 * (prix en bannière, titre « N pièces X m² ») reste la source principale, et
 * chaque champ JSON n'est utilisé qu'en secours, champ par champ.
 *
 * EXCEPTION DOCUMENTÉE : le champ JSON `meuble` est ignoré. Observé le
 * 2026-08-15 : une annonce taguée « Meublé » à l'écran portait `"meuble":0`
 * dans son JSON. En cas de contradiction interne de la source, on se fie à ce
 * que le visiteur voit (les tags), pas au tracking (§17 : ne pas affirmer une
 * donnée douteuse).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

/**
 * Forme d'une URL d'annonce :
 * `/annonce-location-{type…}-{ville…}-{cp}-{référence}/`
 *
 * Le code postal est le PREMIER groupe de cinq chiffres délimité par des
 * tirets (quantificateur paresseux) : indispensable, car les références de
 * type UUID peuvent elles-mêmes contenir cinq chiffres consécutifs.
 */
const LISTING_URL_PATTERN =
  /^https?:\/\/(?:www\.)?orpi\.com\/annonce-location-(.+?)-(\d{5})-([a-z0-9-]+?)\/?(?:[?#].*)?$/i;

/**
 * Biens hors périmètre du projet (§1 : on cherche un logement, pas un garage).
 * Ce n'est pas un critère de recherche « artificiel » (§2) mais le périmètre
 * même du produit : un stationnement à 100 €/mois passerait tous les filtres
 * MVP (budget OK, surface inconnue donc non éliminatoire) et polluerait la
 * tête de liste.
 */
const NON_RESIDENTIAL_PREFIXES = [
  'stationnement',
  'parking',
  'garage',
  'box',
  'terrain',
  'local',
  'bureau',
  'commerce',
  'fonds',
  'immeuble',
  'cave',
] as const;

export interface ParsedListingUrl {
  /** Slug type + ville, ex. `appartement-t1-nice`. */
  readonly typeAndCitySlug: string;
  readonly postalCode: string;
  readonly reference: string;
  readonly canonicalUrl: string;
  /** `true` si le bien n'est pas un logement (stationnement, local…). */
  readonly nonResidential: boolean;
}

/**
 * Analyse une URL d'annonce.
 * @returns `null` si l'URL n'est pas une fiche d'annonce (lien de quartier,
 *          pagination, lien `?contact=true` inclus — il est canonisé).
 */
export function parseListingUrl(href: string): ParsedListingUrl | null {
  const match = LISTING_URL_PATTERN.exec(href.trim());
  if (match === null) return null;

  const [, typeAndCitySlug, postalCode, reference] = match;
  if (typeAndCitySlug === undefined || postalCode === undefined || reference === undefined) {
    return null;
  }

  const firstToken = typeAndCitySlug.split('-')[0] ?? '';
  const nonResidential = NON_RESIDENTIAL_PREFIXES.some((prefix) => firstToken === prefix);

  return {
    typeAndCitySlug,
    postalCode,
    reference,
    // Canonique sans query ni fragment : `?contact=true` désigne la même
    // annonce et ne doit pas produire un doublon.
    canonicalUrl: `https://www.orpi.com/annonce-location-${typeAndCitySlug}-${postalCode}-${reference}/`,
    nonResidential,
  };
}

/**
 * Sous-ensemble utile du JSON `data-eulerian-action`. Tous les champs sont
 * optionnels : le tracking peut changer de forme à tout moment.
 */
interface EulerianData {
  readonly prdref?: string;
  readonly prdamount?: number;
  readonly surfaceBien?: number;
  readonly nbPieces?: number;
  readonly nbChambres?: number;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly agenceNom?: string;
  readonly nomVille?: string;
  readonly codePostal?: string | null;
  readonly quartier?: string;
  readonly dateCreation?: string;
  readonly dpe?: string | number | null;
  readonly etage?: number | null;
  readonly ascenseur?: number;
  readonly nbBalcons?: number | string;
  readonly nbTerrasses?: number;
  readonly nbParking?: number | null;
  readonly meuble?: number;
}

/**
 * Décode le JSON de tracking d'une carte.
 * @returns `null` si l'attribut est absent, corrompu, ou ne concerne pas la
 *          référence attendue (garde contre un attribut déplacé dans le DOM).
 */
export function parseEulerianData(
  raw: string | undefined,
  expectedRef: string,
): EulerianData | null {
  if (raw === undefined || raw === '') return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    const candidate = data as EulerianData;
    if (candidate.prdref !== expectedRef) return null;
    return candidate;
  } catch {
    return null;
  }
}

/** Isole le fragment prix de la bannière, ex. « 1 280 € par mois ». */
export function extractPriceText(text: string): string | undefined {
  const match = text.match(/[\d][\d\s.,]*\s*€\s*par\s*mois/i);
  return match?.[0];
}

/** Isole la surface du titre, ex. « 13,50 m 2 » (le HTML écrit `m<sup>2</sup>`). */
export function extractAreaText(text: string): string | undefined {
  const match = text.match(/[\d][\d\s.,]*\s*m\s*(?:²|2)(?!\d)/i);
  return match?.[0];
}

/** Isole « 2 pièces » du titre. */
export function extractRoomsText(text: string): string | undefined {
  const match = text.match(/\d+\s*pièces?/i);
  return match?.[0];
}

/** Résultat du parsing d'une page de résultats. */
export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
}

/**
 * Analyse une page `/location-immobiliere-{ville}/` et en extrait les annonces.
 *
 * @param html contenu HTML brut de la page
 * @param pageUrl URL de la page, pour résoudre les liens relatifs
 */
/** Premier lien de fiche de la carte, canonisé. `null` si aucun. */
function findCardUrl(
  $: cheerio.CheerioAPI,
  card: ReturnType<cheerio.CheerioAPI>,
  pageUrl: string,
): ParsedListingUrl | null {
  let parsed: ParsedListingUrl | null = null;
  card.find('a[href*="/annonce-location-"]').each((_i, anchor) => {
    if (parsed !== null) return;
    const href = $(anchor).attr('href');
    if (href === undefined) return;
    const absolute = href.startsWith('http') ? href : new URL(href, pageUrl).toString();
    parsed = parseListingUrl(absolute);
  });
  return parsed;
}

/**
 * Attributs structurés du tracking → dictionnaire `extra` (quartier, DPE,
 * atouts). Le quartier n'est PAS une adresse : le placer dans `addressText`
 * ferait gagner à tort le bonus « même adresse » au dédoublonnage (§14).
 */
function buildOrpiExtra(eulerian: EulerianData | null, reference: string): Record<string, string> {
  const extra: Record<string, string> = { reference };
  if (eulerian === null) return extra;
  if (eulerian.quartier !== undefined && eulerian.quartier !== '') {
    extra['quartier'] = eulerian.quartier;
  }
  // Le tracking code la classe en indice (4 pour « D ») : tel quel, il était perdu.
  const dpe =
    dpeLetterOfIndex(eulerian.dpe) ?? (typeof eulerian.dpe === 'string' ? eulerian.dpe : '');
  if (dpe !== '') extra['dpe'] = dpe;
  if (eulerian.etage != null) extra['etage'] = String(eulerian.etage);
  if (eulerian.ascenseur != null) extra['ascenseur'] = String(eulerian.ascenseur);
  if (eulerian.nbBalcons != null && eulerian.nbBalcons !== '') {
    extra['nbBalcons'] = String(eulerian.nbBalcons);
  }
  if (eulerian.nbTerrasses != null) extra['nbTerrasses'] = String(eulerian.nbTerrasses);
  if (eulerian.nbParking != null) extra['nbParking'] = String(eulerian.nbParking);
  return extra;
}

/** Champs de localisation/contact issus du tracking (avec secours sur l'URL). */
function orpiEulerianFields(eulerian: EulerianData | null, url: ParsedListingUrl): RawDraft {
  return {
    cityText:
      eulerian?.nomVille !== undefined && eulerian.nomVille !== '' ? eulerian.nomVille : undefined,
    postalCodeText:
      eulerian?.codePostal != null && eulerian.codePostal !== ''
        ? eulerian.codePostal
        : url.postalCode,
    latitude: eulerian?.latitude,
    longitude: eulerian?.longitude,
    agencyName:
      eulerian?.agenceNom !== undefined && eulerian.agenceNom !== ''
        ? `Orpi — ${eulerian.agenceNom}`
        : 'Orpi',
    publishedAtText:
      eulerian?.dateCreation !== undefined && eulerian.dateCreation !== ''
        ? eulerian.dateCreation
        : undefined,
  };
}

/** Convention « N pièces M chambres » : pièces (titre ou JSON) + chambres (JSON). */
function orpiRoomsText(titleText: string, eulerian: EulerianData | null): string | undefined {
  const parts: string[] = [];
  const fromTitle =
    extractRoomsText(titleText) ??
    (eulerian?.nbPieces != null ? `${eulerian.nbPieces} pièces` : undefined);
  if (fromTitle !== undefined) parts.push(fromTitle);
  if (eulerian?.nbChambres != null) parts.push(`${eulerian.nbChambres} chambres`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Analyse une carte d'annonce en `RawListing`. `null` si non exploitable. */
function parseCard(
  $: cheerio.CheerioAPI,
  card: ReturnType<cheerio.CheerioAPI>,
  pageUrl: string,
): RawListing | null {
  const url = findCardUrl($, card, pageUrl);
  if (url === null || url.nonResidential) return null;

  // La référence de l'attribut fait foi ; l'URL sert de secours.
  const reference = card.attr('data-reference') ?? url.reference;

  // Texte aplati de la carte : les balises deviennent des espaces pour que
  // deux fragments voisins restent des mots distincts.
  const cardText = cleanText($.html(card).replace(/<[^>]*>/g, ' '));
  const titleText = cleanText(card.find('a.c-overlay__link').first().text());
  const tagsText = cleanText(
    card
      .find('.c-tag')
      .map((_i, tag) => $(tag).text())
      .get()
      .join(' '),
  );
  const description = htmlToText($, card.find('.text-sm') as cheerio.Cheerio<never>);

  // Enrichissement optionnel par le JSON de tracking (voir en-tête).
  const eulerian = parseEulerianData(
    card.find('[data-eulerian-action*="prdref"]').first().attr('data-eulerian-action'),
    reference,
  );

  const imageUrls = card
    .find('img[data-src]')
    .map((_i, img) => $(img).attr('data-src'))
    .get()
    .filter((src): src is string => typeof src === 'string' && src.startsWith('http'));

  return compactListing({
    sourceRef: reference,
    sourceUrl: url.canonicalUrl,
    title: titleText !== '' ? titleText : undefined,
    description: description !== '' ? description : undefined,
    priceText:
      extractPriceText(cardText) ??
      (eulerian?.prdamount != null ? `${eulerian.prdamount} €` : undefined),
    // `surfaceBien` est documentée en m² par la structure même de la carte.
    areaText:
      extractAreaText(titleText) ??
      (eulerian?.surfaceBien != null ? `${eulerian.surfaceBien} m²` : undefined),
    roomsText: orpiRoomsText(titleText, eulerian),
    // Le premier token du slug (« appartement », « maison », « studio »).
    propertyTypeText: url.typeAndCitySlug.split('-')[0] ?? '',
    // Meublé : tags + titre + description — jamais le champ JSON `meuble`.
    furnishedText: cleanText(`${tagsText} ${titleText} ${description}`),
    ...orpiEulerianFields(eulerian, url),
    // §21 : la liste ne publie pas de coordonnées directes. Le formulaire de la
    // fiche est le canal prévu ; on ne force aucune requête pour plus.
    contactFormUrl: url.canonicalUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: buildOrpiExtra(eulerian, reference),
  });
}

export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const byReference = new Map<string, RawListing>();

  $('article[data-reference]').each((_index, element) => {
    const listing = parseCard($, $(element), pageUrl);
    if (listing !== null && !byReference.has(listing.sourceRef)) {
      byReference.set(listing.sourceRef, listing);
    }
  });

  const listings = [...byReference.values()];

  // §61 : détection d'anomalie structurelle, sans requête supplémentaire.
  if (listings.length > 0) {
    const withPrice = listings.filter((listing) => listing.priceText !== undefined).length;
    if (withPrice === 0) {
      warnings.push('Aucune annonce ne contient de prix — structure probablement modifiée');
    } else if (withPrice / listings.length < 0.5) {
      warnings.push(
        `Seules ${withPrice}/${listings.length} annonces contiennent un prix — parsing dégradé`,
      );
    }
  }

  // Pagination : le lien `rel="next"` est la marque la plus fiable ; à défaut,
  // un lien vers la page numérotée suivante.
  const currentPage = Number.parseInt(new URL(pageUrl).searchParams.get('page') ?? '1', 10);
  const hasNextPage =
    $('a[rel="next"]').length > 0 || $(`a[href*="page=${currentPage + 1}"]`).length > 0;

  return { listings, hasNextPage, warnings };
}

/**
 * La description ENTIÈRE, lue sur la fiche de l'annonce.
 *
 * LA CARTE TRONQUE À CENT CINQUANTE-DEUX CARACTÈRES, et toujours au même
 * endroit : sur les quarante-neuf annonces Orpi en base le 2026-09-08, la plus
 * longue en faisait 152 et la moyenne 151. Un plafond aussi net n'est pas une
 * coïncidence, c'est une coupe — souvent en plein mot.
 *
 * La fiche porte le texte complet sous « L'avis de l'agent », dans l'unique
 * bloc `.s-cms` de la page : 903 caractères pour l'annonce mesurée, six fois
 * plus, et surtout AVEC SON ADRESSE DE RUE (« 22bis BOULEVARD MONTREAL »).
 * C'est elle qui permet de placer le bien sur la carte (§20) et de le
 * reconnaître ailleurs (§14) — Orpi ne la donne nulle part sur la liste.
 *
 * @returns le complément à fusionner, ou `null` si la fiche n'apprend rien —
 *          auquel cas on garde ce que la carte avait donné (§17).
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const block = $('.s-cms').first();
  const description = block.length > 0 ? htmlToText($, block as cheerio.Cheerio<never>) : '';
  const estate = parseEstateData($('[data-estate]').first().attr('data-estate'));
  const fields = estate === null ? {} : estateFields(estate);
  const draft: RawDraft = {
    ...(description.length > 0 ? { description } : {}),
    ...fields,
  };
  return Object.keys(draft).length > 0 ? draft : null;
}

/** Sous-ensemble utile du JSON `data-estate` de la fiche. */
interface EstateData {
  readonly deposit?: number | null;
  readonly chargeReserve?: number | null;
  readonly agencyCommission?: number | null;
  readonly dpeDisplay?: boolean;
  readonly consumptionIndex?: number | null;
  readonly agency?: {
    readonly phone?: string | null;
    readonly email?: string | null;
    readonly rentEmail?: string | null;
  } | null;
}

function parseEstateData(raw: string | undefined): EstateData | null {
  if (raw === undefined || raw === '') return null;
  try {
    const data: unknown = JSON.parse(raw);
    return typeof data === 'object' && data !== null ? (data as EstateData) : null;
  } catch {
    return null;
  }
}

/** Indice 1 à 7 → classe « A » à « G », comme l'échelle affichée par la fiche. */
export function dpeLetterOfIndex(index: number | string | null | undefined): string | undefined {
  const n = typeof index === 'string' ? Number.parseInt(index, 10) : index;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 7
    ? 'ABCDEFG'.charAt(n - 1)
    : undefined;
}

const euros = (value: number | null | undefined): string | undefined =>
  typeof value === 'number' && value >= 0 ? `${value} €` : undefined;

const nonEmpty = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Montants, DPE et coordonnées de l'agence du bien, lus dans `data-estate`.
 *
 * La fiche affiche les mêmes valeurs (« Dépôt de garantie : 894 € ») ; le JSON
 * les donne sans libellé à interpréter. Le contact est celui de l'agence qui
 * porte l'annonce, jamais l'e-mail personnel de l'agent. Le DPE est la classe
 * surlignée sur l'échelle « Consommation énergétique » de la fiche.
 */
function estateFields(estate: EstateData): RawDraft {
  const agency = estate.agency ?? undefined;
  const dpe = estate.dpeDisplay === false ? undefined : dpeLetterOfIndex(estate.consumptionIndex);
  return compactDraft({
    depositText: euros(estate.deposit),
    chargesText: euros(estate.chargeReserve),
    feesText: euros(estate.agencyCommission),
    phoneText: nonEmpty(agency?.phone),
    emailText: nonEmpty(agency?.rentEmail) ?? nonEmpty(agency?.email),
    extra: dpe !== undefined ? { dpe } : undefined,
  });
}

function compactDraft(draft: RawDraft): RawDraft {
  return Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined)) as RawDraft;
}
