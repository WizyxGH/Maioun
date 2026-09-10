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
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';
import { htmlToText } from '../shared/html-text.js';

/** « Nice (06000) » — la commune et son code postal, d'un seul tenant. */
const CITY_AND_CODE = /^(.+?)\s*\((\d{5})\)$/;

/**
 * La photo d'une carte, prise dans son `<picture>`.
 *
 * AUCUNE PHOTO N'ÉTAIT RÉCUPÉRÉE, et ce n'était pas un oubli anodin : le
 * parser ne regardait tout simplement pas les images. LocService les sert en
 * `<picture>` — un `<source>` par format (AVIF, WebP) et par largeur, puis un
 * `<img>` de repli. Chaque `srcset` est une liste « adresse largeur ».
 *
 * ON PREND LE JPEG DE REPLI, pas le premier `<source>` : l'AVIF est plus léger,
 * mais toutes les visionneuses ne l'affichent pas, et les photos sont POINTÉES
 * chez la source, jamais recopiées — c'est donc le navigateur du visiteur qui
 * doit savoir la lire, pas le collecteur.
 *
 * LA PLUS GRANDE LARGEUR, tant qu'à faire : la carte affiche une vignette de
 * 167 px, la fiche ouverte mérite mieux, et c'est la même requête.
 */
function largestFromSrcset(srcset: string): string | null {
  let best: { url: string; width: number } | null = null;
  for (const candidate of srcset.split(',')) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    if (url === undefined || url === '') continue;
    const width = Number.parseInt(descriptor ?? '', 10);
    const measured = Number.isFinite(width) ? width : 0;
    if (best === null || measured > best.width) best = { url, width: measured };
  }
  return best?.url ?? null;
}

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

    // L'`<img>` de repli d'abord — c'est le JPEG, lisible partout. Son `srcset`
    // offre plusieurs largeurs ; à défaut, son `src` fait l'affaire.
    const photo = card.find('.accommodation-ad-photo img').first();
    const imageUrl =
      largestFromSrcset(photo.attr('srcset') ?? '') ?? photo.attr('src')?.trim() ?? null;

    listings.push(
      compactListing({
        sourceRef: reference,
        sourceUrl,
        ...(imageUrl !== null && imageUrl !== '' ? { imageUrls: [imageUrl] } : {}),
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

/**
 * Ce que la FICHE apprend, que la liste ne dit pas.
 *
 * LA LISTE N'EN DONNE QU'UN AVANT-GOÛT. Relevé du 2026-09-10 sur les 1 045
 * annonces actives : description de 60 à 110 caractères, aucun DPE, aucune
 * disponibilité, une seule photo — pour 38 % du volume du projet. La fiche
 * porte tout cela, dans un balisage stable :
 *
 *   - `#accommodation-ad-description` : le texte entier ;
 *   - `li.accommodation-ad-characteristic` : meublé, disponibilité, et surtout
 *     « Particulier » ou « Professionnel » — la source est rangée « portail de
 *     particuliers », mais une part de ses annonces sont d'agences ;
 *   - la barre énergie : la lettre du DPE, dans l'élément marqué actif ;
 *   - le JSON-LD : TOUTES les photos, là où la liste n'en montre qu'une.
 *
 * @returns le complément à fusionner, ou `null` si la page ne ressemble pas à
 *          une fiche — on garde alors ce que la liste avait donné (§17).
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  if ($('#accommodation-ad-description').length === 0) return null;

  const description = htmlToText($, '#accommodation-ad-description');
  const traits = $('li.accommodation-ad-characteristic')
    .map((_i, li) => $(li).text().replace(/\s+/g, ' ').trim())
    .get();

  // La PREMIÈRE barre est le DPE, la seconde le GES : on ne lit que la
  // première, et seulement la lettre de l'élément marqué actif.
  const dpe = $('.energy-bar')
    .first()
    .find('.energy-bar-item--active .energy-bar-letter')
    .first()
    .text()
    .trim();

  const disponibilite = traits.find((trait) => /^disponible\b/i.test(trait));
  const meuble = traits.find((trait) => /^(non[ -])?meubl[ée]e?$|^vide$/i.test(trait));
  const bailleur = traits.find((trait) => /^(particulier|professionnel)$/i.test(trait));

  const extra: Record<string, string> = {};
  if (/^[A-G]$/.test(dpe)) extra['dpe'] = dpe;
  if (bailleur !== undefined) {
    extra['landlord'] = /^particulier$/i.test(bailleur) ? 'private' : 'agency';
  }

  const photos = detailPhotos($);
  return {
    ...(description !== '' ? { description } : {}),
    ...(disponibilite !== undefined ? { availableAtText: disponibilite } : {}),
    ...(meuble !== undefined ? { furnishedText: meuble } : {}),
    ...(photos.length > 0 ? { imageUrls: photos } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

/** Les photos du JSON-LD de la fiche, en https, sans doublon. */
function detailPhotos($: cheerio.CheerioAPI): string[] {
  const photos = new Set<string>();
  $('script[type="application/ld+json"]').each((_i, script) => {
    try {
      const data = JSON.parse($(script).text()) as { photos?: unknown };
      if (!Array.isArray(data.photos)) return;
      for (const photo of data.photos) {
        if (typeof photo === 'string' && /^https:\/\//.test(photo)) photos.add(photo);
      }
    } catch {
      // Un bloc illisible ne dit rien ; les autres peuvent encore parler.
    }
  });
  return [...photos];
}
