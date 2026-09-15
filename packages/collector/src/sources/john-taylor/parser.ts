/**
 * Source : John Taylor (john-taylor.fr) — réseau de prestige, gabarit maison
 * rendu serveur.
 *
 * La liste `/france/location/cote-d-azur/` ne porte que des locations à l'année
 * (les saisonnières sont sous `/location-saisonniere/`) : une carte schema.org
 * `Offer` par bien, avec loyer, période (« / Mois »), commune et code postal.
 * La fiche ajoute description, galerie et téléphone du service location ; le
 * dépôt et les honoraires ne sont que dans le texte.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { cleanText } from '../../normalization/text.js';
import { AREA_POSTAL_CODES } from '../imodirect/parser.js';
import { htmlToText } from '../shared/html-text.js';
import { afterLabel } from '../shared/labels.js';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';

export const AGENCY_NAME = 'John Taylor';
export const SITE = 'https://www.john-taylor.fr';
/** Une page tient une soixantaine de cartes ; la Côte d'Azur en compte 14. */
export const LIST_URL = `${SITE}/france/location/cote-d-azur/`;

/** Zone suivie, élargie à Vence, Falicon et Colomars que la liste d'Imodirect n'a pas. */
const ZONE_POSTAL_CODES: ReadonlySet<string> = new Set([
  ...AREA_POSTAL_CODES,
  '06140',
  '06950',
  '06670',
]);

/** `/france/location/{type}/{région}/…/{commune}/L0603LC/` */
const FICHE =
  /^https:\/\/www\.john-taylor\.fr\/france\/location\/(?:[a-z0-9-]+\/)+([A-Z]\d{4}[A-Z]{2})\/$/;

/** « Cagnes-sur-Mer 06800 » */
const PLACE = /^(.+?)\s+(\d{5})$/;

interface Card {
  readonly priceText?: string | undefined;
  readonly cityText?: string | undefined;
  readonly postalCodeText?: string | undefined;
  readonly areaText?: string | undefined;
  readonly roomsText?: string | undefined;
  readonly bedrooms?: string | undefined;
  readonly furnished?: string | undefined;
}

/**
 * Chiffres communs à la carte et à la fiche : loyer au mois seulement (un prix
 * sur demande ou à la semaine n'est pas rendu), commune et pictogrammes.
 */
function readFigures($: cheerio.CheerioAPI, scope: cheerio.Cheerio<never>): Card {
  const amount = scope.find('[itemprop="price"]').first().attr('content') ?? '';
  const monthly = /mois/i.test(scope.find('.price_periode').first().text());
  const place = PLACE.exec(cleanText(scope.find('[itemprop="availableAtOrFrom"]').attr('content')));
  const icon = (name: string): string | undefined => {
    const text = cleanText(
      scope.find(`.list_icons img[src*="/${name}_"]`).first().closest('.list_icons').text(),
    );
    return text === '' ? undefined : text;
  };
  return {
    priceText: /^\d+$/.test(amount) && monthly ? `${amount} € / mois` : undefined,
    cityText: place?.[1],
    postalCodeText: place?.[2],
    areaText: icon('property_size') ?? icon('surface_area'),
    roomsText: icon('rooms'),
    bedrooms: icon('bedroom'),
    furnished: icon('property_furnished'),
  };
}

export function parseList(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const byRef = new Map<string, RawListing>();
  $('.product-holder[itemtype$="/Offer"]').each((_i, el) => {
    const card = $(el) as cheerio.Cheerio<never>;
    const link = card.find('a.link_property_view').first();
    const sourceUrl = link.attr('href') ?? '';
    const reference = FICHE.exec(sourceUrl)?.[1];
    if (reference === undefined || byRef.has(reference)) return;
    const figures = readFigures($, card);
    const type = cleanText(card.find('.prod-bullets1 li').eq(1).text());
    const image = card.find('meta[itemprop="image"]').attr('content');
    byRef.set(
      reference,
      compactListing({
        sourceRef: reference,
        sourceUrl,
        title: cleanText(link.attr('title')) || undefined,
        priceText: figures.priceText,
        areaText: figures.areaText,
        roomsText: figures.roomsText,
        propertyTypeText: type || undefined,
        furnishedText: figures.furnished,
        cityText: figures.cityText,
        postalCodeText: figures.postalCodeText,
        agencyName: AGENCY_NAME,
        contactFormUrl: `${sourceUrl}#contact`,
        imageUrls: image !== undefined ? [image] : undefined,
        extra: { reference },
      }),
    );
  });
  return [...byRef.values()];
}

/** Seules les fiches de la zone sont lues : le reste de la Côte d'Azur est écarté au scoring. */
export function detailUrl(listing: RawListing): string | null {
  return listing.postalCodeText !== undefined && ZONE_POSTAL_CODES.has(listing.postalCodeText)
    ? listing.sourceUrl
    : null;
}

/** Ce que la fiche apprend ; `null` sans loyer mensuel. */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const header = $('.property-product-header').first() as cheerio.Cheerio<never>;
  const panel = $('.property-product-panel').first() as cheerio.Cheerio<never>;
  const figures = readFigures($, header);
  if (figures.priceText === undefined) return null;
  const icons = readFigures($, panel);

  const description = htmlToText(
    $,
    panel.find('.essential-panel .colright > p').first() as cheerio.Cheerio<never>,
  );
  const bullets = panel
    .find('.colright .prod-bullets li')
    .toArray()
    .map((el) => cleanText($(el).text()));
  // Galerie : vignettes `ori100` de la fiche, sans le paramètre d'horodatage.
  const imageUrls = [
    ...new Set(
      $('.slider-panels a.swipebox')
        .toArray()
        .map((el) => ($(el).attr('href') ?? '').replace(/\?.*$/, ''))
        .filter((href) => /\.jpg$/i.test(href))
        .map((href) => new URL(href, SITE).toString()),
    ),
  ];
  const phone = cleanText($('.agency-panel [itemprop="telephone"]').first().text());
  const office = cleanText($('.agency-panel [itemprop="name"]').first().text());
  const title = cleanText(panel.find('h2.comment_title').first().text());

  const extra: Record<string, string> = {};
  if (bullets[0] !== undefined && bullets[0] !== '') extra['reference'] = bullets[0];
  if (icons.bedrooms !== undefined) extra['chambres'] = icons.bedrooms;
  if (office !== '') extra['agence'] = office;

  return {
    title: title || undefined,
    description: description || undefined,
    priceText: figures.priceText,
    depositText: afterLabel(description, 'Dépôt de garantie'),
    feesText: afterLabel(description, 'Honoraires(?: locataires?)?'),
    areaText: icons.areaText,
    roomsText: icons.roomsText,
    propertyTypeText: bullets[2] || undefined,
    furnishedText: [icons.furnished, description].filter(Boolean).join(' ') || undefined,
    cityText: figures.cityText,
    postalCodeText: figures.postalCodeText,
    agencyName: AGENCY_NAME,
    phoneText: phone || undefined,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}
