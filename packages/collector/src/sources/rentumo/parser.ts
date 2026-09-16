/**
 * Source : Rentumo (rentumo.com) — AGRÉGATEUR, demandé par l'utilisateur le
 * 2026-09-03. Voir la fiche d'étude dans `docs/sources.md`.
 *
 * CE QU'IL FAUT SAVOIR AVANT DE LIRE CE FICHIER.
 *
 * Rentumo balaie lui-même des milliers de sites et republie les annonces. Trois
 * conséquences, assumées et signalées à l'utilisateur :
 *
 *   1. AUCUN LIEN VERS L'ANNONCE D'ORIGINE. La fiche Rentumo ne le publie pas,
 *      et les coordonnées y sont floutées derrière un abonnement payant. Sa
 *      fiche n'est lue, pour les nouvelles, que pour le texte d'origine
 *      et la localisation affichée.
 *   2. CHAMPS « extraits par IA », de l'aveu du site lui-même (« may not be
 *      100% accurate »). On ne retient que ce qui est affiché tel quel sur la
 *      carte — prix, surface, chambres, type, ville — jamais une déduction.
 *   3. DONNÉE DE SECONDE MAIN. Une annonce vue ici l'est souvent déjà par une
 *      source directe ; c'est le dédoublonnage qui tranche (§13, §14).
 *
 * LA SOURCE RÉELLE EST POURTANT RÉCUPÉRABLE, et c'est ce qui rend cette source
 * exploitable : les photos passent par un proxy dont l'URL encode, en base64,
 * l'adresse D'ORIGINE de l'image. On y lit l'hébergeur du site source (FNAIM,
 * La Boîte Immo, Orpi…), ce qui identifie l'annonceur et fournit une photo en
 * pleine qualité sans passer par le proxy.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import {
  extractStreetAddress,
  parseDistrict,
  parsePostalCode,
} from '../../normalization/parse-listing-fields.js';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import type { DetailPage } from '../shared/enrich.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';
import { htmlToText } from '../shared/html-text.js';
import { collectJsonLdNodes, jsonLdString, jsonLdType } from '../shared/json-ld.js';

/**
 * URL d'origine d'une image servie par le proxy de Rentumo.
 *
 * Le proxy (imgproxy) compose ses URLs ainsi :
 *
 *     https://img.rentumo.com/<signature>/s:366:311/rt:fill-down/<base64 découpé>
 *
 * La cible est encodée en base64url, PUIS découpée en tranches séparées par des
 * `/`. On recolle les tranches avant de décoder.
 *
 * @returns l'URL d'origine, ou `null` si l'URL ne suit pas ce format — auquel
 *          cas on ne devine rien (§17).
 */
export function decodeProxiedImage(url: string): string | null {
  const encoded = /\/rt:[^/]+\/(.+)$/.exec(url)?.[1];
  if (encoded === undefined) return null;
  const joined = encoded.replace(/\//g, '');
  let decoded: string;
  try {
    decoded = Buffer.from(joined, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  return /^https?:\/\/\S+$/.test(decoded) ? decoded : null;
}

/**
 * Hôte du site d'origine, tel que révélé par les photos.
 *
 * C'est la seule trace de provenance que Rentumo laisse : elle ne remplace pas
 * un lien vers l'annonce, mais elle dit d'où vient le bien, ce qui vaut mieux
 * que « rentumo » pour décider quoi faire (§15).
 */
function originHost(imageUrls: readonly string[]): string | undefined {
  for (const url of imageUrls) {
    try {
      return new URL(url).hostname;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Titre d'une annonce, s'il y en a un.
 *
 * La carte ne porte PAS de titre : seulement un extrait de description, dont
 * la première ligne fait souvent l'affaire (« NICE NORD - AV. ST MAURICE… »).
 * Mais certaines sources ouvrent sur le loyer (« Loyer : / 1 490 € / par mois »)
 * — en faire un titre donnerait « Loyer : ». Mieux vaut alors aucun titre
 * qu'un titre absurde (§17).
 *
 * UNE PHRASE COUPÉE PAR LE SITE N'EST PAS UN TITRE NON PLUS. La carte tronque
 * l'extrait à une soixantaine de caractères, points de suspension compris :
 * quarante-deux annonces de l'inventaire s'intitulaient « Antoine BIERLAIRE du
 * cabinet Gestion Cassini vous propose... ». La fiche porte le vrai titre —
 * « 4 pièces Vide - 15 Rue de Rivoli - Nice Centre », qui nomme même la voie.
 */
function headline(description: string): string | undefined {
  const first = description.split('\n')[0]?.trim() ?? '';
  if (first.length < 12) return undefined;
  if (/(\.\.\.|…)$/.test(first)) return undefined;
  // Une ligne qui commence par une étiquette ou un montant n'est pas un titre.
  if (/^(loyer|prix|charges|montant|à partir)\b/i.test(first)) return undefined;
  if (/^[\d\s€.,]+$/.test(first)) return undefined;
  return first;
}

/**
 * Le loyer de Rentumo est HORS CHARGES, et le dire est ce qui le rend
 * comparable au reste de l'inventaire.
 *
 * Rentumo affiche « Monthly rent » et « Utilities » sur deux lignes ; le nombre
 * repris ici est le premier, quand les annonces d'origine — et les sources
 * directes du projet — annoncent le plus souvent un loyer charges comprises.
 * Vérifié le 2026-09-16 : là où le texte d'origine écrit « Loyer : X € par mois
 * charges comprises », Rentumo est en dessous quarante-six fois sur
 * quarante-neuf, de la valeur exacte des charges ; sur les biens que le projet
 * tient aussi d'une source directe, quinze fois sur seize (Citya 1 565 € dont
 * 65 → Rentumo 1 500 €).
 *
 * Sans la mention, la copie ne se regroupait pas avec l'originale et ressortait
 * comme une bonne affaire qui n'existe pas.
 */
function rentExcludingCharges(priceText: string): string {
  return `${priceText} hors charges`;
}

/** Ce qu'une page de résultats rend : ses annonces, et s'il en reste. */
export interface RentumoList extends ParsedList {
  /** `true` si la page déclare une suite (`<link rel="next">`). */
  readonly hasNext: boolean;
}

/** Extrait les annonces d'une page de résultats. */
export function parseListPage(html: string, pageUrl: string): RentumoList {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];

  $('.listing-item').each((_index, element) => {
    const card = $(element);
    const reference = card.attr('data-listing-id');
    if (reference === undefined || reference === '') return;

    const href = card.find('a[href^="/listings/"]').first().attr('href');
    if (href === undefined) {
      warnings.push(`Annonce ${reference} sans lien : ignorée`);
      return;
    }
    let sourceUrl: string;
    try {
      sourceUrl = new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    // Photos : on garde l'ORIGINE, jamais le proxy — la même image y est en
    // pleine résolution, et l'URL survit à un changement de proxy.
    const imageUrls: string[] = [];
    card.find('img[data-src^="https://img.rentumo.com/"]').each((_i, image) => {
      const decoded = decodeProxiedImage($(image).attr('data-src') ?? '');
      if (decoded !== null && !imageUrls.includes(decoded)) imageUrls.push(decoded);
    });

    // Les deux paragraphes du bloc texte : la ville, puis l'accroche.
    const paragraphs = card.find('a[href^="/listings/"] p');
    const cityText = cleanText(paragraphs.eq(0).text());
    const description = htmlToText($, paragraphs.eq(1) as cheerio.Cheerio<never>);

    // La rangée de faits : « 1 Bedroom · Apartment · 18 m² ». L'ordre varie
    // selon ce que la source publie : on lit chaque cellule pour ce qu'elle
    // est, jamais par sa position.
    const facts = card
      .find('li')
      .map((_i, cell) => cleanText($(cell).text()))
      .get()
      .filter((text) => text !== '');
    const areaText = facts.find((text) => /m²/i.test(text));
    const bedrooms = facts.find((text) => /\bbedrooms?\b/i.test(text));
    // Le vocabulaire anglais du site est passé TEL QUEL : c'est
    // `parsePropertyType` qui décide d'un type de bien, et il le comprend
    // désormais. Traduire ici en français pour qu'il retraduise ensuite était
    // un aller-retour, et un couplage muet entre deux fichiers (§12).
    const propertyTypeText = facts.join(' ');

    const priceText = cleanText(card.find('strong').first().text());
    const host = originHost(imageUrls);

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: headline(description),
        description: description !== '' ? description : undefined,
        priceText: priceText !== '' ? rentExcludingCharges(priceText) : undefined,
        areaText,
        // « 1 Bedroom » compte les CHAMBRES, pas les pièces : le confondre
        // gonflerait la typologie d'une unité sur tout l'inventaire (§17).
        // `parsePropertyType` en déduira « appartement », ce qui est juste.
        ...(bedrooms !== undefined ? { roomsText: bedrooms } : {}),
        propertyTypeText,
        cityText: cityText !== '' ? cityText : undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        extra: {
          reference,
          ...(host !== undefined ? { origine: host } : {}),
        },
      }),
    );
  });

  // `hasNext` est rendu ici : le document est déjà analysé, et le relire pour
  // le seul `<link rel="next">` coûtait une seconde analyse complète.
  return { listings, warnings, hasNext: $('link[rel="next"]').attr('href') !== undefined };
}

/**
 * Ce que la FICHE apprend : le titre et le texte ENTIER de l'annonce d'origine,
 * dans son JSON-LD.
 *
 * La carte n'en montre qu'une accroche : aucune description de plus de deux
 * cents caractères au 2026-09-15, donc ni charges, ni dépôt, ni DPE, ni
 * disponibilité à lire. Le JSON-LD recopie le texte source tel quel — loyer,
 * provision, dépôt de garantie compris.
 *
 * On n'y prend PAS `numberOfRooms` : c'est un champ « extrait par IA », qui
 * rend « 2 » pour un deux-pièces à une chambre.
 *
 * La localisation, elle, se lit dans la page (voir `locationFields`).
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const node = collectJsonLdNodes($).find((one) => {
    const type = jsonLdType(one);
    return (
      type !== '' && type !== 'breadcrumblist' && jsonLdString(one['description']) !== undefined
    );
  });
  if (node === undefined) return null;
  const description = cleanMultiline(jsonLdString(node['description']));
  const title = cleanText(jsonLdString(node['name']));
  if (description === '') return null;
  return {
    description,
    ...(title !== '' ? { title } : {}),
    ...locationFields(cleanText($('#address').first().text())),
  };
}

/**
 * Mémoire d'une fiche retirée : la liste peut montrer l'annonce encore
 * quelque temps, cette marque l'emporte sur elle.
 */
export const WITHDRAWN_DRAFT: RawDraft = { extra: { retiree: 'oui' } };

export function isWithdrawnDraft(draft: Partial<RawListing> | undefined): boolean {
  return draft?.extra?.['retiree'] === 'oui';
}

const DEACTIVATED_FLASH = /the listing has been deactivated/i;

/**
 * `true` si Rentumo dit l'annonce retirée. Relevé le 2026-09-15 : la fiche
 * désactivée redirige (302) vers la recherche de la commune, qui affiche
 * « Sorry, the listing has been deactivated ». Une redirection vers une autre
 * fiche ne prouve rien.
 */
export function isWithdrawnPage(html: string, page: DetailPage): boolean {
  if (page.status === 410) return true;
  if (page.status >= 300 && page.status < 400) {
    if (page.location === null) return false;
    try {
      return !new URL(page.location, 'https://rentumo.com').pathname.startsWith('/listings/');
    } catch {
      return false;
    }
  }
  return DEACTIVATED_FLASH.test(html);
}

/** Ce qu'une réponse de fiche apprend : retrait, contenu, ou rien. */
export function parseDetailResponse(html: string, page: DetailPage): RawDraft | null {
  if (isWithdrawnPage(html, page)) return WITHDRAWN_DRAFT;
  return page.status >= 200 && page.status < 300 ? parseDetail(html) : null;
}

/**
 * La localisation affichée sous le titre, telle que la source l'a écrite :
 * « 11 RUE X, 06300, Nice », « 06100, Nice », « Nice - Fleurs Gambetta ».
 *
 * Le `postalCode` du JSON-LD n'est PAS repris : relevé le 2026-09-15, il vaut
 * 06000 quand la source n'en donne aucun, et contredit parfois celle-ci
 * (06000 pour un bien affiché « 06100, Nice »).
 *
 * Le numéro de voie est masqué (« ** AVENUE X ») : on garde la voie seule,
 * sans aller le chercher là où la page l'a laissé en clair.
 */
function locationFields(location: string): RawDraft {
  if (location === '') return {};
  const street = extractStreetAddress(location.replace(/^\*+\s*/, ''));
  // Sans voie, la localisation nomme souvent un quartier ; avec, le nom de la
  // voie pourrait passer pour un quartier (« avenue de la Californie »).
  const district = street === null ? parseDistrict(location) : null;
  return {
    ...(street !== null ? { addressText: street } : {}),
    ...(parsePostalCode(location) !== null ? { postalCodeText: location } : {}),
    ...(district !== null ? { extra: { quartier: district } } : {}),
  };
}
