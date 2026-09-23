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
import { cleanText } from '../../normalization/text.js';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

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
