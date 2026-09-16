/**
 * Score de similarité entre deux occurrences (§14).
 *
 * Le dédoublonnage repose sur une accumulation de signaux plutôt que sur une
 * règle unique, parce qu'aucune source ne fournit le même sous-ensemble
 * d'informations. Deux principes gouvernent l'implémentation :
 *
 *   1. Les signaux ABSENTS ne comptent pas. Deux annonces sans téléphone ne se
 *      ressemblent pas davantage pour autant.
 *   2. Certains désaccords sont RÉDHIBITOIRES. Un écart de surface important
 *      ou une ville différente interdit la fusion, quel que soit le reste :
 *      fusionner deux logements distincts est bien plus grave que d'en afficher
 *      un en double (§14).
 */

import { ONE_SHOT_SOURCES, type NormalizedListing } from '@maioun/shared';
import { comparable, tokenize } from '../normalization/text.js';
import { sameStreet } from '../normalization/parse-listing-fields.js';
import { haversineKm } from '../core/geo.js';

/** Verdict rendu pour une paire d'annonces. */
export type SimilarityVerdict = 'duplicate' | 'ambiguous' | 'distinct';

export interface SimilaritySignal {
  readonly code: string;
  readonly label: string;
  readonly points: number;
}

export interface SimilarityResult {
  readonly score: number;
  readonly verdict: SimilarityVerdict;
  readonly signals: readonly SimilaritySignal[];
  /** Renseigné quand un désaccord rédhibitoire a tranché la comparaison. */
  readonly blocker: string | null;
}

/** Au-delà de ce score, la fusion est automatique. */
export const DUPLICATE_THRESHOLD = 70;

/** Signaux purement chiffrés, qui concordent aussi entre deux biens voisins. */
const FIGURES_ONLY = new Set(['price', 'area', 'exactArea', 'rooms', 'postalCode']);

/** Longueur à partir de laquelle une description aurait pu concorder. */
const DESCRIBED = 100;

/** En dessous de ce score, les annonces sont considérées distinctes. */
const AMBIGUOUS_THRESHOLD = 45;

/** Tolérance sur le loyer : les portails diffèrent sur l'inclusion des charges. */
const PRICE_TOLERANCE_EUR = 30;
const PRICE_TOLERANCE_RATIO = 0.06;

/** Tolérance sur la surface : les arrondis varient d'une source à l'autre. */
const AREA_TOLERANCE_M2 = 2;
const AREA_TOLERANCE_RATIO = 0.05;

/** Deux points distants de moins de 80 m désignent très probablement le même immeuble. */
const GPS_SAME_BUILDING_KM = 0.08;

function withinTolerance(a: number, b: number, absolute: number, ratio: number): boolean {
  const delta = Math.abs(a - b);
  return delta <= Math.max(absolute, Math.max(a, b) * ratio);
}

/**
 * La surface porte-t-elle des décimales ?
 *
 * La tolérance de 4 millièmes absorbe les flottants : `22.81` peut se ranger en
 * `22.809999999999999`, et un test d'égalité stricte à l'entier s'y perdrait.
 */
function hasDecimals(area: number): boolean {
  return Math.abs(area - Math.round(area)) > 0.004;
}

/** Deux surfaces identiques au centimètre carré près. */
function sameToTheCentimetre(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/** Indice de Jaccard entre deux ensembles de mots, dans [0, 1]. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Même surface, ou l'une est l'entier de l'autre (« 22 m² » d'un digest, « 22,81 m² »). */
function sameArea(a: number, b: number): boolean {
  if (sameToTheCentimetre(a, b)) return true;
  const wholeOf = (whole: number, precise: number): boolean =>
    !hasDecimals(whole) &&
    (Math.floor(precise + 0.005) === Math.round(whole) ||
      Math.round(precise) === Math.round(whole));
  return wholeOf(a, b) || wholeOf(b, a);
}

/**
 * AU SEIN D'UNE SOURCE, LE MÊME BIEN PORTE LES MÊMES CHIFFRES.
 *
 * Les tolérances servent à absorber les écarts ENTRE maisons (charges
 * incluses ou non, arrondis). Une source qui publie deux fois le même bien le
 * tient d'un seul système : même loyer, même surface. Deux studios BEP à
 * 800 €, de 20 et 19 m², l'un à Bellet et l'autre à la Bornala, fusionnaient
 * pourtant — et l'un des deux disparaissait.
 *
 * Exception : un portail qui relaie, quand deux agences connues et
 * différentes co-publient le même bien avec leurs propres chiffres.
 */
export function sameSourceConflict(
  a: NormalizedListing,
  b: NormalizedListing,
  relaysListings: (sourceId: string) => boolean = () => false,
): string | null {
  if (a.sourceId !== b.sourceId || a.id === b.id) return null;
  const agencyA = a.contact.agencyName;
  const agencyB = b.contact.agencyName;
  if (
    relaysListings(a.sourceId) &&
    agencyA !== null &&
    agencyB !== null &&
    comparable(agencyA) !== comparable(agencyB)
  ) {
    return null;
  }
  if (a.price !== null && b.price !== null && Math.abs(a.price - b.price) > 0.5) {
    return `même source, loyers différents (${a.price} € / ${b.price} €)`;
  }
  if (a.area !== null && b.area !== null && !sameArea(a.area, b.area)) {
    return `même source, surfaces différentes (${a.area} m² / ${b.area} m²)`;
  }
  // Le même système donne le même code postal : 06000 et 06300 chez FNAIM sont
  // deux studios Saint-Roch, pas un (relevé du 2026-09-15). Pas les alertes des
  // portails : SeLoger donne 06000 puis 06200 pour le même studio.
  if (
    !ONE_SHOT_SOURCES.includes(a.sourceId) &&
    a.postalCode !== null &&
    b.postalCode !== null &&
    a.postalCode !== b.postalCode
  ) {
    return `même source, codes postaux différents (${a.postalCode} / ${b.postalCode})`;
  }
  return null;
}

/**
 * Recherche un désaccord rédhibitoire.
 *
 * @param photosProuvent dit qu'une photo propre aux deux annonces les a déjà
 *   identifiées. LE LOYER CESSE ALORS DE POUVOIR LES SÉPARER : les portails ne
 *   l'annoncent pas sur la même base — Rentumo publie le loyer hors charges là
 *   où les autres le publient charges comprises, et l'écart atteint un tiers
 *   sur un petit meublé. Dix-neuf des vingt-six rapprochements Rentumo/FNAIM
 *   mesurés le 2026-09-16 mouraient là. Surface, pièces, commune et position
 *   continuent de trancher, elles.
 * @returns la raison du blocage, ou `null` si rien n'interdit la fusion.
 */
function findBlocker(
  a: NormalizedListing,
  b: NormalizedListing,
  photosProuvent: boolean,
): string | null {
  if (a.city !== null && b.city !== null && a.city !== b.city) {
    return `villes différentes (${a.city} / ${b.city})`;
  }

  if (
    a.area !== null &&
    b.area !== null &&
    !withinTolerance(a.area, b.area, AREA_TOLERANCE_M2, AREA_TOLERANCE_RATIO)
  ) {
    return `surfaces incompatibles (${a.area} m² / ${b.area} m²)`;
  }

  if (
    !photosProuvent &&
    a.price !== null &&
    b.price !== null &&
    !withinTolerance(a.price, b.price, PRICE_TOLERANCE_EUR, PRICE_TOLERANCE_RATIO)
  ) {
    return `loyers incompatibles (${a.price} € / ${b.price} €)`;
  }

  if (a.rooms !== null && b.rooms !== null && a.rooms !== b.rooms) {
    return `nombre de pièces différent (${a.rooms} / ${b.rooms})`;
  }

  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
    const distance = haversineKm(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    );
    // Au-delà de 500 m, il ne s'agit plus du même bien, même si tout concorde.
    if (distance > 0.5) return `positions éloignées de ${Math.round(distance * 1000)} m`;
  }

  return null;
}

/** Signaux très forts : ils identifient presque à eux seuls le même bien (§14). */
/**
 * Identité d'une image, indépendante de sa signature d'accès.
 *
 * Les portails ajoutent un jeton par requête (`?ci_seal=…`) : deux liens vers le
 * MÊME fichier ne se ressemblent pas caractère pour caractère. On ne garde donc
 * que l'hôte et le chemin.
 */
function imageIdentity(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Le NOM DE FICHIER d'une photo, quand il suffit à la désigner.
 *
 * L'hôte et le chemin changent d'un site à l'autre pour un MÊME cliché :
 * l'agence sert `/original/…`, le portail `/1600xauto/…`, un autre encore
 * redimensionne dans le chemin. Le nom de fichier, lui, vient de l'export de
 * l'agence et voyage intact — c'est par lui que l'annonce d'un portail rejoint
 * celle du site de l'agence.
 *
 * ENCORE FAUT-IL QU'IL DÉSIGNE QUELQUE CHOSE. `1.jpg` est porté par 98
 * annonces d'un même portail, `lg.jpeg` par 24, et un haché de huit caractères
 * revient d'un bien à l'autre chez une agence. On n'accepte donc qu'un nom
 * long et chiffré — horodatage, identifiant de cliché —, et il en faut DEUX
 * en commun : relevé du 2026-09-16 sur l'inventaire, deux noms communs entre
 * sources donnent 125 paires dont aucune n'oppose des surfaces incompatibles,
 * là où un seul nom en donne 235 dont 70 le font.
 */
const NAMED_PHOTO_MIN_LENGTH = 12;

function photoName(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    const stem = base.replace(/\.[a-z0-9]{2,5}$/, '');
    return stem.length >= NAMED_PHOTO_MIN_LENGTH && /\d/.test(stem) ? stem : null;
  } catch {
    return null;
  }
}

/**
 * Les repères par lesquels une photo peut être reconnue ailleurs.
 *
 * UNE SEULE FABRIQUE, parce que trois lecteurs s'en servent et doivent voir
 * les mêmes clés : la comparaison de paires, l'index des clichés de catalogue
 * et le blocage qui décide quelles paires sont seulement comparées.
 */
export function photoKeys(listing: NormalizedListing): string[] {
  const keys = new Set<string>();
  for (const url of listing.imageUrls) {
    const identity = imageIdentity(url);
    if (identity !== null) keys.add(identity);
    const name = photoName(url);
    if (name !== null) keys.add(name);
  }
  return [...keys];
}

/**
 * Ce que les photos de deux annonces prouvent.
 *
 * UNE PHOTO QUI N'APPARTIENT QU'À DEUX ANNONCES LES IDENTIFIE. Le fichier
 * publié par l'hébergeur de la source est propre à un bien : deux annonces qui
 * le servent décrivent le même logement, qu'elles viennent de l'agence, d'un
 * portail ou d'un agrégateur qui décode l'adresse d'origine. Relevé du
 * 2026-09-16 : 61 paires inter-sources partagent ainsi une photo, aucune
 * n'oppose des surfaces ni des nombres de pièces incompatibles.
 *
 * ENCORE FAUT-IL QUE LE CLICHÉ DÉSIGNE UN BIEN, ce que dit `photoIdentifies` :
 * une agence illustre volontiers dix logements avec la même façade, et ce
 * cliché-là n'appartient à personne. Le verdict a trois états, et c'est
 * nécessaire : « je ne sais pas » ne vaut ni « photo propre » — on fusionnerait
 * sur un filigrane — ni « catalogue » — on perdrait le jeu identique, seul
 * indice de bien des annonces.
 *
 * AU SEIN D'UNE SOURCE QUI NE RELAIE PAS, rien de tout cela ne vaut : la même
 * agence publie ses propres photos sur ses propres annonces. Seul le JEU
 * ENTIER, à deux photos au moins, reste parlant — c'est une annonce republiée.
 */
type PhotoAgreement = 'none' | 'partial' | 'shared' | 'identical';

function photoAgreement(
  a: NormalizedListing,
  b: NormalizedListing,
  relaysListings: (sourceId: string) => boolean,
  photoIdentifies: (key: string) => boolean | null,
): PhotoAgreement {
  const left = new Set(a.imageUrls.map(imageIdentity).filter((x): x is string => x !== null));
  const right = new Set(b.imageUrls.map(imageIdentity).filter((x): x is string => x !== null));
  if (left.size === 0 || right.size === 0) return 'none';

  let communes = 0;
  let propres = 0;
  let catalogue = 0;
  for (const identity of left) {
    if (!right.has(identity)) continue;
    communes += 1;
    const verdict = photoIdentifies(identity);
    if (verdict === true) propres += 1;
    else if (verdict === false) catalogue += 1;
  }

  // Un jeu entier fait de clichés de catalogue n'est pas un jeu : c'est le
  // fonds de l'agence, posé à l'identique sur deux biens différents.
  const memeJeu = communes > catalogue && communes === left.size && communes === right.size;
  if (a.sourceId === b.sourceId && !relaysListings(a.sourceId)) {
    // AU SEIN D'UNE SOURCE, IL EN FAUT DEUX. Un cliché tamponné suffit à faire
    // « jeu identique » quand les deux annonces n'en publient qu'un — et une
    // agence pose volontiers la même façade sur dix biens.
    return memeJeu && communes >= 2 ? 'identical' : 'none';
  }

  const leftNames = new Set(a.imageUrls.map(photoName).filter((x): x is string => x !== null));
  const rightNames = new Set(b.imageUrls.map(photoName).filter((x): x is string => x !== null));
  let nommees = 0;
  for (const name of leftNames) {
    if (rightNames.has(name) && photoIdentifies(name) === true) nommees += 1;
  }
  if (propres >= 1 || nommees >= 2) return 'shared';

  // LE JEU ENTIER, À DÉFAUT DE SAVOIR CE QUE VAUT CHAQUE CLICHÉ : deux annonces
  // qui ne publient rien d'autre que les mêmes photos se ressemblent, même
  // sans lecture du lot. Quarante-cinq points, pas le seuil : il faut que le
  // reste concorde.
  if (memeJeu) return 'identical';
  return communes >= 1 || nommees >= 1 ? 'partial' : 'none';
}

/** Le numéro en tête d'une adresse (« 49 », « 22 bis »), ou `null`. */
function houseNumber(address: string): string | null {
  return /^(\d{1,4})\s*(bis|ter)?\b/.exec(comparable(address))?.slice(1).join('') ?? null;
}

/**
 * Deux adresses d'une même voie, avec ou sans le même numéro.
 *
 * L'égalité stricte ratait les adresses lues dans un titre : « 49 BOULEVARD DE
 * RIQUIER - NICE RIQUI… » (alerte SeLoger coupée) ne vaut pas « 49 boulevard de
 * Riquier » caractère pour caractère. Même numéro et même voie désignent le
 * même immeuble ; la même voie seule, un voisinage.
 */
function streetAgreement(
  a: string | null,
  b: string | null,
): 'numbered' | 'bare' | 'street' | 'none' {
  if (a === null || b === null) return 'none';
  if (comparable(a) === comparable(b)) return houseNumber(a) !== null ? 'numbered' : 'bare';
  if (!sameStreet(a, b)) return 'none';
  const numberA = houseNumber(a);
  const numberB = houseNumber(b);
  if (numberA !== null && numberB !== null) return numberA === numberB ? 'numbered' : 'none';
  return 'street';
}

/**
 * Mots qui décrivent n'importe quel logement : un titre fait de ceux-là (« Studio
 * meublé à louer », « 1 pièce · 24 m² ») ne désigne aucun bien.
 */
const GENERIC_TITLE_WORDS = new Set([
  'appartement',
  'appart',
  'studio',
  'studette',
  'piece',
  'pieces',
  'chambre',
  'chambres',
  'location',
  'louer',
  'loue',
  'meuble',
  'meublee',
  'vide',
  'nice',
  'colocation',
  'logement',
  'maison',
  'villa',
  'duplex',
  'loft',
  'etudiant',
  'etudiante',
  'bail',
  'mois',
  'libre',
  'disponible',
  'beau',
  'belle',
  'joli',
  'jolie',
  'charmant',
  'lumineux',
  'grand',
  'petit',
]);

/** Les mots d'un titre, sans le dernier s'il est coupé (« … », « ... »). */
function titleTokens(title: string | null): { readonly tokens: string[]; readonly cut: boolean } {
  const raw = (title ?? '').trim();
  const cut = /(?:\.\.\.|…)$/.test(raw);
  const tokens = tokenize(raw.replace(/(?:\.\.\.|…)$/, ''));
  return { tokens: cut ? tokens.slice(0, -1) : tokens, cut };
}

/**
 * LE MÊME TITRE, ÉCRIT PAR L'AGENCE, EST UNE SIGNATURE.
 *
 * « NICE - STUDIO 21m2 - PROMENADES DES ANGLAIS » chez SeLoger et chez l'agence,
 * mêmes loyer, surface et pièces : cinquante-sept points, sous le seuil — le
 * titre ne pesait que quinze, qu'il soit « Studio à louer » ou une phrase
 * propre à ce bien. Un titre identique d'au moins quatre mots, dont deux qui ne
 * décrivent pas n'importe quel logement, vaut désormais trente points : avec
 * les chiffres concordants, la fusion. Un titre coupé par le portail compte
 * s'il est le début de l'autre.
 */
function sameDistinctiveTitle(a: NormalizedListing, b: NormalizedListing): boolean {
  const left = titleTokens(a.title);
  const right = titleTokens(b.title);
  const shorter = left.tokens.length <= right.tokens.length ? left : right;
  const longer = shorter === left ? right : left;
  if (shorter.tokens.length < 4) return false;
  if (shorter.tokens.filter((token) => !GENERIC_TITLE_WORDS.has(token)).length < 2) return false;
  const others = new Set(longer.tokens);
  if (!shorter.tokens.every((token) => others.has(token))) return false;
  // Sans coupure, l'inclusion ne suffit pas : il faut les mêmes mots.
  return shorter.cut || new Set(shorter.tokens).size === others.size;
}

/** Une page d'annonce, sans fragment ni barre finale ; `null` pour une racine ou un lien illisible. */
function listingPage(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (path === '') return null;
    return `${parsed.host.toLowerCase()}${path}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * DEUX SOURCES QUI POINTENT LA MÊME PAGE PUBLIENT LA MÊME ANNONCE.
 *
 * Une alerte Bien'ici renvoie vers la page que la source Bien'ici collecte :
 * même lien, mais ni adresse, ni texte, ni photo. Prix, surface et pièces ne
 * faisaient que quarante-six points, et l'alerte restait seule.
 *
 * Entre sources différentes seulement : au sein d'une source, un lien partagé
 * est une page de liste (le bulletin BEP en porte quarante).
 */
function sameListingPage(a: NormalizedListing, b: NormalizedListing): boolean {
  if (a.sourceId === b.sourceId) return false;
  const page = listingPage(a.sourceUrl);
  return page !== null && page === listingPage(b.sourceUrl);
}

function collectStrongSignals(
  a: NormalizedListing,
  b: NormalizedListing,
  push: (signal: SimilaritySignal) => void,
  photos: PhotoAgreement,
): void {
  // Suffit à fusionner, sous réserve des garde-fous.
  if (sameListingPage(a, b)) {
    push({ code: 'url', label: 'même page d’annonce', points: DUPLICATE_THRESHOLD });
  }

  // Gratuit : on compare des URL déjà collectées, sans télécharger d'image.
  if (photos === 'shared') {
    // AUTANT QUE LA MÊME PAGE D'ANNONCE, et pour la même raison : le fichier
    // désigne un bien et un seul. Les annonces d'agrégateur n'ont souvent rien
    // d'autre à offrir — ni titre, ni nombre de pièces, ni code postal —, et
    // les garde-fous (commune, surface, pièces, position) restent en travers.
    push({ code: 'image', label: 'photo propre à ces deux annonces', points: DUPLICATE_THRESHOLD });
  } else if (photos === 'identical') {
    push({ code: 'image', label: 'mêmes photos', points: 45 });
  } else if (photos === 'partial') {
    // HUIT POINTS, ET C’EST VOULU. Une photo commune qui appartient aussi au
    // fonds de catalogue d’une agence, ou un seul nom de fichier partagé,
    // appuie une ressemblance déjà établie par ailleurs sans pouvoir en
    // décider. Même ajoutée à une concordance complète de prix, surface,
    // pièces, code postal et titre, elle reste sous le seuil de fusion.
    push({ code: 'image', label: 'une photo commune', points: 8 });
  }

  // Coordonnées : signal fort ENTRE SOURCES seulement. Au sein d'une source,
  // le numéro est le plus souvent le STANDARD de l'agence — porté à l'identique
  // par une vingtaine d'annonces, et posé en repli par le pipeline sur celles
  // qui n'en publient aucun. Il ne distingue donc rien, et additionné à
  // l'adresse ou au GPS il franchissait le seuil de fusion (§14).
  if (a.sourceId !== b.sourceId) {
    const phone = a.contact.phone;
    if (phone !== null && phone === b.contact.phone) {
      push({ code: 'phone', label: 'même téléphone', points: 40 });
    }
    const email = a.contact.email;
    if (email !== null && email === b.contact.email) {
      push({ code: 'email', label: 'même e-mail', points: 35 });
    }
  }

  // La référence d'agence n'est comparée qu'entre sources différentes : au sein
  // d'une même source, elle est déjà l'identifiant, la comparaison serait vaine.
  const refA = a.contact.reference;
  const refB = b.contact.reference;
  if (refA !== null && refB !== null && comparable(refA) === comparable(refB) && refA.length >= 4) {
    push({ code: 'reference', label: 'même référence', points: 35 });
  }

  const street = streetAgreement(a.address, b.address);
  // UNE VOIE SANS NUMÉRO, écrite pareil : entre deux sources, c'est la même
  // annonce recopiée ; dans une même agence, deux biens de la même rue — les
  // deux parkings « Rue Massenet » à 150 € fusionnaient.
  if (street === 'numbered' || (street === 'bare' && a.sourceId !== b.sourceId)) {
    push({ code: 'address', label: 'même adresse', points: 30 });
  } else if (street !== 'none') {
    push({ code: 'street', label: 'même rue', points: 10 });
  }

  if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
    const distance = haversineKm(
      { latitude: a.latitude, longitude: a.longitude },
      { latitude: b.latitude, longitude: b.longitude },
    );
    if (distance <= GPS_SAME_BUILDING_KM) {
      push({ code: 'gps', label: 'coordonnées quasi identiques', points: 30 });
    }
  }
}

/** Signaux forts : concordants, ils ne suffisent pas seuls mais s'additionnent. */
/**
 * Les deux lectures d'une surface : la même à peu près, et la même exactement.
 *
 * SÉPARÉ DU RESTE parce que `collectMediumSignals` passait le seuil de
 * complexité toléré en accueillant la seconde — et parce que ces deux signaux
 * disent une seule chose, à deux échelles.
 */
function collectAreaSignals(
  a: NormalizedListing,
  b: NormalizedListing,
  push: (signal: SimilaritySignal) => void,
): void {
  if (
    a.area !== null &&
    b.area !== null &&
    withinTolerance(a.area, b.area, AREA_TOLERANCE_M2, AREA_TOLERANCE_RATIO)
  ) {
    push({ code: 'area', label: 'surface équivalente', points: 18 });
  }

  /**
   * UNE SURFACE AU CENTIÈME PRÈS EST PRESQUE UN IDENTIFIANT.
   *
   * « 22 m² » est un arrondi que partagent des centaines de studios niçois ;
   * « 22,81 m² » est un mesurage — la loi Carrez impose de le publier, et les
   * deux annonces qui l'affichent le tiennent du MÊME métreur. Deux sources
   * indépendantes n'arrivent pas par hasard à la même deuxième décimale.
   *
   * CE QUE ÇA RÉPARE. Les alertes des portails ne portent presque rien : ni
   * adresse, ni téléphone, ni description, ni photo commune avec le site de
   * l'agence. Prix, surface et pièces concordants ne font que quarante-deux
   * points, et il en faut soixante-dix — ces annonces restaient donc seules,
   * rattachées à un lien SeLoger qui meurt en quelques jours, quand la même
   * annonce vivait chez l'agence avec une adresse et un téléphone.
   *
   * TRENTE POINTS, comme l'opérateur : avec prix, surface et pièces on atteint
   * soixante-douze. La fusion demande donc que TOUT concorde, pas seulement la
   * décimale. Les garde-fous restent en place — même commune, loyer à 6 %
   * près, même nombre de pièces.
   *
   * LES SURFACES RONDES NE COMPTENT PAS, et c'est tout l'intérêt : mesuré sur
   * l'inventaire, ce signal fusionne huit paires, toutes justes, et laisse
   * intactes les quarante paires « même prix, même surface entière » qui,
   * elles, sont réellement ambiguës.
   *
   * ENTRE SOURCES DIFFÉRENTES SEULEMENT, comme la photo et le téléphone. Deux
   * annonces d'une MÊME source affichant la même surface au centième ne se
   * ressemblent pas : elles trahissent un parseur qui recopie. C'est exactement
   * ce qui s'est produit chez L'Adresse, dont les treize annonces portaient
   * toutes « 76,25 m² » faute d'un sélecteur limité à la carte. Le bug est
   * corrigé ; cette règle-ci protège du prochain.
   */
  if (
    a.sourceId !== b.sourceId &&
    a.area !== null &&
    b.area !== null &&
    hasDecimals(a.area) &&
    sameToTheCentimetre(a.area, b.area)
  ) {
    push({ code: 'exactArea', label: `surface identique (${a.area} m²)`, points: 30 });
  }
}

function collectMediumSignals(
  a: NormalizedListing,
  b: NormalizedListing,
  push: (signal: SimilaritySignal) => void,
): void {
  if (
    a.price !== null &&
    b.price !== null &&
    withinTolerance(a.price, b.price, PRICE_TOLERANCE_EUR, PRICE_TOLERANCE_RATIO)
  ) {
    push({ code: 'price', label: 'loyer équivalent', points: 18 });
  }

  collectAreaSignals(a, b, push);

  if (a.rooms !== null && a.rooms === b.rooms) {
    push({ code: 'rooms', label: 'même nombre de pièces', points: 6 });
  }

  const agencyA = a.contact.agencyName;
  const agencyB = b.contact.agencyName;
  // Au sein d'une source d'agence, toutes ses annonces ont « la même agence ».
  if (
    a.sourceId !== b.sourceId &&
    agencyA !== null &&
    agencyB !== null &&
    comparable(agencyA) === comparable(agencyB)
  ) {
    push({ code: 'agency', label: 'même agence', points: 12 });
  }

  if (a.postalCode !== null && a.postalCode === b.postalCode) {
    push({ code: 'postalCode', label: 'même code postal', points: 4 });
  }

  // Le QUARTIER situe bien plus finement que la commune : à Nice, « Gambetta »
  // vaut mieux que « Nice ». Il n'était pas exploité du tout. On le lit aussi
  // dans le titre de l'autre annonce (« STUDIO GAMBETTA »), les portails le
  // mettant souvent là plutôt que dans un champ dédié.
  const districtA = a.district;
  const districtB = b.district;
  if (districtA !== null && districtB !== null && comparable(districtA) === comparable(districtB)) {
    push({ code: 'district', label: `même quartier (${districtA})`, points: 12 });
  } else if (
    (districtA !== null && tokenize(b.title).includes(comparable(districtA))) ||
    (districtB !== null && tokenize(a.title).includes(comparable(districtB)))
  ) {
    push({ code: 'district', label: 'quartier nommé dans le titre', points: 8 });
  }

  const titleScore = jaccard(tokenize(a.title), tokenize(b.title));
  if (a.sourceId !== b.sourceId && sameDistinctiveTitle(a, b)) {
    push({ code: 'title', label: 'même titre', points: 30 });
  } else if (titleScore > 0.4) {
    push({
      code: 'title',
      label: `titres proches (${Math.round(titleScore * 100)} %)`,
      points: Math.round(titleScore * 15),
    });
  }

  const descriptionScore = jaccard(tokenize(a.description), tokenize(b.description));
  if (descriptionScore > 0.5) {
    push({
      code: 'description',
      label: `descriptions proches (${Math.round(descriptionScore * 100)} %)`,
      points: Math.round(descriptionScore * 12),
    });
  }
}

/**
 * Compare deux occurrences et rend un verdict motivé.
 *
 * @param relaysListings dit si une source RELAIE des annonces publiées ailleurs
 *   (`SourceDescriptor.relaysListings`). Par défaut « non » : sans registre
 *   sous la main — dans un test unitaire, par exemple — on retient l'hypothèse
 *   prudente, celle qui fusionne le moins (§14).
 * @param photoIdentifies dit si un repère de photo désigne UN bien (`true`),
 *   s'il appartient au fonds de catalogue d'une source (`false`), ou si l'on
 *   n'en sait rien (`null`). Seul `dedupe` peut trancher, lui qui voit tout le
 *   lot ; sans lui on répond « je ne sais pas », l'hypothèse prudente, celle
 *   qui fusionne le moins.
 */
export function similarity(
  a: NormalizedListing,
  b: NormalizedListing,
  relaysListings: (sourceId: string) => boolean = () => false,
  operatorOf: (sourceId: string) => string | null = () => null,
  photoIdentifies: (key: string) => boolean | null = () => null,
): SimilarityResult {
  // Identité : la même annonce, sur la même source.
  if (a.id === b.id) {
    return {
      score: 100,
      verdict: 'duplicate',
      signals: [{ code: 'identity', label: 'même occurrence', points: 100 }],
      blocker: null,
    };
  }

  const photos = photoAgreement(a, b, relaysListings, photoIdentifies);
  const blocker =
    findBlocker(a, b, photos === 'shared') ?? sameSourceConflict(a, b, relaysListings);
  if (blocker !== null) {
    return { score: 0, verdict: 'distinct', signals: [], blocker };
  }

  const signals: SimilaritySignal[] = [];
  const push = (signal: SimilaritySignal): void => {
    signals.push(signal);
  };

  collectStrongSignals(a, b, push, photos);
  collectMediumSignals(a, b, push);

  /**
   * DEUX CANAUX D'UNE MÊME MAISON. BEP Logement publie le même stock sur son
   * site public et dans son bulletin abonnés, avec des références, des titres
   * et des photos entièrement différents : rien ne pouvait les rapprocher.
   * Prix, surface et pièces concordants ne font que quarante-deux points, et il
   * en faut soixante-dix — onze annonces s'affichaient donc en double.
   *
   * IL A FALLU LE RESSERRER, et vite. Adossé aux TOLÉRANCES — loyer à 6 %
   * près, surface à 5 % —, il rapprochait des logements simplement voisins par
   * la taille et le prix. Chaque rapprochement en vaut deux, l'union-find étant
   * transitive : mesuré sur l'inventaire, un groupe réunissait HUIT studios BEP
   * distincts, de 18 à 23 m² et de 750 à 850 €, enchaînés de proche en proche.
   * Huit logements affichés comme un seul — bien pire que le doublon qu'on
   * voulait retirer.
   *
   * IL EXIGE DÉSORMAIS L'ÉGALITÉ EXACTE du loyer ET de la surface. C'est ce que
   * publient réellement les deux canaux d'une même maison : le même chiffre,
   * puisque c'est la même fiche à la source. Une tolérance n'apportait rien ici
   * — elle sert à absorber les divergences ENTRE maisons, et il n'y en a pas
   * quand l'annonce vient d'un seul système.
   *
   * TRENTE POINTS : avec prix, surface et pièces, on atteint soixante-douze. La
   * fusion demande donc que tout concorde, pas seulement l'opérateur.
   */
  const operator = operatorOf(a.sourceId);
  const sameFigures =
    a.price !== null &&
    a.price === b.price &&
    a.area !== null &&
    b.area !== null &&
    sameToTheCentimetre(a.area, b.area);
  if (
    a.sourceId !== b.sourceId &&
    operator !== null &&
    operator === operatorOf(b.sourceId) &&
    sameFigures
  ) {
    push({ code: 'operator', label: `même opérateur (${operator})`, points: 30 });
  }

  const score = Math.min(
    100,
    signals.reduce((total, signal) => total + signal.points, 0),
  );

  let verdict: SimilarityVerdict = 'distinct';
  if (score >= DUPLICATE_THRESHOLD) verdict = 'duplicate';
  else if (score >= AMBIGUOUS_THRESHOLD) verdict = 'ambiguous';

  /**
   * DES CHIFFRES SEULS NE SUFFISENT PAS ENTRE DEUX ANNONCES QUI ONT UN TEXTE.
   *
   * Loyer, surface au centième, pièces et code postal font soixante-seize
   * points. Relevé du 2026-09-14 : 21 fusions sur 573 ne tenaient qu'à cela, et
   * 8 réunissaient deux biens distincts — « F2 vide Parc Chambrun » et « 2
   * pièces meublé Pessicart », un appartement de Cimiez et une colocation rue
   * Trachel, qui lui prêtait ses badges. Toutes les fausses opposaient deux
   * descriptions ; les vraies avaient un côté muet (alerte SeLoger, fiche sans
   * texte), où rien d'autre ne peut concorder. Entre deux textes, il faut donc
   * un autre accord : photo, adresse, titre, description, contact, quartier.
   */
  if (
    verdict === 'duplicate' &&
    signals.every((signal) => FIGURES_ONLY.has(signal.code)) &&
    (a.description ?? '').length >= DESCRIBED &&
    (b.description ?? '').length >= DESCRIBED
  ) {
    verdict = 'ambiguous';
  }

  return { score, verdict, signals, blocker: null };
}
