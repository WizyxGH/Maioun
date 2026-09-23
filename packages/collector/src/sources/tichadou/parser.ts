/**
 * Immobilière Tichadou (tichadou.fr) — agence niçoise, demandée par son nom.
 *
 * Site ICS, mais PAS au gabarit `resultat.php` des autres sources ICS du dépôt
 * (Forimmo, Drago, Agence du Port) : celui-ci rend ses annonces dans un
 * TABLEAU JAVASCRIPT embarqué, `var properties = [ … ]`, qui porte tout —
 * titre, loyer, lien, photo et la description ENTIÈRE.
 *
 * UNE SEULE REQUÊTE SUFFIT DONC, et la description vaut le détour : elle
 * détaille le loyer charges comprises, la provision pour charges et les
 * honoraires du locataire AVEC leur ratio au mètre carré et la part d'état des
 * lieux. C'est la matière même du plafond ALUR.
 *
 * CE N'EST PAS DU JSON, malgré les apparences : les valeurs mêlent guillemets
 * doubles, apostrophes échappées à la mode JavaScript et champs entre
 * apostrophes simples. `JSON.parse` s'y casse les dents, et `eval` n'entre pas
 * dans ce dépôt. On lit donc CHAQUE CHAMP UTILE au coup par coup — ce qui a
 * l'avantage de ne rien exiger des champs qu'on ignore.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText, comparable } from '../../normalization/text.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';

export const SITE = 'https://www.tichadou.fr';
export const LIST_URL = `${SITE}/resultats?transac=location`;

/** « Appartement en location à Nice / 1 pièce 29 m² » — le titre dit tout. */
const TITRE = /^(.+?)\s+en\s+location\s+à\s+(.+?)\s*\/\s*(\d+)\s*pi[èe]ces?\s+([\d.,]+)\s*m²/i;

/** Un champ à valeur entre guillemets doubles, échappements compris. */
function champ(objet: string, nom: string): string | null {
  const motif = new RegExp(`"${nom}"[\\s]*:[\\s]*"((?:[^"\\\\]|\\\\.)*)"`);
  const trouve = motif.exec(objet);
  if (trouve?.[1] === undefined) return null;
  return trouve[1].replace(/\\(['"\\/])/g, '$1');
}

/** Le texte d'une valeur HTML : entités décodées, balises retirées. */
function texte(valeur: string | null): string | null {
  if (valeur === null) return null;
  const sansSaut = valeur.replace(/<br\s*[/]?>/gi, ' ');
  return cleanText(cheerio.load(`<div>${sansSaut}</div>`)('div').text());
}

/**
 * Les objets du tableau, découpés sur leur première clé.
 *
 * Découper sur `},` serait imprudent : une description en contient. La clé
 * `"id"` ouvre chaque objet et n'apparaît nulle part ailleurs.
 */
function objets(html: string): readonly string[] {
  const debut = html.indexOf('var properties = [');
  if (debut === -1) return [];
  const fin = html.indexOf('];', debut);
  const tableau = html.slice(debut, fin === -1 ? undefined : fin);
  return tableau
    .split(/[{][\s]*"id"[\s]*:/)
    .slice(1)
    .map((part) => `"id":${part}`);
}

export function parseListPage(html: string): ParsedList {
  const listings: RawListing[] = [];
  const warnings: string[] = [];

  for (const objet of objets(html)) {
    const lien = champ(objet, 'lien');
    const identifiant = champ(objet, 'id');
    if (lien === null || identifiant === null) continue;

    const titre = texte(champ(objet, 'titre')) ?? '';
    const decoupe = TITRE.exec(titre);
    const prix = champ(objet, 'prix');
    const image = champ(objet, 'image');

    listings.push(
      compactListing({
        sourceRef: identifiant,
        sourceUrl: `${SITE}/${lien}`,
        title: titre,
        ...(prix !== null ? { priceText: texte(prix) ?? undefined } : {}),
        ...(decoupe !== null
          ? {
              propertyTypeText: cleanText(decoupe[1]) ?? undefined,
              cityText: cleanText(decoupe[2]) ?? undefined,
              roomsText: decoupe[3],
              areaText: decoupe[4],
            }
          : {}),
        description: texte(champ(objet, 'description')) ?? undefined,
        imageUrls:
          image === null
            ? []
            : [image.startsWith('http') ? image : `${SITE}/${image.replace(/^[.][/]/, '')}`],
      }),
    );
  }

  if (listings.length === 0) {
    warnings.push('Aucune annonce dans le tableau de la page de résultats');
  }
  return { listings, warnings };
}

/** Ce que la fiche ajoute à la carte : tout le tableau « Informations détaillées ». */
const DETAILS = '#collapseDetails li';

/** « Ascenseur : Oui » — l'ICS écrit ses booléens en toutes lettres. */
const OUI = /^oui$/i;

/**
 * Les traits que la fiche déclare et qu'aucun champ typé ne recueille.
 *
 * Ils partent dans `extra.features`, que `extractFeatures` relit comme une
 * liste d'équipements DÉCLARÉE — donc sans la chercher dans une phrase, où une
 * négation voisine pourrait la nier.
 */
const TRAITS = [
  'type de cuisine',
  'exposition',
  'chauffage',
  'mode chauffage',
  'installation eau chaude',
  'etat general',
  'standing',
  'acces handicape',
  'mecanisme de chauffage',
];

/** « Charges : 95 € » → « charges » ⇒ « 95 € ». Accents et casse ramenés. */
function tableauDetails($: cheerio.CheerioAPI): Map<string, string> {
  const details = new Map<string, string>();
  $(DETAILS).each((_, element) => {
    const ligne = cleanText($(element).text()) ?? '';
    const coupe = ligne.indexOf(':');
    if (coupe === -1) return;
    const cle = comparable(ligne.slice(0, coupe));
    const valeur = cleanText(ligne.slice(coupe + 1));
    if (cle !== '' && valeur !== null) details.set(cle, valeur);
  });
  return details;
}

/**
 * LA FICHE APPORTE CINQ FOIS PLUS DE PHOTOS, ET EN PLEINE TAILLE.
 *
 * La liste n'en donne qu'une, et dans sa version « moyennes ». La fiche porte
 * la galerie entière deux fois — en vignettes et en grand —, et c'est la
 * grande qu'on garde : les vignettes font 90 px de large.
 */
function photos($: cheerio.CheerioAPI): string[] {
  const vues = new Set<string>();
  $('img[src*="photobox"]').each((_, element) => {
    const src = $(element).attr('src') ?? '';
    if (src === '' || src.includes('/vignettes/') || src.includes('/moyennes/')) return;
    vues.add(new URL(src.replace(/^[.][/]/, ''), `${SITE}/`).toString());
  });
  return [...vues];
}

/**
 * Ce que la fiche apprend, ou `null` si elle n'apprend rien.
 *
 * LES MONTANTS SONT DANS LE TABLEAU, pas seulement dans la description : les y
 * prendre évite de relire une phrase pour un chiffre qui a sa propre case, et
 * donne le dépôt de garantie, que la description tait.
 *
 * L'ÉTIQUETTE ÉNERGIE EST UNE IMAGE, et son nom de fichier porte la classe :
 * `nouveau-dpe-D-182-D-38-titre.jpg` dit DPE D et GES D. C'est le même procédé
 * que chez les autres sites ICS du dépôt.
 */
export function parseDetailPage(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const details = tableauDetails($);
  if (details.size === 0) return null;

  const etiquettes = $('img[src*="dpe.ics.fr"]').attr('src') ?? '';
  const dpe = /nouveau-dpe-([A-G])-/.exec(etiquettes)?.[1];
  const ges = /nouveau-dpe-[A-G]-[\d.,]+-([A-G])-/.exec(etiquettes)?.[1];

  const extra: Record<string, string> = {};
  const etage = details.get('numero etage');
  if (etage !== undefined) extra['etage'] = etage;
  if (OUI.test(details.get('ascenseur') ?? '')) extra['ascenseur'] = '1';
  // `comparable` remplace la ponctuation par une espace : « Nombre de
  // Balcon(s) » devient « nombre de balcon s », et c'est cette clé-là qu'on
  // demande — la forme d'origine ne répondrait jamais.
  const balcons = details.get('nombre de balcon s');
  if (balcons !== undefined) extra['nbBalcons'] = balcons;
  const terrasses = details.get('nombre de terrasse s');
  if (terrasses !== undefined) extra['nbTerrasses'] = terrasses;
  // « Localisation : Centre ville » : le quartier, tel que l'agence le nomme.
  const quartier = details.get('localisation');
  if (quartier !== undefined) extra['quartier'] = quartier;
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (ges !== undefined) extra['ges'] = ges;
  const traits = TRAITS.map((nom) => {
    const valeur = details.get(nom);
    return valeur === undefined ? null : `${nom} : ${valeur}`;
  }).filter((trait): trait is string => trait !== null);
  if (traits.length > 0) extra['features'] = traits.join(' · ');

  const galerie = photos($);
  return {
    chargesText: details.get('charges'),
    feesText: details.get('honoraires de location'),
    depositText: details.get('depot de garantie'),
    areaText: details.get('surface habitable'),
    ...(galerie.length > 0 ? { imageUrls: galerie } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}
