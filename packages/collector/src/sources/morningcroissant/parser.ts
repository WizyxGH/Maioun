/**
 * Source : MorningCroissant (morningcroissant.fr) — place de marché de la
 * location meublée et non meublée en MOYENNE et LONGUE durée.
 *
 * POURQUOI ELLE ENTRE — l'étude complète est dans `docs/sources.md`.
 *
 *   - Ce ne sont PAS des meublés touristiques. La page tarifaire énumère les
 *     baux pratiqués : bail civil de date à date, bail mobilité de 1 à 10 mois,
 *     bail étudiant de 9 mois, bail tacitement renouvelable (1 an en meublé,
 *     3 ans en non meublé). Chaque fiche publie son DPE et son GES, que la
 *     location saisonnière n'a pas à fournir.
 *   - LA SOURCE DIT QUI LOUE. La fiche porte « Particulier » ou
 *     « Professionnel », et la carte d'un professionnel porte un `pro-tag`.
 *     C'est écrit, jamais déduit d'une prose. Au relevé du 2026-09-16,
 *     quarante-huit annonces niçoises sur quatre-vingt-douze sont publiées par
 *     un particulier.
 *   - LA SOURCE DIT AUSSI SI L'ON PARTAGE. « Type de location » vaut « Logement
 *     entier », « Chambre privée » ou « Chambre partagée » — les deux dernières
 *     sont des colocations, et ce compte les exclut. On transmet la déclaration
 *     telle quelle (`extra.flatShare`) plutôt que de la faire relire au texte.
 *
 * robots.txt vérifié le 2026-09-16 : `/location/*` et `/appartement/*` sont
 * autorisés. Sont interdits — et jamais appelés ici : `/search/ajax`,
 * `/autocomplete`, `/appartement/reservation`, `/appartement/request`,
 * `/appartement/pre-book`, `/login`, `/reservation`, `/photo-gallery/`. Les
 * conditions d'utilisation (à jour au 5 février 2026) ne mentionnent ni robot,
 * ni aspiration, ni extraction de base de données.
 *
 * LE LOYER AFFICHÉ EST CHARGES COMPRISES. La carte montre « 980€ /mois » et la
 * fiche décompose « hors charges 950 € + charges 30 € = charges comprises
 * 980 € ». On le dit donc explicitement au lieu de laisser la normalisation
 * hésiter, et la fiche fournit ensuite le loyer hors charges et la provision.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { htmlToText } from '../shared/html-text.js';
import { energyLabels, fieldMatching } from '../shared/labels.js';
import { cleanText } from '../../normalization/text.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';

/** Une sélection cheerio, telle que `$(…)` la rend — cheerio n'en exporte pas le type. */
type Selection = ReturnType<cheerio.CheerioAPI>;

/** Identifiant de l'annonce, en queue d'URL : `…-riquier-13989` → `13989`. */
function referenceFrom(href: string): string | null {
  return /\/appartement\/[^/?#]*?-(\d+)(?:[?#]|$)/.exec(href)?.[1] ?? null;
}

/**
 * « Logement entier » / « Chambre privée » / « Chambre partagée » traduit en
 * colocation, ou `undefined` si la source n'a pas classé l'annonce.
 *
 * Une chambre n'est jamais louée seule ailleurs que dans un logement partagé :
 * les deux libellés « Chambre … » sont, dans le vocabulaire du site, la
 * catégorie « logement partagé » qui fait face à « logement entier ».
 */
function flatShareFrom(rentalType: string): string | undefined {
  const lower = rentalType.toLowerCase();
  if (lower.includes('logement entier')) return 'false';
  if (lower.includes('chambre')) return 'true';
  return undefined;
}

/**
 * Le bailleur tel que la source le CLASSE : « Particulier » ou
 * « Professionnel ». Les autres valeurs — il n'en a pas été observé — ne sont
 * pas interprétées, et l'annonce reste alors sans nature déclarée.
 */
function landlordFrom(type: string): string | undefined {
  const lower = type.toLowerCase();
  if (lower.startsWith('particulier')) return 'private';
  if (lower.startsWith('professionnel')) return 'agency';
  return undefined;
}

/** « Nice, 06300 » → commune et code postal, chacun de son côté. */
function splitLocation(text: string): { city?: string; postalCode?: string } {
  const match = /^(.*?),\s*(\d{5})$/.exec(text.trim());
  if (match === null) return text === '' ? {} : { city: text };
  return { city: match[1]?.trim(), postalCode: match[2] };
}

/** Retire les champs `undefined` d'un brouillon : un champ absent reste absent. */
function compactDraft(draft: RawDraft): RawDraft {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined) out[key] = value;
  }
  return out as RawDraft;
}

/** Même règle pour `extra`, dont les clés sont toutes des chaînes. */
function compactExtra(draft: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Une carte de la page de liste.
 *
 * La carte porte déjà tout ce qui décide : loyer, surface, pièces, meublé,
 * commune, code postal, entier ou partagé. La fiche n'ajoute que la
 * description, le décompte des charges, le dépôt, les diagnostics, la
 * référence publiée et les durées de bail — c'est pourquoi une liste suffit à
 * faire entrer une annonce, et pourquoi la fiche n'est visitée qu'une fois.
 */
function parseCard($: cheerio.CheerioAPI, card: Selection, pageUrl: string): RawListing | null {
  const link = card.find('a.flat-link').first();
  const href = link.attr('href') ?? '';
  const reference = referenceFrom(href);
  if (reference === null) return null;

  let sourceUrl: string;
  try {
    sourceUrl = new URL(href, pageUrl).toString();
  } catch {
    return null;
  }

  const amount = cleanText(card.find('.flat-price .amount').first().text());
  const details = card.find('.flat-details');
  const location = card.find('.flat-location span');
  const rentalType = cleanText(location.eq(0).text());
  const place = splitLocation(cleanText(location.eq(1).text()));

  // « 42 m² » est le seul `.hometiptip` sans `data-content` ni classe : les
  // autres portent « Type », « Lit(s) », « Capacité » ou la mention meublé.
  const area = details
    .find('span.hometiptip')
    .filter((_i, span) => {
      const s = $(span);
      return s.attr('data-content') === undefined && (s.attr('class') ?? '') === 'hometiptip';
    })
    .first()
    .text();

  const images = card
    .find('.flat-carousel-list span[data-url]')
    .map((_i, span) => $(span).attr('data-url') ?? '')
    .get()
    .filter((url) => url !== '')
    .map((url) => new URL(url, pageUrl).toString());

  /**
   * LE PROFESSIONNEL A SON PROPRE BALISAGE, et c'est la seule chose que la
   * carte tranche : le loueur professionnel est annoncé par `div.pro-tag`,
   * là où le particulier n'a qu'un `div.owner-name` portant son prénom
   * (« Par Camille D. »). Un prénom ne classe rien — c'est la fiche qui dit
   * « Particulier », et on attend qu'elle le dise.
   */
  const professionnel = card.find('.pro-tag').length > 0;

  return compactListing({
    sourceRef: reference,
    sourceUrl,
    title: cleanText(link.text()) || undefined,
    // Le montant de la carte EST le loyer charges comprises (voir l'en-tête).
    //
    // « CC », PAS « CHARGES COMPRISES » : la normalisation cherche aussi une
    // PROVISION dans le texte du prix, et « 980€ charges comprises » lui donnait
    // 980 € de charges — le loyer entier, recopié dans un champ qui ne le
    // dit pas. Les deux tournures marquent l'inclusion ; seule la seconde
    // fabrique un montant.
    priceText: amount === '' ? undefined : `${amount} CC`,
    areaText: cleanText(area) || undefined,
    roomsText: cleanText(details.find('[data-content="Type"]').first().text()) || undefined,
    // « Chambre privée » doit rester le type du bien ; sans quoi « 1 pièce »
    // classerait en appartement une chambre dans un logement partagé.
    propertyTypeText: rentalType === '' ? undefined : rentalType,
    furnishedText: cleanText(details.find('.furnished-tag').first().text()) || undefined,
    cityText: place.city,
    postalCodeText: place.postalCode,
    ...(professionnel ? { agencyName: 'Loueur professionnel' } : {}),
    contactFormUrl: sourceUrl,
    imageUrls: images.length > 0 ? images : undefined,
    // PAS DE `reference` ICI : la carte n'en publie aucune. Le numéro de l'URL
    // est notre clé de collecte, pas un identifiant que le loueur reconnaîtrait.
    // La fiche, elle, écrit « Référence: 47156 », et c'est celle-là qu'on garde.
    //
    // ET ON NE LA DÉDUIT PAS DE L'URL POUR AUTANT, bien que les deux nombres
    // coïncident sur les soixante-dix annonces vérifiées le 2026-09-17 — sans
    // un écart. Coïncider n'est pas publier : la fiche l'imprime, la carte non,
    // et la recopier depuis l'URL serait le repli qu'on a retiré du projet.
    // C'est la COUVERTURE des fiches qui a été augmentée (voir `index.ts`).
    extra: compactExtra({
      flatShare: flatShareFrom(rentalType),
      ...(professionnel ? { landlord: 'agency' } : {}),
    }),
  });
}

/** Parse une page de résultats et rend une annonce par carte. */
export function parseListPage(html: string, pageUrl: string): ParsedList {
  const $ = cheerio.load(html);
  const bySourceRef = new Map<string, RawListing>();

  $('li.flats-list-item').each((_i, el) => {
    const listing = parseCard($, $(el), pageUrl);
    if (listing === null || bySourceRef.has(listing.sourceRef)) return;
    bySourceRef.set(listing.sourceRef, listing);
  });

  const listings = [...bySourceRef.values()];
  return {
    listings,
    warnings: listings.length === 0 ? [`Aucune annonce sur la liste : ${pageUrl}`] : [],
  };
}

/** `true` quand le site DIT lui-même n'avoir aucun résultat. */
export function isEmptyList(html: string): boolean {
  return /0\s*r[ée]sultats?/i.test(html);
}

/**
 * Les listes de définition des sections `#product_details`, `#product_pricing`
 * et `#product_modalities` : chaque `li` porte un intitulé et sa valeur.
 */
function definitions($: cheerio.CheerioAPI, section: string): Map<string, string> {
  const out = new Map<string, string>();
  $(`${section} li`).each((_i, li) => {
    const item = $(li);
    // L'intitulé porte parfois une bulle d'aide (« ? ») : elle n'en fait pas
    // partie, et la garder empêcherait toute comparaison.
    const label = item.find('.left').clone();
    label.find('.hometiptip').remove();
    const key = cleanText(label.text()).toLowerCase();
    if (key === '') return;
    const value = cleanText(item.find('.right').text().replace(/\s+/g, ' '));
    if (!out.has(key)) out.set(key, value);
  });
  return out;
}

/** La lettre de l'échelle active, `undefined` si la fiche n'en désigne aucune. */
function diagnostic($: cheerio.CheerioAPI, block: '.dpe' | '.ges'): string | undefined {
  const label = $(`${block} li.line.active`).first().attr('data-label');
  return label === undefined || label === '' ? undefined : label;
}

/** `N/A` et le vide ne sont pas des valeurs : la fiche dit qu'elle ne sait pas. */
function published(value: string | undefined): string | undefined {
  return value !== undefined && value !== '' && value !== 'N/A' && /\d/.test(value)
    ? value
    : undefined;
}

/**
 * Ce que la FICHE ajoute à la carte.
 *
 * LE LOYER Y EST DÉCOMPOSÉ, et la fiche en imprime les TROIS lignes : « hors
 * charges 566 € », « charges mensuelles 158 € », « charges comprises 724 € ».
 * On garde la troisième, qui est la base de la carte, et la deuxième, qui est
 * la provision. Prendre la première faisait BAISSER le loyer d'une annonce dès
 * qu'on lisait sa fiche : la même source affichait alors deux bases selon
 * qu'elle avait été visitée ou non, et le logement paraissait moins cher.
 *
 * LES DURÉES SONT RENDUES TELLES QUELLES dans la description : « durée
 * minimum : 3 mois », « durée maximum : 9 mois ». Un bail de neuf mois est un
 * bail étudiant, et la normalisation sait le reconnaître à ces mots — le lui
 * dire autrement reviendrait à trancher à sa place.
 */
export function parseDetail(html: string, listing?: RawListing): RawDraft | null {
  const $ = cheerio.load(html);

  const description = htmlToText($, '#product_description .txt');
  const details = definitions($, '#product_details');
  const pricing = definitions($, '#product_pricing');
  const modalities = definitions($, '#product_modalities');

  const rentalType = fieldMatching(details, /^type de location$/) ?? '';
  const landlord = landlordFrom(cleanText($('#host-contact .type').first().text()));
  const ownerName = cleanText($('#host-contact .contact a.profile').first().text());

  const rentAllIn = published(fieldMatching(pricing, /loyer mensuel charges comprises/));
  // Lu, mais pas retenu comme loyer : il ne sert qu'à reconnaître une fiche.
  const rentExcluding = published(fieldMatching(pricing, /loyer mensuel hors charges/));
  const charges = published(fieldMatching(pricing, /^charges mensuelles$/));
  const deposit = published(fieldMatching(pricing, /^d[ée]p[ôo]t de garantie$/));

  const durations = ['durée minimum', 'durée maximum', 'durée du préavis']
    .map((key) => {
      const value = published(modalities.get(key)) ?? modalities.get(key);
      return value === undefined || value === '' || value === 'N/A' ? null : `${key} : ${value}`;
    })
    .filter((line): line is string => line !== null);

  // Une page qui n'a ni description ni décompte n'est pas une fiche : ne rien
  // rendre vaut mieux qu'écraser ce que la liste avait donné.
  if (description === '' && rentExcluding === undefined && details.size === 0) return null;

  const prose = [description, ...durations].filter((part) => part !== '').join('\n');

  // LA CARTE COMPTE LES PIÈCES, LA FICHE LES CHAMBRES : on garde les deux,
  // comme le font déjà Hektor, Apimo et Oqoro, plutôt que de laisser la
  // seconde effacer la première.
  const bedrooms = published(fieldMatching(details, /^chambres$/));
  const rooms =
    bedrooms === undefined
      ? undefined
      : `${listing?.roomsText ?? ''} ${bedrooms} chambre${Number(bedrooms) > 1 ? 's' : ''}`.trim();

  // La RÉFÉRENCE que le loueur reconnaîtra, telle que la fiche l'imprime.
  const reference = /R[ée]f[ée]rence\s*:?\s*([\w-]+)/.exec(
    cleanText($('.ref').first().text()),
  )?.[1];

  return compactDraft({
    description: prose === '' ? undefined : prose,
    roomsText: rooms,
    // LA MÊME BASE QUE LA CARTE, toujours : la fiche imprime elle-même le total
    // charges comprises, et c'est lui qu'on garde. Absent, la carte fait foi.
    priceText: rentAllIn === undefined ? undefined : `${rentAllIn} CC`,
    chargesText: charges,
    depositText: deposit,
    propertyTypeText: rentalType === '' ? undefined : rentalType,
    contactName: landlord === 'private' && ownerName !== '' ? ownerName : undefined,
    agencyName: landlord === 'agency' ? ownerName || 'Loueur professionnel' : undefined,
    extra: compactExtra({
      reference,
      flatShare: flatShareFrom(rentalType),
      landlord,
      ...energyLabels(diagnostic($, '.dpe'), diagnostic($, '.ges')),
    }),
  });
}
