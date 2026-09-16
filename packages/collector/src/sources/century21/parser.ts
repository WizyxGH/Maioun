/**
 * Parser des pages « ville » de century21.fr.
 *
 * CONFORMITÉ (revérifiée le 2026-08-15) : le `robots.txt` interdit les
 * recherches par code postal (motifs « location…/cp-… ») et par agence
 * (« /a/…/annonces/ »), mais PAS le format par ville
 * `/annonces/location-appartement/v-nice/` — qui est indexable
 * (`meta robots: index, follow`) et servi en SSR. Le verdict initial du
 * projet (« écartée ») était trop sévère et a été corrigé après relecture.
 *
 * ANCRAGE : classes composant du site (`js-the-list-of-properties-list-property`,
 * `c-the-property-thumbnail-with-content`), attribut `data-uid`, texte du
 * `h3` (« NICE 06 / 78,27 m² / 3 pièces / Ref : 16862 / … / 3 000 € par mois
 * charges comprises »).
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import { htmlToText } from '../shared/html-text.js';

/** Forme d'une URL de fiche : `/trouver_logement/detail/{uid}/`. */
const LISTING_URL_PATTERN =
  /^https?:\/\/(?:www\.)?century21\.fr\/trouver_logement\/detail\/(\d{6,})\/?(?:[?#].*)?$/i;

export interface ParsedListingUrl {
  readonly reference: string;
  readonly canonicalUrl: string;
}

/** Analyse une URL de fiche. `null` si ce n'en est pas une. */
export function parseListingUrl(href: string): ParsedListingUrl | null {
  const match = LISTING_URL_PATTERN.exec(href.trim());
  if (match?.[1] === undefined) return null;
  return {
    reference: match[1],
    canonicalUrl: `https://www.century21.fr/trouver_logement/detail/${match[1]}/`,
  };
}

/** Résultat du parsing d'une page de résultats. */
export interface ParsedPage {
  readonly listings: readonly RawListing[];
  readonly hasNextPage: boolean;
  readonly warnings: readonly string[];
}

/**
 * Analyse une page `/annonces/location-appartement/v-{ville}/`.
 *
 * @param html contenu HTML brut de la page
 * @param pageUrl URL de la page, pour résoudre les liens relatifs
 */
export function parseSearchPage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const warnings: string[] = [];
  const byReference = new Map<string, RawListing>();

  $('.c-the-property-thumbnail-with-content[data-uid]').each((_index, element) => {
    const card = $(element);

    let parsedUrl: ParsedListingUrl | null = null;
    card.find('a[href*="/trouver_logement/detail/"]').each((_i, anchor) => {
      if (parsedUrl !== null) return;
      const href = $(anchor).attr('href');
      if (href === undefined) return;
      const absolute = href.startsWith('http') ? href : new URL(href, pageUrl).toString();
      parsedUrl = parseListingUrl(absolute);
    });
    if (parsedUrl === null) return;
    const url: ParsedListingUrl = parsedUrl;
    if (byReference.has(url.reference)) return;

    // Le h3 concentre tout : ville, surface, pièces, référence agence, type,
    // prix. Aplati en texte, les unités françaises servent d'ancres.
    const headText = cleanText(card.find('h3').first().text().replace(/\s+/g, ' '));
    const description = htmlToText($, card.find('.tw-truncate-safe') as cheerio.Cheerio<never>);
    const ariaTitle = cleanText(card.find('a[aria-label]').first().attr('aria-label') ?? '');

    const priceText = headText.match(/[\d][\d\s.,]*\s*€\s*par\s*mois[^,.]*/i)?.[0];
    // Sans espaces internes : le « 06 » du département précède la surface
    // dans le texte aplati (« NICE 06 78,27 m² ») et serait sinon capturé.
    const areaText = headText.match(/\d+(?:[.,]\d+)?\s*m\s*(?:²|2)(?!\d)/i)?.[0];
    const roomsText = headText.match(/\d+\s*pièces?/i)?.[0];
    const agencyRef = headText.match(/Ref\s*:\s*([\w-]+)/i)?.[1];
    // « NICE 06 » en tête de bloc : ville en capitales suivie du département.
    const cityMatch = headText.match(/^([A-ZÀ-Ý][A-ZÀ-Ý\s'-]+?)\s+\d{2}\b/u);

    /**
     * LES PHOTOS SONT EN CHEMIN RELATIF, et c'est ce qui les faisait perdre.
     *
     * On n'acceptait que les adresses commençant par `http`, comme sur les
     * autres sources : ici elles s'écrivent « /imagesBien/s3/202/… ». Toutes les
     * fiches Century 21 arrivaient donc sans la moindre photo.
     *
     * `/theme/` est écarté : c'est l'habillage du site — logos, encarts
     * publicitaires — et non le logement.
     *
     * ET SEULE LA PREMIÈRE CARTE A UN `src`. Les suivantes sont chargées à la
     * demande : leur adresse est en `data-src`, que le navigateur recopie au
     * défilement. Ne lire que `src` rendait une photo sur dix-sept, relevé le
     * 2026-09-10 — le correctif du chemin relatif ne pouvait pas le voir, la
     * page de test n'ayant qu'une carte.
     */
    const imageUrls = card
      .find('img[src], img[data-src]')
      .map((_i, img) => $(img).attr('data-src') ?? $(img).attr('src'))
      .get()
      .filter((src): src is string => typeof src === 'string' && src !== '')
      .filter((src) => !src.includes('/theme/'))
      .map((src) => {
        try {
          return new URL(src, pageUrl).toString();
        } catch {
          return null;
        }
      })
      // Un chargement différé pose souvent une image de remplacement en
      // `data:` : ce n'est pas une photo du logement.
      .filter((src): src is string => src !== null && /^https?:/i.test(src));

    // « Ref : … » est ce que l'agence affiche ; il partait en `agencyRef`, que
    // personne ne lisait, pendant que `reference` — la ligne « Réf. agence » de
    // la fiche — recevait l'identifiant d'URL, inconnu de l'agence.
    const extra: Record<string, string> = {};
    if (agencyRef !== undefined) extra['reference'] = agencyRef;

    const listing: RawListing = {
      sourceRef: url.reference,
      sourceUrl: url.canonicalUrl,
      ...(ariaTitle !== '' ? { title: ariaTitle } : { title: headText }),
      ...(description !== '' ? { description } : {}),
      ...(priceText !== undefined ? { priceText } : {}),
      ...(areaText !== undefined ? { areaText } : {}),
      ...(roomsText !== undefined ? { roomsText } : {}),
      propertyTypeText: ariaTitle !== '' ? ariaTitle : headText,
      furnishedText: cleanText(`${headText} ${description}`),
      ...(cityMatch?.[1] !== undefined ? { cityText: cleanText(cityMatch[1]) } : {}),
      agencyName: 'Century 21',
      // §21 : pas de coordonnées directes en liste ; la fiche est le canal.
      contactFormUrl: url.canonicalUrl,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      extra,
    };

    byReference.set(url.reference, listing);
  });

  const listings = [...byReference.values()];

  // §61 : détection d'anomalie structurelle.
  if (listings.length > 0) {
    const withPrice = listings.filter((listing) => listing.priceText !== undefined).length;
    if (withPrice === 0) {
      warnings.push('Aucune annonce ne contient de prix — structure probablement modifiée');
    } else if (withPrice / listings.length < 0.5) {
      warnings.push(
        `Seules ${withPrice}/${listings.length} annonces contiennent un prix — parsing dégradé`,
      );
    }
  }

  // La page ville liste tout le stock d'un coup (19 annonces observées) :
  // pas de pagination à suivre.
  return { listings, hasNextPage: false, warnings };
}

/**
 * La description ENTIÈRE, lue sur la fiche de l'annonce.
 *
 * LA CARTE TRONQUE, et le site le dit lui-même : le fragment qu'elle affiche
 * porte la classe `tw-truncate-safe`. Relevé du 2026-09-08 sur les
 * trente-quatre annonces en base — 238 caractères de moyenne, coupés en plein
 * mot (« disponible en location longue dur »). La fiche en porte 577 pour
 * l'annonce mesurée — plus du double — et commence souvent par SON ADRESSE DE
 * RUE (« Nice EST - 23 boulevard saint Roch ») : de quoi géocoder le bien
 * (§20) et le rapprocher de ses jumelles (§14), là où la carte ne laissait
 * qu'une demi-phrase.
 *
 * DEUX LANGUES DANS LE MÊME BLOC, et c'est le piège. Century 21 y range la
 * version française ET sa traduction anglaise, dans deux `span` qu'un script
 * montre à tour de rôle. Prendre le texte du bloc entier rendait une
 * description bilingue de 985 caractères là où le français seul en fait 577 —
 * la moitié inutile, et deux fois le même bien décrit. On ne garde que celle
 * qui s'affiche au chargement (`x-show="!show"`).
 *
 * @returns le complément à fusionner, ou `null` si la fiche n'apprend rien —
 *          auquel cas on garde ce que la carte avait donné (§17).
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const dpe = highlightedDpe($);
  const draft: RawDraft = compactListing({
    description: frenchDescription($),
    ...toKnowFields($),
    phoneText: agencyPhone($),
    extra: dpe !== undefined ? { dpe } : undefined,
  });
  return Object.keys(draft).length > 0 ? draft : null;
}

function frenchDescription($: cheerio.CheerioAPI): string | undefined {
  const block = $('.c-the-property-detail-description').first();
  if (block.length === 0) return undefined;

  // La version française d'abord ; à défaut, le bloc sans son titre — une
  // fiche monolingue reste lisible, et mieux vaut ce texte que rien.
  const french = block.find('[x-show="!show"]').first();
  let target: cheerio.Cheerio<never>;
  if (french.length > 0) {
    target = french as cheerio.Cheerio<never>;
  } else {
    const whole = block.clone();
    whole.find('h2').remove();
    target = whole as cheerio.Cheerio<never>;
  }

  const description = cleanMultiline(htmlToText($, target));
  return description.length > 0 ? description : undefined;
}

/**
 * Bloc « À savoir » : une ligne par montant, libellé puis valeur.
 * « Honoraires charge locataire : 528,72 € TTC dont : … » — seul le premier
 * montant compte, le détail qui suit en est la ventilation.
 */
function toKnowFields($: cheerio.CheerioAPI): RawDraft {
  const fields: Record<string, string | undefined> = {};
  $('.c-the-property-detail-to-know > ul > li').each((_i, li) => {
    const line = cleanText($(li).text().replace(/\s+/g, ' '));
    const value = /:\s*(.+)$/.exec(line)?.[1];
    if (value === undefined) return;
    const amount = /^[\d\s.,]+€/.exec(value)?.[0];
    if (/^provision pour charges/i.test(line)) fields['chargesText'] = amount;
    else if (/^d[ée]p[ôo]t de garantie/i.test(line)) fields['depositText'] = amount;
    else if (/^honoraires charge locataire/i.test(line)) fields['feesText'] = amount;
    else if (/^libre le/i.test(line)) fields['availableAtText'] = value;
  });
  return fields;
}

/**
 * Le numéro du bouton « Téléphoner à l'agence » : il est dans la page, en
 * attribut, et s'affiche au clic. Celui du bandeau d'actions vise l'annonce ;
 * le bloc agence en bas de fiche sert de repli.
 */
function agencyPhone($: cheerio.CheerioAPI): string | undefined {
  const label =
    $('.c-the-property-detail-actions [data-click-label]').first().attr('data-click-label') ??
    $('.c-the-property-detail-agency [data-click-label]').first().attr('data-click-label');
  const phone = cleanText(label ?? '');
  return phone !== '' ? phone : undefined;
}

/** Couleurs officielles de l'étiquette énergie, de A à G. */
const DPE_COLORS: Readonly<Record<string, string>> = {
  '#00a06d': 'A',
  '#52b153': 'B',
  '#a5cc74': 'C',
  '#f4e70f': 'D',
  '#f0b40f': 'E',
  '#eb8235': 'F',
  '#d7221f': 'G',
};

/**
 * La classe DPE, dessinée et jamais écrite : l'étiquette est un SVG dont les
 * lettres sont des tracés. La barre de la classe du bien est la seule suivie
 * de son contour noir. On ne la recalcule pas depuis les kWh et le CO₂ : le
 * relevé du 2026-09-15 montrait « D » affiché pour 80 kWh et 30 kg, que le
 * barème général classe « C ».
 */
function highlightedDpe($: cheerio.CheerioAPI): string | undefined {
  let letter: string | undefined;
  $('.c-the-dpe-ges-new-dpe-svg svg path').each((_i, path) => {
    if (letter !== undefined) return;
    const fill = fillOf($(path).attr('style'));
    const next = $(path).next('path');
    if (fill !== undefined && fillOf(next.attr('style')) === '#1d1d1b') {
      letter = DPE_COLORS[fill];
    }
  });
  return letter;
}

function fillOf(style: string | undefined): string | undefined {
  return /fill:\s*(#[0-9a-f]{6})/i.exec(style ?? '')?.[1]?.toLowerCase();
}
