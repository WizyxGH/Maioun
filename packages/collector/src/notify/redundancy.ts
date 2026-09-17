/**
 * Deux alertes pour le même logement (§29).
 *
 * CE QUI S'EST PASSÉ. Le 2026-09-03 à 12h11, deux notifications sont parties à
 * la même minute pour le même studio Saint-Sylvestre : « 660 € · 29,4 m² » vu
 * par une alerte e-mail, et « 660 € · 29 m² » vu directement chez Savi Esteve.
 * Deux fiches distinctes — les surfaces publiées diffèrent d'un demi-mètre
 * carré, ce qui suffit à ne pas les fusionner (§14, prudence) — mais un seul
 * appartement, et deux sonneries.
 *
 * Le dépôt savait déjà rapprocher ces deux-là : `listingSpecKey` arrondit
 * justement le loyer et la surface, et `directListingSpecKeys` recensait les
 * biens vus EN DIRECT pour cette raison. Simplement, personne n'appelait ces
 * fonctions — l'intention était écrite, le filtre jamais posé.
 *
 * CE QU'ON FAIT. Quand une alerte e-mail décrit le même bien qu'une source
 * directe, on tait l'alerte e-mail. La source directe vaut mieux : elle porte
 * un lien vers la vraie fiche, souvent un téléphone, et les honoraires.
 *
 * ET L'ÉCHO D'UNE SOURCE SUR ELLE-MÊME. MorningCroissant publie quatre annonces
 * — 30563, 30567, 30568, 30569 — au même loyer, à la même surface, sous quatre
 * titres différents et avec EXACTEMENT les mêmes vingt-deux photos, au fichier
 * près. Impossible de dire de l'extérieur s'il s'agit d'un bien republié quatre
 * fois ou de quatre studios identiques d'une résidence : leurs galeries sont
 * d'ailleurs recopiées de trois AUTRES logements du même bailleur, ce qui
 * ressemble fort à un fonds de résidence. On ne fusionne donc rien — les quatre
 * fiches restent visibles, et neuf logements réels ne risquent pas de
 * disparaître —, mais on ne sonne qu'une fois : du point de vue de
 * l'utilisateur, c'est une seule annonce à aller voir.
 *
 * CE QU'ON NE FAIT PAS. On ne fusionne rien (§14) : les deux fiches restent
 * visibles sur le site, avec leurs sources. Et on ne marque pas l'annonce tue
 * comme « signalée » : si la fiche directe disparaît, l'e-mail redevient la
 * seule trace du bien, et il sera notifié à ce moment-là.
 *
 * L'ÉCHO, LUI, SE MARQUE — c'est la différence, et elle est nécessaire. Une
 * annonce tue parce qu'une autre du MÊME lot la disait déjà reviendrait seule
 * au passage suivant, et sonnerait alors : les quatre notifications seraient
 * simplement étalées sur quatre collectes. `echoes` dit donc qui a été tu et
 * POUR QUI, pour que l'appelant ne le marque signalé que si la sonnerie qu'il
 * double est réellement partie.
 */

import { photoName } from '../deduplication/similarity.js';
import { listingSpecKey, looseSpecKey, type NotifiableListing } from '../db/repository.js';

/** La source qui relaie, par opposition à celles qu'on collecte en direct. */
const RELAYED_SOURCE = 'email-alerts';

/**
 * Photos qu'il faut voir concorder pour parler d'une même galerie.
 *
 * DEUX AU MOINS : une annonce qui ne publie qu'un cliché de façade partagerait
 * sa « galerie » avec tous les biens du même immeuble.
 */
const GALLERY_MIN_PHOTOS = 2;

/** Les deux clés d'une annonce : avec la ville, et sans elle. */
function keysOf(listing: NotifiableListing): string[] {
  return [
    listingSpecKey(listing.price, listing.area, listing.city, listing.rooms),
    looseSpecKey(listing.price, listing.area, listing.rooms),
  ].filter((key): key is string => key !== null);
}

/**
 * La galerie d'une annonce, réduite aux NOMS DE FICHIER de ses photos.
 *
 * LE CHEMIN NE SUFFIT PAS : MorningCroissant sert le même cliché sous quatre
 * entrées de médiathèque (`/medialibrary/flats/499095/…`, `499185`, `499207`,
 * `499231`), si bien que quatre galeries identiques n'ont pas une seule URL en
 * commun. Le nom, lui, porte l'empreinte du fichier
 * (`crop.e7635649052c48f4bceea93ee9c23b02-14591_530x365`) et ne bouge pas.
 *
 * `null` dès qu'un nom ne désigne rien — `1.jpg`, `lg.jpeg` — : trois annonces
 * dont les photos s'appellent « 1 », « 2 », « 3 » ne partagent pas une galerie,
 * elles partagent un gabarit d'hébergeur.
 */
function galleryKey(photoUrls: readonly string[]): string | null {
  if (photoUrls.length < GALLERY_MIN_PHOTOS) return null;
  const names = photoUrls.map(photoName);
  if (names.some((name) => name === null)) return null;
  return [...new Set(names)].sort().join('\n');
}

/**
 * Ce qui fait de deux annonces D'UNE MÊME SOURCE le même logement aux yeux de
 * la sonnerie : la même galerie, au fichier près, ET les mêmes chiffres.
 *
 * RIEN DE MOINS. « Même loyer, même surface » ne suffit pas — une résidence
 * loue réellement dix studios identiques —, et la galerie seule non plus : deux
 * annonces peuvent illustrer deux lots avec les mêmes clichés d'ensemble.
 * Réunies, les deux conditions décrivent une annonce qu'on a déjà montrée.
 */
function echoKey(listing: NotifiableListing): string | null {
  const sourceId = listing.sourceId;
  if (sourceId === null || sourceId === RELAYED_SOURCE) return null;
  const spec = looseSpecKey(listing.price, listing.area, listing.rooms);
  if (spec === null) return null;
  const gallery = galleryKey(listing.photoUrls);
  return gallery === null ? null : `${sourceId}\n${spec}\n${gallery}`;
}

/** Une annonce tue parce qu'une autre du même lot la dit déjà. */
export interface NotificationEcho {
  /** L'annonce qu'on ne signale pas. */
  readonly id: string;
  /** Celle qui la remplace, et dont le sort décide qu'on la marque ou non. */
  readonly of: string;
}

export interface RedundancyResult {
  readonly listings: readonly NotifiableListing[];
  readonly echoes: readonly NotificationEcho[];
}

/**
 * Retire les annonces redondantes d'un lot à notifier.
 *
 * @param pending  annonces prêtes à être signalées, priorité décroissante.
 * @param directKeys  clés des biens déjà connus par une source DIRECTE, en
 *                    base. Le lot courant s'y ajoute au fil de l'eau : deux
 *                    annonces du même bien peuvent arriver dans la même
 *                    collecte, et c'est précisément ce qui s'est produit.
 */
export function dropRedundantNotifications(
  pending: readonly NotifiableListing[],
  directKeys: ReadonlySet<string>,
): RedundancyResult {
  const direct = new Set(directKeys);

  // Les annonces directes du lot d'abord, quel que soit leur rang de priorité :
  // sans cela, une alerte e-mail traitée en premier passerait, et c'est la
  // fiche directe — la meilleure des deux — qui aurait été tue.
  for (const listing of pending) {
    if (listing.sourceId === RELAYED_SOURCE) continue;
    for (const key of keysOf(listing)) direct.add(key);
  }

  const echoes: NotificationEcho[] = [];
  // Le lot arrive par priorité décroissante : la première annonce d'une galerie
  // est celle qu'on aurait choisi de montrer.
  const premiere = new Map<string, string>();
  const listings = pending.filter((listing) => {
    if (listing.sourceId === RELAYED_SOURCE) {
      return !keysOf(listing).some((key) => direct.has(key));
    }
    const key = echoKey(listing);
    if (key === null) return true;
    const deja = premiere.get(key);
    if (deja === undefined) {
      premiere.set(key, listing.id);
      return true;
    }
    echoes.push({ id: listing.id, of: deja });
    return false;
  });

  return { listings, echoes };
}
