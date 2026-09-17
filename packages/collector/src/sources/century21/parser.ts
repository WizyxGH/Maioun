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
 *
 * VINGT PAR PAGE, ET LA PAGE DIT COMBIEN IL Y EN A. Le verdict « une page =
 * tout le stock » venait d'un relevé de dix-neuf annonces, à une de la taille
 * de page. Le 2026-09-17, Nice en appartement en annonçait 32 : vingt sur la
 * première page, douze sur la seconde, jamais lue. Le total est écrit en tête
 * de liste (« 32 annonces immobilières ») ; c'est lui qui prouve que
 * l'inventaire a été lu en entier, et non le nombre de cartes.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { compactListing, type RawDraft } from '../shared/raw-listing.js';
import { cleanMultiline, cleanText } from '../../normalization/text.js';
import { isShortPeriodPrice } from '../../normalization/parse-listing-fields.js';
import { htmlToText } from '../shared/html-text.js';

/**
 * LE LOYER AVEC SA PÉRIODE, et c'est ce qui manquait.
 *
 * On n'acceptait que « … € par mois ». Century 21 loue aussi à la SEMAINE — six
 * villas du périmètre, « 6 800 € par semaine », « Prix nous consulter » sur la
 * fiche. Le prix ne correspondant pas au motif, il restait vide : l'annonce
 * entrait sans loyer, et la règle du projet qui écarte les tarifs à la nuit ou
 * à la semaine n'avait rien à lire. La maison du Mont Boron, 243 m² de location
 * saisonnière, se retrouvait ainsi DANS les critères, sa surface faisant seule
 * le score. Lire la période la fait reconnaître pour ce qu'elle est.
 */
const PRICE_WITH_PERIOD = /[\d][\d\s.,]*\s*€\s*par\s*(?:mois|semaine|nuit(?:ée|ee)?|jour)[^,.]*/i;

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

/** Annonce lue, puis écartée par une règle — et le motif, en clair. */
export interface ExcludedListing {
  readonly sourceRef: string;
  readonly reason: string;
}

/** Résultat du parsing d'une page de résultats. */
export interface ParsedPage {
  readonly listings: readonly RawListing[];
  /**
   * Les annonces écartées. Elles COMPTENT dans l'inventaire — sans quoi la
   * recherche se croirait incomplète à chaque passage, puisque le site les
   * annonce dans son total — mais ne sont pas retenues, et `warnings` dit
   * laquelle et pourquoi.
   */
  readonly excluded: readonly ExcludedListing[];
  readonly hasNextPage: boolean;
  /** Adresse de la page suivante, ou `null` : celle-ci est la dernière. */
  readonly nextPageUrl: string | null;
  /**
   * Nombre d'annonces que la page déclare elle-même (« 32 annonces
   * immobilières »), ou `null` si elle ne le dit pas. C'est ce chiffre qui
   * permet de savoir si l'inventaire a été lu en entier.
   */
  readonly announcedTotal: number | null;
  /** La page dit n'avoir aucun bien pour cette recherche : rien de cassé. */
  readonly empty: boolean;
  /** Commune annoncée par le titre de la page (« Appartement à louer Nice »). */
  readonly headingCity: string | null;
  readonly warnings: readonly string[];
}

/**
 * La page suivante, telle que le site la désigne.
 *
 * ON NE COMPTE PAS LES LIENS `page-N`, et c'est une correction : au-delà de sa
 * dernière page, century21.fr répond 200 en SERVANT À NOUVEAU LA PAGE 1 (relevé
 * du 2026-09-17 : `/v-nice/page-3/` rend les vingt annonces de la page 1 et
 * repropose un lien vers la page 2). Compter les numéros affichés ferait donc
 * relire la première page indéfiniment. Seule la flèche « suivant » de la barre
 * de pagination dit qu'il reste quelque chose : la dernière page n'en a pas.
 */
function nextPageUrl($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const href = $('.c-the-pagination-bar a[aria-label="next"]').first().attr('href');
  if (href === undefined || href.trim() === '') return null;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

/** « 32 annonces immobilières : », en tête de la liste. */
function announcedTotal($: cheerio.CheerioAPI): number | null {
  const text = cleanText(
    $('.js-the-list-of-properties-number-of-results h2').first().text().replace(/\s+/g, ' '),
  );
  const count = /^([\d\s]+)\s*annonces?\s+immobili[èe]re/i.exec(text)?.[1];
  if (count === undefined) return null;
  const total = Number(count.replace(/\s/g, ''));
  return Number.isFinite(total) ? total : null;
}

/**
 * La commune que la page dit servir : « Appartement à louer Nice », « Maison à
 * louer St Laurent Du Var ». Le scraper s'en sert pour refuser une page qui
 * répondrait 200 en montrant une autre ville.
 */
function headingCity($: cheerio.CheerioAPI): string | null {
  const heading = cleanText($('h1').first().text().replace(/\s+/g, ' '));
  return /\s[àa]\s+louer\s+(.+)$/i.exec(heading)?.[1]?.trim() ?? null;
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
  const excluded: ExcludedListing[] = [];

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

    const priceText = headText.match(PRICE_WITH_PERIOD)?.[0];

    // UN LOYER À LA SEMAINE N'EST PAS UN LOYER : c'est une location de
    // vacances, que le projet écarte pour toutes ses sources. La carte le dit,
    // donc on s'arrête ici plutôt que d'aller lire la fiche.
    if (isShortPeriodPrice(priceText)) {
      excluded.push({ sourceRef: url.reference, reason: `loyer « ${priceText ?? ''} »` });
      warnings.push(
        `Location saisonnière (écartée, loyer « ${priceText ?? ''} ») : ${url.canonicalUrl}`,
      );
      return;
    }

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
      // La carte ne porte ni téléphone ni courriel : la fiche est le seul canal.
      contactFormUrl: url.canonicalUrl,
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
      extra,
    };

    byReference.set(url.reference, listing);
  });

  const listings = [...byReference.values()];

  // Un gabarit changé se voit à ce que les cartes cessent de porter un prix.
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

  const next = nextPageUrl($, pageUrl);
  return {
    listings,
    excluded,
    hasNextPage: next !== null,
    nextPageUrl: next,
    announcedTotal: announcedTotal($),
    // Bandeau « Nos biens actuels ne correspondent pas à votre recherche » :
    // la commune existe chez Century 21, elle n'a simplement rien à louer.
    empty: $('.js-the-list-of-properties-no-results').length > 0,
    headingCity: headingCity($),
    warnings,
  };
}

/**
 * TOUT CE QUE LA FICHE PUBLIE, et que la carte de la liste ne dit pas :
 * description entière, prix avec sa période, montants, disponibilité, DPE et
 * GES, étage, équipements, chambres, nom réel de l'agence, téléphone et la
 * vingtaine de photos du carrousel.
 *
 * Ce que la fiche ne publie PAS reste absent. Century 21 ne donne ni le code
 * postal du bien — le « 06300 » du fil d'Ariane vaut pour Nice entière —, ni
 * son adresse de rue autrement que dans la prose, ni l'état des lieux en dehors
 * de la ventilation des honoraires, ni la taxe d'ordures ménagères.
 *
 * LA CARTE TRONQUE, et le site le dit lui-même : le fragment qu'elle affiche
 * porte la classe `tw-truncate-safe`. Relevé du 2026-09-08 sur les
 * trente-quatre annonces en base — 238 caractères de moyenne, coupés en plein
 * mot (« disponible en location longue dur »). La fiche en porte 577 pour
 * l'annonce mesurée — plus du double — et commence souvent par SON ADRESSE DE
 * RUE (« Nice EST - 23 boulevard saint Roch ») : de quoi géocoder le bien et le
 * rapprocher de ses jumelles, là où la carte ne laissait qu'une demi-phrase.
 *
 * DEUX LANGUES DANS LE MÊME BLOC, et c'est le piège. Century 21 y range la
 * version française ET sa traduction anglaise, dans deux `span` qu'un script
 * montre à tour de rôle. Prendre le texte du bloc entier rendait une
 * description bilingue de 985 caractères là où le français seul en fait 577 —
 * la moitié inutile, et deux fois le même bien décrit. On ne garde que celle
 * qui s'affiche au chargement (`x-show="!show"`).
 *
 * @returns le complément à fusionner, ou `null` si la fiche n'apprend rien —
 *          auquel cas on garde ce que la carte avait donné.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);
  const view = globalView($);
  const extra: Record<string, string> = {};
  const dpe = energyClass($, '.c-the-dpe-ges-new-dpe-svg', DPE_COLORS);
  const ges = energyClass($, '.c-the-dpe-ges-new-ges-svg', GES_COLORS);
  const features = declaredFeatures($, view.bedrooms);
  if (dpe !== undefined) extra['dpe'] = dpe;
  if (ges !== undefined) extra['ges'] = ges;
  if (view.floor !== undefined) extra['etage'] = view.floor;
  if (features !== undefined) extra['features'] = features;

  const draft: RawDraft = compactListing({
    description: frenchDescription($),
    priceText: abstractPrice($),
    ...toKnowFields($),
    phoneText: agencyPhone($),
    agencyName: agencyName($),
    imageUrls: galleryImages($),
    furnishedText: view.lease,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  });
  return Object.keys(draft).length > 0 ? draft : null;
}

/** Toutes les adresses de century21.fr sont relatives à ce domaine. */
const SITE = 'https://www.century21.fr';

/**
 * Le prix TEL QUE LA FICHE L'AFFICHE, montant et période séparés par le gabarit
 * (« 6 800 € » / « par semaine », « 4 350 € » / « par mois charges comprises »).
 * Recoller les deux est ce qui permet de reconnaître un tarif de vacances,
 * quand bien même la carte de la liste n'aurait rien donné.
 */
function abstractPrice($: cheerio.CheerioAPI): string | undefined {
  const amount = cleanText($('.c-the-property-abstract__price').first().text());
  if (amount === '') return undefined;
  const period = cleanText($('.c-the-property-abstract__price-conditions').first().text());
  return period === '' ? amount : `${amount} ${period}`;
}

/** `true` si ce texte de prix est un tarif de vacances, et non un loyer. */
export function isSeasonalPrice(priceText: string | null | undefined): boolean {
  return isShortPeriodPrice(priceText);
}

/**
 * L'AGENCE QUI TIENT LE BIEN, et non le réseau.
 *
 * Toutes les annonces portaient « Century 21 » : le nom du réseau, que ses
 * trois cents agences se partagent. La fiche nomme la vraie — « CENTURY 21
 * Lafage Transactions » — et c'est elle qu'on appelle, elle qui rapproche deux
 * annonces du même bien, elle que le suivi d'agence compte.
 */
function agencyName($: cheerio.CheerioAPI): string | undefined {
  const name = cleanText($('.c-the-property-detail-agency h3.is-agency-name').first().text());
  return name !== '' ? name : undefined;
}

/**
 * LES PHOTOS DU BIEN, toutes, et seulement elles.
 *
 * La carte de la liste n'en porte qu'UNE ; la fiche en publie vingt à trente.
 * Relevé du 2026-09-17 sur les quarante-six annonces actives : une photo par
 * annonce en base, contre huit en moyenne sur les autres sources.
 *
 * Le carrousel du bien est le seul lu. Ailleurs dans la page se trouvent la
 * vitrine de l'agence (`webmaster_…`) et les vignettes de « Nos offres » —
 * d'autres biens, qui n'ont rien à faire sur cette fiche.
 *
 * Les vues sont chargées à la demande (`data-src`), et les premières plaques du
 * diaporama n'ont pas d'adresse du tout : elles se retirent d'elles-mêmes.
 */
function galleryImages($: cheerio.CheerioAPI): readonly string[] | undefined {
  const urls: string[] = [];
  $('.c-the-detail-images__item img').each((_i, img) => {
    const src = $(img).attr('data-src') ?? $(img).attr('src') ?? '';
    if (src === '' || src.includes('/theme/')) return;
    try {
      const absolute = new URL(src, SITE).toString();
      if (/^https?:/i.test(absolute) && !urls.includes(absolute)) urls.push(absolute);
    } catch {
      /* adresse illisible : une photo de moins, jamais une erreur */
    }
  });
  return urls.length > 0 ? urls : undefined;
}

/** Ce que le bloc « Vue globale » déclare, quand il le déclare. */
interface GlobalView {
  /** « Location meublée », « Location vide » — la déclaration, pas une tournure. */
  readonly lease: string | undefined;
  /** Étage, en chiffres ; `'0'` pour un rez-de-chaussée. */
  readonly floor: string | undefined;
  /** Chambres comptées dans le détail des pièces. */
  readonly bedrooms: number;
}

/**
 * Bloc « Vue globale » : la nature du bail, l'étage, et LE DÉTAIL DES PIÈCES.
 *
 * Ce détail est replié derrière « [Voir le détail] » mais présent dans la page,
 * une pièce par ligne — « Entrée, Séjour, Chambre, Chambre, Chambre, Cuisine ».
 * Century 21 ne publie nulle part un nombre de chambres ; il publie la liste,
 * et compter ses chambres n'est pas la deviner. Sans elle, aucune annonce de la
 * source n'en avait, les descriptions écrivant « une chambre … une 2eme
 * chambre » plutôt qu'un total.
 */
function globalView($: cheerio.CheerioAPI): GlobalView {
  const block = $('.c-the-property-detail-global-view').first();
  let lease: string | undefined;
  let floor: string | undefined;
  block.find('> ul > li').each((_i, li) => {
    const line = cleanText($(li).clone().children('span, ul').remove().end().text());
    if (/^location\s/i.test(line)) lease = line;
    const stage = /^[ÉE]tage\s*:\s*(.+)$/i.exec(line)?.[1];
    if (stage === undefined) return;
    if (/rez.de.chauss/i.test(stage)) floor = '0';
    else floor = /(\d{1,2})/.exec(stage)?.[1] ?? floor;
  });
  const bedrooms = block.find('ul ul > li').filter((_i, li) => {
    return /^chambre/i.test(cleanText($(li).text()));
  }).length;
  return { lease, floor, bedrooms };
}

/**
 * Bloc « Équipements » : ascenseur, balcon, climatisation, terrasse, garage…
 *
 * Il était ignoré, et rien d'autre ne le remplace : l'appartement 155 m² du
 * Mont Boron déclare ici un ascenseur et un balcon que sa description ne
 * mentionne pas. Le nombre de chambres rejoint la liste parce que c'est là que
 * la normalisation lit ce que la source déclare.
 */
function declaredFeatures($: cheerio.CheerioAPI, bedrooms: number): string | undefined {
  const parts: string[] = [];
  if (bedrooms > 0) parts.push(`${String(bedrooms)} chambres`);
  $('.c-the-property-detail-equipment p, .c-the-property-detail-equipment li').each((_i, node) => {
    const line = cleanText($(node).text());
    if (line !== '' && !parts.includes(line)) parts.push(line);
  });
  return parts.length > 0 ? parts.join(' · ') : undefined;
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
 * Couleurs de l'étiquette CLIMAT, dessinée à côté du DPE.
 *
 * Elle a sa propre gamme — un dégradé de bleu vers le violet — et son propre
 * SVG. Faute de la lire, les quarante-six annonces de la source arrivaient sans
 * GES, contre quatre sur cinq ailleurs : c'était le seul champ où Century 21
 * était vide à cent pour cent.
 */
const GES_COLORS: Readonly<Record<string, string>> = {
  '#a4dbf8': 'A',
  '#8cb4d3': 'B',
  '#7792b1': 'C',
  '#606f8f': 'D',
  '#4d5271': 'E',
  '#393551': 'F',
  '#281b35': 'G',
};

/**
 * La classe, dessinée et jamais écrite : l'étiquette est un SVG dont les
 * lettres sont des tracés. La barre de la classe du bien est la seule suivie
 * de son contour noir. On ne la recalcule pas depuis les kWh et le CO₂ : le
 * relevé du 2026-09-15 montrait « D » affiché pour 80 kWh et 30 kg, que le
 * barème général classe « C ».
 */
function energyClass(
  $: cheerio.CheerioAPI,
  selector: string,
  colors: Readonly<Record<string, string>>,
): string | undefined {
  let letter: string | undefined;
  $(`${selector} svg path`).each((_i, path) => {
    if (letter !== undefined) return;
    const fill = fillOf($(path).attr('style'));
    const next = $(path).next('path');
    if (fill !== undefined && fillOf(next.attr('style')) === '#1d1d1b') {
      letter = colors[fill];
    }
  });
  return letter;
}

function fillOf(style: string | undefined): string | undefined {
  return /fill:\s*(#[0-9a-f]{6})/i.exec(style ?? '')?.[1]?.toLowerCase();
}
