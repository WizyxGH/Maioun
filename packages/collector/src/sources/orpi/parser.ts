/**
 * Parser des pages « ville » de orpi.com (`/location-immobiliere-{ville}/`).
 *
 * STRATÉGIE D'ANCRAGE — à lire avant toute modification.
 *
 * Les cartes d'annonces sont des `<article data-test-estate
 * data-reference="…">` : on s'ancre sur ces attributs de données, posés pour
 * l'outillage du site lui-même, donc bien plus stables que les classes CSS.
 *
 * SEULES COMPTENT LES CARTES DU CONTENEUR DE RÉSULTATS. La page en porte
 * d'autres, et ce n'est pas un détail : sous la pagination, un carrousel
 * « Biens à louer dans les communes à proximité de Nice » répète SIX annonces
 * D'AUTRES COMMUNES, identiques sur toutes les pages. Relevé du 2026-09-16 :
 * 21+21+21+18 cartes sur quatre pages, mais 63 références distinctes seulement,
 * et la liste niçoise n'en compte que 57. C'est de là que venaient les annonces
 * de Saint-Laurent-du-Var et de Saint-André dans l'inventaire « Nice », et
 * c'est ce qui faussait tout décompte.
 *
 * LE SITE ANNONCE SON TOTAL, et c'est ce qui permet enfin de savoir si
 * l'inventaire est complet sans le deviner : les liens de filtre par type
 * portent un `data-eulerian-action` avec `typeBien` et `nbResults`
 * (appartement 48, stationnement 7, maison 2 pour Nice le 2026-09-16, soit 57
 * — exactement le nombre de cartes lues sur les quatre pages).
 *
 * Chaque carte porte en plus, sur son bouton « favoris », un attribut
 * `data-eulerian-action` contenant un JSON riche (référence, prix, surface,
 * pièces, GPS, quartier, agence). C'est une AUBAINE pour le dédoublonnage
 * (§14 : les coordonnées GPS sont un signal très fort), mais c'est un attribut
 * de *tracking*, pas une API : il peut disparaître sans préavis. Le parser le
 * traite donc comme un ENRICHISSEMENT — le HTML visible (prix en bannière,
 * titre « N pièces X m² ») reste la source principale, et chaque champ JSON
 * n'est utilisé qu'en secours, champ par champ.
 *
 * DEUX CHAMPS DU TRACKING SONT ÉCARTÉS, tous deux parce qu'ils mentent.
 *
 *   - `meuble` : le 2026-08-15, une annonce taguée « Meublé » à l'écran portait
 *     `"meuble":0`. En cas de contradiction interne, on se fie à ce que le
 *     visiteur voit (§17).
 *   - `dateCreation` : le 2026-09-16, les CINQUANTE-SEPT cartes niçoises la
 *     donnaient au 2026-09-16 — le jour même — y compris un bien dont la fiche
 *     dit `onMarketSince: 2026-07-08`. Ce n'est pas une date de parution, c'est
 *     la date du rendu. Prise pour telle, elle faisait paraître tout le stock
 *     Orpi publié du jour. La vraie date est sur la fiche, et n'y est que là.
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
 * Les annonces de location qu'Orpi ÉNUMÈRE LUI-MÊME, lues dans son sitemap.
 *
 * POURQUOI UN SITEMAP QUAND ON A DÉJÀ LES PAGES. Parce que les pages de liste
 * ne sont pas un instantané : deux requêtes faites à quelques secondes d'écart
 * n'ont pas le même ordre, si bien qu'une annonce se retrouve sur deux pages et
 * une autre sur aucune (relevé du 2026-09-18 : page 3 relue quatre minutes plus
 * tard, trois biens venus de la page 2 en tête et quatre repoussés vers la page
 * suivante, déjà lue). Le sitemap, lui, est UN SEUL document : ce qu'il
 * énumère est cohérent avec lui-même.
 *
 * Il ne remplace pas les pages — il ne porte ni loyer, ni surface, ni GPS —,
 * il dit seulement QUELLES annonces existent. C'est exactement ce qui manquait
 * pour savoir si la lecture a tout vu.
 *
 * L'URL porte la commune et le CODE POSTAL du bien, ce qui règle du même coup
 * le cas des communes homonymes : `la-trinite-97220` n'est pas la nôtre.
 */
export function parseRentalSitemap(xml: string): readonly ParsedListingUrl[] {
  const annonces: ParsedListingUrl[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const parsed = parseListingUrl(match[1] ?? '');
    if (parsed !== null) annonces.push(parsed);
  }
  return annonces;
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
  /** Présent sur les LIENS DE FILTRE, pas sur les cartes : total par type. */
  readonly typeBien?: string;
  readonly nbResults?: number;
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
  /** Les LOGEMENTS de la liste : stationnements et locaux écartés. */
  readonly listings: readonly RawListing[];
  /**
   * Toutes les cartes de la liste, non résidentielles comprises. C'est le
   * dénominateur à comparer au total annoncé, qui les compte aussi.
   */
  readonly cardRefs: readonly string[];
  /**
   * Total annoncé par le site pour cette recherche, tous types de biens
   * confondus, ou `null` si la page ne le publie plus.
   */
  readonly announcedTotal: number | null;
  /**
   * Chemin canonique servi par le site. Orpi répond 200 et sert la page du
   * DÉPARTEMENT pour une commune qu'il ne connaît pas : sans cette
   * vérification, ses annonces cannoises entraient dans l'inventaire de
   * Cap-d'Ail.
   */
  readonly canonicalPath: string | null;
  /**
   * Le code postal que la page se donne, `null` si elle ne le publie pas.
   *
   * IL DIT QUELLE COMMUNE ON A OBTENUE, quand le chemin ne dit que son nom.
   * `/location-immobiliere-la-trinite/` est servie, canonique en règle, et
   * c'est La Trinité de MARTINIQUE (97220) : la nôtre est en 06340, et Orpi
   * n'a pas de page pour elle.
   */
  readonly pagePostalCode: string | null;
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
}

/** Conteneur des résultats ; le reste de la page porte d'autres annonces. */
const RESULTS_CONTAINER = '[data-oncrawl="estate-list"]';

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
function buildOrpiExtra(eulerian: EulerianData | null): Record<string, string> {
  // Pas de `reference` : `data-reference` recopie le dernier segment de l'URL,
  // et Orpi n'affiche aucune référence d'agence sur ses cartes (§17).
  const extra: Record<string, string> = {};
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

/**
 * Champs de localisation/contact issus du tracking.
 *
 * `pageCity` est la commune de la page interrogée, lue sur ses liens de filtre.
 * Elle sert de secours : une carte sans JSON de tracking n'avait AUCUNE
 * commune, et huit occurrences sur cinquante-cinq en base étaient dans ce cas
 * le 2026-09-16 — sans ville, pas de trajet ni de filtre par commune (§20).
 *
 * Pas de `publishedAtText` : voir l'en-tête, `dateCreation` est la date du
 * rendu, pas celle de la parution.
 */
function orpiEulerianFields(
  eulerian: EulerianData | null,
  url: ParsedListingUrl,
  pageCity: string | undefined,
): RawDraft {
  const city =
    eulerian?.nomVille !== undefined && eulerian.nomVille !== '' ? eulerian.nomVille : pageCity;
  return {
    cityText: city !== undefined && city !== '' ? city : undefined,
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
  pageCity: string | undefined,
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
    ...orpiEulerianFields(eulerian, url, pageCity),
    // §21 : la liste ne publie pas de coordonnées directes. Le formulaire de la
    // fiche est le canal prévu ; on ne force aucune requête pour plus.
    contactFormUrl: url.canonicalUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: buildOrpiExtra(eulerian),
  });
}

/**
 * Ce que les LIENS DE FILTRE par type apprennent sur la recherche : le total
 * annoncé, la commune telle que le site l'écrit, et SON CODE POSTAL.
 *
 * Chaque lien porte son propre `nbResults` (appartement, maison,
 * stationnement…) ; leur somme est l'inventaire entier de la recherche, celui
 * qu'on compare aux cartes lues pour savoir si l'on a tout vu.
 *
 * LE CODE POSTAL DIT QUELLE COMMUNE LE SITE A SERVIE, et c'est la seule chose
 * qui le dise : l'adresse demandée ne porte qu'un nom, et un nom peut désigner
 * plusieurs communes. Relevé du 2026-09-18 : les dix pages du périmètre qu'Orpi
 * connaît publient exactement le code postal que notre table leur donne.
 */
function readSearchTotals($: cheerio.CheerioAPI): {
  announcedTotal: number | null;
  city: string | undefined;
  postalCode: string | undefined;
} {
  let announcedTotal: number | null = null;
  let city: string | undefined;
  let postalCode: string | undefined;
  $('[data-eulerian-action*="nbResults"]').each((_index, element) => {
    const raw = $(element).attr('data-eulerian-action');
    if (raw === undefined || raw === '') return;
    let data: EulerianData;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      data = parsed as EulerianData;
    } catch {
      return;
    }
    // Les liens de QUARTIER portent le même attribut avec un `typeBien` vide :
    // les additionner compterait plusieurs fois les mêmes biens.
    if (data.typeBien === undefined || data.typeBien === '') return;
    if (typeof data.nbResults !== 'number' || !Number.isFinite(data.nbResults)) return;
    announcedTotal = (announcedTotal ?? 0) + data.nbResults;
    if (city === undefined && data.nomVille !== undefined && data.nomVille !== '') {
      city = data.nomVille;
    }
    if (postalCode === undefined && data.codePostal != null && data.codePostal !== '') {
      postalCode = data.codePostal;
    }
  });
  return { announcedTotal, city, postalCode };
}

export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const byReference = new Map<string, RawListing>();
  const cardRefs: string[] = [];
  const { announcedTotal, city, postalCode } = readSearchTotals($);

  $(`${RESULTS_CONTAINER} article[data-reference]`).each((_index, element) => {
    const card = $(element);
    const reference = card.attr('data-reference');
    if (reference !== undefined && reference !== '' && !cardRefs.includes(reference)) {
      cardRefs.push(reference);
    }
    const listing = parseCard($, card, pageUrl, city);
    if (listing !== null && !byReference.has(listing.sourceRef)) {
      byReference.set(listing.sourceRef, listing);
    }
  });

  const listings = [...byReference.values()];
  const canonical = $('link[rel="canonical"]').first().attr('href');

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

  return {
    listings,
    cardRefs,
    announcedTotal,
    canonicalPath: canonicalPathOf(canonical),
    pagePostalCode: postalCode ?? null,
    hasNextPage,
    warnings,
  };
}

/** Le chemin du lien canonique, sans domaine ni querystring. `null` si absent. */
function canonicalPathOf(href: string | undefined): string | null {
  if (href === undefined || href === '') return null;
  try {
    return new URL(href, 'https://www.orpi.com/').pathname;
  } catch {
    return null;
  }
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

/**
 * Chemin canonique que sert Orpi à la place d'une annonce qui n'est plus à
 * louer. Le nom parle de lui-même — « biens loués ».
 */
const RENTED_CANONICAL = '/louer/biens-loues/';

/**
 * `true` si le site dit lui-même que cette annonce n'est plus à louer.
 *
 * ORPI NE RÉPOND PAS TOUJOURS 410. Relevé du 2026-09-16 : une fiche partie a
 * rendu 200 et servi l'ACCUEIL du site, sans `data-estate`, avec pour seul
 * signe son lien canonique — `/louer/biens-loues/`. Un 200 ne prouve rien par
 * lui-même (c'est la règle de `shared/withdrawn.ts`), mais ce chemin-là est une
 * déclaration explicite de la source, au même titre qu'un bandeau « annonce
 * introuvable ». Les deux conditions sont exigées ensemble : une fiche qui
 * porterait encore ses données n'est pas retirée sur la foi d'un lien.
 */
export function isWithdrawnDetail(html: string): boolean {
  const $ = cheerio.load(html);
  if ($('[data-estate]').length > 0) return false;
  const canonical = canonicalPathOf($('link[rel="canonical"]').first().attr('href'));
  return canonical === RENTED_CANONICAL;
}

/**
 * Sous-ensemble utile du JSON `data-estate` de la fiche.
 *
 * C'EST LA SEULE PAGE QUI DIT TOUT. La carte de résultats ne publie ni
 * chambres, ni étage, ni dépôt, ni DPE, ni date de parution : le tracking de la
 * liste rend `nbChambres: null`, `etage: null`, `dpe: null` sur les
 * cinquante-sept cartes niçoises du 2026-09-16. Tout cela n'existe que dans ce
 * JSON, dont les valeurs sont exactement celles que la fiche affiche.
 */
interface EstateData {
  readonly price?: number | null;
  readonly priceHC?: number | null;
  readonly deposit?: number | null;
  readonly chargeReserve?: number | null;
  /** Honoraires locataire, honoraires d'état des lieux compris. */
  readonly agencyCommission?: number | null;
  readonly liveableSurface?: number | null;
  readonly surface?: number | null;
  readonly nbRooms?: number | null;
  readonly nbBedrooms?: number | null;
  readonly storyLocation?: number | null;
  readonly nbParkingSpaces?: number | null;
  readonly elevator?: boolean;
  readonly balcony?: boolean;
  readonly terrace?: boolean;
  readonly garden?: boolean;
  readonly garage?: boolean;
  readonly cellar?: boolean;
  readonly swimmingPool?: boolean;
  /** `['furnished']`, `['air_conditioning']`… : les atouts déclarés. */
  readonly comfortFeatures?: readonly string[];
  readonly heatingCoolingFeatures?: readonly string[];
  readonly dpeDisplay?: boolean;
  readonly consumptionIndex?: number | null;
  /** Étiquette climat, sur la même échelle 1–7 que `consumptionIndex`. */
  readonly emissionIndex?: number | null;
  /** Mise en ligne réelle, la seule date de parution fiable d'Orpi. */
  readonly onMarketSince?: string | null;
  readonly zipCode?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly images?: readonly string[];
  readonly city?: { readonly name?: string | null } | null;
  readonly district?: { readonly name?: string | null } | null;
  readonly agency?: {
    readonly name?: string | null;
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

const positive = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * `true` si les trois montants de la fiche prouvent un loyer CHARGES
 * COMPRISES.
 *
 * Orpi affiche « 1 800 € par mois / Charges comprises / Loyer de base :
 * 1 610 € / Provisions pour charges : 190 € ». Le JSON donne les mêmes
 * nombres, et leur somme le démontre : `price = priceHC + chargeReserve`. Sans
 * cette mention, la source entière laissait `chargesIncluded` indéterminé, et
 * ses loyers étaient comparés à des loyers hors charges.
 *
 * Le MONTANT, lui, ne vient pas d'ici : c'est le seul chiffre que la liste
 * publie à chaque passage, et la mémoire des fiches le figerait une semaine
 * — voir `annonceChargesComprises` dans `index.ts`, qui recolle la mention sur
 * le loyer frais de la carte.
 */
function estateChargesIncluded(estate: EstateData): boolean {
  const price = positive(estate.price);
  const priceHC = positive(estate.priceHC);
  const charges = positive(estate.chargeReserve);
  if (price === undefined || priceHC === undefined || charges === undefined) return false;
  return Math.abs(price - (priceHC + charges)) < 1;
}

/** Atouts déclarés par la fiche, dans les mots que la normalisation relit. */
function estateFeatures(estate: EstateData): string | undefined {
  const comfort = new Set([
    ...(estate.comfortFeatures ?? []),
    ...(estate.heatingCoolingFeatures ?? []),
  ]);
  const labels: Array<[boolean, string]> = [
    [estate.garden === true, 'Jardin'],
    [estate.garage === true, 'Garage'],
    [estate.cellar === true, 'Cave'],
    [estate.swimmingPool === true, 'Piscine'],
    [comfort.has('furnished'), 'Meublé'],
    [comfort.has('air_conditioning'), 'Climatisation'],
  ];
  const kept = labels.filter(([present]) => present).map(([, label]) => label);
  return kept.length > 0 ? kept.join(', ') : undefined;
}

/**
 * Les attributs que `extractFeatures` relit tels quels, plus quartier et DPE.
 *
 * `etage` mérite un mot : la table admet `'0'` pour le rez-de-chaussée, si bien
 * qu'un étage nul doit passer — d'où le test sur `null`/`undefined` plutôt que
 * sur la vérité du nombre.
 */
function estateExtra(estate: EstateData): Record<string, string> | undefined {
  const extra: Record<string, string> = {};
  const affiche = estate.dpeDisplay !== false;
  const dpe = affiche ? dpeLetterOfIndex(estate.consumptionIndex) : undefined;
  if (dpe !== undefined) extra['dpe'] = dpe;
  // Le GES est indexé sur la même échelle, dans le même JSON, et le même
  // interrupteur `dpeDisplay` décide de l'afficher ou non.
  const ges = affiche ? dpeLetterOfIndex(estate.emissionIndex) : undefined;
  if (ges !== undefined) extra['ges'] = ges;
  const quartier = nonEmpty(estate.district?.name);
  if (quartier !== undefined) extra['quartier'] = quartier;
  if (estate.storyLocation != null) extra['etage'] = String(estate.storyLocation);
  if (estate.elevator !== undefined) extra['ascenseur'] = estate.elevator ? '1' : '0';
  if (estate.balcony !== undefined) extra['nbBalcons'] = estate.balcony ? '1' : '0';
  if (estate.terrace !== undefined) extra['nbTerrasses'] = estate.terrace ? '1' : '0';
  if (estate.nbParkingSpaces != null) extra['nbParking'] = String(estate.nbParkingSpaces);
  const features = estateFeatures(estate);
  if (features !== undefined) extra['features'] = features;
  if (estateChargesIncluded(estate)) extra[CHARGES_INCLUDED_KEY] = '1';
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/** Marque posée par la fiche, relue par `index.ts` sur le loyer de la carte. */
export const CHARGES_INCLUDED_KEY = 'orpiChargesComprises';

/** « 3 pièces 2 chambres » — les chambres n'existent QUE sur la fiche. */
function estateRoomsText(estate: EstateData): string | undefined {
  const parts: string[] = [];
  if (positive(estate.nbRooms) !== undefined) parts.push(`${estate.nbRooms ?? 0} pièces`);
  if (estate.nbBedrooms != null) parts.push(`${estate.nbBedrooms} chambres`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Tout ce que la fiche apprend, lu dans `data-estate`.
 *
 * La fiche affiche les mêmes valeurs (« Dépôt de garantie : 894 € ») ; le JSON
 * les donne sans libellé à interpréter. Le contact est celui de l'agence qui
 * porte l'annonce, jamais l'e-mail personnel de l'agent — la fiche publie les
 * deux, et `agent.email` est nominatif.
 *
 * L'ADRESSE DU BIEN N'EST PAS ICI : `agency.address1` est celle de l'agence,
 * et la poser en `addressText` ferait gagner le bonus « même adresse » à tous
 * les biens d'une même agence (§14). Seule la description la porte.
 *
 * `onMarketSince` REMPLACE la date de la liste. Sur le bien mesuré, la carte
 * annonçait le 2026-09-16 (le jour du relevé) et la fiche le 2026-07-08.
 *
 * NI LE LOYER NI LES TAGS ne sont repris, et pour la même raison : ce que la
 * fiche apprend est gardé une semaine et réappliqué à chaque passage, donc
 * tout champ repris ici EFFACE une semaine durant ce que la liste publie de
 * frais. Pour le loyer, c'est justement le chiffre que la liste donne à chaque
 * passage ; pour les tags, ils portent le « Meublé » visible que le JSON de la
 * liste contredit parfois. La fiche passe donc par `extra`, qui se fusionne au
 * lieu de remplacer : ses atouts s'ajoutent à ceux de la carte.
 */
function estateFields(estate: EstateData): RawDraft {
  const agency = estate.agency ?? undefined;
  const surface = positive(estate.liveableSurface) ?? positive(estate.surface);
  const agencyName = nonEmpty(agency?.name);
  return compactDraft({
    depositText: euros(estate.deposit),
    chargesText: euros(estate.chargeReserve),
    feesText: euros(estate.agencyCommission),
    areaText: surface === undefined ? undefined : `${surface} m²`,
    roomsText: estateRoomsText(estate),
    cityText: nonEmpty(estate.city?.name),
    postalCodeText: nonEmpty(estate.zipCode),
    latitude: positive(estate.latitude),
    longitude: positive(estate.longitude),
    agencyName: agencyName === undefined ? undefined : `Orpi — ${agencyName}`,
    phoneText: nonEmpty(agency?.phone),
    emailText: nonEmpty(agency?.rentEmail) ?? nonEmpty(agency?.email),
    publishedAtText: nonEmpty(estate.onMarketSince),
    // La carte n'en publie qu'une, en vignette ; la fiche les donne toutes.
    imageUrls: estate.images !== undefined && estate.images.length > 0 ? estate.images : undefined,
    extra: estateExtra(estate),
  });
}

function compactDraft(draft: RawDraft): RawDraft {
  return Object.fromEntries(Object.entries(draft).filter(([, v]) => v !== undefined)) as RawDraft;
}
