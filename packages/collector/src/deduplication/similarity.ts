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

import type { NormalizedListing } from '@maioun/shared';
import { comparable, tokenize } from '../normalization/text.js';
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
  return null;
}

/**
 * Recherche un désaccord rédhibitoire.
 * @returns la raison du blocage, ou `null` si rien n'interdit la fusion.
 */
function findBlocker(a: NormalizedListing, b: NormalizedListing): string | null {
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
 * Ce que les photos de deux annonces ont en commun.
 *
 * DEUX SIGNAUX, ET NON UN, parce qu’ils ne valent pas la même chose. Mesuré
 * sur l’inventaire du 2026-09-09, à surface et pièces égales et prix à 15 %
 * près :
 *
 *   partager AU MOINS une photo  : 331 paires, 45 plausibles — 14 %
 *   partager TOUT le jeu         :  30 paires, 27 plausibles — 90 %
 *
 * L’écart s’explique : une agence illustre volontiers dix biens avec la même
 * façade ou le même hall. Ce cliché-là se retrouve partout et ne désigne rien.
 * Un JEU ENTIER identique, en revanche, ne s’explique pas par un fonds de
 * catalogue — c’est la même annonce, reprise ailleurs ou republiée.
 *
 * D’où un partage partiel qui ne peut plus, à lui seul, emporter la décision :
 * ajouté à la concordance prix/surface/pièces il reste sous le seuil de fusion,
 * là où le jeu entier le franchit.
 */
type PhotoOverlap = 'none' | 'partial' | 'identical';

function photoOverlap(
  a: NormalizedListing,
  b: NormalizedListing,
  relaysListings: (sourceId: string) => boolean,
): PhotoOverlap {
  // AU SEIN D’UNE SOURCE QUI NE RELAIE PAS, le partage partiel ne dit rien :
  // Citya réutilise un cliché sur quatorze biens, Saint-Roch sur cinq. Le jeu
  // ENTIER, lui, reste parlant — c’est une annonce republiée.
  const memeSource = a.sourceId === b.sourceId && !relaysListings(a.sourceId);

  const left = new Set(a.imageUrls.map(imageIdentity).filter((x): x is string => x !== null));
  const right = new Set(b.imageUrls.map(imageIdentity).filter((x): x is string => x !== null));
  if (left.size === 0 || right.size === 0) return 'none';

  let communes = 0;
  for (const identity of left) if (right.has(identity)) communes += 1;
  if (communes === 0) return 'none';

  const memeJeu = communes === left.size && communes === right.size;
  // AU SEIN D'UNE SOURCE, IL EN FAUT DEUX. Un cliché tamponné suffit à faire
  // « jeu identique » quand les deux annonces n'en publient qu'un — et une
  // agence pose volontiers la même façade sur dix biens. Deux photos communes
  // et rien d'autre, en revanche, ne s'explique plus par un fonds de catalogue.
  if (memeJeu) return !memeSource || communes >= 2 ? 'identical' : 'none';
  return memeSource ? 'none' : 'partial';
}

function collectStrongSignals(
  a: NormalizedListing,
  b: NormalizedListing,
  push: (signal: SimilaritySignal) => void,
  relaysListings: (sourceId: string) => boolean,
): void {
  // Gratuit : on compare des URL déjà collectées, sans télécharger d'image.
  const photos = photoOverlap(a, b, relaysListings);
  if (photos === 'identical') {
    push({ code: 'image', label: 'mêmes photos', points: 45 });
  } else if (photos === 'partial') {
    // HUIT POINTS, ET C’EST VOULU. Une photo commune parmi d’autres n’a que
    // 14 % de justesse : elle appuie une ressemblance déjà établie par ailleurs,
    // elle ne doit plus pouvoir en décider. Même ajoutée à une concordance
    // complète de prix, surface, pièces, code postal et titre, elle reste sous
    // le seuil de fusion.
    push({ code: 'image', label: 'une photo commune', points: 8 });
  }

  // Coordonnées : signal fort ENTRE SOURCES seulement. Au sein d'une source,
  // le numéro est le plus souvent le STANDARD de l'agence — porté à l'identique
  // par une vingtaine d'annonces, et posé en repli par le pipeline sur celles
  // qui n'en publient aucun. Il ne distingue donc rien, et additionné à
  // l'adresse ou au GPS il franchissait le seuil de fusion (§14).
  if (a.sourceId !== b.sourceId) {
    if (a.contact.phone !== null && a.contact.phone === b.contact.phone) {
      push({ code: 'phone', label: 'même téléphone', points: 40 });
    }
    if (a.contact.email !== null && a.contact.email === b.contact.email) {
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

  if (a.address !== null && b.address !== null && comparable(a.address) === comparable(b.address)) {
    push({ code: 'address', label: 'même adresse', points: 30 });
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
  if (agencyA !== null && agencyB !== null && comparable(agencyA) === comparable(agencyB)) {
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
  if (titleScore > 0.4) {
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
 */
export function similarity(
  a: NormalizedListing,
  b: NormalizedListing,
  relaysListings: (sourceId: string) => boolean = () => false,
  operatorOf: (sourceId: string) => string | null = () => null,
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

  const blocker = findBlocker(a, b) ?? sameSourceConflict(a, b, relaysListings);
  if (blocker !== null) {
    return { score: 0, verdict: 'distinct', signals: [], blocker };
  }

  const signals: SimilaritySignal[] = [];
  const push = (signal: SimilaritySignal): void => {
    signals.push(signal);
  };

  collectStrongSignals(a, b, push, relaysListings);
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

  return { score, verdict, signals, blocker: null };
}
