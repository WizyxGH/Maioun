/**
 * Source : Street Immobilier (street-immobilier.com) — agence de Nice, 12 rue
 * Cassini, et sa maison mère parisienne. Site Genesites / Partagimmo.
 *
 * LA LISTE SUFFIT. Chaque carte de `/location/nice-06/1/0` porte la rue, la
 * commune et le code postal, la surface, les pièces, les chambres, l'étage, le
 * loyer charges comprises, la référence (« STIN233 ») dans le titre du lien, la
 * photo et le téléphone de l'agence. La fiche n'apprendrait que la
 * description : on ne la demande pas, ce qui tient la source à une requête.
 *
 * Le site déclare `windows-1252` : le client HTTP le lit.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { compactListing } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'Street Immobilier';
export const LIST_URL = 'https://street-immobilier.com/location/nice-06/1/0';

/** Le texte d'une icône de critère (`icon_surface`, `icon_pieces`…). */
function critere(carte: cheerio.Cheerio<never>, $: cheerio.CheerioAPI, nom: string): string {
  return cleanText($(carte).find(`.icon_${nom}`).first().text());
}

/** Les cartes de la page de liste. */
export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const parRef = new Map<string, RawListing>();
  $('.row.property').each((_i, el) => {
    const carte = $(el) as cheerio.Cheerio<never>;
    const lien = carte.find('a[href$=".html"]').first();
    const href = lien.attr('href');
    // « Voir la fiche de STIN233 : Appartement de 31m² à Nice »
    const [, reference, nature] = /fiche de (\S+)\s*:\s*(.+)$/.exec(lien.attr('title') ?? '') ?? [];
    if (href === undefined || reference === undefined || parRef.has(reference)) return;

    const bloc = carte.find('.criteres_biens_liste1').first();
    // La rue est le premier texte du bloc, avant le premier séparateur.
    const rue = cleanText(bloc.contents().first().text());
    const [, commune, codePostal] =
      /^(.+?)\s*-\s*(\d{5})$/.exec(cleanText(bloc.find('h4').first().text())) ?? [];
    const loyer = cleanText(bloc.find('h4').last().text());
    const photo = /url\((https?:[^)]+)\)/.exec(carte.find('.image-liste').attr('style') ?? '')?.[1];
    const telephone = /0\d(?:[.\s]?\d\d){4}/.exec(carte.find('.well').text())?.[0];
    const sourceUrl = new URL(href, LIST_URL).href;
    const etage = critere(carte, $, 'etage').replace(/^étage\s*:\s*/i, '');

    parRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: nature,
        propertyTypeText: nature,
        priceText: /€/.test(loyer) ? loyer : undefined,
        areaText: critere(carte, $, 'surface') ? `${critere(carte, $, 'surface')} m²` : undefined,
        roomsText: critere(carte, $, 'pieces') || undefined,
        addressText: rue || undefined,
        cityText: commune,
        postalCodeText: codePostal,
        imageUrls: photo !== undefined ? [photo] : undefined,
        agencyName: AGENCY_NAME,
        phoneText: telephone,
        contactFormUrl: sourceUrl,
        extra: {
          reference,
          ...(etage !== '' ? { features: `étage : ${etage}` } : {}),
        },
      }),
    );
  });
  return [...parRef.values()];
}
