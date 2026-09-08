/**
 * LocService (locservice.fr) — pages de recherche par commune.
 *
 * UN PORTAIL, PAS UNE AGENCE : les annonces viennent de propriétaires
 * particuliers qui déposent chez eux. C'est précisément ce qui manque au
 * projet, dont l'essentiel du stock est agence — et neuf cent cinquante
 * logements y sont référencés pour Nice seule.
 *
 * SON `robots.txt` NOUS AUTORISE ICI, et l'interdit ailleurs : il ferme
 * `/locataires/consulter/`, `/locataires/match-*`, `/proprietaires/locations/`
 * et les sélections, mais laisse les pages de commune ouvertes. On ne lit donc
 * QUE celles-là (§10) — jamais l'espace locataire, qui est leur service payant.
 *
 * LE CONTACT RESTE CHEZ EUX. Leur modèle est de mettre en relation contre
 * paiement : on ne cherche pas à en extraire une adresse ni un téléphone, et la
 * source est `manualOnly`. Le lien mène à leur fiche, où l'utilisateur fait ce
 * qu'il veut.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { compactListing, type ParsedList } from '../shared/raw-listing.js';

/** « Nice (06000) » — la commune et son code postal, d'un seul tenant. */
const CITY_AND_CODE = /^(.+?)\s*\((\d{5})\)$/;

export function parseListPage(html: string, pageUrl: string): ParsedList {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const warnings: string[] = [];

  $('li.accommodation-ad').each((_i, element) => {
    const card = $(element);
    const reference = card.attr('data-accommodation-id');
    const link = card.find('.accommodation-ad-title a').first();
    const href = link.attr('href');
    if (reference === undefined || href === undefined) return;

    // Les caractéristiques sont une liste sans classe distinctive, hormis le
    // prix : on les lit par leur FORME plutôt que par leur position, qui
    // change dès qu'une annonce en omet une.
    let cityText: string | undefined;
    let postalCodeText: string | undefined;
    let areaText: string | undefined;
    card.find('.accommodation-ad-characteristic').each((_j, item) => {
      const text = $(item).text().replace(/\s+/g, ' ').trim();
      const place = CITY_AND_CODE.exec(text);
      if (place?.[1] !== undefined && place[2] !== undefined) {
        cityText = place[1];
        postalCodeText = place[2];
        return;
      }
      if (/^\d+(?:[.,]\d+)?\s*m²$/i.test(text)) areaText = text;
    });

    let sourceUrl: string;
    try {
      sourceUrl = new URL(href, pageUrl).toString();
    } catch {
      return;
    }

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: link.text().trim() || undefined,
        priceText: card.find('.accommodation-ad-characteristic-price').text().trim() || undefined,
        description: card.find('.accommodation-ad-description').text().trim() || undefined,
        areaText,
        cityText,
        postalCodeText,
        // Le titre porte « T2 », « studio », « meublé » : la normalisation y
        // lit les pièces et le meublé, on ne les redit pas ici.
        roomsText: link.text(),
        propertyTypeText: link.text(),
        furnishedText: link.text(),
        contactFormUrl: sourceUrl,
      }),
    );
  });

  // §61 : une page de commune vide signale un gabarit changé, pas un marché
  // désert — il s'y trouve en permanence des centaines de logements.
  if (listings.length === 0) warnings.push('Aucune annonce trouvée : gabarit peut-être changé');
  return { listings, warnings };
}

/** L'adresse de la page `n` d'une commune. La première n'a pas de suffixe. */
export function pageUrlFor(base: string, page: number): string {
  return page <= 1 ? `${base}.html` : `${base}-p${page}.html`;
}
