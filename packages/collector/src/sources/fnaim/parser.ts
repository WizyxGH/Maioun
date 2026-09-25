/**
 * Source : FNAIM (fnaim.fr) — portail de la fédération professionnelle.
 * Voir la fiche d'étude dans `docs/sources-enquetes.md`.
 *
 * POURQUOI ELLE COMPTE PLUS QUE LES AUTRES. Les trois quarts de l'inventaire
 * viennent aujourd'hui d'alertes e-mail, qui ne publient ni adresse ni
 * téléphone. La FNAIM est le contraire : 193 agences niçoises y publient
 * elles-mêmes, la carte nomme l'agence ET donne son téléphone en clair, et
 * beaucoup de ces agences n'ont pas de site scrapable. C'est la seule source
 * étudiée qui atteigne les petites agences en une requête.
 *
 * LA CARTE PORTE L'ESSENTIEL : titre (type, pièces, meublé, surface), loyer,
 * commune et code postal, agence, téléphone, photos. Mais elle COUPE la
 * description vers 250 caractères, et ce qu'elle coupe contient souvent
 * l'adresse en toutes lettres. Les fiches ne sont PAS lues — le robots.txt les
 * interdit ; charges, honoraires, dépôt, DPE et disponibilité restent donc hors
 * de portée, aucun n'étant publié sur la carte.
 *
 * ANCRAGE : classes sémantiques du gabarit (`li.item`, `.price`,
 * `.description`, `.agence .nom`, `.telNumber`), et l'attribut `data-title`
 * que le site pose lui-même sur chaque lien d'annonce pour son analytics —
 * il porte le titre canonique, à l'abri des retours à la ligne du HTML.
 *
 * PAS DE `relaysListings` ICI, à la différence de Rentumo. Les photos sont
 * réhébergées par la fédération, et ses adhérents sont les mêmes réseaux que
 * l'on collecte déjà en direct (Citya, Century 21…), dont certains illustrent
 * des dizaines d'annonces avec la même photo tamponnée. Une photo commune ne
 * prouverait donc rien au sein de la FNAIM (§14).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText, comparable } from '../../normalization/text.js';
import { portalCommunes } from '../shared/communes.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';

const ORIGIN = 'https://www.fnaim.fr';

/** `/annonce-immobiliere/53157237/18-location-appartement-nice-06200.htm`. */
const LISTING_HREF = /^\/annonce-immobiliere\/(\d+)\//;

/**
 * Le titre canonique : « Appartement 1 pièce Meublé 23m² NICE 06200 ».
 * Tout y est facultatif sauf le type — voir `splitTitle`.
 */
const TITLE_PARTS =
  /^(?<type>.+?)(?:\s+(?<rooms>\d+\s*pi[eè]ces?))?(?:\s+(?<furnished>meubl[ée]e?))?(?:\s+(?<area>[\d.,]+\s*m)²?)?(?:\s+(?<city>[^\d]+?))?(?:\s+(?<postalCode>\d{5}))?$/i;

/**
 * Les communes suivies, ÉCRITES COMME LE PORTAIL LES ÉCRIT.
 *
 * Le portail abrège : « st-laurent-du-var », « st-andre ». Avec notre
 * orthographe, il répond 200 et sert sa page d'accueil — aucune erreur, aucune
 * annonce. Les huit annonces de Saint-Laurent-du-Var ont manqué ainsi. Chaque
 * écriture a été vérifiée sur le titre que rend la page (relevé du
 * 2026-09-16) ; `parseListPage` signale celles qui retomberaient sur l'accueil.
 *
 * Le périmètre lui-même vit dans `shared/communes.ts` : ici, seule l'écriture
 * du portail est décrite.
 */
const COMMUNES = portalCommunes({
  abbreviateSaint: true,
  withPostalCode: true,
  exceptions: {
    // Le portail ne connaît que « st-andre » : le déterminant complet renvoie
    // sur l'accueil, alors que Saint-Laurent garde bien le sien.
    'saint-andre-de-la-roche': 'st-andre',
  },
});

/**
 * Les mêmes communes, dans les DEUX écritures qu'on peut rencontrer.
 *
 * Ce filtre décide si un bien de la recherche départementale appartient au
 * périmètre. Bâti sur les seuls noms du PORTAIL — abrégés —, il contenait
 * « st laurent du var » et « st andre » : une carte écrivant « SAINT LAURENT
 * DU VAR » en toutes lettres était silencieusement écartée. On accepte donc
 * aussi le nom canonique de la commune.
 */
const TARGET_CITIES: ReadonlySet<string> = new Set(
  COMMUNES.flatMap((commune) => [comparable(commune.name), comparable(commune.commune)]),
);

/** Une recherche du portail : un slug d'URL, et de quoi la borner. */
export interface FnaimSearch {
  readonly slug: string;
  /** `true` si la recherche déborde le périmètre et doit être filtrée. */
  readonly beyondPerimeter?: boolean;
}

/**
 * Ce qu'on lit à chaque passage.
 *
 * UNE RECHERCHE PAR COMMUNE POUR LES APPARTEMENTS. La recherche
 * départementale existe et tiendrait en neuf pages, mais elle est TRONQUÉE :
 * 225 annonces pour tout le 06, alors que Nice seule en a 173 et que 67
 * annonces niçoises n'y figurent pas. Commune par commune, le compte est
 * complet.
 *
 * UNE SEULE RECHERCHE POUR LES MAISONS, à l'échelle du département : vingt-neuf
 * en tout, deux pages, et les six niçoises y sont. Treize recherches de commune
 * coûteraient treize requêtes pour le même résultat.
 */
export const SEARCHES: readonly FnaimSearch[] = [
  ...COMMUNES.map((commune) => ({ slug: `18-location-appartement-${commune.slug}` })),
  { slug: '18-location-maison-alpes-maritimes-06', beyondPerimeter: true },
];

export interface FnaimPage extends ParsedList {
  /** `true` si le gabarit annonce une page suivante. */
  readonly hasNext: boolean;
  /**
   * `false` si la page servie n'est pas une page de résultats — c'est ce que
   * rend le portail pour une recherche qu'il ne connaît pas.
   */
  readonly recognized: boolean;
}

/**
 * Décompose le titre canonique. Rien n'est deviné : sans forme, rien (§17).
 *
 * CHAQUE MORCEAU EST FACULTATIF, et c'est ce qui a changé. Exiger les cinq d'un
 * coup faisait tout perdre — type, pièces, surface, commune — dès qu'il en
 * manquait un seul : « Appartement 1 pièce Meublé 16m² NICE 06000 » (le
 * meublé s'intercale), « Maison 4 pièces NICE 06300 » (pas de surface),
 * « Appartement 3 pièces 72m² » (pas de commune). Huit cartes niçoises sur
 * 179 au relevé du 2026-09-16, dont quatre meublés que le filtre « non
 * meublé » laissait passer faute de le savoir.
 */
export function splitTitle(title: string): {
  propertyType?: string;
  rooms?: string;
  area?: string;
  furnished?: string;
  city?: string;
  postalCode?: string;
} {
  const match = TITLE_PARTS.exec(cleanText(title));
  if (match === null) return {};
  const { type, rooms, furnished, area, city, postalCode } = match.groups ?? {};

  // Sans un seul morceau canonique, ce n'est pas ce titre-là : on ne prend pas
  // la phrase entière pour un type de bien.
  if ([rooms, area, postalCode].every((part) => part === undefined)) return {};
  const propertyType = type !== undefined && type !== '' ? type : undefined;

  return {
    ...(propertyType !== undefined ? { propertyType } : {}),
    ...(rooms !== undefined ? { rooms } : {}),
    ...(area !== undefined ? { area: `${area}²` } : {}),
    ...(furnished !== undefined ? { furnished } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(postalCode !== undefined ? { postalCode } : {}),
  };
}

/**
 * La commune et son code postal, lus sous la carte plutôt que dans le titre.
 *
 * Le portail les y met toujours — « 06100 · NICE · ALPES-MARITIMES · … », un
 * niveau par icône — alors que le titre les omet parfois.
 */
function placeOf(card: cheerio.Cheerio<never>): { city?: string; postalCode?: string } {
  const lieu = card.find('.picto.lieu').first().clone();
  if (lieu.length === 0) return {};
  lieu.find('i').replaceWith('\n');
  const parts = lieu
    .text()
    .split('\n')
    .map((part) => cleanText(part))
    .filter((part) => part !== '');
  const [postalCode, city] = parts;
  if (postalCode === undefined || !/^\d{5}$/.test(postalCode)) return {};
  return {
    postalCode,
    ...(city !== undefined && city !== '' ? { city } : {}),
  };
}

/**
 * Le loyer, quand il y en a un.
 *
 * La FNAIM laisse ses adhérents écrire « Nous consulter pour le prix » : c'est
 * une absence de prix, pas un prix. On ne renvoie que ce qui porte un montant
 * (§17) — la normalisation en tirera le nombre.
 */
function priceOf(text: string): string | undefined {
  const clean = cleanText(text);
  return /\d/.test(clean) ? clean : undefined;
}

function collectImages($: cheerio.CheerioAPI, card: cheerio.Cheerio<never>): string[] {
  const urls: string[] = [];
  card.find('img[src]').each((_index, node) => {
    const src = $(node).attr('src');
    // Le gabarit pose un logo de repli en `onerror` ; il n'est pas une photo.
    if (src === undefined || !src.startsWith('http')) return;
    if (!urls.includes(src)) urls.push(src);
  });
  return urls;
}

/**
 * Extrait les annonces d'une page de résultats FNAIM.
 *
 * `search.beyondPerimeter` écarte les communes que nous ne suivons pas : la
 * recherche des maisons porte sur tout le département.
 */
export function parseListPage(html: string, pageUrl: string, search?: FnaimSearch): FnaimPage {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  $('li.item').each((_index, element) => {
    const card = $(element);
    const link = card.find('a.linkAnnonce[href^="/annonce-immobiliere/"]').first();
    const href = link.attr('href');
    if (href === undefined) return;

    const reference = LISTING_HREF.exec(href)?.[1];
    if (reference === undefined) {
      warnings.push(`Lien d'annonce sans référence : ${href}`);
      return;
    }
    if (seen.has(reference)) return;
    seen.add(reference);

    // `data-title` porte le titre canonique, sans les retours à la ligne que
    // le gabarit glisse dans le texte du lien.
    const title = cleanText(link.attr('data-title') ?? link.text());
    const parts = splitTitle(title);
    // Le lieu publié sous la carte prime sur celui du titre, qui manque parfois.
    const place = placeOf(card as cheerio.Cheerio<never>);
    const city = place.city ?? parts.city;
    const postalCode = place.postalCode ?? parts.postalCode;

    if (search?.beyondPerimeter === true && !TARGET_CITIES.has(comparable(city))) return;

    const agencyName = cleanText(card.find('.agence .nom').first().text());
    const phone = cleanText(card.find('.telNumber').first().text());
    const criteria = cleanText(card.find('.annonce_criteres').first().text());
    const description = htmlToText($, card.find('.description').first() as cheerio.Cheerio<never>);
    const images = collectImages($, card as cheerio.Cheerio<never>);

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl: new URL(href, pageUrl).toString(),
        title: title !== '' ? title : undefined,
        description: description !== '' ? description : undefined,
        priceText: priceOf(card.find('.price').first().text()),
        areaText: parts.area,
        roomsText: parts.rooms,
        propertyTypeText: parts.propertyType,
        furnishedText: parts.furnished,
        cityText: city,
        postalCodeText: postalCode,
        agencyName: agencyName !== '' ? agencyName : undefined,
        phoneText: phone !== '' ? phone : undefined,
        // §23 : le contact passe par l'onglet « contacter l'agence » de la fiche.
        contactFormUrl: new URL(`${href}#AGE_CONTACT`, pageUrl).toString(),
        imageUrls: images.length > 0 ? images : undefined,
        extra: criteria !== '' ? { features: criteria } : undefined,
      }),
    );
  });

  // LE LIEN DE LA PAGE SUIVANTE, PAS N'IMPORTE QUEL LIEN DE PAGE. Compter les
  // `-page-` rendait `hasNext` toujours vrai : la dernière page garde les liens
  // vers les précédentes. On demandait donc chaque fois une page vide de plus.
  const hasNext = $('a[title="Page suivante"]').length > 0;
  // Une recherche que le portail ne connaît pas reçoit sa page d'accueil, en
  // 200 et sans annonce : seule l'absence de ce titre les distingue.
  const recognized = $('h1.titre_primaire').length > 0;
  return { listings, warnings, hasNext, recognized };
}

/** URL de la page N d'une recherche. */
export function listUrl(search: FnaimSearch, page: number): string {
  const base = `${ORIGIN}/liste-annonces-immobilieres/${search.slug}`;
  return page <= 1 ? `${base}.htm` : `${base}-page-${page}.htm`;
}

/**
 * Ce que la FICHE ajoute à la carte : la description entière.
 *
 * La carte la coupe à environ 250 caractères, sur une ellipse (« … revenus
 * ... »). La fiche donne le texte complet — 1 900 caractères dans le cas
 * mesuré — et, avec lui, l'adresse en toutes lettres que l'agence écrit
 * souvent en tête (« 94 AV. DE LA CORNICHE FLEURIE 06200 NICE »), donc de quoi
 * placer une punaise (§20) et reconnaître un doublon (§14).
 *
 * `itemprop="description"` : le gabarit le pose lui-même pour les moteurs de
 * recherche. C'est un ancrage sémantique, plus stable qu'une classe de mise en
 * page.
 *
 * @returns le complément à fusionner, ou `null` si la fiche n'apprend rien —
 *          auquel cas on garde ce que la carte avait donné (§17).
 */
/**
 * Le tableau « Caractéristiques du bien » d'une fiche.
 *
 * Balisage régulier : `<li><span>Intitulé&nbsp;: </span> Valeur</li>`, groupé
 * sous des titres (Composition, Extérieur, Partie commune). On ne cherche pas
 * un intitulé précis — chaque agence remplit ce qu'elle veut — on ramasse tout.
 *
 * LES « NON » SONT ÉCARTÉS, et c'est le point délicat. Ce tableau répond par
 * « Oui » ou « Non » : « Balcon : Non » recopié tel quel dans le texte des
 * atouts y ferait apparaître un balcon, puisque la normalisation cherche le
 * mot. On inventerait un équipement à partir de son absence, ce qui est
 * exactement l'inverse de ce que §17 demande.
 *
 * Un « Oui » perd sa valeur et ne garde que l'intitulé : « Ascenseur » se lit,
 * « Ascenseur : Oui » ne se lit pas mieux.
 */
export function parseCharacteristics(html: string): string | undefined {
  const $ = cheerio.load(html);
  const parts: string[] = [];

  $('.caracteristique li').each((_index, element) => {
    const item = $(element);
    const label = cleanText(item.find('span').first().text()).replace(/\s*:\s*$/, '');
    if (label === '') return;
    const value = cleanText(item.clone().children('span').remove().end().text());
    if (value === '' || /^non$/i.test(value)) return;
    parts.push(/^oui$/i.test(value) ? label : `${label} : ${value}`);
  });

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const node = $('[itemprop="description"]').first();
  // Une annonce retirée renvoie la page de LISTE, qui n'a pas de description :
  // c'est ce qui distingue les deux, et ce qui évite de recopier la description
  // d'une annonce voisine sur celle qu'on cherchait.
  if (node.length === 0) return null;
  const description = htmlToText($, node as unknown as cheerio.Cheerio<never>);
  if (description.length === 0) return null;

  // La fiche est déjà téléchargée pour sa description : lire le tableau des
  // caractéristiques au passage ne coûte aucune requête de plus.
  const features = parseCharacteristics(html);
  return features === undefined ? { description } : { description, extra: { features } };
}
