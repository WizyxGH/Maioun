/**
 * Adaptateur générique des sites d'agences sur la plateforme « La Boîte
 * Immo » / Hektor (§5, §47) — un seul parser pour plusieurs agences niçoises.
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
 *     inconnu, honnêtement (§17).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText, slugify } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing } from '../shared/raw-listing.js';

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
}

/** Extrait les liens de fiches d'une page de liste. */
export function parseListPage(html: string, pageUrl: string): ParsedList {
  const $ = cheerio.load(html);
  const seen = new Map<string, ParsedHektorUrl>();

  // Une annonce sans titre n'a parfois aucun lien, seulement des boutons
  // `data-url` (sudagence.fr).
  $('a[href], [data-url]').each((_i, el) => {
    const href = $(el).attr('href') ?? $(el).attr('data-url') ?? '';
    const parsed = parseListingUrl(href, pageUrl);
    if (parsed !== null && !seen.has(parsed.reference)) seen.set(parsed.reference, parsed);
  });

  const urls = [...seen.values()];
  return {
    urls,
    warnings: urls.length === 0 ? [`Aucune fiche trouvée sur la liste : ${pageUrl}`] : [],
  };
}

export interface ParsedDetail {
  readonly listing: RawListing | null;
  readonly warnings: readonly string[];
}

/** Libellés de la table sans classe de clé, ramenés aux clés des autres gabarits. */
const LABEL_KEYS: readonly (readonly [RegExp, string])[] = [
  [/^loyer cc/i, 'loyer_cc'],
  [/^code postal/i, 'cp'],
  [/^nombre de pièces/i, 'nbpiecees'],
  [/^meublé/i, 'meuble'],
  [/^charges locatives/i, 'ChargesAnnonceLocation_forfaitaires_mensuelles'],
  [/^surface habitable/i, 'surface_habitable'],
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

/** Les codes postaux 06000 à 06300 ne desservent que Nice. */
function cityFromPostalCode(postalCode: string | undefined): string | undefined {
  return postalCode !== undefined && /^06[0-3]00$/.test(postalCode) ? 'Nice' : undefined;
}

/** Le téléphone de l'agence, en pied de page (`coords-phone`, ou `footer_element`). */
function agencyPhone($: cheerio.CheerioAPI): string | undefined {
  const href = $(
    '.coords-phone a[href^="tel:"], a.coords-phone__content[href^="tel:"], .footer_element__content a.phone[href^="tel:"]',
  )
    .first()
    .attr('href');
  return href !== undefined ? href.replace(/^tel:/, '') : undefined;
}

/**
 * Gabarit « detail_content » : la référence de l'agence (« Référence L02 »),
 * « Nice (06000) » sous le titre, et les caractéristiques en simple liste
 * (« quartier LE PIOL », « cave », « exposition Sud-Ouest »). Rien de tout
 * cela n'était lu : ni quartier, ni code postal, ni référence.
 */
interface DetailContent {
  readonly reference?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly district?: string;
  readonly items: readonly string[];
}

function readDetailContent($: cheerio.CheerioAPI): DetailContent {
  // « Référence : 19 » en paragraphe `.ref` sur l'ancien gabarit (AA Gestion).
  const reference =
    cleanText($('.id_ref_item').first().text()) ||
    (/^R[ée]f[ée]rence\s*:?\s*(\S+)$/i.exec(cleanText($('p.ref').first().text()))?.[1] ?? '');
  const location = /^(.+?)\s*\((\d{5})\)$/.exec(cleanText($('.text_location_item').first().text()));
  const items = $('.list_items .list_item')
    .filter((_i, el) => $(el).closest('[class*="property-more"]').length === 0)
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((text) => text !== '');
  const district = items
    .map((item) => /^quartier\s*:?\s+(.+)$/i.exec(item)?.[1])
    .find((value) => value !== undefined);
  return {
    ...(reference !== '' ? { reference } : {}),
    ...(location?.[1] !== undefined ? { city: location[1] } : {}),
    ...(location?.[2] !== undefined ? { postalCode: location[2] } : {}),
    ...(district !== undefined ? { district } : {}),
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
): { propertyTypeText: string; cityText: string | undefined } {
  const match =
    /^location\s+(appartement|studio|maison|villa|parking|garage|local|chambre|duplex|loft)\s+(.+?)(?:\s+\d|$)/i.exec(
      pageTitle,
    );
  // Le libellé « La ville de … » fait foi. Un titre libre (« Appartement meublé
  // à Nice Musiciens ») ne donne la commune que s'il concorde avec l'URL.
  const fromTitle = match?.[2]?.trim();
  const slug = parsedUrl.citySlug;
  const titleAgrees = fromTitle !== undefined && (slug === null || slugify(fromTitle) === slug);
  // Titre libre (« Location Magnifique F1 Aperçu Mer ») : le type est dans l'URL
  // (`/2-appartement/`).
  const fromUrl =
    /\/\d{1,3}-(appartement|studio|maison|villa|parking|garage|local|chambre)\//i.exec(
      parsedUrl.canonicalUrl,
    )?.[1];
  return {
    propertyTypeText: match?.[1] ?? fromUrl ?? parsedUrl.canonicalUrl,
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

  // Surface : d'abord le titre (le plus courant), sinon la table — certaines
  // agences ne la mettent pas dans le titre mais la déclarent en loi Boutin ou
  // Carrez (immobiliere-nicoise.com : clé `surf_carrez_loi_boutin`).
  const areaFromTable = ['surface', 'surf_carrez_loi_boutin', 'surf_habitable', 'surface_habitable']
    .map((key) => table.get(key))
    .find((value) => value !== undefined && /\d/.test(value));
  // Le h1 engendré (« Appartement 1 pièce(s) 27.46 m² ») passe avant le titre
  // libre, qui peut nommer une autre surface (« terrasse de 8 m² »).
  const areaText =
    /pièce\(s\).*?(\d+(?:[.,]\d+)?\s*m²)/i.exec(h1)?.[1] ??
    `${pageTitle} ${h1}`.match(/\d+(?:[.,]\d+)?\s*m²/i)?.[0] ??
    (areaFromTable !== undefined ? `${areaFromTable.replace(/[^\d.,]/g, '')} m²` : undefined) ??
    (labels.area !== undefined ? `${labels.area} m²` : undefined);
  const roomsFromTable = table.get('nbpiecees') ?? labels.rooms;
  // Titre libre sans pièces (englimmo.com) : le h1 engendré « Studio 1 pièce(s) » les donne.
  const roomsText =
    roomsFromTable !== undefined
      ? `${roomsFromTable} pièces`
      : `${pageTitle} ${h1}`.match(/\d+\s*pièces?/i)?.[0];

  // Meublé : la table est explicite (OUI/NON) — un texte fidèle à sa valeur,
  // jamais un « meublé » par défaut qui inverserait le sens (§17).
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

/** Atouts (caractéristiques, vue, exposition), quartier et référence d'agence. */
function hektorExtra(
  table: Map<string, string>,
  content: DetailContent,
  urlReference: string,
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
  // La référence que l'agence affiche, qui la retrouve sur les portails.
  const extra: Record<string, string> = { reference: content.reference ?? urlReference };
  if (featureList.length > 0) extra['features'] = featureList.join(' · ');
  if (content.district !== undefined) extra['quartier'] = content.district;
  return extra;
}

export function parseDetailPage(html: string, pageUrl: string, agencyName: string): ParsedDetail {
  const parsedUrl = parseListingUrl(pageUrl, pageUrl);
  if (parsedUrl === null) {
    return { listing: null, warnings: [`URL inattendue pour une fiche : ${pageUrl}`] };
  }

  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const table = readAriaTable($);

  // <title> « Location appartement Nice 3 pièces 54.25m² 1460€ | Agence » —
  // généré par la plateforme, riche ; le h1 est le titre libre de l'annonce.
  const pageTitle = cleanText($('title').first().text()).split('|')[0]?.trim() ?? '';
  // Le gabarit éditorial préfixe le titre de la commune (« Nice (06000) ») dans
  // un premier `span` : le titre de l'annonce est le second.
  const rawH1 = cleanText(
    ($('h1 .title__content-2').first().text() || $('h1').first().text()).replace(/\s+/g, ' '),
  );
  const h1 = JUNK_H1.test(rawH1) ? '' : rawH1;
  const title = h1 !== '' ? h1 : pageTitle;
  const labels = readLabels($);
  const content = readDetailContent($);

  const description =
    DESCRIPTION_SELECTORS.map((selector) => htmlToText($, selector))
      .find((text) => text !== '')
      ?.replace(/^(?:Description|Détails) de l'offre\s*/i, '') ?? '';

  const { priceText, areaText, roomsText, furnishedText } = readFigures(
    table,
    labels,
    pageTitle,
    h1,
  );
  if (priceText === undefined) warnings.push(`Fiche sans prix : ${pageUrl}`);

  const { propertyTypeText, cityText } = parseTypeAndCity(pageTitle, parsedUrl, labels.city);

  // Photos : CDN staticlbi de la plateforme, en pleine taille de préférence.
  // On ne garde QUE les vraies photos du bien, sous `/images/biens/` — le reste
  // du CDN est de l'habillage (avatar d'agence « contact », logos LBI/FNAIM,
  // panneaux, diaporama d'accueil) qu'il ne faut jamais prendre pour une photo
  // d'annonce (sinon envoyée à tort dans une alerte, §29).
  //
  // CHARGEMENT DIFFÉRÉ. La plateforme met un SVG vide dans `src` et la vraie
  // URL dans `data-src` : lire `src` ne ramenait aucune photo sur les fiches
  // ainsi rendues. On lit donc `data-src` en premier.
  //
  // « Ces biens peuvent aussi vous intéresser » : les photos des AUTRES annonces.
  $('[class*="property-more"], [class*="properties-related"]').remove();
  const imageUrls: string[] = [];
  // Le nom de fichier identifie la photo : la même image apparaît sous
  // plusieurs chemins (`/original/…` et `/1600xauto/…`), et les montrer toutes
  // ferait défiler deux fois le même cliché.
  const seenPhotos = new Set<string>();
  $('img[src*="/images/biens/"], img[data-src*="/images/biens/"]').each((_i, el) => {
    const raw = $(el).attr('data-src') ?? $(el).attr('src') ?? '';
    // URLs sans schéma (`//cdn…`) : le CDN les sert en HTTPS.
    const src = raw.replace(/^\/\//, 'https://');
    const normalized = src.replace('/original/', '/1600xauto/');
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
    depositText: labels.deposit !== undefined ? `${labels.deposit} €` : undefined,
    feesText: labels.fees !== undefined ? `${labels.fees} €` : undefined,
    phoneText: agencyPhone($),
    cityText: cityText ?? content.city ?? cityFromPostalCode(table.get('cp') ?? labels.postalCode),
    postalCodeText: table.get('cp') ?? labels.postalCode ?? content.postalCode,
    agencyName,
    contactFormUrl: parsedUrl.canonicalUrl,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: hektorExtra(table, content, parsedUrl.reference),
  });

  return { listing, warnings };
}
