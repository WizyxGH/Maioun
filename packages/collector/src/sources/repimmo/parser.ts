/**
 * Source : Repimmo (repimmo.com) — petites annonces immobilières gratuites,
 * déposées par des particuliers et par des agences.
 *
 * C'EST L'ORIGINE DES ANNONCES DE RENTOLA. Rentola recopie Repimmo (sa fiche
 * cite l'annonce d'origine) mais n'en garde presque rien : ni la rue, ni les
 * charges, ni le DPE, ni l'annonceur — et il garde en ligne des annonces que
 * Repimmo a expirées. Lire l'original rend tout cela.
 *
 * LISTE : `/annonces-immobilieres-nice/location-nice-06000/`, dix annonces par
 * page, paginée par `?page=N`. Chaque carte porte déjà le titre, le loyer, la
 * surface, les pièces, la rue et la nature de l'annonceur (« Annonce de
 * particulier n° »).
 *
 * FICHE : `/petite_annonces_immobiliere/{n°}/{slug}.php` — description,
 * charges, DPE et GES, équipements, photos, et le bloc de contact : nom et
 * adresse de l'agence avec ses téléphones en clair, ou le nom du particulier
 * (son téléphone n'est donné qu'à la demande, par un script que `robots.txt`
 * ne nous ouvre pas — on ne le demande pas).
 *
 * Le site ne répond qu'en http, et déclare `iso-8859-1` : le client HTTP le lit.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { namesAStreet } from '../../normalization/parse-listing-fields.js';
import { htmlToText } from '../shared/html-text.js';
import { energyLabels } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const ORIGIN = 'http://www.repimmo.com';
export const LIST_URL = `${ORIGIN}/annonces-immobilieres-nice/location-nice-06000/`;

/** Adresse canonique d'une fiche. */
function ficheUrl(path: string): string {
  return new URL(path, ORIGIN).href;
}

/** Valeur d'une étiquette `<li><span class="label">Pièces</span>2</li>`. */
function etiquette(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<never>,
  libelle: RegExp,
): string | undefined {
  let valeur: string | undefined;
  scope.find('ul.annonce_labels li').each((_i, el) => {
    const label = cleanText($(el).find('.label').text());
    if (valeur === undefined && libelle.test(label)) {
      const texte = cleanText($(el).text()).slice(label.length).trim();
      valeur = texte === '' ? undefined : texte;
    }
  });
  return valeur;
}

/**
 * La rue, si le libellé en nomme une ; le quartier sinon.
 *
 * Repimmo écrit ce que l'annonceur a saisi : « rue Pastorelli », « Cr Saleya, »,
 * ou un nom de quartier. Une rue devient l'adresse ; le reste, un quartier —
 * jamais une adresse inventée.
 */
function lieu(secteur: string | undefined): { addressText?: string; quartier?: string } {
  const propre = cleanText(secteur ?? '').replace(/[,\s]+$/, '');
  if (propre === '') return {};
  return namesAStreet(propre) ? { addressText: propre } : { quartier: propre };
}

/** Les cartes d'une page de liste. */
export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  $('div.annonce_resume[id^="annonce_resume_"]').each((_i, el) => {
    const carte = $(el) as cheerio.Cheerio<never>;
    const reference = /annonce_resume_(\d+)/.exec(carte.attr('id') ?? '')?.[1];
    const lien = carte.find('h3 a').first();
    const href = lien.attr('href');
    if (reference === undefined || href === undefined) return;

    // « Location appartement 40 m2 sur Nice rue Pastorelli ( 06000 - Alpes Maritimes ) »
    const situation = cleanText(carte.find('.annonce_resume_prix strong').text());
    const [, secteur, postalCode] =
      /^sur\s+\S+(?:\s+(.*?))?\s*\(\s*(\d{5})\s*-/.exec(situation) ?? [];
    const resume = cleanText(carte.find('.annonce_description_txt').text());
    const date = /du (\d{2}\/\d{2}\/\d{4})/.exec(carte.find('.annonce_bloc_date').text())?.[1];
    const vignette = carte.find('img.imageImmo').attr('src');
    const { addressText, quartier } = lieu(secteur);

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl: ficheUrl(href),
        title: cleanText(lien.text()),
        priceText: cleanText(carte.find('h3 > span').first().text()) || undefined,
        areaText: etiquette($, carte, /^Surface$/i),
        roomsText: etiquette($, carte, /^Pi[eè]ces$/i),
        propertyTypeText: cleanText(lien.text()),
        cityText: cleanText(carte.find('[itemprop="addressLocality"]').text()) || undefined,
        postalCodeText: postalCode,
        addressText,
        publishedAtText: date,
        imageUrls: vignette !== undefined ? [ficheUrl(vignette)] : undefined,
        contactFormUrl: ficheUrl(href),
        extra: {
          ...(quartier !== undefined ? { quartier } : {}),
          ...(/^Annonce de particulier\b/i.test(resume) ? { landlord: 'private' } : {}),
        },
      }),
    );
  });
  return listings;
}

/** La page suivante, telle que la pagination la publie ; `null` à la dernière. */
export function nextPage(html: string, url: string): string | null {
  const courante = Number(new URL(url).searchParams.get('page') ?? '1');
  const $ = cheerio.load(html);
  const suivante = $('a.pageindexlink')
    .map((_i, el) => $(el).attr('href') ?? '')
    .get()
    .find((href) => new RegExp(`[?&]page=${courante + 1}$`).test(href));
  return suivante === undefined ? null : new URL(suivante, url).href;
}

/** Une ligne « • Libellé : valeur » des informations complémentaires. */
function complement(texte: string, libelle: string): string | undefined {
  const ligne = new RegExp(`•\\s*${libelle}\\s*:\\s*([^\\n]+)`, 'i').exec(texte)?.[1];
  const valeur = cleanText(ligne ?? '');
  return valeur === '' ? undefined : valeur;
}

/** L'annonceur : une agence nommée avec ses téléphones, ou un particulier. */
function annonceur($: cheerio.CheerioAPI): RawDraft {
  const boite = $('#contact_box');
  if (boite.length === 0) return {};
  const identite = boite.find('.contact_box_identity');
  const particulier = identite.find('img[src*="particulier"]').length > 0;
  const lignes = htmlToText($, identite as cheerio.Cheerio<never>)
    .split('\n')
    .map((ligne) => cleanText(ligne))
    .filter((ligne) => ligne !== '' && !/^Toutes les annonces/i.test(ligne));
  const telephones = (
    boite
      .find('.contact_box_phone')
      .text()
      .match(/0\d(?:[\s.]?\d\d){4}/g) ?? []
  ).map((numero) => numero.trim());

  if (particulier) {
    return {
      contactName: lignes[0],
      extra: { landlord: 'private' },
    };
  }
  return {
    agencyName: lignes[0],
    phoneText: telephones[0],
    otherPhonesText: telephones.length > 1 ? telephones.slice(1) : undefined,
    extra: { landlord: 'agency' },
  };
}

/** Ce que la fiche apprend ; `null` si ce n'est pas une location. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const titre = cleanText($('h1').first().text());
  if (!/^Location\b/i.test(titre)) return null;

  const haut = $('.annonce_detail_top');
  const infos = haut
    .find('.annonce_detail_top_info')
    .map((_i, el) => cleanText($(el).text()))
    .get();
  const secteur = infos.find((info) => /^secteur\b/i.test(info))?.replace(/^secteur\s+/i, '');
  const postalCode = /\((\d{5})\)/.exec(titre)?.[1];
  const description = htmlToText($, 'p[itemprop="description"]');
  const corps = $('body') as cheerio.Cheerio<never>;

  const blocInfos = $('h3')
    .filter((_i, el) => /Informations compl/i.test($(el).text()))
    .first()
    .parent();
  const infosTexte = htmlToText($, blocInfos as cheerio.Cheerio<never>);
  // La première ligne, sans puce : les équipements (« meublé, cuisine équipée, … »).
  const equipements = infosTexte
    .split('\n')
    .map((ligne) => cleanText(ligne))
    .find((ligne) => ligne !== '' && !/^Informations compl|^•|^Annonce n°/i.test(ligne));
  const reference = /Annonce n°\s*\d+\s*-\s*([A-Z0-9-]+)/i.exec(infosTexte)?.[1];

  // Un bloc par étiquette : lu ligne à ligne, « DPE : C » ne se colle pas au GES.
  const diagnostic = htmlToText(
    $,
    $('h3')
      .filter((_i, el) => /Diagnostic/i.test($(el).text()))
      .first()
      .parent() as cheerio.Cheerio<never>,
  );
  const dpe = /DPE\s*:\s*([A-G])\b/.exec(diagnostic)?.[1];
  const ges = /GES\s*:\s*([A-G])\b/.exec(diagnostic)?.[1];

  // Vignettes `s_maison_media_…` : la photo pleine taille est le même nom sans `s_`.
  const imageUrls = [
    ...new Set(
      $('img.imageImmoProduit')
        .map((_i, el) => $(el).attr('src') ?? '')
        .get()
        .filter((src) => src.includes('/upload/'))
        .map((src) => ficheUrl(src.replace(/\/s_(maison_media_)/, '/$1'))),
    ),
  ];
  const { addressText, quartier } = lieu(secteur);
  const contact = annonceur($);

  return {
    title: titre,
    description: description === '' ? undefined : description,
    priceText: cleanText(haut.find('[itemprop="price"]').text()) || undefined,
    chargesText: complement(infosTexte, 'Charges'),
    areaText: etiquette($, corps, /^Surface$/i),
    roomsText: etiquette($, corps, /^Pi[eè]ces$/i),
    propertyTypeText: titre,
    furnishedText:
      equipements !== undefined && /\bmeubl/i.test(equipements) ? equipements : undefined,
    addressText,
    postalCodeText: postalCode,
    publishedAtText: haut.find('time').attr('datetime'),
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    ...contact,
    extra: {
      ...(quartier !== undefined ? { quartier } : {}),
      ...(reference !== undefined ? { reference } : {}),
      ...(equipements !== undefined ? { features: equipements.replace(/,\s*\.{3}$/, '') } : {}),
      ...energyLabels(dpe, ges),
      ...contact.extra,
    },
  };
}
