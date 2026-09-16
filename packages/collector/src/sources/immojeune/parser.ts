/**
 * ImmoJeune : lecture des listes « location par particulier » et des fiches.
 *
 * DEUX SIGNAUX QUE LA SOURCE ÉCRIT ELLE-MÊME, et qu'on ne devine donc pas :
 *
 *   - le premier badge de chaque carte dit « PARTICULIER » ou « AGENCE ».
 *     C'est la deuxième source du projet à trancher la nature du bailleur
 *     annonce par annonce, après Bien'ici — et la seule à en publier autant de
 *     particuliers sur le périmètre ;
 *   - la rubrique de l'adresse — `/colocation/`, `/location-etudiant/`,
 *     `/location-courte-duree/` — dit ce que le bien est. La colocation se
 *     déclare ainsi, sans avoir à la lire dans une prose.
 *
 * LA COURTE DURÉE EST ÉCARTÉE À LA LECTURE, pas plus loin : `/location-courte-
 * duree/` n'est pas une location à l'année, et l'entrée en base d'un meublé de
 * passage se paierait en alertes inutiles.
 *
 * LES LIENS OBFUSQUÉS NE SONT PAS DÉCODÉS. Une partie des cartes remplace son
 * `<a href>` par `<span class="obflink" data-encoded-link="…">`, où l'adresse
 * est en base64. Le site signale par là qu'il ne veut pas voir ces liens
 * suivis automatiquement ; les décoder serait passer outre (§10). Ces cartes
 * sont donc ignorées, et le compte s'en ressent surtout du côté des agences —
 * relevé le 2026-09-16 : 38 cartes lisibles sur 46 dans la rubrique
 * particuliers de Nice, contre 1 sur 12 dans la liste des agences.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { energyLabels } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.immojeune.com';

/**
 * Rubriques d'annonces retenues, telles qu'elles paraissent dans l'adresse.
 *
 * `residence-etudiante` en est absente à dessein : ce sont des RÉSIDENCES —
 * un exploitant, un parc, un loyer « à partir de » qui ne désigne aucun
 * logement en particulier, et l'accès réservé aux étudiants. Ce n'est pas une
 * annonce de location, et six d'entre elles occupent à elles seules les deux
 * premières pages de la liste niçoise.
 *
 * `location-courte-duree` en est absente pour la même raison qu'ailleurs dans
 * le projet : un meublé de passage n'est pas un logement à l'année.
 */
const RUBRIQUES_RETENUES: ReadonlySet<string> = new Set(['location-etudiant', 'colocation']);

/** Adresse d'une annonce : `/{rubrique}/{commune}-{dept}/{titre}_{id}.html`. */
const CHEMIN_ANNONCE = /^\/([a-z-]+)\/([a-z0-9-]+)\/[^/]*_(\d+)\.html$/;

/** Ce que l'adresse d'une annonce apprend, ou `null` si ce n'en est pas une. */
export function readAdPath(
  href: string,
): { readonly rubrique: string; readonly commune: string; readonly ref: string } | null {
  let pathname: string;
  try {
    pathname = new URL(href, SITE).pathname;
  } catch {
    return null;
  }
  const match = CHEMIN_ANNONCE.exec(pathname);
  if (match === null) return null;
  const [, rubrique, commune, ref] = match;
  if (rubrique === undefined || commune === undefined || ref === undefined) return null;
  return { rubrique, commune, ref };
}

/** « PARTICULIER » / « AGENCE » tel que le premier badge l'écrit. */
function landlordFrom(badges: readonly string[]): 'private' | 'agency' | undefined {
  const first = badges[0]?.toUpperCase();
  if (first === 'PARTICULIER') return 'private';
  if (first === 'AGENCE') return 'agency';
  return undefined;
}

/**
 * Le type de bien, pris parmi les badges qui suivent celui du bailleur.
 *
 * « COLOCATION » y côtoie « CHAMBRE » : c'est le mode de location, pas le
 * type de bien. Il est retiré d'ici et relu par `flatShareFrom`.
 */
function propertyTypeFrom(badges: readonly string[]): string | undefined {
  const type = badges.slice(1).find((badge) => badge.toUpperCase() !== 'COLOCATION');
  return type === undefined || type === '' ? undefined : type;
}

/** La colocation, déclarée par la rubrique ou par un badge. */
function flatShareFrom(rubrique: string, badges: readonly string[]): boolean {
  return rubrique === 'colocation' || badges.some((badge) => badge.toUpperCase() === 'COLOCATION');
}

/** « 40 m² - 610 € CC » : la surface, le loyer, et la mention des charges. */
function priceAndArea($: cheerio.CheerioAPI, card: cheerio.Cheerio<never>): RawDraft {
  // La ligne des chiffres est le `<p>` sans classe de la carte.
  const line = card.find('.content > p').filter((_i, el) => $(el).attr('class') === undefined);
  if (line.length === 0) return {};
  // Le `<sup>` porte « CC » : sans espace, « 610 €CC » n'est plus lisible.
  line.find('sup').each((_i, el) => {
    $(el).replaceWith(` ${$(el).text()}`);
  });
  const text = cleanText(line.first().text());
  const area = /(\d+(?:[.,]\d+)?)\s*m²/.exec(text)?.[0];
  const price = /(\d[\d\s.]*(?:,\d+)?)\s*€[^-]*/.exec(text)?.[0];
  return {
    areaText: area,
    priceText: price === undefined ? undefined : cleanText(price),
  };
}

/** « 06000 Nice » : le code postal et la commune du BIEN, tels que la carte les donne. */
function placeFrom(geo: string): RawDraft {
  const match = /^(\d{5})\s+(.+)$/.exec(cleanText(geo));
  if (match === null) return { cityText: cleanText(geo) === '' ? undefined : cleanText(geo) };
  return { postalCodeText: match[1], cityText: match[2] };
}

/**
 * Les annonces d'une page de liste.
 *
 * Les cartes hors `#resultsajax` — « les résidences à proximité », les blocs de
 * suggestion — ne sont pas des résultats et restent dehors.
 */
export function parseListPage(html: string, listUrl: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  $('#resultsajax .card').each((_i, el) => {
    const card = $(el) as unknown as cheerio.Cheerio<never>;
    const href = card.find('p.title a[href]').first().attr('href');
    // Pas de lien en clair : carte obfusquée, laissée où elle est.
    if (href === undefined) return;
    const path = readAdPath(href);
    if (path === null || !RUBRIQUES_RETENUES.has(path.rubrique)) return;
    if (seen.has(path.ref)) return;
    seen.add(path.ref);

    const badges = card
      .find('.badge')
      .map((_j, badge) => cleanText($(badge).text()))
      .get()
      .filter((badge) => badge !== '');

    const landlord = landlordFrom(badges);
    const images = card
      .find('.img-slick[data-background]')
      .map((_j, image) => $(image).attr('data-background') ?? '')
      .get()
      .filter((url) => url !== '');

    listings.push(
      compactListing({
        sourceRef: path.ref,
        sourceUrl: new URL(href, listUrl).toString(),
        title: cleanText(card.find('p.title').text()),
        propertyTypeText: propertyTypeFrom(badges),
        ...priceAndArea($, card),
        ...placeFrom(card.find('.geo').text()),
        imageUrls: images.length === 0 ? undefined : images,
        // Le formulaire de candidature est sur la fiche, et il est gratuit.
        contactFormUrl: new URL(href, listUrl).toString(),
        extra: {
          flatShare: String(flatShareFrom(path.rubrique, badges)),
          ...(landlord === undefined ? {} : { landlord }),
        },
      }),
    );
  });

  return listings;
}

/** « aucune annonce ne correspond » : une liste vide de l'aveu du site. */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  return $('#resultsajax').length > 0 && $('#resultsajax .card').length === 0;
}

/** L'étiquette d'un diagnostic, lue sur le nom du dessin : `dpe-b.svg` → `B`. */
function diagnosticLetter($: cheerio.CheerioAPI, kind: 'dpe' | 'ges'): string | undefined {
  const src = $(`.diagnostics img[src*="/img/diagnostics/${kind}-"]`).first().attr('src');
  return new RegExp(String.raw`/${kind}-([a-g])\.svg$`).exec(src ?? '')?.[1]?.toUpperCase();
}

/**
 * Le pavé des conditions, lu intitulé par intitulé.
 *
 * IL SE LIT SUR SA STRUCTURE, PAS À L'EXPRESSION RÉGULIÈRE. Les trois postes
 * se suivent dans un seul bloc — « Charges 60 € | Frais de dossier à partir de
 * Aucun | Dépôt de garantie à partir de 550 € » — et un motif qui cherche un
 * montant APRÈS un intitulé saute par-dessus « Aucun » pour attraper celui du
 * poste suivant : les frais de dossier valaient alors le dépôt de garantie.
 * Chaque `span.grey` ouvre un poste et ferme le précédent.
 */
function conditions($: cheerio.CheerioAPI): Map<string, string> {
  const posts = new Map<string, string>();
  let label: string | null = null;
  let value = '';
  $('#partial-advert-description')
    .contents()
    .each((_i, node) => {
      const part = $(node);
      if (part.is('span.grey')) {
        if (label !== null) posts.set(label, cleanText(value));
        label = cleanText(part.text()).toLowerCase();
        value = '';
        return;
      }
      value += ` ${part.text()}`;
    });
  if (label !== null) posts.set(label, cleanText(value));
  return posts;
}

/**
 * Le montant d'un poste, ou `undefined` quand il n'y en a pas.
 *
 * « Aucun » n'est PAS zéro euro : le bailleur dit qu'il ne demande rien de ce
 * côté, pas qu'il a chiffré des frais à zéro. Un champ absent reste absent.
 */
function amountOf(posts: Map<string, string>, label: RegExp): string | undefined {
  for (const [name, value] of posts) {
    if (!label.test(name)) continue;
    const amount = /\d[\d\s.]*(?:,\d+)?\s*€/.exec(value)?.[0];
    return amount === undefined ? undefined : cleanText(amount);
  }
  return undefined;
}

/**
 * Ce que la fiche apprend, ou `null` si la page n'est pas une annonce.
 *
 * UNE ANNONCE PARTIE NE REND PAS 404 : le site REDIRIGE vers son accueil, et
 * répond 200. Le mécanisme partagé d'extinction, qui se fie au code HTTP, ne
 * peut donc rien ici ; on se contente de ne rien apprendre d'une telle page,
 * et l'annonce s'éteint par ses absences de la liste, qui, elle, ne montre que
 * ce qui est en ligne.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const content = $('#content');
  if (content.length === 0 || content.find('h1').length === 0) return null;

  const badges = content
    .find('.badge')
    .map((_i, badge) => cleanText($(badge).text()))
    .get()
    .filter((badge) => badge !== '');

  const aside = $('aside');
  const posts = conditions($);

  // « 11 Rue Dunoyer De Segonzac - 06000 Nice » : l'adresse du BIEN, puis sa
  // commune. Le tiret sépare, et l'adresse manque sur les annonces sans numéro.
  const place = cleanText(content.find('.title p.flex.grey').first().text());
  const placeMatch = /^(.*?)\s*-?\s*(\d{5})\s+(.+)$/.exec(place);

  // « 37 m² 900 € CC » : le pavé de droite, où le `<sup>` porte la mention.
  aside.find('sup').each((_i, el) => {
    $(el).replaceWith(` ${$(el).text()}`);
  });
  const priceBlock = cleanText(aside.find('#partial-advert-price').text());
  const price = /(\d[\d\s.]*(?:,\d+)?)\s*€(?:\s*[A-Za-z]{2,3})?/.exec(priceBlock)?.[0];

  const services = $('.services .service span')
    .map((_i, el) => cleanText($(el).text()))
    .get()
    .filter((label) => label !== '');

  const dpe = diagnosticLetter($, 'dpe');
  const ges = diagnosticLetter($, 'ges');
  const landlord = landlordFrom(badges);

  return {
    title: cleanText(content.find('h1').first().text()),
    description: htmlToText($, '.item.description'),
    priceText: price === undefined ? undefined : cleanText(price),
    areaText: /(\d+(?:[.,]\d+)?)\s*m²/.exec(priceBlock)?.[0],
    chargesText: amountOf(posts, /^charges/),
    depositText: amountOf(posts, /^dépôt de garantie/),
    feesText: amountOf(posts, /^frais de dossier/),
    propertyTypeText: propertyTypeFrom(badges),
    // « Meublé » est un équipement déclaré par le bailleur, pas une lecture du titre.
    furnishedText: services.some((label) => /^meublé$/i.test(label)) ? 'Meublé' : undefined,
    addressText: placeMatch?.[1] === undefined || placeMatch[1] === '' ? undefined : placeMatch[1],
    postalCodeText: placeMatch?.[2],
    cityText: placeMatch?.[3],
    publishedAtText: /Publiée[^<]*/.exec(cleanText(content.find('.title').text()))?.[0],
    availableAtText: /Disponible[^|]*/.exec(cleanText(aside.find('h3').first().text()))?.[0],
    extra: {
      ...energyLabels(dpe, ges),
      ...(landlord === undefined ? {} : { landlord }),
      ...(services.length === 0 ? {} : { equipements: services.join(', ') }),
    },
  };
}
