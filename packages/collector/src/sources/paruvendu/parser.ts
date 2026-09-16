/**
 * Parser des pages de liste et des fiches de paruvendu.fr.
 *
 * CE QUE LA SOURCE APPORTE, MESURÉ AVANT DE L'ÉCRIRE (2026-09-11). Sur les 150
 * annonces de ses cinq pages, les deux tiers viennent d'agences que le projet
 * collecte déjà — BEP 32, Citya 23, LocService 13, L'Adresse 13, Century 21 11.
 * Le reste est ce qu'on vient chercher : des PARTICULIERS, la denrée rare d'un
 * inventaire presque entièrement professionnel, et une douzaine d'agences
 * qu'aucune autre source ne lit — Riviera Boulevard, MCE, A Alliance, BSK,
 * 123loger, Bérénice… Le dédoublonnage rapproche le reste.
 *
 * CONFORMITÉ : le `robots.txt` (relu le 2026-09-16) ferme
 * `/immobilier/annonceimmofo/`, `/immobilier/annoncefo/`,
 * `/communfo/popincommunfo/` et plusieurs paramètres (`?pagv=`, `?tri=`,
 * `?d=`, `?fulltext=`). La pagination `?p=N` et les filtres `?px0=`/`?px1=`
 * n'y figurent pas ; les fiches vivent sous `/immobilier/location/<type>/<id>`,
 * ouvert. Aucun `Crawl-delay` n'est demandé ; on en tient trois secondes.
 *
 * LA CARTE : loyer charges comprises (« CC* », jamais hors charges), surface,
 * pièces, CHAMBRES, DPE, un extrait de description coupé, les photos en 320
 * pixels, et l'annonceur — « Particulier » avec son pseudonyme, ou le nom de
 * l'agence.
 *
 * LA FICHE (`parseDetail`) : charges, dépôt de garantie, honoraires, la
 * description entière, le CODE POSTAL, l'étage, l'ascenseur, les chambres, le
 * meublé, la RÉFÉRENCE DE L'ANNONCEUR, le nom exact de l'annonceur, et les
 * mêmes photos en 1 000 pixels (480 chez les agences).
 *
 * NI TÉLÉPHONE NI COURRIEL, NULLE PART : le contact passe par une fenêtre
 * `/communfo/popincommunfo/`, que le `robots.txt` ferme. C'est la seule case du
 * relevé qui reste vide, et elle le restera.
 *
 * LA DATE AFFICHÉE EST CELLE DE LA DERNIÈRE MISE À JOUR, pas de la parution —
 * le site l'intitule ainsi, carte et fiche. On ne la fait pas passer pour une
 * date de publication.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { parseChargesFromText, parsePrice } from '../../normalization/parse-listing-fields.js';
import { cleanText, comparable } from '../../normalization/text.js';
import { NICE_AREA_SLUGS, portalCommunes } from '../shared/communes.js';
import { htmlToText } from '../shared/html-text.js';
import type { RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.paruvendu.fr';

/**
 * LES BANDES DE LOYER, ET POURQUOI ELLES REMPLACENT LES TRANCHES PAR PIÈCES.
 *
 * Le portail ne sert que CINQ PAGES de trente, soit 150 annonces, quel que
 * soit le stock — 160 annoncées à Nice le 2026-09-16. Les dix de trop sont
 * invisibles, et l'inventaire ne pouvait donc jamais être complet.
 *
 * Les tranches `?nbpieces=` servaient à les rattraper, et n'y suffisaient pas :
 * le portail n'en propose que de 1 à 4 — `?nbpieces=5` est ignoré et rend la
 * recherche entière — si bien que les grands logements et ceux dont il ne
 * connaît pas le nombre de pièces n'appartenaient à AUCUNE tranche. Relevé du
 * 2026-09-16 : 55 + 48 + 41 + 9 = 153 annonces tranchées sur 160, et parmi les
 * sept restantes (deux T5, un T7, deux sans pièces, une « 2/3 pièces »), six
 * seulement tenaient dans les 150 premières. Une annonce manquait à chaque
 * passage, et un inventaire à une annonce près n'éteint plus rien.
 *
 * LE LOYER, LUI, PARTITIONNE. `?px0=`/`?px1=` sont des bornes incluses, toute
 * annonce en a un, et le compte tombe juste : 4 + 23 + 55 + 40 + 38 = 160, soit
 * exactement ce que la recherche entière annonce, pour neuf requêtes au lieu de
 * douze. Une annonce qui échapperait aux bandes ferait tomber cette somme à
 * côté — c'est le contrôle, et il ne coûte rien.
 *
 * Les bornes laissent de la marge : la plus chargée fait 55 annonces pour un
 * plafond de 150.
 */
export const PRICE_BANDS: readonly { readonly min?: number; readonly max?: number }[] = [
  { max: 500 },
  { min: 501, max: 700 },
  { min: 701, max: 1000 },
  { min: 1001, max: 1500 },
  { min: 1501 },
];

/**
 * Les communes suivies, ÉCRITES COMME LE PORTAIL LES ÉCRIT.
 *
 * Elles portent leur code postal, et contrairement à la FNAIM le portail
 * n'abrège pas « saint ». Les douze écritures ont été vérifiées une à une le
 * 2026-09-16 sur le titre que rend la page.
 *
 * NICE EST À PART : elle se cherche sans code postal, et par bandes de loyer
 * plutôt qu'en une requête — voir `SEARCHES`. Le périmètre lui-même vit dans
 * `shared/communes.ts`.
 */
const COMMUNES = portalCommunes({ withPostalCode: true, omit: ['nice'] });

/** Les communes du périmètre, dans la forme que portent les cartes. */
const PERIMETER_CITIES: ReadonlySet<string> = new Set(
  NICE_AREA_SLUGS.map((slug) => comparable(slug.replace(/-/g, ' '))),
);

/** `true` si la commune de cette annonce fait partie du périmètre suivi. */
export function inPerimeter(city: string | undefined): boolean {
  return city !== undefined && PERIMETER_CITIES.has(comparable(city));
}

/** Une recherche du portail, et ce qu'on attend d'elle. */
export interface Search {
  /** Nom court, pour le journal. */
  readonly label: string;
  /** Chemin de la recherche, sans pagination ni filtre. */
  readonly path: string;
  /** Bornes de loyer, incluses, quand la recherche est une bande. */
  readonly minPrice?: number;
  readonly maxPrice?: number;
  /**
   * La commune que la page doit nommer. Le portail répond 200 et sert la
   * recherche DÉPARTEMENTALE pour une commune sans annonce : sans ce contrôle,
   * trente annonces de Grasse ou de Cannes entreraient comme niçoises.
   */
  readonly commune?: string;
  /** `true` si la recherche déborde le périmètre : ses annonces sont filtrées. */
  readonly beyondPerimeter?: boolean;
  /**
   * `true` si la recherche ne sert qu'à lire le total de référence — une page,
   * pas davantage, puisque les bandes en rendent le détail.
   */
  readonly reference?: boolean;
  /**
   * `true` si le portail peut n'avoir aucune annonce ici, auquel cas il sert sa
   * recherche départementale : c'est le cas ordinaire d'une petite commune, pas
   * celui de Nice.
   */
  readonly mayBeEmpty?: boolean;
}

const NICE_FLATS = '/immobilier/recherche/location/appartement/nice/';

/**
 * Ce qu'on lit à chaque passage.
 *
 * NICE EN APPARTEMENT PAR BANDES DE LOYER (voir `PRICE_BANDS`), précédée d'une
 * page de référence qui donne le total à retrouver.
 *
 * LES DOUZE AUTRES COMMUNES, une recherche chacune : 17 annonces à Cagnes,
 * 9 à Saint-Laurent, 5 à Villeneuve-Loubet, 4 à Cap-d'Ail, 3 à Beaulieu, 2 à
 * Carros, 1 à Villefranche, 1 à La Trinité le 2026-09-16 — quarante-deux
 * annonces qu'on ne demandait tout simplement pas. Les quatre dernières n'ont
 * rien aujourd'hui ; on les demande quand même, sans quoi leur première annonce
 * ne serait jamais vue.
 *
 * LES MAISONS À L'ÉCHELLE DU DÉPARTEMENT, et pas commune par commune : elles
 * tiennent en vingt-sept annonces, une seule page, dont huit dans le périmètre
 * (trois à Nice, deux à Villefranche, une à Carros, à Drap et à Beaulieu).
 *
 * LA RECHERCHE « MAISONS À NICE » N'EN EST PAS UNE, et c'est le piège : le
 * portail l'intitule « 22 maisons à louer à Nice » mais y verse toute la région
 * — Antibes, Valbonne, Le Cannet, Vallauris — pour trois maisons réellement
 * niçoises. Son titre ne trahit rien ; seule la commune de chaque carte le dit.
 * La recherche départementale, elle, est franche, contient les mêmes annonces et
 * cinq de plus, et coûte la même requête.
 */
export const SEARCHES: readonly Search[] = [
  { label: 'nice-total', path: NICE_FLATS, commune: 'nice', reference: true },
  ...PRICE_BANDS.map((band) => ({
    label: `nice-${String(band.min ?? 0)}-${band.max === undefined ? 'plus' : String(band.max)}`,
    path: NICE_FLATS,
    commune: 'nice',
    ...(band.min !== undefined ? { minPrice: band.min } : {}),
    ...(band.max !== undefined ? { maxPrice: band.max } : {}),
  })),
  ...COMMUNES.map((commune) => ({
    label: commune.slug,
    path: `/immobilier/recherche/location/appartement/${commune.slug}/`,
    commune: commune.name,
    mayBeEmpty: true,
  })),
  {
    label: 'maisons-06',
    path: '/immobilier/recherche/location/maison/alpes-maritimes-06/',
    beyondPerimeter: true,
  },
];

/** L'adresse de la page `page` d'une recherche. */
export function searchUrl(search: Search, page: number): string {
  const url = new URL(SITE + search.path);
  if (search.minPrice !== undefined) url.searchParams.set('px0', String(search.minPrice));
  if (search.maxPrice !== undefined) url.searchParams.set('px1', String(search.maxPrice));
  if (page > 1) url.searchParams.set('p', String(page));
  return url.toString();
}

export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  /** Le nombre d'annonces que la recherche annonce, `null` s'il n'est pas lisible. */
  readonly totalCount: number | null;
  /**
   * Le titre que la page se donne — « 17 appartements à louer à Cagnes-sur-Mer ».
   * C'est lui qui trahit le repli départemental.
   */
  readonly heading: string;
  readonly warnings: readonly string[];
}

/** `true` si la page rendue est bien celle de la commune demandée. */
export function namesCommune(heading: string, commune: string): boolean {
  return comparable(heading).includes(comparable(commune.replace(/-/g, ' ')));
}

/**
 * La commune, lue sur l'intitulé de la carte : « Appartement 48 m2 Mougins (06) ».
 *
 * LE TYPE DE BIEN S'Y COLLAIT quand la surface manque — « Appartement Nice (06) »
 * rendait la commune « Appartement Nice », qu'aucun filtre ne reconnaît. Trois
 * cartes sur trente en sont là au relevé du 2026-09-16.
 */
function cityOf(headline: string): string | undefined {
  const name = /([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]+?)\s*\(\d{2}\)/.exec(headline)?.[1];
  if (name === undefined) return undefined;
  const city = cleanText(
    name.replace(/^(?:appartement|maison|studio|villa|loft|duplex|chambre|atelier|local)\s+/i, ''),
  );
  return city === '' ? undefined : city;
}

/** Les photos d'une carte : celles de l'annonce, jamais le logo de l'agence. */
function photosOf($: cheerio.CheerioAPI, card: cheerio.Cheerio<never>): string[] {
  const photos = new Set<string>();
  // La PREMIÈRE photo est posée par un script — l'`<img>` ne porte qu'un pixel
  // transparent en attendant. Les suivantes sont de vrais `src`.
  const script = card.find('script').text();
  for (const match of script.matchAll(
    /src\s*=\s*'(https:\/\/img\.paruvendu\.fr\/media_ext\/[^']+)'/g,
  )) {
    if (match[1] !== undefined) photos.add(match[1]);
  }
  card.find('.blocMedia img').each((_i, img) => {
    const src = $(img).attr('src') ?? '';
    if (/^https:\/\/img\.paruvendu\.fr\/media_ext\//.test(src)) photos.add(src);
  });
  return [...photos];
}

/**
 * Analyse une page de liste.
 *
 * @param html contenu HTML brut
 * @param pageUrl adresse de la page, pour résoudre les liens relatifs
 */
export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  $('.blocAnnonce[data-id]').each((_i, element) => {
    const card = $(element) as cheerio.Cheerio<never>;
    const reference = card.attr('data-id');
    if (reference === undefined || !/^\d+$/.test(reference) || seen.has(reference)) return;

    const link = card.find('a[href*="/immobilier/location/"]').first();
    const href = link.attr('href');
    if (href === undefined) return;
    seen.add(reference);

    // « Appartement - 1 pièce(s) - 20 m² » : l'intitulé que le site compose, dans
    // un ordre invariable.
    const title = cleanText(link.attr('title') ?? '');
    const headline = cleanText(card.find('h3').first().text());
    const price = cleanText(card.find('.encoded-lnk > div').first().text());
    const rooms = cleanText(card.find('li').first().text());
    // LA BANDE D'ÉTIQUETTES, pas seulement la première : « 2 pièces » y voisine
    // avec « 1 chambre », que le titre ne dit nulle part. Aucune annonce n'avait
    // de nombre de chambres sur les 156 en base.
    const badges = cleanText(card.find('li').first().parent().text());
    const dpe = card.find('[class*="NoteEnerg_"]').first().text().trim();
    const description = cleanText(card.find('p.line-clamp-5').first().text());
    const city = cityOf(headline);

    // L'ANNONCEUR. « Particulier » se dit en toutes lettres ; le texte de
    // remplacement de l'avatar nomme ensuite le déposant — « particulier :
    // Muriel C », « pro : LOCService ».
    const isPrivate = /\bparticulier\b/i.test(card.find('.pseudoinfo').text());
    const agency = /^pro\s*:\s*(.+)$/i.exec(card.find('img.imgOffice').attr('alt') ?? '')?.[1];
    const person = /^particulier\s*:\s*(.+)$/i.exec(
      card.find('img.imgPart').attr('alt') ?? '',
    )?.[1];

    // La référence de l'ANNONCEUR est lue sur la fiche (« Réf. annonce ») ;
    // `reference` n'est ici que l'identifiant Paru Vendu (§17).
    const extra: Record<string, string> = {};
    if (/^[A-G]$/.test(dpe)) extra['dpe'] = dpe;
    if (isPrivate) extra['landlord'] = 'private';
    else if (agency !== undefined) extra['landlord'] = 'agency';
    if (badges !== '') extra['features'] = badges;

    const photos = photosOf($, card);
    const sourceUrl = new URL(href, pageUrl).toString();
    listings.push({
      sourceRef: reference,
      sourceUrl,
      title: title !== '' ? title : headline,
      ...(price !== '' ? { priceText: price } : {}),
      ...(title !== '' ? { areaText: title, propertyTypeText: title } : {}),
      ...(rooms !== '' ? { roomsText: rooms } : {}),
      ...(description !== '' ? { description } : {}),
      furnishedText: `${title} ${description}`,
      ...(city !== undefined ? { cityText: city } : {}),
      ...(agency !== undefined ? { agencyName: cleanText(agency) } : {}),
      ...(person !== undefined ? { contactName: cleanText(person) } : {}),
      ...(photos.length > 0 ? { imageUrls: photos } : {}),
      // Le contact passe par le formulaire du site : on n'en extrait rien.
      contactFormUrl: sourceUrl,
      extra,
    });
  });

  const warnings: string[] = [];
  // Une page vide signale un gabarit changé, pas un marché désert.
  if (listings.length === 0) warnings.push('Aucune annonce trouvée : gabarit peut-être changé');

  const current = Number(new URL(pageUrl).searchParams.get('p') ?? '1');
  // `?p=2` comme `?px0=501&p=2` : on compare le paramètre, pas le texte.
  const hasNextPage = $('a[href*="p="]')
    .toArray()
    .some((a) => {
      const href = $(a).attr('href') ?? '';
      return new URL(href, pageUrl).searchParams.get('p') === String(current + 1);
    });
  const count = /(\d[\d\s]*)\s+annonces?/.exec($('.aff_nbann').first().text());
  const totalCount = count?.[1] !== undefined ? Number(count[1].replace(/\s/g, '')) : null;
  return { listings, hasNextPage, totalCount, heading: cleanText($('title').text()), warnings };
}

/** Une ligne du bloc « Caractéristiques du bien » : son libellé, ses valeurs. */
function characteristics($: cheerio.CheerioAPI): { label: string; values: string[] }[] {
  const rows: { label: string; values: string[] }[] = [];
  $('ul.crit-alignbloc')
    .eq(1)
    .find('li')
    .each((_i, li) => {
      const row = $(li).clone();
      const values = row
        .find('span')
        .map((_j, span) => cleanText($(span).text()))
        .get()
        .filter((value) => value !== '');
      row.find('span').remove();
      rows.push({ label: cleanText(row.text()).replace(/\s*:\s*$/, ''), values });
    });
  return rows;
}

/**
 * Ce que la fiche ajoute à la carte.
 *
 * « Dont charges/mois » est la part des charges DANS le loyer affiché. Absente
 * chez les particuliers et quelques agences, qui l'écrivent parfois dans le
 * texte (« dont charges mensuelles : 50.0 euros »).
 *
 * LE CODE POSTAL, que la carte ne donne jamais : `#detail_loc` porte « Nice
 * (06300) ». Aucune des 156 annonces en base n'en avait — donc ni quartier
 * déduit, ni géocodage sûr.
 *
 * LES CARACTÉRISTIQUES, en deux blocs. Le premier est une bande d'étiquettes,
 * le second une liste libellé/valeur : « Accès : Ascenseur », « Général : Etage
 * : 5 », « Agencement : 1 chambre », « Réf. annonce : ParuVendu GES83170023-53 ».
 *
 * ON N'Y PREND QUE CE QUI EST SANS ÉQUIVOQUE. Les étiquettes du premier bloc
 * nomment des FAMILLES — « Parking / Garage », « Balcon / Terrasse », « Jardin /
 * Terrain » — et rien n'y dit laquelle des deux le bien possède. Les retenir
 * ferait afficher un balcon à qui n'a qu'une terrasse (§17) ; le second bloc,
 * lui, tranche quand il est renseigné, et la description reste lue comme avant.
 *
 * LA RÉFÉRENCE DE L'ANNONCEUR est la prise du dédoublonnage (§14) : c'est le
 * numéro que porte aussi l'annonce sur le site de l'agence. Les dépôts de
 * particuliers n'en ont pas — le portail y remet son propre identifiant
 * `WI…`, qui n'apprend rien.
 *
 * Le loyer n'est pas repris : la mémoire des fiches le figerait une semaine,
 * et masquerait une baisse que la liste montre.
 */
/** Le bloc prix : charges comprises dans le loyer, dépôt, honoraires. */
function priceRows($: cheerio.CheerioAPI): {
  chargesText?: string;
  depositText?: string;
  feesText?: string;
} {
  const rows: { chargesText?: string; depositText?: string; feesText?: string } = {};
  $('#autoprix .opt19_hd_det').each((_i, row) => {
    const label = cleanText($(row).find('span').first().text());
    const value = cleanText($(row).find('strong').first().text());
    // « NC » ou vide : rien à retenir.
    if (!/\d/.test(value)) return;
    if (/charges/i.test(label)) rows.chargesText = value;
    else if (/d[ée]p[ôo]t/i.test(label)) rows.depositText = value;
    else if (/honoraires/i.test(label)) rows.feesText = value;
  });
  return rows;
}

/**
 * Ce que les deux blocs de caractéristiques déclarent, rangé pour la
 * normalisation : étage, ascenseur, référence de l'annonceur, et la liste
 * d'atouts que `extractFeatures` sait relire.
 */
function attributesOf($: cheerio.CheerioAPI): Record<string, string> {
  const extra: Record<string, string> = {};
  const traits: string[] = [];

  // Bande d'étiquettes : seulement les chambres et le meublé, sans équivoque.
  const badges = cleanText($('ul.crit-alignbloc').first().text());
  const bedrooms = /\d+\s*chambres?/i.exec(badges)?.[0];
  if (bedrooms !== undefined) traits.push(bedrooms);
  if (/\bmeubl[ée]/i.test(badges)) traits.push('Meublé');

  for (const { label, values } of characteristics($)) {
    // « ParuVendu GES83170023-53 » : le portail préfixe son nom. Un `WI…` est
    // son propre numéro de dépôt, pas celui d'un annonceur.
    if (/^r[ée]f\.?\s*annonce$/i.test(label)) {
      const own = cleanText((values[0] ?? '').replace(/^paruvendu\s*/i, ''));
      if (own !== '' && !/^WI\d+$/i.test(own)) extra['reference'] = own;
      continue;
    }
    if (/^mise à jour$/i.test(label)) continue;
    for (const value of values) {
      const floor = /^etage\s*:\s*(\d{1,2})$/i.exec(value)?.[1];
      if (floor !== undefined) extra['etage'] = floor;
      else if (/^ascenseur$/i.test(value)) extra['ascenseur'] = '1';
      else traits.push(value);
    }
  }
  if (traits.length > 0) extra['features'] = traits.join(', ');
  return extra;
}

/**
 * LES MÊMES PHOTOS EN GRAND : la carte les sert en 320 pixels de large, la
 * fiche en 1 000 (480 chez les agences). Le logo de l'agence n'a pas de
 * recadrage `func=crop` : c'est ce qui l'écarte.
 */
function detailPhotos($: cheerio.CheerioAPI): string[] {
  const photos = new Set<string>();
  $('#photo-principal img, .photo_miniature img').each((_i, img) => {
    const src = $(img).attr('src') ?? '';
    if (/^https:\/\/img\.paruvendu\.fr\/media_ext\/.*func=crop/.test(src)) photos.add(src);
  });
  return [...photos];
}

export function parseDetail(html: string, priceText?: string): RawDraft | null {
  const $ = cheerio.load(html);

  const { depositText, feesText, ...prix } = priceRows($);
  let chargesText = prix.chargesText;

  const body = $('#txtAnnonceTrunc').first().clone();
  // Bloc caché « Lieu : Alpes-Maritimes (06) », qui n'est pas du texte d'annonce.
  body.find('#localisation_bar_header').remove();
  const description = htmlToText($, body as cheerio.Cheerio<never>);

  // Charges écrites dans le texte (« dont charges mensuelles : 50.0 euros »).
  if (chargesText === undefined && description !== '') {
    const inText = parseChargesFromText(description, parsePrice(priceText).amount);
    if (inText !== null) chargesText = `${String(inText)} €`;
  }

  // « Nice (06300) »
  const place = /^(.+?)\s*\((\d{5})\)$/.exec(cleanText($('#detail_loc').first().text()));

  const extra = attributesOf($);

  // Le DPE de la fiche, quand la carte n'en portait pas.
  const dpe = /DPE_consEnerNote\s+NoteEnerg_([A-G])\b/.exec(html)?.[1];
  if (dpe !== undefined) extra['dpe'] = dpe;

  // Le GES, dans le bloc jumeau. Il n'existe QUE sur la fiche : les cartes de
  // liste n'affichent que l'étiquette énergie.
  const ges = /DPE_effSerreNote\s+NoteGES\d*_([A-G])\b/.exec(html)?.[1];
  if (ges !== undefined) extra['ges'] = ges;

  // L'ANNONCEUR, nommé exactement : « Citya Baie Des Anges - Citya Helios »
  // là où le logo de la carte abrège, un pseudonyme pour un particulier.
  const seller = cleanText(
    $('#detail_infosvendeur p').first().find('strong').first().text() ||
      $('#detail_infosvendeur .enseigne-infosvendeur').first().text(),
  );
  const isPrivate = /\bde particulier\b/i.test($('title').text());
  if (seller !== '') extra['landlord'] = isPrivate ? 'private' : 'agency';

  const photos = detailPhotos($);

  const draft: RawDraft = {
    chargesText,
    depositText,
    feesText,
    description: description !== '' ? description : undefined,
    ...(place !== null ? { cityText: place[1], postalCodeText: place[2] } : {}),
    ...(seller !== '' && !isPrivate ? { agencyName: seller } : {}),
    ...(seller !== '' && isPrivate ? { contactName: seller } : {}),
    ...(photos.length > 0 ? { imageUrls: photos } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
  // Une page qui n'apprend rien ne doit pas effacer ce qu'on avait (§17).
  return Object.values(draft).every((value) => value === undefined) ? null : draft;
}
