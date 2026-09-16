/**
 * Source : Appartager (appartager.com), marque française de Roomgo Limited —
 * anciennement SpareRoom. Portail de COLOCATION entre particuliers.
 *
 * CE QU'ELLE EST, DIT SANS DÉTOUR. Cent pour cent de ses annonces sont des
 * colocations : une chambre dans un logement partagé, jamais un logement
 * entier. Ce compte EXCLUT les colocations (`excludeFlatShare`) — ces annonces
 * n'apparaîtront donc dans la liste que si l'utilisateur lève ce filtre. Elle
 * entre malgré tout, à sa demande, correctement étiquetée : `flatShare` est
 * déclaré `true` pour chaque annonce, sans laisser le texte en décider.
 *
 * LE CONTACT N'EST PAS TOUJOURS GRATUIT, et la source le dit sur ses propres
 * cartes : « Contacter gratuitement » lorsque l'annonceur a payé l'abonnement
 * Premium, sinon « Upgrade to Premium membership for unlimited contact
 * access ». D'où `paidContact` sur le descripteur, et le libellé de la carte
 * conservé tel quel dans la description : c'est une information qui doit
 * arriver AVANT le clic, pas après.
 *
 * CE QU'ELLE NE PUBLIE PAS : ni surface, ni charges, ni dépôt de garantie —
 * vérifié sur la fiche et sur la carte le 2026-09-16. Ces champs restent
 * absents, jamais reconstitués.
 *
 * robots.txt vérifié le 2026-09-16. Le bloc `User-agent: *` interdit toute
 * URL de recherche PARAMÉTRÉE — `/colocations/*min_rent=`, `*max_rent=`,
 * `*sort_by=`, `*filter=showall`, `*KW=`, `*lookup=` et une soixantaine
 * d'autres — ainsi que `/location/search.pl?*action=search`, `/pro/*`,
 * `/location/shortlist.pl` et `/location/savesearch.pl`. La page de ville nue
 * `/colocations/nice` et les fiches `/colocations/{dept}/{ville}/{id}` ne sont
 * visées par aucune règle : ce sont les seules adresses appelées ici, sans
 * aucun paramètre.
 */

import * as cheerio from 'cheerio';
import type { RawListing } from '@maioun/shared';
import { fieldMatching, firstMatch } from '../shared/labels.js';
import { cleanText } from '../../normalization/text.js';
import { compactListing, type ParsedList, type RawDraft } from '../shared/raw-listing.js';

/** Identifiant de l'annonce : `/colocations/alpes-maritimes/nice/3002094206`. */
function referenceFrom(href: string): string | null {
  return /\/colocations\/[^/]+\/[^/]+\/(\d+)(?:[?#]|$)/.exec(href)?.[1] ?? null;
}

/** « Nice (06000 Nice) » → commune et code postal. */
function splitLocation(text: string): { city?: string; postalCode?: string } {
  const match = /\((\d{5})\s+([^)]+)\)/.exec(text);
  if (match !== null) return { city: match[2]?.trim(), postalCode: match[1] };
  const bare = cleanText(text.replace(/\([^)]*\)/g, ''));
  return bare === '' ? {} : { city: bare };
}

/** Une sélection cheerio, telle que `$(…)` la rend — cheerio n'en exporte pas le type. */
type Selection = ReturnType<cheerio.CheerioAPI>;

/**
 * `true` quand le libellé de la carte NOMME la chambre qui se loue — « Chambre
 * simple », « Chambre double ». Tout le reste décrit autre chose.
 */
function namesTheRoom(offer: string): boolean {
  return /chambre/i.test(offer);
}

/**
 * CE QUI SE LOUE EST UNE CHAMBRE, toujours.
 *
 * Le libellé de la carte dit tantôt la chambre — « Chambre simple », « Chambre
 * double » — tantôt le logement qui l'abrite (« Appartement à 3 lit(s) »),
 * tantôt le lot proposé (« 2 simples + double », « 4 doubles »). Les deux
 * derniers ne sont pas des types de bien, et les prendre pour tels classait
 * quatre annonces sur vingt-deux en « appartement » ou en « autre » : l'une
 * d'elles annonçait un 88 m² à 635 € alors que sa fiche répartit le loyer entre
 * TROIS chambres à 635 € et signale « 3 jeunes actifs en place déjà ».
 *
 * Le catalogue entier du site vit sous `/colocations/` : ce qu'on prend est une
 * chambre, et le libellé d'origine, lui, rejoint la description où il renseigne
 * sans tromper.
 */
function rentedUnit(offer: string): string {
  return namesTheRoom(offer) ? offer : 'Chambre en colocation';
}

/**
 * Une carte de résultats.
 *
 * Elle porte le loyer mensuel, la commune et son code postal, la disponibilité,
 * le type de chambre (« Chambre simple », « Chambre double », « Appartement à
 * 3 lit(s) ») et l'état du contact. La fiche ajoute la description entière, le
 * meublé et — décisif ici — la durée maximale du séjour.
 */
function parseCard($: cheerio.CheerioAPI, card: Selection, pageUrl: string): RawListing | null {
  const href = card.find('a.result-card__link').first().attr('href') ?? '';
  const reference = referenceFrom(href);
  if (reference === null) return null;

  let sourceUrl: string;
  try {
    sourceUrl = new URL(href, pageUrl).toString();
  } catch {
    return null;
  }

  const rent = cleanText(card.find('.result-card-media__rent > span').first().text());
  const frequency = cleanText(card.find('.result-card-media__rent-frequency').first().text());
  const contactStatus = cleanText(card.find('.result-card-media__contact-status').first().text());

  // Les `summary-item` sans modificateur portent le type d'offre ; les autres
  // sont l'abonnement de l'annonceur, la nouveauté et la disponibilité.
  const offer = cleanText(
    card
      .find('.result-card-info__summary-item')
      .filter((_i, li) => ($(li).attr('class') ?? '').trim() === 'result-card-info__summary-item')
      .first()
      .text(),
  );

  const place = splitLocation(card.find('.result-card-info__main-heading span[id]').first().text());
  const image = card.find('img.result-card-media__image').first().attr('src') ?? '';
  const excerpt = cleanText(card.find('.result-card-info__description').first().text());

  return compactListing({
    sourceRef: reference,
    sourceUrl,
    title: cleanText(card.find('.result-card-info__heading').first().text()) || undefined,
    // « €600 » + « par mois ». Ni charges ni dépôt ne sont publiés : le montant
    // est rendu seul, sans mention qu'on ne pourrait pas justifier.
    priceText: rent === '' ? undefined : cleanText(`${rent} ${frequency}`),
    // Le libellé qui ne nomme pas la chambre — logement d'accueil ou lot de
    // chambres — ouvre la description : il renseigne, mais ce n'est pas le bien.
    description:
      [namesTheRoom(offer) ? '' : offer, excerpt].filter((p) => p !== '').join(' — ') || undefined,
    propertyTypeText: rentedUnit(offer),
    cityText: place.city,
    postalCodeText: place.postalCode,
    availableAtText:
      cleanText(card.find('.result-card-info__summary-item--availability').first().text()) ||
      undefined,
    contactFormUrl: sourceUrl,
    imageUrls: image === '' ? undefined : [new URL(image, pageUrl).toString()],
    // PAS DE `reference` ICI : la carte n'en imprime aucune, et le numéro de
    // l'URL est notre clé de collecte, pas un identifiant que l'annonceur
    // reconnaîtrait. La fiche écrit « Référence de l'annonce #… » : c'est de
    // là qu'elle vient.
    extra: {
      // FAIT DE LA SOURCE, pas supposition sur l'annonce : Appartager ne
      // publie que des colocations.
      flatShare: 'true',
      ...(contactStatus === '' ? {} : { contactStatus }),
    },
  });
}

/** Parse une page de résultats et rend une annonce par carte. */
export function parseListPage(html: string, pageUrl: string): ParsedList {
  const $ = cheerio.load(html);
  const bySourceRef = new Map<string, RawListing>();

  $('article.result-card').each((_i, el) => {
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
 * Ce que la FICHE ajoute à la carte.
 *
 * LA DURÉE MAXIMALE EST CE QU'ON VIENT CHERCHER. Appartager mélange des
 * colocations à l'année et des chambres « à court terme » : la première fiche
 * relevée le 2026-09-16 annonçait « Locations à court terme acceptées » et
 * « 3 mois maximum ». Trois mois n'est pas un logement, c'est un dépannage, et
 * rien sur la carte ne le disait. Les mentions sont donc reprises TELLES
 * QUELLES en tête de description, là où l'utilisateur les lira et où la
 * normalisation reconnaît déjà les baux qui s'arrêtent.
 */
export function parseDetail(html: string): RawDraft | null {
  const $ = cheerio.load(html);

  const features = new Map<string, string>();
  $('.property-feature-list__item').each((_i, item) => {
    const key = cleanText($(item).find('.sr-only').first().text()).toLowerCase();
    const value = cleanText($(item).find('.property-feature-list__text').first().text());
    if (key !== '' && !features.has(key)) features.set(key, value);
  });

  // Le texte de l'annonce vit dans l'encadré que coiffe « Description de
  // l'annonce » — repéré par son titre, car l'encadré n'a pas de classe propre.
  const box = $('h2')
    .filter((_i, h) => /description de l/i.test($(h).text()))
    .first()
    .parent();
  box.find('h2').remove();
  const description = cleanText(box.text().replace(/\s+/g, ' '));

  const duration = [
    fieldMatching(features, /court terme/),
    fieldMatching(features, /^durée maximum$/),
  ]
    .filter((line): line is string => line !== undefined)
    .join(' — ');

  const furnished = fieldMatching(features, /^ameublement$/);

  // La RÉFÉRENCE que l'annonceur reconnaîtra, telle que la fiche l'imprime :
  // « Référence de l'annonce #3002094206 ». La carte, elle, n'en publie
  // aucune — et le numéro de l'URL n'en est pas une.
  const reference = firstMatch(
    cleanText($('body').text().replace(/\s+/g, ' ')),
    String.raw`R[ée]f[ée]rence de l['’]annonce\s*#?\s*(\d+)`,
  );

  if (features.size === 0 && description === '') return null;

  // ON NE REPREND PAS « 5 chambres total » : c'est la taille du LOGEMENT, pas
  // ce qui est loué. La porter en `roomsText` ferait passer une chambre pour
  // un cinq-pièces — exactement l'erreur que le type de bien doit éviter.
  const prose = [duration, description].filter((part) => part !== '').join('\n');

  return {
    ...(prose !== '' ? { description: prose } : {}),
    ...(furnished !== undefined ? { furnishedText: furnished } : {}),
    extra: { flatShare: 'true', ...(reference !== undefined ? { reference } : {}) },
  };
}
