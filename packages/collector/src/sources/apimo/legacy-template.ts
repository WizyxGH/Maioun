/**
 * Gabarit Apimo « classique » (`/fr/recherche/{transaction}-{type}-…-{cp}-{id}`),
 * antérieur à celui de `parser.ts`, partagé par Agence Castel et CDC Immobilier.
 *
 * La recherche `/fr/recherche/?nature=2` ne rend que les locations, en cartes
 * `li.ad` portant l'identifiant Apimo (`?estate=`) et « Type, Ville ». La fiche
 * marque sa transaction sur `<body class="nature-N">` (1 vente, 2 location,
 * 3 saisonnier) et range ses chiffres en listes « Libellé <span>valeur</span> »
 * (Résumé, Informations légales). Le DPE n'existe qu'en images dont l'adresse
 * porte les deux valeurs : `/fr/diagnostic/{id}/1/{kWh}` et `/2/{CO₂}`.
 *
 * Aucune location publiée par les deux agences au 2026-09-15 : le parseur a été
 * écrit sur leurs fiches de VENTE (même gabarit) et la recherche vide.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { dpeFromValues } from '../../normalization/parse-listing-fields.js';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export interface ApimoClassicSite {
  readonly agencyName: string;
  /** Origine du site, sans barre finale (`http://www.agencecastel.com`). */
  readonly origin: string;
}

/** Recherche filtrée sur la location à l'année. */
export const listUrl = (site: ApimoClassicSite): string => `${site.origin}/fr/recherche/?nature=2`;

/** Cartes de la recherche ; les ventes éventuelles sont écartées d'après l'adresse. */
export function parseList(html: string, site: ApimoClassicSite): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('li.ad').each((_i, el) => {
    const card = $(el);
    const reference = /estate=(\d+)/.exec(card.find('.selectionLink').attr('href') ?? '')?.[1];
    const href = card
      .find('a[href^="/fr/recherche/"]')
      .toArray()
      .map((a) => $(a).attr('href') ?? '')
      .find((path) => /^\/fr\/recherche\/[a-z]/.test(path));
    if (reference === undefined || href === undefined || byRef.has(reference)) return;
    if (/^\/fr\/recherche\/(?:vente|viager|programme)-/.test(href)) return;
    // « Appartement, Nice »
    const [type, city] = cleanText(card.find('.titles h2').first().text()).split(/\s*,\s*/);
    const title = cleanText(card.find('.titles h3').first().text());
    const sourceUrl = `${site.origin}${href}`;
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: title === '' ? undefined : title,
        propertyTypeText: type === '' ? undefined : type,
        cityText: city,
        agencyName: site.agencyName,
        contactFormUrl: sourceUrl,
      }),
    );
  });
  return [...byRef.values()];
}

/**
 * Bloc « Aucun résultat » de la recherche. Par sa classe : le même texte sert
 * d'attribut au sélecteur de ville, sur les pages pleines aussi.
 */
export function isEmptyList(html: string): boolean {
  const $ = cheerio.load(html);
  return $('li.ad').length === 0 && $('.noResults').length > 0;
}

/** Les listes « Libellé <span>valeur</span> » d'un bloc de détails. */
function labelled($: cheerio.CheerioAPI, block: string): Map<string, string> {
  const fields = new Map<string, string>();
  $(`.detailsList .${block} li`).each((_i, el) => {
    const value = cleanText($(el).find('span').text());
    const label = cleanText($(el).clone().children('span').remove().end().text()).toLowerCase();
    if (label !== '' && !fields.has(label)) fields.set(label, value);
  });
  return fields;
}

/** Première valeur dont le libellé correspond. */
const find = (fields: Map<string, string>, pattern: RegExp): string | undefined =>
  [...fields].find(([label, value]) => pattern.test(label) && value !== '')?.[1];

/** « Appartement <br> Nice Le Port » : type, puis ville suivie du quartier. */
function placeOf(
  $: cheerio.CheerioAPI,
  listing: RawListing,
): { type?: string; city?: string; district?: string } {
  const [type, place] = ($('.showPictures article h2').first().html() ?? '')
    .split(/<br\s*\/?>/i)
    .map((part) => cleanText(cheerio.load(part).text()));
  const city = listing.cityText ?? place;
  const rest =
    city !== undefined && place?.toLowerCase().startsWith(`${city.toLowerCase()} `) === true
      ? place.slice(city.length).trim()
      : '';
  return {
    ...(type !== undefined && type !== '' ? { type } : {}),
    ...(city !== undefined && city !== '' ? { city } : {}),
    ...(rest !== '' ? { district: rest } : {}),
  };
}

/** Classe DPE lue dans l'adresse des images, sans les charger (robots.txt l'interdit). */
function dpeOf($: cheerio.CheerioAPI): string | undefined {
  const value = (kind: 1 | 2): number | undefined => {
    const src = $('.diagnostics img[src*="/fr/diagnostic/"]')
      .toArray()
      .map((img) => $(img).attr('src') ?? '')
      .find((path) => new RegExp(`/${kind}/\\d+(?:\\.\\d+)?$`).test(path));
    const number = Number(src?.split('/').pop());
    return src !== undefined && Number.isFinite(number) ? number : undefined;
  };
  const kwh = value(1);
  const co2 = value(2);
  return kwh !== undefined && co2 !== undefined ? dpeFromValues(kwh, co2) : undefined;
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location à l'année. */
export function parseDetail(
  html: string,
  listing: RawListing,
  site: ApimoClassicSite,
): RawDraft | null {
  const $ = cheerio.load(html);
  if (!/\bnature-2\b/.test($('body').attr('class') ?? '')) return null;
  const head = $('.showPictures article').first();
  const price = head
    .find('li')
    .toArray()
    .map((li) => cleanText($(li).text()))
    .find((text) => /€/.test(text));
  // Un tarif à la semaine passe : la normalisation l'écarte.
  if (price === undefined) return null;

  const summary = labelled($, 'summary');
  const legal = labelled($, 'legal');
  const services = $('.detailsList .services li')
    .toArray()
    .map((li) => cleanText($(li).text()));
  const { type, city, district } = placeOf($, listing);
  const description = htmlToText($, 'p.comment');
  const title = cleanText($('.titles h1').first().text());
  const imageUrls = [
    ...new Set(
      $('.show-carousel a.slideshow')
        .toArray()
        .map((a) => $(a).attr('href') ?? '')
        .filter((href) => href.startsWith('https://')),
    ),
  ];
  const dpe = dpeOf($);
  const rooms = find(summary, /^pièces$/);
  const bedrooms = /(\d+)\s*chambre/.exec(head.text())?.[1];
  const reference = /Ref\.\s*(\S+)/.exec(head.text())?.[1];

  const extra: Record<string, string> = {};
  if (reference !== undefined) extra['reference'] = reference;
  if (district !== undefined) extra['quartier'] = district;
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (services.length > 0) extra['features'] = services.join(', ');

  return {
    title: title === '' ? undefined : title,
    description: description === '' ? undefined : description,
    // Le libellé des charges accompagne le loyer quand elles y sont comprises.
    priceText: find(legal, /charges comprises/) !== undefined ? `${price} CC` : price,
    chargesText: find(legal, /provision|charges locatives|^charges$/),
    depositText: find(legal, /dépôt de garantie/),
    feesText: find(legal, /honoraires.*locataire|honoraires de location/),
    areaText: find(summary, /^surface$/),
    // Les chambres ne se lisent qu'avec les pièces (ou `extra.features`).
    roomsText: [rooms, bedrooms !== undefined ? `${bedrooms} chambres` : undefined]
      .filter(Boolean)
      .join(', '),
    propertyTypeText: type,
    furnishedText: services.some((service) => /^meublé$/i.test(service))
      ? 'meublé'
      : `${title} ${description}`,
    cityText: city,
    postalCodeText: /-(\d{5})(?:-\d+)?$/.exec(listing.sourceUrl)?.[1],
    availableAtText: find(summary, /^disponibilit/),
    agencyName: site.agencyName,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
