/**
 * Parser des pages de liste de paruvendu.fr (location d'appartements à Nice).
 *
 * CE QUE LA SOURCE APPORTE, MESURÉ AVANT DE L'ÉCRIRE (2026-09-11). Sur les 150
 * annonces de ses cinq pages, les deux tiers viennent d'agences que le projet
 * collecte déjà — BEP 32, Citya 23, LocService 13, L'Adresse 13, Century 21 11.
 * Le reste est ce qu'on vient chercher : TREIZE PARTICULIERS, la denrée rare
 * d'un inventaire presque entièrement professionnel, et une douzaine d'agences
 * qu'aucune autre source ne lit — Riviera Boulevard, MCE, A Alliance, BSK,
 * 123loger, Bérénice… Le dédoublonnage rapproche le reste.
 *
 * CONFORMITÉ : le `robots.txt` ferme `/immobilier/annonceimmofo/`,
 * `/immobilier/annoncefo/` et plusieurs paramètres (`?pagv=`, `?tri=`, `?d=`,
 * `?fulltext=`). La pagination passe par `?p=N`, qui n'y figure pas ; les
 * fiches vivent sous `/immobilier/location/appartement/<id>`, ouvert.
 *
 * LA CARTE : loyer charges comprises (« CC* », jamais hors charges), surface,
 * pièces, DPE, un extrait de description coupé, les photos, et l'annonceur —
 * « Particulier », ou le nom de l'agence.
 *
 * LA FICHE (`parseDetail`) : charges, dépôt de garantie, honoraires et la
 * description entière.
 *
 * LA DATE AFFICHÉE EST CELLE DE LA DERNIÈRE MISE À JOUR, pas de la parution —
 * le site l'intitule ainsi. On ne la fait pas passer pour une date de
 * publication.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { parseChargesFromText, parsePrice } from '../../normalization/parse-listing-fields.js';
import { cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';
import type { RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.paruvendu.fr';

/** L'adresse de la page `n` de la recherche niçoise. */
export function pageUrlFor(page: number): string {
  const base = `${SITE}/immobilier/recherche/location/appartement/nice/`;
  return page <= 1 ? base : `${base}?p=${page}`;
}

export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
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
    const dpe = card.find('[class*="NoteEnerg_"]').first().text().trim();
    const description = cleanText(card.find('p.line-clamp-5').first().text());
    const city = /([A-ZÀ-Ý][A-Za-zÀ-ÿ' -]+?)\s*\(\d{2}\)/.exec(headline)?.[1];

    // L'ANNONCEUR. « Particulier » se dit en toutes lettres ; une agence se
    // désigne par le texte de remplacement de son logo, « pro : <nom> ».
    const isPrivate = /\bparticulier\b/i.test(card.find('.pseudoinfo').text());
    const agency = /^pro\s*:\s*(.+)$/i.exec(card.find('img.imgOffice').attr('alt') ?? '')?.[1];

    const extra: Record<string, string> = { reference };
    if (/^[A-G]$/.test(dpe)) extra['dpe'] = dpe;
    if (isPrivate) extra['landlord'] = 'private';
    else if (agency !== undefined) extra['landlord'] = 'agency';

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
  const hasNextPage = $(`a[href*="?p=${current + 1}"]`).length > 0;
  return { listings, hasNextPage, warnings };
}

/**
 * Ce que la fiche ajoute à la carte : charges, dépôt, honoraires et la
 * description entière.
 *
 * « Dont charges/mois » est la part des charges DANS le loyer affiché. Absente
 * chez les particuliers et quelques agences, qui l'écrivent parfois dans le
 * texte (« dont charges mensuelles : 50.0 euros »).
 *
 * Le loyer n'est pas repris : la mémoire des fiches le figerait une semaine,
 * et masquerait une baisse que la liste montre.
 */
export function parseDetail(html: string, priceText?: string): RawDraft | null {
  const $ = cheerio.load(html);

  let chargesText: string | undefined;
  let depositText: string | undefined;
  let feesText: string | undefined;
  $('#autoprix .opt19_hd_det').each((_i, row) => {
    const label = cleanText($(row).find('span').first().text());
    const value = cleanText($(row).find('strong').first().text());
    // « NC » ou vide : rien à retenir.
    if (!/\d/.test(value)) return;
    if (/charges/i.test(label)) chargesText = value;
    else if (/d[ée]p[ôo]t/i.test(label)) depositText = value;
    else if (/honoraires/i.test(label)) feesText = value;
  });

  const body = $('#txtAnnonceTrunc').first().clone();
  // Bloc caché « Lieu : Alpes-Maritimes (06) », qui n'est pas du texte d'annonce.
  body.find('#localisation_bar_header').remove();
  const description = htmlToText($, body as cheerio.Cheerio<never>);

  // Charges écrites dans le texte (« dont charges mensuelles : 50.0 euros »).
  if (chargesText === undefined && description !== '') {
    const inText = parseChargesFromText(description, parsePrice(priceText).amount);
    if (inText !== null) chargesText = `${String(inText)} €`;
  }

  if ([chargesText, depositText, feesText].every((v) => v === undefined) && description === '') {
    return null;
  }
  return {
    chargesText,
    depositText,
    feesText,
    description: description !== '' ? description : undefined,
  };
}
