/**
 * Votre Agence Immo (votre-agence-immo.fr) — page catégorie « location ».
 *
 * WORDPRESS DEVANT APIMO. Les photos sont servies par `media.apimo.pro` : le
 * stock vient bien d'Apimo, mais le site est un WordPress qui le rend à sa
 * façon. Le lecteur Apimo du projet ne s'applique donc pas — ni ses URL, ni son
 * sitemap — d'où ce parseur, court parce que le gabarit est régulier.
 *
 * CE QUI DISTINGUE UNE LOCATION D'UNE VENTE est une classe sur l'article :
 * `type_biens-location`. Le sitemap des biens, lui, mêle les deux sans rien
 * pour les départager — s'y fier aurait fait entrer des ventes dans une base
 * de locations.
 *
 * LE PRIX DE LA LISTE EST CELUI QU'ON RETIENT. La fiche affiche parfois une
 * autre valeur — 940 € dans le titre pour 970 € en liste : l'un est sans doute
 * le loyer, l'autre charges comprises, et rien ne le dit. On prend celui que la
 * source étiquette explicitement « /mois », et on ne tranche pas à sa place.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

/** L'identifiant WordPress de l'article : `post-445540` → `445540`. */
const POST_ID = /(?:^|\s)post-(\d+)(?:\s|$)/;

export function parseListPage(html: string): ParsedList {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];

  $('article.type_biens-location').each((_i, element) => {
    const article = $(element);
    const reference = POST_ID.exec(article.attr('class') ?? '')?.[1];
    const link = article.find('.entry-title a').first();
    const href = link.attr('href');
    if (reference === undefined || href === undefined) return;

    // « Appartement 55.86 m² » puis « 3 pièces dont 2 chambres », séparés par
    // des <br> : on lit le texte entier et l'on y cherche chaque motif.
    const specs = article.find('.superficie-immo').text().replace(/\s+/g, ' ');
    const image = article.find('.ctt-img-bien-immo img').attr('src');

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl: href,
        title: link.text().trim() || undefined,
        priceText: article.find('.prix-immo').first().text().trim() || undefined,
        areaText: /[\d.,]+\s*m²/i.exec(specs)?.[0],
        roomsText: /\d+\s*pi[eè]ces?/i.exec(specs)?.[0],
        propertyTypeText: /^(appartement|maison|studio|villa|loft)/i.exec(specs)?.[0],
        agencyName: 'Votre Agence Immo',
        contactFormUrl: href,
        ...(image !== undefined && /^https?:/i.test(image) ? { imageUrls: [image] } : {}),
      }),
    );
  });

  // §61 : une page qui ne rend plus rien signale un changement de gabarit,
  // pas un catalogue vide — l'agence en publie une poignée en permanence.
  if (listings.length === 0) warnings.push('Aucune location trouvée : gabarit peut-être changé');
  return { listings, warnings };
}

/**
 * Ce que la FICHE ajoute : la description, qui porte l'adresse en clair.
 *
 * « situé au 73 Boulevard Virgile Barel » — de quoi placer une punaise et
 * calculer un trajet (§20), là où la liste ne donne que le quartier dans son
 * titre. Elle vit dans la balise `meta description`, que le greffon SEO
 * remplit avec le début du texte.
 */
export function parseDetail(html: string): { description: string } | null {
  const $ = cheerio.load(html);
  const description = ($('meta[name="description"]').attr('content') ?? '').trim();
  return description === '' ? null : { description };
}
