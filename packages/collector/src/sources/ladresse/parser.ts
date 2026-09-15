/**
 * Source : L'Adresse (ladresse.com) — réseau coopératif d'agences, demandé
 * explicitement. Agence de Nice.
 *
 * Vérifié le 2026-08-22 : robots.txt permissif (n'interdit que /admin/, /page/,
 * /conf/…). La page de résultats `/recherche/location/appartement/nice-06000`
 * est en SSR et porte TOUT sur chaque carte (`a.bien`) : prix charges comprises,
 * type, pièces/chambres, surface, ville/CP (dans l'`alt` de la photo), photo et
 * lien `/annonce/location/…/{id}`. On parse donc la LISTE en une requête, sauf
 * la description : la carte n'en porte qu'un résumé, et la fiche des annonces
 * nouvelles est lue pour le texte entier. Pas de JSON-LD.
 *
 * La page inclut aussi des communes voisines (Cannes, Le Cannet, Mandelieu) :
 * elles sont conservées telles quelles et écartées ensuite par le scoring de
 * ville (§16), comme pour les autres sources multi-communes.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';

/** Type de bien depuis le libellé français de la carte. */
const TYPE_LABELS = /appartement|maison|studio|villa|duplex|loft|chambre/i;

/** Brouillon : champs de `RawListing` tous facultatifs, `undefined` toléré. */
/** Retire les champs `undefined` et fige en `RawListing`. */
/**
 * Compose l'annonce à partir des champs déjà extraits d'une carte. Isolé pour
 * garder la boucle de parsing simple (complexité).
 */
function buildListing(fields: {
  reference: string;
  sourceUrl: string;
  alt: string;
  typeText: string;
  description: string;
  geo: string;
  price: string;
  image: string | undefined;
  agencyName: string;
}): RawListing {
  const { reference, sourceUrl, alt, typeText, description, geo, price, image, agencyName } =
    fields;
  return compactListing({
    sourceRef: reference,
    sourceUrl,
    title: cleanText(alt) || undefined,
    description: description || undefined,
    priceText: price || undefined,
    // Surface/pièces : dans la description, sinon dans l'alt.
    areaText: (description.match(/[\d.,]+\s*m²/i) ?? alt.match(/[\d.,]+\s*m²/i))?.[0],
    roomsText: (description.match(/\d+\s*pi[eè]ces?/i) ?? alt.match(/\d+\s*pi[eè]ces?/i))?.[0],
    propertyTypeText: TYPE_LABELS.test(typeText) ? typeText : undefined,
    // Ville : depuis l'alt « {Type} {VILLE} ({CP}) … » — fiable (le `.bien-geo`
    // vaut parfois « à 33 km de Nice » pour les communes lointaines, trompeur).
    // CP depuis l'alt aussi.
    cityText:
      /^\S+\s+(.+?)\s*\(\d{5}\)/.exec(alt)?.[1]?.trim() ||
      geo.replace(/\s*\(\d+\)\s*$/, '').trim() ||
      undefined,
    postalCodeText: /\((\d{5})\)/.exec(alt)?.[1],
    agencyName,
    contactFormUrl: sourceUrl,
    imageUrls: image !== undefined && /^https?:/i.test(image) ? [image] : undefined,
    extra: { reference },
  });
}

/** Parse la page de résultats et rend une annonce par carte `a.bien`. */
export function parseListPage(html: string, pageUrl: string, agencyName: string): ParsedList {
  const $ = cheerio.load(html);
  const bySourceRef = new Map<string, RawListing>();

  $('a.bien[href]').each((_i, el) => {
    const card = $(el);
    const href = card.attr('href') ?? '';
    const reference = card.attr('data-id') ?? /\/(\d{4,})(?:\?|$)/.exec(href)?.[1] ?? null;
    if (reference === null || bySourceRef.has(reference)) return;
    let sourceUrl: string;
    try {
      sourceUrl = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    bySourceRef.set(
      reference,
      buildListing({
        reference,
        sourceUrl,
        alt: card.find('img[alt]').attr('alt') ?? '',
        typeText: cleanText(card.find('.bien-type').text()),
        // LA CARTE, PAS LE DOCUMENT. Le sélecteur portait sur `$` tout entier :
        // `htmlToText` prend alors le PREMIER `.bien-description` de la page, et
        // les treize annonces héritaient de la description de la première. Sur
        // la fiche, cela se voyait à peine ; sur les données, c'était grave —
        // surface et nombre de pièces se lisent dans cette description, si bien
        // que TOUTES les annonces de la source affichaient « 76,25 m² » et
        // « 3 pièces ». Le filtre par surface les gardait ou les jetait en bloc,
        // le score au mètre carré était faux, et le dédoublonnage les prenait
        // pour le même bien.
        description: htmlToText($, card.find('.bien-description') as cheerio.Cheerio<never>),
        geo: cleanText(card.find('.bien-geo').text().replace(/\s+/g, ' ')),
        price: cleanText(card.find('.bien-prix').text().replace(/\s+/g, ' ')),
        image: card.find('img[src]').attr('src'),
        agencyName,
      }),
    );
  });

  const listings = [...bySourceRef.values()];
  return {
    listings,
    warnings: listings.length === 0 ? [`Aucune annonce sur la liste : ${pageUrl}`] : [],
  };
}

/**
 * Un `<br />` suivi d'un saut de ligne : c'est ainsi que la fiche rend CHAQUE
 * retour à la ligne. Les deux comptés, chaque ligne était suivie d'une vide.
 */
const BR_THEN_NEWLINE = /(<br\s*\/?>)[^\S\n]*\r?\n/gi;

/**
 * La description entière, lue sur la fiche.
 *
 * La carte n'en donne qu'un résumé fabriqué — « 3 pièces, 2 chambres 76.25 m²
 * Avec balcon » — alors que le texte de l'agence, avec rue, étage et
 * disponibilité, n'est que sur la fiche. On vise `#annonce-description` : la
 * page liste aussi des biens similaires, chacun avec son `.bien-description`.
 *
 * `null` si le bloc manque : on garde alors ce que la carte a donné.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html.replace(BR_THEN_NEWLINE, '$1'));
  // Le premier paragraphe seul : le suivant est la mention Géorisques, commune
  // à toutes les fiches.
  const description = htmlToText($, '#annonce-description > p');
  const dpe = /\bdpe-([a-g])\b/i.exec(
    $('#annonce-description .dpe').first().attr('class') ?? '',
  )?.[1];
  const phone = $('#annonce-contact a[href^="tel:"]').first().attr('href')?.slice('tel:'.length);
  const draft = compactListing({
    description: description !== '' ? description : undefined,
    ...summaryAmounts(cleanText($('.annonce-caracteristiques').first().text())),
    phoneText: phone !== undefined && phone.trim() !== '' ? phone.trim() : undefined,
    extra: dpe !== undefined ? { dpe: dpe.toUpperCase() } : undefined,
  });
  return Object.keys(draft).length > 0 ? draft : null;
}

/**
 * Ligne de résumé sous la référence : « 1700 € de dépôt de garantie | Charges :
 * 50 € | Honoraires 598.00 TTC à la charge du locataire (dont 138.00€ …) ».
 * Le montant précède ou suit son libellé selon le segment.
 */
function summaryAmounts(line: string): RawDraft {
  const fields: Record<string, string | undefined> = {};
  for (const segment of line.split('|')) {
    const amount = /(\d[\d\s.,]*)\s*(?:€|TTC)/.exec(segment)?.[1]?.trim();
    if (amount === undefined) continue;
    if (/d[ée]p[ôo]t de garantie/i.test(segment)) fields['depositText'] = `${amount} €`;
    else if (/^\s*charges/i.test(segment)) fields['chargesText'] = `${amount} €`;
    else if (/honoraires/i.test(segment)) fields['feesText'] = `${amount} €`;
  }
  return fields;
}

/**
 * `true` si la fiche annonce explicitement que le bien n'est plus à louer.
 *
 * L'agence laisse la page en ligne et y pose un bandeau — « CE BIEN N'EST PLUS
 * DISPONIBLE A LA LOCATION ». Sans le lire, l'annonce restait en « peut-être
 * retirée » alors que la source, elle, ne doute pas (§32).
 */
export function parseWithdrawn(html: string): boolean {
  return /n['’\s]?est\s+plus\s+disponible\s+a\s+la\s+location/i.test(cheerio.load(html).text());
}
