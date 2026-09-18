/**
 * Adaptateur générique des sites d'agences sur la plateforme « La Boîte
 * Immo » / Hektor — un seul parser pour plusieurs agences niçoises.
 *
 * Signature de la plateforme (vérifiée le 2026-08-17 sur 6 sites) :
 *   - robots.txt permissif (interdits : /stats, /phpmv2, /fonctions,
 *     /templates, /admin, /images/clients) + sitemap déclaré ;
 *   - pages LISTE server-rendered (`/location/1`, `/a-louer/1`…) avec liens de
 *     fiches contenant `/{id}-{slug}` ;
 *   - fiches avec table clé/valeur `table-aria__tr--{clé}` (code postal,
 *     pièces, meublé, loyer CC, charges…), description
 *     `property-detail-v1__description__text`, photos sur `*.staticlbi.com` ;
 *   - DPE servi en IMAGE générée sous /admin (interdit par robots) → laissé
 *     inconnu, honnêtement. Seul le gabarit « pastilles » l'écrit en
 *     texte (`bubble_dpe_b bubble--active`) : lu là, et là seulement.
 *   - ni rue ni date de disponibilité structurées : seul le texte libre en
 *     parle, et la normalisation l'y lit.
 *   - une fiche RETIRÉE ne rend pas 404 : elle redirige vers l'accueil, qui
 *     répond 200. Seul le `<link rel="canonical">` dit quelle page est servie.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText, slugify } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing } from '../shared/raw-listing.js';
import { collectJsonLdNodes, findJsonLdNode } from '../shared/json-ld.js';

/**
 * Identifiant d'une fiche dans une URL Hektor : dernier segment `{id}-{slug}`
 * (avec `.html` final sur certains sites). Les pages de liste (`/location/2`)
 * et les pages éditoriales (`/contact.html`) n'ont pas cette forme.
 */
const FICHE_SEGMENT = /\/(\d{1,7})-([a-z0-9][a-z0-9-]*)(?:\.html)?\/?$/i;

export interface ParsedHektorUrl {
  readonly reference: string;
  readonly canonicalUrl: string;
  /** Slug de ville si l'URL contient un segment `/1-{ville}/` (sites à zones). */
  readonly citySlug: string | null;
}

/** Analyse une URL de fiche. `null` si ce n'en est pas une. */
export function parseListingUrl(href: string, baseUrl: string): ParsedHektorUrl | null {
  let resolved: URL;
  try {
    resolved = new URL(href, baseUrl);
  } catch {
    return null;
  }
  // Jamais hors du site de l'agence.
  if (new URL(baseUrl).hostname !== resolved.hostname) return null;

  const match = FICHE_SEGMENT.exec(resolved.pathname);
  if (match?.[1] === undefined) return null;
  // Les listes paginées type `/location/2` ont un id mais pas de slug — le
  // motif exige le tiret, donc elles sont déjà écartées. Écarte aussi les
  // pages de zone `/location/1-nice/` sans fiche (le segment fiche est final).
  // Certains gabarits préfixent le département (`/06-alpes-maritimes/1-nice/`) :
  // ce segment-là n'est pas la commune.
  const citySlug =
    [...resolved.pathname.matchAll(/\/\d{1,5}-([a-z-]+)(?=\/)/gi)]
      .map((m) => m[1] ?? '')
      .find((slug) => slug.toLowerCase() !== 'alpes-maritimes') ?? null;

  return {
    reference: match[1],
    canonicalUrl: `${resolved.origin}${resolved.pathname}`,
    citySlug: citySlug?.toLowerCase() ?? null,
  };
}

export interface ParsedList {
  readonly urls: readonly ParsedHektorUrl[];
  readonly warnings: readonly string[];
  /** `true` si la page dit n'avoir aucun bien : liste vide, pas gabarit cassé. */
  readonly empty: boolean;
  /** Page suivante de la même liste, ou `null` si celle-ci est la dernière. */
  readonly nextPageUrl: string | null;
}

/** Une liste paginée s'écrit `{chemin}/{numéro}` : `/location/2`, `/a-louer/3`. */
const LIST_PAGE_PATH = /^(.*\/)(\d+)$/;

interface ListPage {
  readonly prefix: string;
  readonly number: number;
}

function listPage(url: URL): ListPage | null {
  const match = LIST_PAGE_PATH.exec(url.pathname);
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { prefix: match[1], number: Number(match[2]) };
}

/**
 * LA PAGE 2 N'ÉTAIT JAMAIS LUE, et rien ne le disait.
 *
 * L'adaptateur ne connaissait que les adresses écrites à la main dans son
 * descripteur. Relevé du 2026-09-17 : giletta-properties.com publie 53
 * locations sur six pages, trois adresses étaient déclarées — 23 annonces
 * n'avaient jamais été vues ; immobiliereroseland.fr en publie 21 sur trois
 * pages pour deux adresses déclarées. Le stock grossit, la liste écrite à la
 * main reste où elle était.
 *
 * TROIS HABILLAGES POUR LA MÊME PAGINATION, selon l'âge du gabarit : le lien
 * `rel="next"` de l'en-tête, la liste `ul.pagination` à boutons, et le bloc
 * `pagination__items` à flèches. On les lit tous les trois et on retient le
 * plus petit numéro au-delà de la page courante — le suivant, quel que soit
 * l'habillage.
 *
 * ON NE SE FIE PAS AU PLUS GRAND NUMÉRO AFFICHÉ : au-delà de sa dernière page,
 * la plateforme sert une liste vide en continuant d'offrir des liens (page 7
 * de giletta propose encore une page 8). C'est l'absence de nouvelle fiche qui
 * ferme la pagination, côté scraper, et non la disparition des liens.
 */
function nextPageUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  let current: URL;
  try {
    current = new URL(pageUrl);
  } catch {
    return null;
  }
  const here = listPage(current);
  if (here === null) return null;

  let next: number | null = null;
  const consider = (href: string | undefined): void => {
    if (href === undefined) return;
    let candidate: URL;
    try {
      candidate = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (candidate.hostname !== current.hostname) return;
    const page = listPage(candidate);
    if (page === null || page.prefix !== here.prefix || page.number <= here.number) return;
    if (next === null || page.number < next) next = page.number;
  };

  consider($('link[rel="next"]').first().attr('href'));
  $('[class*="pagination"] a[href]').each((_index, anchor) => consider($(anchor).attr('href')));

  return next === null ? null : `${current.origin}${here.prefix}${String(next)}`;
}

/**
 * Bandeaux de liste vide de la plateforme, relevés le 2026-09-15 : acsimmo.fr,
 * agence-api.com et laclefimmobiliere.com, westimmo-properties.com. Le bouton
 * « Aucune annonce trouvée » seul ne compte pas : il est aussi sur les listes
 * pleines.
 */
const EMPTY_LIST = new RegExp(
  [
    String.raw`aucun\s+bien\s+ne\s+correspond\s+[àa]\s+vos\s+crit[èe]res`,
    String.raw`aucun\s+bien\s+n['’]est\s+disponible\s+pour\s+le\s+moment`,
    String.raw`aucune\s+annonce\s+trouv[ée]e\s+selon\s+vos\s+crit[èe]res`,
  ].join('|'),
  'i',
);

/**
 * Fiche de démonstration laissée sur un site neuf : slug « test »
 * (dominiceimmobilier.com, terrain de 50 m² à Paris) ou slug vide, fiche sans
 * titre ni type (gestymo.com, Boulouparis à 123 €). Ni l'une ni l'autre n'est
 * un bien à louer.
 */
const DEMO_FICHE = /\/\d{1,7}-(?:test)?(?:\.html)?\/?$/i;

function isDemoFiche(href: string, baseUrl: string): boolean {
  try {
    return DEMO_FICHE.test(new URL(href, baseUrl).pathname);
  } catch {
    return false;
  }
}

/**
 * Liste SANS liens de fiche (Riviera Angels : titre vers l'accueil, boutons
 * obfusqués). L'identifiant est le `rel` du bouton de sélection, et la fiche
 * `/{id}-{titre en slug}.html` — un slug inexact répond 301 sans destination.
 * Recours seulement : ailleurs, le lien fait foi.
 */
function unlinkedCards($: cheerio.CheerioAPI, pageUrl: string): ParsedHektorUrl[] {
  const origin = new URL(pageUrl).origin;
  return $('button.ajoutPanierSelection[rel]')
    .toArray()
    .flatMap((button) => {
      const reference = ($(button).attr('rel') ?? '').trim();
      const title = cleanText($(button).closest('article').find('h2').first().text());
      if (!/^\d{1,7}$/.test(reference) || title === '') return [];
      return parseListingUrl(`${origin}/${reference}-${slugify(title)}.html`, pageUrl) ?? [];
    });
}

/** Extrait les liens de fiches d'une page de liste. */
export function parseListPage(html: string, pageUrl: string): ParsedList {
  const $ = cheerio.load(html);
  const seen = new Map<string, ParsedHektorUrl>();
  let demoSeen = false;

  // Une annonce sans titre n'a parfois aucun lien, seulement des boutons
  // `data-url` (sudagence.fr).
  $('a[href], [data-url]').each((_i, el) => {
    const href = $(el).attr('href') ?? $(el).attr('data-url') ?? '';
    if (isDemoFiche(href, pageUrl)) {
      demoSeen = true;
      return;
    }
    const parsed = parseListingUrl(href, pageUrl);
    if (parsed !== null && !seen.has(parsed.reference)) seen.set(parsed.reference, parsed);
  });
  if (seen.size === 0) {
    for (const parsed of unlinkedCards($, pageUrl)) {
      if (!seen.has(parsed.reference)) seen.set(parsed.reference, parsed);
    }
  }

  const urls = [...seen.values()];
  // Une liste qui ne montre que la fiche de démonstration est vide.
  const empty = urls.length === 0 && (demoSeen || EMPTY_LIST.test($('body').text()));
  return {
    urls,
    warnings: urls.length === 0 && !empty ? [`Aucune fiche trouvée sur la liste : ${pageUrl}`] : [],
    empty,
    nextPageUrl: nextPageUrl($, pageUrl),
  };
}

export interface ParsedDetail {
  readonly listing: RawListing | null;
  readonly warnings: readonly string[];
  /** La fiche demandée n'est plus servie : l'occurrence peut s'éteindre. */
  readonly withdrawn?: boolean;
}

/**
 * La fiche d'une annonce retirée ne répond pas 404 : la plateforme REDIRIGE
 * vers l'accueil, qui répond 200. Sans garde, cette page d'accueil était lue
 * comme une fiche et fabriquait une annonce dont le titre valait le nom de
 * l'agence et dont tout le reste était vide, affichée comme un bien à visiter
 * (sudagence.fr, fiche 282, relevée le 2026-09-16 : absente du sitemap, encore
 * sur la liste, sa fiche menant à l'accueil).
 *
 * Le `<link rel="canonical">` du gabarit dit quelle page est réellement servie.
 * S'il désigne autre chose que la fiche demandée, on ne lit rien : mieux vaut
 * une annonce absente qu'une annonce inventée.
 *
 * Deux prudences : sans canonique, on ne conclut rien ; et une canonique
 * d'un AUTRE domaine (réseau qui canonise vers son siège) ne dit rien non plus
 * de la présence du bien.
 */
function servedElsewhere($: cheerio.CheerioAPI, parsedUrl: ParsedHektorUrl): boolean {
  const href = cleanText($('link[rel="canonical"]').first().attr('href') ?? '');
  if (href === '') return false;
  let canonical: URL;
  try {
    canonical = new URL(href, parsedUrl.canonicalUrl);
  } catch {
    return false;
  }
  if (canonical.hostname !== new URL(parsedUrl.canonicalUrl).hostname) return false;
  const served = parseListingUrl(canonical.href, parsedUrl.canonicalUrl);
  return served === null || served.reference !== parsedUrl.reference;
}

/** Libellés de la table sans classe de clé, ramenés aux clés des autres gabarits. */
const LABEL_KEYS: readonly (readonly [RegExp, string])[] = [
  [/^loyer cc/i, 'loyer_cc'],
  [/^code postal/i, 'cp'],
  [/^nombre de pièces/i, 'nbpiecees'],
  [/^meublé/i, 'meuble'],
  [/^charges locatives/i, 'ChargesAnnonceLocation_forfaitaires_mensuelles'],
  [/^surface habitable/i, 'surface_habitable'],
  [/^nombre de chambre/i, 'nbchambres'],
  [/^[ée]tage$/i, 'etage'],
];

function keyOfLabel(label: string): string | undefined {
  if (label === '') return undefined;
  return LABEL_KEYS.find(([pattern]) => pattern.test(label))?.[1] ?? slugify(label);
}

/**
 * Lit la table clé/valeur `table-aria` de la fiche.
 *
 * La plateforme sert DEUX variantes de gabarit pour la même table :
 *   - `class="table-aria__tr table-aria__tr--surface"`  (clé dans le modifieur)
 *   - `class="table-aria__tr surf_carrez_loi_boutin"`   (clé en seconde classe)
 * Ne lire que la première laissait des fiches entières sans prix ni surface
 * (constaté sur immobiliere-nicoise.com : 26 lignes, aucune reconnue). On
 * accepte donc les deux formes.
 *
 * Une troisième n'a aucune classe de clé, seulement le libellé dans sa
 * première cellule (aurusimmo.com) : il est ramené à la clé équivalente.
 */
function readAriaTable($: cheerio.CheerioAPI): Map<string, string> {
  const rows = new Map<string, string>();
  $('[class*="table-aria__tr"]').each((_i, el) => {
    const className = $(el).attr('class') ?? '';
    const cells = $(el).find('[role="cell"]');
    // Variante « modifieur » d'abord ; sinon, la première classe qui n'est pas
    // un nom de bloc de la plateforme ; sinon, le libellé.
    const key =
      /table-aria__tr--([\w-]+)/.exec(className)?.[1] ??
      className.split(/\s+/).find((name) => name !== '' && !name.startsWith('table-aria')) ??
      (cells.length > 1 ? keyOfLabel(cleanText($(cells.get(0)).text())) : undefined);
    if (key === undefined || rows.has(key)) return;
    const value = cleanText($(cells.get(cells.length - 1)).text());
    if (value !== '') rows.set(key, value);
  });
  // Quatrième variante, sans table : une liste `<li class="data">Étage : 2</li>`
  // (AA Gestion, Riviera Angels). Mêmes libellés, donc mêmes clés — sans quoi
  // l'étage et les chambres qu'elle est seule à porter étaient perdus.
  $('li.data').each((_i, el) => {
    const pair = /^([^:]+?)\s*:\s*(.+)$/.exec(cleanText($(el).text()));
    const key = pair?.[1] !== undefined ? keyOfLabel(pair[1]) : undefined;
    if (key === undefined || pair?.[2] === undefined || rows.has(key)) return;
    rows.set(key, pair[2]);
  });
  return rows;
}

/**
 * Valeurs des libellés « Loyer CC* / mois », « Code postal »… lus dans le texte
 * de la page. Les gabarits sans table `table-aria` (listes `<li>`, paires
 * `title_finance`/`price_finance`, `termInfos`/`valueInfos`) écrivent tous ces
 * mêmes libellés, avec ou sans deux-points.
 */
interface LabelledValues {
  readonly rentCc?: string;
  readonly postalCode?: string;
  readonly area?: string;
  readonly rooms?: string;
  readonly furnished?: string;
  readonly charges?: string;
  readonly city?: string;
  readonly rentHc?: string;
  readonly deposit?: string;
  readonly fees?: string;
}

function readLabels($: cheerio.CheerioAPI): LabelledValues {
  const body = $('body').clone();
  body.find('script, style, noscript').remove();
  const text = body.text().replace(/\s+/g, ' ');
  const pick = (pattern: RegExp): string | undefined => pattern.exec(text)?.[1]?.trim();
  const amount = String.raw`(\d[\d  .]*(?:,\d+)?)\s*€`;
  const values = {
    rentCc: pick(new RegExp(String.raw`Loyer CC\* \/ mois\s*:?\s*${amount}`)),
    postalCode: pick(/Code postal\s*:?\s*(\d{5})\b/),
    area: pick(/Surface (?:habitable|loi Boutin) \(m²\)\s*:?\s*(\d+(?:[.,]\d+)?)/),
    rooms: pick(/Nombre de pièces\s*:?\s*(\d+)\b/),
    furnished: pick(/Meublé\s*:?\s*(OUI|NON)\b/),
    city: pick(/La ville de ([^()]+?)\s*\(\d{5}\)/),
    // Le libellé porte sa parenthèse : on s'arrête au premier chiffre.
    charges: pick(new RegExp(String.raw`Charges locatives[^:€\d]*:?\s*${amount}`)),
    rentHc: pick(new RegExp(String.raw`Loyer HC\* \/ mois\s*:?\s*${amount}`)),
    deposit: pick(new RegExp(String.raw`Dépôt de garantie[^:€\d]*:?\s*${amount}`)),
    fees: pick(new RegExp(String.raw`Honoraires[^:€\d]*charge locataire\s*:?\s*${amount}`)),
  };
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as LabelledValues;
}

/**
 * Titres qui ne sont pas l'annonce : bandeau de recherche, ou h1 réduit à la
 * commune (« Nice », « La ville de Nice (06000) ») sur les anciens gabarits.
 */
const JUNK_H1 = /recherche de biens|^la ville de |^[\p{L}' -]{2,30}$/iu;

/**
 * Les trois titres d'une fiche : celui de la plateforme, celui de l'agence, et
 * celui qu'on retient.
 *
 * Le `<title>` « Location appartement Nice 3 pièces 54.25m² 1460€ | Agence »,
 * généré, est riche ; le h1 est le titre libre de l'annonce, et le gabarit
 * éditorial y préfixe la commune dans un premier `span`.
 *
 * LE NOM DE L'AGENCE N'EST PAS UN TITRE D'ANNONCE : c'est le `<title>` de ses
 * pages d'habillage. Garde de dernier recours, si une page sans fiche passait
 * malgré la canonique.
 */
function readTitles(
  $: cheerio.CheerioAPI,
  agencyName: string,
): { pageTitle: string; h1: string; title: string } {
  const pageTitle = cleanText($('title').first().text()).split('|')[0]?.trim() ?? '';
  const rawH1 = cleanText(
    ($('h1 .title__content-2').first().text() || $('h1').first().text()).replace(/\s+/g, ' '),
  );
  const h1 = JUNK_H1.test(rawH1) ? '' : rawH1;
  const fromTitle = slugify(pageTitle) === slugify(agencyName) ? '' : pageTitle;
  return { pageTitle, h1, title: h1 !== '' ? h1 : fromTitle };
}

/** Les codes postaux 06000 à 06300 ne desservent que Nice. */
function cityFromPostalCode(postalCode: string | undefined): string | undefined {
  return postalCode !== undefined && /^06[0-3]00$/.test(postalCode) ? 'Nice' : undefined;
}

/**
 * La photo en taille d'affichage : seul le segment de taille, juste avant
 * `/images/biens/`, change. Un `/original/` plus loin dans le chemin est un
 * dossier du CDN, pas une taille : le remplacer donnait une adresse en 404.
 */
function displaySize(url: string): string {
  return url.replace(
    /^(https:\/\/[^/]+)\/(?:original|\d+x(?:\d+|auto))(?=\/images\/biens\/)/,
    '$1/1600xauto',
  );
}

/** Dossier CDN d'une photo : `/images/biens/1/{dossier}/photo_….jpg`, un par bien. */
const PHOTO_FOLDER = /\/images\/biens\/\d+\/([^/]+)\//;

/**
 * Les photos du dossier le plus fourni, le premier en cas d'égalité : une
 * vignette d'une autre annonce (bloc « autres annonces » au balisage inconnu)
 * vient d'un autre dossier.
 */
function ownGallery(urls: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const folder = PHOTO_FOLDER.exec(url)?.[1];
    if (folder !== undefined) counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  let own: string | undefined;
  for (const [folder, count] of counts) {
    if (own === undefined || count > (counts.get(own) ?? 0)) own = folder;
  }
  return urls.filter((url) => {
    const folder = PHOTO_FOLDER.exec(url)?.[1];
    return folder === undefined || folder === own;
  });
}

/**
 * Le téléphone de l'agence, en pied de page (`coords-phone`, ou
 * `footer_element`), sinon le bouton « Afficher le téléphone » de la fiche.
 *
 * Ce bouton est le dernier recours parce qu'il est parfois le SEUL : plusieurs
 * gabarits de la plateforme ne mettent aucune coordonnée en pied de fiche
 * (sudagence.fr, aagestion.net, rivieraangels.com), et l'annonce sortait alors
 * sans numéro — on ne pouvait que remplir le formulaire et attendre.
 */
function agencyPhone($: cheerio.CheerioAPI): string | undefined {
  // Deux recherches, pas un sélecteur unique : `first()` prendrait le premier
  // dans l'ORDRE DE LA PAGE, où le bouton de la fiche précède le pied de page.
  return (
    lienDecode(
      $,
      '.coords-phone a[href^="tel:"], a.coords-phone__content[href^="tel:"], .footer_element__content a.phone[href^="tel:"]',
      /^tel:/,
    ) ?? lienDecode($, 'a.dispPhoneAgency[href^="tel:"]', /^tel:/)
  );
}

/**
 * Cible du premier lien correspondant, privée de son schéma. `undefined` si la
 * page n'a pas ce lien.
 *
 * « tel:   06 00 00 00 00 » : la plateforme laisse les espaces du gabarit.
 */
function lienDecode($: cheerio.CheerioAPI, selecteur: string, schema: RegExp): string | undefined {
  const href = $(selecteur).first().attr('href');
  return href === undefined ? undefined : cleanText(href.replace(schema, ''));
}

/**
 * L'e-mail de l'agence, au même endroit que son téléphone. La fiche n'offre
 * qu'un formulaire : sans cette adresse, on ne pouvait qu'attendre une réponse.
 * Le JSON-LD `RealEstateAgent` la porte aussi, sur les gabarits sans pied de
 * page ; à défaut, le destinataire du formulaire de contact.
 */
function agencyEmail($: cheerio.CheerioAPI): string | undefined {
  const pied = lienDecode(
    $,
    '.coords-mail a[href^="mailto:"], a.coords-mail__content[href^="mailto:"], .footer_element__content a.mail[href^="mailto:"]',
    /^mailto:/,
  );
  if (pied !== undefined && pied !== '') return pied;
  const agent = findJsonLdNode(collectJsonLdNodes($), ['realestateagent']);
  const email = agent?.['email'];
  if (typeof email === 'string' && email.includes('@')) return cleanText(email);
  return destinataireDuFormulaire($);
}

/** Une adresse, et rien d'autre : le champ sert aussi à autre chose ailleurs. */
const EMAIL_SEUL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * Le formulaire de contact porte son destinataire dans un champ caché : c'est
 * l'adresse à laquelle il écrirait, et sur plusieurs gabarits de la plateforme
 * c'est le SEUL endroit où la page la donne — ni pied de page, ni JSON-LD.
 *
 * Le même gabarit pose un second champ de même nom, vide, destiné à la saisie :
 * seul un champ portant une adresse compte.
 */
function destinataireDuFormulaire($: cheerio.CheerioAPI): string | undefined {
  return $('input[name="data[Contact][to]"]')
    .map((_i, element) => cleanText($(element).attr('value') ?? ''))
    .get()
    .find((valeur) => EMAIL_SEUL.test(valeur));
}

/**
 * Gabarit « detail_content » : la référence de l'agence (« Référence L02 »),
 * « Nice (06000) » sous le titre, et les caractéristiques en simple liste
 * (« quartier LE PIOL », « cave », « exposition Sud-Ouest »). Rien de tout
 * cela n'était lu : ni quartier, ni code postal, ni référence.
 */
interface DetailContent {
  readonly reference?: string;
  /** Rue saisie à la place de la référence (« Référence 37 Boulevard … »). */
  readonly address?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly district?: string;
  /** Étage du logement, « 0 » pour un rez-de-chaussée. */
  readonly floor?: string;
  readonly bedrooms?: string;
  readonly items: readonly string[];
}

/** Étage du logement dans la liste de caractéristiques : « 1er étage », « RDC ». */
const ITEM_FLOOR = /^(?:(\d{1,2})\s*(?:er|[èe]me|e)\s+[ée]tage|(rez[- ]de[- ]chauss[ée]e))$/i;

/**
 * Hauteur de l'IMMEUBLE, écrite « 5 étage(s) » juste après l'étage du logement.
 * Sans la distinguer, un bien qui ne déclare que cette ligne se voyait attribuer
 * l'étage de l'immeuble entier — un fait faux, pas une donnée manquante.
 */
const ITEM_BUILDING_FLOORS = /^(\d{1,2})\s+[ée]tage\(s\)$/i;

/** Chambres dans la même liste : « 2 chambre(s) ». */
const ITEM_BEDROOMS = /^(\d{1,2})\s+chambres?(?:\(s\))?$/i;

/** Numéro puis type de voie : « 37 Boulevard François Grosso », « 4 bis, rue … ». */
const STREET =
  /^\d{1,4}\s*(?:bis|ter)?\s*,?\s+(?:rue|avenue|av\.?|boulevard|bd|place|chemin|route|impasse|all[ée]e|quai|promenade|square|cours|mont[ée]e|traverse|corniche|esplanade|passage)\s+\S/i;

/**
 * La référence de l'agence, dans les trois endroits où le gabarit l'écrit.
 *
 * LA RÉFÉRENCE PEUT CONTENIR DES ESPACES : les agences y écrivent le nom du
 * bien (« T2 MEUBLE DIA », « MOSCO Grosso »). Exiger un seul mot la perdait, et
 * l'identifiant d'URL prenait sa place — un numéro qui ne retrouve l'annonce ni
 * au téléphone ni sur les portails.
 *
 * `content__reference` MANQUAIT, et c'est le gabarit le plus répandu. Relevé du
 * 2026-09-17 : la fiche 358 de giletta-properties.com affiche « Ref : CAMA », et
 * nous enregistrions « 358 », le segment de son adresse. Vingt-quatre agences de
 * la plateforme étaient dans ce cas, environ cent cinquante annonces — dont
 * toutes celles de Giletta, d'Immobilière GTI et de SAG. Bien'ici, lui, publie
 * « CAMA » : deux fiches du même logement ne pouvaient donc pas se reconnaître.
 *
 * Le bloc « Ces biens peuvent aussi vous intéresser » porte le même libellé pour
 * d'AUTRES annonces : il est écarté, sans quoi la fiche emprunterait la
 * référence de sa voisine.
 */
function agencyReference($: cheerio.CheerioAPI): string {
  const fromBlock = $('.content__reference, .id_ref_item')
    .filter(
      (_i, el) =>
        $(el).closest('[class*="properties-related"], [class*="property-more"]').length === 0,
    )
    .first()
    .text();
  const cleaned = cleanText(fromBlock).replace(/^R[ée]f\.?\s*:?\s*/i, '');
  if (cleaned !== '') return cleaned;
  // « Référence : 19 » en paragraphe `.ref` sur l'ancien gabarit (AA Gestion).
  return (
    /^R[ée]f[ée]rence\s*:?\s*(.+)$/i.exec(cleanText($('p.ref').first().text()))?.[1]?.trim() ?? ''
  );
}

function readDetailContent($: cheerio.CheerioAPI): DetailContent {
  const reference = agencyReference($);
  const location = /^(.+?)\s*\((\d{5})\)$/.exec(cleanText($('.text_location_item').first().text()));
  const rawItems = $('.list_items .list_item')
    .filter((_i, el) => $(el).closest('[class*="property-more"]').length === 0)
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((text) => text !== '');
  const floorMatch = rawItems.map((item) => ITEM_FLOOR.exec(item)).find((m) => m !== null);
  const floor = floorMatch?.[1] ?? (floorMatch?.[2] !== undefined ? '0' : undefined);
  const bedrooms = rawItems
    .map((item) => ITEM_BEDROOMS.exec(item)?.[1])
    .find((v) => v !== undefined);
  // « 5 étage(s) » compte les niveaux de l'immeuble : reformulé pour qu'aucune
  // relecture ne le prenne pour l'étage du logement.
  const items = rawItems.map((item) =>
    ITEM_BUILDING_FLOORS.test(item)
      ? `Immeuble : ${ITEM_BUILDING_FLOORS.exec(item)?.[1] ?? ''} niveaux`
      : item,
  );
  const district = items
    .map((item) => /^quartier\s*:?\s+(.+)$/i.exec(item)?.[1])
    .find((value) => value !== undefined);
  // Méditerranée Immo écrit parfois l'adresse du bien dans le champ référence :
  // c'est une rue, pas un code qui retrouve l'annonce.
  const isStreet = STREET.test(reference);
  return {
    ...(reference !== '' && !isStreet ? { reference } : {}),
    ...(isStreet ? { address: reference } : {}),
    ...(location?.[1] !== undefined ? { city: location[1] } : {}),
    ...(location?.[2] !== undefined ? { postalCode: location[2] } : {}),
    ...(district !== undefined ? { district } : {}),
    ...(floor !== undefined ? { floor } : {}),
    ...(bedrooms !== undefined ? { bedrooms } : {}),
    items,
  };
}

/** Emplacements de la description, du gabarit courant aux plus anciens. */
const DESCRIPTION_SELECTORS = [
  '[class*="description__text"]',
  '.detail-data-description [class*="text-content"]',
  '.editorial-v2__text_structure .text__content',
  '.offreContent',
  '.description .details',
  '.editorial__text',
  // Gabarit « contentDt » (immobilieregti.com) : le texte n'a que son microdata.
  'p[itemprop="description"], div[itemprop="description"]',
];

/** Clés booléennes de la table promues en atouts quand elles valent OUI. */
const FEATURE_KEYS: Readonly<Record<string, string>> = {
  balcon: 'Balcon',
  terrasse: 'Terrasse',
  ASCENSEUR: 'Ascenseur',
  ascenseur: 'Ascenseur',
  interphone: 'Interphone',
  cave: 'Cave',
  parking: 'Parking',
  climatisation: 'Climatisation',
};

/**
 * Type de bien et ville, depuis le `<title>` plateforme (« Location {type}
 * {Ville} … »), avec repli sur l'URL. Extrait pour alléger `parseDetailPage`.
 */
function parseTypeAndCity(
  pageTitle: string,
  parsedUrl: ParsedHektorUrl,
  labelledCity: string | undefined,
): { propertyTypeText: string | undefined; cityText: string | undefined } {
  const match =
    /^location\s+(appartement|studio|maison|villa|parking|garage|local|chambre|duplex|loft)\s+(.+?)(?:\s+\d|$)/i.exec(
      pageTitle,
    );
  // Le libellé « La ville de … » fait foi. Un titre libre (« Appartement meublé
  // à Nice Musiciens ») ne donne la commune que s'il concorde avec l'URL.
  // Ancien gabarit, sans commune : « Location Appartement 3 pièce(s) 64,36m² »
  // donnerait « 3 pièce(s) ». Une commune ne commence pas par un chiffre.
  const titleTown = match?.[2]?.trim();
  const fromTitle = titleTown !== undefined && !/^\d/.test(titleTown) ? titleTown : undefined;
  const slug = parsedUrl.citySlug;
  const titleAgrees = fromTitle !== undefined && (slug === null || slugify(fromTitle) === slug);
  // Titre libre (« Location Magnifique F1 Aperçu Mer ») : le type est dans l'URL
  // (`/2-appartement/` ou `/appartement/`). Sans lui, inconnu : l'adresse de la
  // fiche n'est pas un type.
  //
  // Le DERNIER segment le porte aussi, quand il vaut exactement un type
  // (`/553-appartement`, `/282-garage`) : cinq fiches de Sud Agence sur neuf
  // n'avaient aucun type, leur `<title>` étant un titre libre. Le segment doit
  // valoir le type ENTIER : « /282-garage-saint-roch » est un titre en slug,
  // pas une catégorie.
  const fromUrl =
    /\/(?:\d{1,7}-)?(appartement|studio|maison|villa|parking|garage|local|chambre)(?:\.html)?(?:\/|$)/i.exec(
      new URL(parsedUrl.canonicalUrl).pathname,
    )?.[1];
  return {
    propertyTypeText: match?.[1] ?? fromUrl,
    cityText:
      labelledCity ??
      (titleAgrees ? fromTitle : slug !== null ? slug.replace(/-/g, ' ') : undefined),
  };
}

interface Figures {
  readonly priceText: string | undefined;
  readonly areaText: string | undefined;
  readonly roomsText: string | undefined;
  readonly furnishedText: string;
}

/** Loyer, surface, pièces et ameublement : la table d'abord, puis les libellés et titres. */
function readFigures(
  table: Map<string, string>,
  labels: LabelledValues,
  content: DetailContent,
  pageTitle: string,
  h1: string,
): Figures {
  // Prix : la table (loyer CC) fait foi, puis le libellé, le <title> en secours.
  const loyerCc =
    table.get('loyer_cc') ?? (labels.rentCc !== undefined ? `${labels.rentCc} €` : undefined);
  const loyerHc = labels.rentHc !== undefined ? `${labels.rentHc} € HC` : undefined;
  const priceText =
    loyerCc !== undefined
      ? `${loyerCc} CC`
      : (loyerHc ?? pageTitle.match(/[\d\s.,]+\s*€/)?.[0] ?? undefined);

  // Surface. La SURFACE HABITABLE déclarée passe avant le titre : un titre est
  // arrondi à la main (« Grand studio vide de 33 m² » pour 33,26 m² déclarés,
  // sudagence.fr), quand la case l'est rarement. Les surfaces Carrez/Boutin
  // restent APRÈS le titre : elles mesurent autre chose, et certaines agences
  // ne remplissent qu'elles (immobiliere-nicoise.com : `surf_carrez_loi_boutin`).
  const measured = (...keys: readonly string[]): string | undefined => {
    const value = keys.map((key) => table.get(key)).find((v) => v !== undefined && /\d/.test(v));
    return value !== undefined ? `${value.replace(/[^\d.,]/g, '')} m²` : undefined;
  };
  const habitable = measured('surface', 'surf_habitable', 'surface_habitable');
  // Le h1 engendré (« Appartement 1 pièce(s) 27.46 m² ») passe avant le titre
  // libre, qui peut nommer une autre surface (« terrasse de 8 m² »).
  const areaText =
    /pièce\(s\).*?(\d+(?:[.,]\d+)?\s*m²)/i.exec(h1)?.[1] ??
    habitable ??
    `${pageTitle} ${h1}`.match(/\d+(?:[.,]\d+)?\s*m²/i)?.[0] ??
    measured('surf_carrez_loi_boutin') ??
    (labels.area !== undefined ? `${labels.area} m²` : undefined);
  const roomsFromTable = table.get('nbpiecees') ?? labels.rooms;
  // Titre libre sans pièces (englimmo.com) : le h1 engendré « Studio 1 pièce(s) » les donne.
  const rooms =
    roomsFromTable !== undefined
      ? `${roomsFromTable} pièces`
      : `${pageTitle} ${h1}`.match(/\d+\s*pièces?/i)?.[0];
  // Chambres déclarées : convention « N pièces M chambres », lue telle quelle
  // par la normalisation. Sans elles, un trois-pièces n'en annonçait aucune.
  const bedrooms = table.get('nbchambres') ?? content.bedrooms;
  const roomsText = bedrooms === undefined ? rooms : `${rooms ?? ''} ${bedrooms} chambres`.trim();

  // Meublé : la table est explicite (OUI/NON) — un texte fidèle à sa valeur,
  // jamais un « meublé » par défaut, qui inverserait le sens.
  const meuble = table.get('meuble') ?? labels.furnished;
  // « Non renseigné » ne dit rien : seuls OUI et NON tranchent.
  const furnishedText =
    meuble === undefined || !/^(oui|non)$/i.test(meuble)
      ? ''
      : /^oui$/i.test(meuble)
        ? 'meublé'
        : 'non meublé';

  return { priceText, areaText, roomsText, furnishedText };
}

/** Étiquette du gabarit « pastilles » : la lettre marquée active. */
function energyClass($: cheerio.CheerioAPI, kind: 'dpe' | 'ges'): string | undefined {
  const letter = cleanText($(`[class*="bubble_${kind}_"].bubble--active`).first().text());
  return /^[A-G]$/i.test(letter) ? letter.toUpperCase() : undefined;
}

/**
 * Quartier déclaré : ligne `QUARTIER` de la table, paire `termInfos`
 * (« Quartier LANTERNE »), puis puce « quartier LE PIOL ». Le préfixe de la
 * commune (« NICE - CIMIEZ ») est retiré.
 */
function declaredDistrict(
  $: cheerio.CheerioAPI,
  table: Map<string, string>,
  content: DetailContent,
): string | undefined {
  const term = $('.termInfos')
    .filter((_i, el) => /^quartier$/i.test(cleanText($(el).text())))
    .first()
    .nextAll('.valueInfos')
    .first()
    .text();
  const district = table.get('QUARTIER') ?? table.get('quartier') ?? (cleanText(term) || undefined);
  const value = (district ?? content.district)?.replace(/^nice\s*[-–]\s*/i, '').trim();
  return value !== undefined && value !== '' ? value : undefined;
}

/** Atouts (caractéristiques, vue, exposition), quartier, DPE et référence d'agence. */
function hektorExtra(
  table: Map<string, string>,
  content: DetailContent,
  declared: {
    readonly district: string | undefined;
    readonly dpe: string | undefined;
    readonly ges: string | undefined;
  },
): Record<string, string> {
  const vue = table.get('vue');
  const exposition = table.get('exposition');
  const featureList = [
    ...[...table.entries()]
      .filter(([key, value]) => FEATURE_KEYS[key] !== undefined && /^oui$/i.test(value))
      .map(([key]) => FEATURE_KEYS[key] as string),
    ...(vue !== undefined ? [`Vue ${vue}`] : []),
    ...(exposition !== undefined ? [`Exposition ${exposition}`] : []),
    ...content.items,
  ];
  // La référence que l'agence AFFICHE, qui la retrouve sur les portails. Sans
  // elle, pas de ligne « Réf. agence » : l'identifiant d'URL qui servait de
  // repli ne désigne rien chez l'agence.
  const extra: Record<string, string> = {};
  if (content.reference !== undefined) extra['reference'] = content.reference;
  if (featureList.length > 0) extra['features'] = featureList.join(' · ');
  if (declared.district !== undefined) extra['quartier'] = declared.district;
  if (declared.dpe !== undefined) extra['dpe'] = declared.dpe;
  if (declared.ges !== undefined) extra['ges'] = declared.ges;
  const floor = declaredFloor(table) ?? content.floor;
  if (floor !== undefined) extra['etage'] = floor;
  return extra;
}

/** Étage déclaré dans la table : « 2 », « Rez-de-chaussée ». */
function declaredFloor(table: Map<string, string>): string | undefined {
  const value = table.get('etage') ?? table.get('Etage');
  if (value === undefined) return undefined;
  if (/rez.de.chauss/i.test(value)) return '0';
  return /^(\d{1,2})\b/.exec(value)?.[1];
}

export function parseDetailPage(html: string, pageUrl: string, agencyName: string): ParsedDetail {
  const parsedUrl = parseListingUrl(pageUrl, pageUrl);
  if (parsedUrl === null) {
    return { listing: null, warnings: [`URL inattendue pour une fiche : ${pageUrl}`] };
  }
  // Fiche de démonstration : écartée sans avertissement, rien n'est cassé.
  if (isDemoFiche(pageUrl, pageUrl)) return { listing: null, warnings: [] };

  const $ = cheerio.load(html);
  // Page servie à la place de la fiche (redirection d'une annonce retirée) :
  // rien à lire, et l'occurrence peut s'éteindre dans le passage même.
  if (servedElsewhere($, parsedUrl)) return { listing: null, warnings: [], withdrawn: true };

  const warnings: string[] = [];
  const table = readAriaTable($);

  const { pageTitle, h1, title } = readTitles($, agencyName);
  const labels = readLabels($);
  const content = readDetailContent($);

  const description =
    DESCRIPTION_SELECTORS.map((selector) => htmlToText($, selector))
      .find((text) => text !== '')
      ?.replace(/^(?:Description|Détails) de l'offre\s*/i, '') ?? '';

  const { priceText, areaText, roomsText, furnishedText } = readFigures(
    table,
    labels,
    content,
    pageTitle,
    h1,
  );
  if (priceText === undefined) warnings.push(`Fiche sans prix : ${pageUrl}`);

  const { propertyTypeText, cityText } = parseTypeAndCity(pageTitle, parsedUrl, labels.city);

  // Photos : CDN staticlbi de la plateforme, en pleine taille de préférence.
  // On ne garde QUE les vraies photos du bien, sous `/images/biens/` — le reste
  // du CDN est de l'habillage (avatar d'agence « contact », logos LBI/FNAIM,
  // panneaux, diaporama d'accueil) qu'il ne faut jamais prendre pour une photo
  // d'annonce, qui partirait à tort dans une alerte.
  //
  // CHARGEMENT DIFFÉRÉ. La plateforme met un SVG vide dans `src` et la vraie
  // URL dans `data-src` : lire `src` ne ramenait aucune photo sur les fiches
  // ainsi rendues. On lit donc `data-src` en premier.
  //
  // « Ces biens peuvent aussi vous intéresser » : les photos des AUTRES annonces.
  $('[class*="property-more"], [class*="properties-related"], [class*="BienOther"]').remove();
  const imageUrls: string[] = [];
  // Le nom de fichier identifie la photo : la même image apparaît sous
  // plusieurs chemins (`/original/…` et `/1600xauto/…`), et les montrer toutes
  // ferait défiler deux fois le même cliché.
  const seenPhotos = new Set<string>();
  $('img[src*="/images/biens/"], img[data-src*="/images/biens/"]').each((_i, el) => {
    const raw = $(el).attr('data-src') ?? $(el).attr('src') ?? '';
    // URLs sans schéma (`//cdn…`) : le CDN les sert en HTTPS.
    const src = raw.replace(/^\/\//, 'https://');
    const normalized = displaySize(src);
    const fileName = normalized.split('/').pop() ?? normalized;
    if (!normalized.startsWith('https://') || seenPhotos.has(fileName)) return;
    seenPhotos.add(fileName);
    imageUrls.push(normalized);
  });

  const chargesValue =
    table.get('ChargesAnnonceLocation_forfaitaires_mensuelles') ??
    (labels.charges !== undefined ? `${labels.charges} €` : undefined);

  const listing = compactListing({
    sourceRef: parsedUrl.reference,
    sourceUrl: parsedUrl.canonicalUrl,
    title: title !== '' ? title : undefined,
    description: description !== '' ? description : undefined,
    priceText,
    chargesText: chargesValue !== undefined ? `${chargesValue} de charges` : undefined,
    areaText,
    roomsText,
    propertyTypeText,
    furnishedText,
    // « 1 € » : valeur de remplissage du formulaire, pas un dépôt.
    depositText:
      labels.deposit !== undefined && !/^\d$/.test(labels.deposit)
        ? `${labels.deposit} €`
        : undefined,
    feesText: labels.fees !== undefined ? `${labels.fees} €` : undefined,
    phoneText: agencyPhone($),
    emailText: agencyEmail($),
    addressText: content.address,
    cityText: cityText ?? content.city ?? cityFromPostalCode(table.get('cp') ?? labels.postalCode),
    postalCodeText: table.get('cp') ?? labels.postalCode ?? content.postalCode,
    agencyName,
    contactFormUrl: parsedUrl.canonicalUrl,
    imageUrls: imageUrls.length > 0 ? ownGallery(imageUrls) : undefined,
    extra: hektorExtra(table, content, {
      district: declaredDistrict($, table, content),
      dpe: energyClass($, 'dpe'),
      ges: energyClass($, 'ges'),
    }),
  });

  return { listing, warnings };
}
