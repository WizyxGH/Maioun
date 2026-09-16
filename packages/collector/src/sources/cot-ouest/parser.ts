/**
 * Cot'Ouest Immobilier : plateforme Twimmo, habillage « templateC ».
 *
 * Twimmo sert plusieurs habillages, et celui-ci ne place pas ses données aux
 * mêmes endroits que celui de `../twimmo/parser.ts` (écrit sur MK Immo et
 * Elitimo) : ni `.detail-header-titre` — donc ni ville ni code postal —, ni
 * `.detail-offre-texte` — donc pas de description —, et le GES s'y intitule
 * « Emission de gaz à effet de serre » et non « Classe climat ».
 *
 * On ne recopie pas le parseur de la famille pour autant : ce module l'appelle
 * et ne remplit QUE ce que l'habillage déplace. Ces compléments ont vocation à
 * rejoindre `../twimmo/parser.ts` — ils valent pour tout site en templateC —
 * dès que ce fichier cessera d'être remanié par ailleurs.
 *
 * La page de liste, elle, en dit plus que la fiche : chaque carte porte la
 * commune, le quartier et les coordonnées GPS saisies par l'agence en attributs
 * `data-*`. On les prend là, la fiche ne les publiant nulle part.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { energyLabels, firstMatch, flatText } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { parseTwimmoDetail, parseTwimmoList } from '../twimmo/parser.js';

/** Un degré décimal, virgule ou point : `43,6820` comme `41.67969`. */
function coordinate(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  // Un 0 n'est pas une position : c'est la case laissée vide par l'agence.
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}

/** Ce que la carte de la liste ajoute à l'annonce, par chemin de fiche. */
function cardsByPath(html: string): Map<string, RawDraft> {
  const $ = cheerio.load(html);
  const byPath = new Map<string, RawDraft>();
  $('article.thumbnail-listing').each((_i, el) => {
    const card = $(el);
    const path = card.attr('data-lien');
    if (path === undefined) return;
    // « Nice<br/>Vallon barla » : la commune, puis le quartier.
    const [city, district] = cleanText(card.attr('data-details')?.replace(/<br\s*\/?>/gi, '|'))
      .split('|')
      .map((part) => part.trim());
    byPath.set(path, {
      cityText: city === undefined || city === '' ? undefined : city,
      latitude: coordinate(card.attr('data-latgps')),
      longitude: coordinate(card.attr('data-longgps')),
      extra: district === undefined || district === '' ? undefined : { quartier: district },
    });
  });
  return byPath;
}

/**
 * Les locations de la liste, enrichies de ce que porte leur carte.
 *
 * LE LOYER DE LA CARTE EST LAISSÉ DE CÔTÉ à dessein : `runListAndDetails` rend
 * toute annonce qui en porte un, et la carte en affiche un pour les locations
 * à la SEMAINE que la fiche fait écarter. Une saisonnière corse passerait pour
 * un loyer mensuel de 1 000 €.
 */
export function parseCotOuestList(html: string, listUrl: string, agencyName: string): RawListing[] {
  const cards = cardsByPath(html);
  return parseTwimmoList(html, listUrl, agencyName).map((listing) => {
    const card = cards.get(new URL(listing.sourceUrl).pathname);
    return card === undefined ? listing : compactListing({ ...listing, ...card });
  });
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location au mois. */
export function parseCotOuestDetail(html: string): RawDraft | null {
  const base = parseTwimmoDetail(html);
  if (base === null) return null;

  const $ = cheerio.load(html);
  const description = htmlToText($, '.offer-description-description');
  // « Appartement à louer 06200, NICE OUEST - Corniche Fleurie » : le code
  // postal du BIEN, seul endroit de la fiche où il soit écrit.
  const meta = cleanText($('meta[name="description"]').attr('content'));
  const postalCode = firstMatch(meta, String.raw`(\d{5}),`);
  const ges = firstMatch(
    flatText($),
    String.raw`Emission de gaz à effet de serre \(ges\) ([A-G])\b`,
  );
  const extra = { ...base.extra, ...energyLabels(undefined, ges) };

  return {
    ...base,
    description: description === '' ? base.description : description,
    postalCodeText: base.postalCodeText ?? postalCode,
    extra: Object.keys(extra).length === 0 ? undefined : extra,
  };
}
