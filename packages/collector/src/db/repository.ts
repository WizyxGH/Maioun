/**
 * Accès aux données (§27, §30).
 *
 * Toute la discipline d'économie d'écritures est concentrée ici :
 *
 *   - chaque ligne porte un `content_hash` calculé sur ses champs métier ;
 *   - avant d'écrire, on compare ; si rien n'a changé, on n'écrit pas ;
 *   - `last_seen_at` seul est rafraîchi pour une annonce inchangée, en lot ;
 *   - les écritures partent groupées plutôt qu'une par annonce.
 *
 * C'est ce qui permet de rester dans le free tier Turso avec plusieurs runs
 * par heure.
 */

import { createHash, randomUUID } from 'node:crypto';
import type {
  DetailMemoryEntry,
  MessageListing,
  NormalizedListing,
  RawListing,
  ScoredListing,
  SourceId,
  SourceRuntimeState,
} from '@maioun/shared';
import {
  canonicalDistrict,
  CURRENT_USER,
  describeOvershoot,
  nearMatchBounds,
} from '@maioun/shared';
import {
  OPEN_TO_APPLICATIONS_SQL,
  traitConditions,
  type TraitFilters,
} from '../core/trait-filters.js';
import { listColumns, reasonlessScores } from '../core/list-payload.js';
import { actionPriority } from '@maioun/shared';
import type { InValue } from '@libsql/client';
import type { Database } from './client.js';
import type { VanishRate } from '../scheduler/scheduler.js';
import type { CacheEntry, HttpCacheStore } from '../core/http-client.js';
import type { GeocodeCacheStore } from '../core/geocode.js';
import type { DpeCacheStore } from '../core/dpe.js';
import type { TransitCacheStore } from '../core/transit.js';

/** Instruction SQL prête pour `db.batch`. */
type Statement = { sql: string; args: InValue[] };

/**
 * À partir de combien d'annonces découvertes au MÊME instant chez la MÊME
 * source on tient l'arrivée pour un effet de pagination et non pour du marché.
 * Voir `vanishRates`.
 */
const VANISH_BATCH = 3;

/**
 * Écrit par TRANCHES, dans l'ordre.
 *
 * UN LOT UNIQUE A FAIT TOMBER LA COLLECTE ENTIÈRE, deux fois le 2026-09-11.
 * Depuis que les fiches gardent leur description complète et toutes leurs
 * photos, une fiche pèse 5,8 Ko en moyenne, jusqu'à 17 ; un passage qui en
 * réécrit un millier envoyait plusieurs mégaoctets en une requête, que la base
 * coupe — « fetch failed », sans pile, et le processus s'arrête. Le premier
 * passage complet d'une grosse source en production aurait fait de même.
 *
 * Cent instructions par requête : quelques centaines de kilo-octets. On perd
 * l'atomicité du tout, pas celle de chaque tranche — et chaque ligne est
 * indépendante : une tranche manquée est réécrite au passage suivant.
 */
const BATCH_SLICE = 100;

async function batchInSlices(db: Database, statements: readonly Statement[]): Promise<void> {
  for (let start = 0; start < statements.length; start += BATCH_SLICE) {
    await db.batch([...statements.slice(start, start + BATCH_SLICE)], 'write');
  }
}

/** État antérieur minimal d'une occurrence, pour la détection de changement. */
interface PreviousOccurrence {
  readonly hash: string;
  readonly firstSeenAt: string;
  readonly price: number | null;
  readonly area: number | null;
  readonly availableAt: string | null;
  /** Ce que la base disait d'elle AVANT ce passage — « inactive » si elle avait disparu. */
  readonly lifecycle: string;
}

/**
 * Construit l'instruction d'historique (§31), ou `null` s'il n'y a rien à
 * consigner (annonce connue dont ni loyer, ni surface, ni disponibilité n'ont
 * changé). À la première observation, une ligne « baseline » fixe le point de
 * départ de la trajectoire.
 */
function historyRow(listing: NormalizedListing, change: string): Statement {
  return {
    sql: `INSERT INTO listing_history
            (id, occurrence_id, source_id, source_ref, price, area, available_at, change, recorded_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [
      randomUUID(),
      listing.id,
      listing.sourceId,
      listing.sourceRef,
      listing.price,
      listing.area,
      listing.availableAt,
      change,
      listing.scrapedAt,
    ],
  };
}

/**
 * REVENUE EN LIGNE, et une ligne À PART.
 *
 * Une annonce retirée puis republiée repassait « active » sans un mot : sa
 * première observation est préservée, donc elle ne compte pas comme nouvelle,
 * ne déclenche aucune alerte, et se range au milieu des anciennes. Or c'est
 * souvent le logement qu'on croyait perdu qui revient — une visite annulée, un
 * dossier qui tombe.
 *
 * Sa propre ligne, et non un motif de plus dans la liste des changements :
 * celle-ci se résume à « multiple » dès qu'il y en a deux, et le retour serait
 * reparti avec. Une republication s'accompagne souvent d'une baisse de loyer,
 * c'est-à-dire précisément du cas où les deux comptent.
 */
function reappearanceStatement(
  listing: NormalizedListing,
  previous: PreviousOccurrence | undefined,
): Statement | null {
  if (previous === undefined || previous.lifecycle === 'active') return null;
  return historyRow(listing, 'reappeared');
}

function historyStatement(
  listing: NormalizedListing,
  previous: PreviousOccurrence | undefined,
): Statement | null {
  /**
   * UNE BAISSE QUE LA SOURCE ANNONCE ELLE-MÊME.
   *
   * Le mécanisme ordinaire compare deux collectes : il ne peut donc RIEN dire
   * d'une annonce vue pour la première fois, ni de celles qui n'arrivent que
   * par les digests de portail — précisément celles dont on n'a pas d'historique
   * à comparer. Or SeLoger envoie de vrais messages « Baisse de prix » et y
   * barre l'ancien montant : l'information est là, dès la première rencontre.
   *
   * On l'inscrit donc comme une baisse plutôt que comme un simple point de
   * départ. Le badge « Prix en baisse » et la mise en avant en découlent sans
   * une ligne de plus — ils lisent déjà cet historique.
   */
  const annonceeEnBaisse =
    listing.previousPrice !== null &&
    listing.price !== null &&
    listing.previousPrice > listing.price;

  let change: string;
  if (previous === undefined) {
    change = annonceeEnBaisse ? 'price-drop' : 'baseline';
  } else {
    const changed: string[] = [];
    if (previous.price !== listing.price) {
      // Distinguer baisse et hausse : une baisse est un signal d'opportunité
      // (§17), directement requêtable pour la mise en avant.
      const bothKnown = previous.price !== null && listing.price !== null;
      changed.push(bothKnown && listing.price < previous.price ? 'price-drop' : 'price-rise');
    }
    if (previous.area !== listing.area) changed.push('area');
    if (previous.availableAt !== listing.availableAt) changed.push('availability');
    if (changed.length === 0) return null;
    change = changed.length === 1 ? (changed[0] as string) : 'multiple';
  }

  return historyRow(listing, change);
}

/** Empreinte stable des champs métier d'une occurrence. */
export function occurrenceHash(listing: NormalizedListing): string {
  // Volontairement limité aux champs dont un changement mérite une écriture :
  // `lastSeenAt` et `scrapedAt` en sont exclus, sans quoi tout changerait à
  // chaque run et l'optimisation n'aurait plus aucun effet.
  const material = JSON.stringify([
    listing.title,
    listing.description,
    listing.price,
    listing.charges,
    /**
     * CE QUE LE LOYER COMPREND décide du loyer retenu : `rentAllIn` et
     * `rentForBudget` n'en disent rien sans lui. Hors de l'empreinte, une
     * occurrence dont seule cette mention change était jugée identique, et la
     * colonne gardait sa vieille valeur — la collecte ne touchait que sa date.
     *
     * Rentumo publie ses loyers HORS CHARGES et le dit depuis le 2026-09-16 ;
     * treize annonces actives portaient encore « inconnu » le 2026-09-18, dont
     * quatre dont le loyer retenu était trop bas, et une qui tenait à tort dans
     * un budget de 700 € (670 € au lieu de 710 €).
     *
     * Omise quand inconnue, comme le GES et la référence : les occurrences dont
     * la source ne dit rien gardent leur empreinte ; celles qui portent la
     * mention sont réécrites une fois, au prochain passage.
     */
    ...(listing.chargesIncluded !== null ? [`cc:${listing.chargesIncluded}`] : []),
    listing.area,
    listing.rooms,
    // Les CHAMBRES s'affichent, donc elles entrent ici. Omises quand inconnues :
    // sans cela, l'arrivée du champ réécrirait tout le stock d'un coup. Zéro est
    // une valeur — un studio a zéro chambre.
    ...(listing.bedrooms !== null ? [`ch:${listing.bedrooms}`] : []),
    listing.propertyType,
    listing.furnished,
    listing.flatShare,
    listing.dpe,
    // Omis quand inconnu, comme le depot : sans cela, l'arrivee du GES
    // changerait l'empreinte des 3 795 occurrences actives d'un coup.
    ...(listing.ges !== null ? [`ges:${listing.ges}`] : []),
    // Le loyer precedent ANNONCE par la source : il apparait le jour ou le
    // portail signale la baisse, et rien d'autre ne change ce jour-la. Sans lui
    // ici, l'occurrence serait jugee inchangee et la baisse jamais consignee.
    listing.previousPrice,
    listing.maxOccupants,
    listing.features,
    // Réversible : un « complet » qui rouvre doit réécrire l'occurrence. Omis
    // quand inconnu, pour ne pas changer l'empreinte de tout le stock.
    ...(listing.applicationStatus != null ? [listing.applicationStatus] : []),
    // Même raison : omis quand inconnus.
    ...(listing.deposit !== null ? [`deposit:${listing.deposit}`] : []),
    ...(listing.tenantFees !== null ? [`fees:${listing.tenantFees}`] : []),
    // Omise quand absente, comme le GES : sans cela, l'arrivée du champ
    // changerait l'empreinte de tout le stock d'un coup. Dans l'empreinte tout
    // de même, sinon une vidéo ajoutée après coup ne descendrait jamais.
    ...(listing.videoUrl !== null ? [`video:${listing.videoUrl}`] : []),
    listing.address,
    listing.city,
    listing.postalCode,
    listing.latitude,
    listing.longitude,
    listing.contact.phone,
    listing.contact.email,
    listing.contact.agencyName,
    /**
     * LA RÉFÉRENCE MANQUAIT ICI, et c'est ce qui rendait sa correction
     * impossible. Elle s'affiche sur la fiche — c'est le numéro qu'on cite au
     * téléphone — mais hors de l'empreinte, une occurrence dont seule la
     * référence change est jugée identique : la collecte ne touche que sa date
     * de dernière observation et repart. Les 87 fiches BEP qui annonçaient un
     * numéro tiré de leur URL auraient pu être recollectées indéfiniment sans
     * jamais en changer.
     *
     * Omise quand inconnue, comme le GES et le dépôt : les 692 occurrences
     * actives dont la source ne publie rien gardent ainsi leur empreinte. Les
     * 3 400 qui en portent une seront réécrites au prochain passage, une fois,
     * et c'est le prix de l'entrée dans l'empreinte.
     */
    ...(listing.contact.reference !== null ? [`ref:${listing.contact.reference}`] : []),
    listing.publishedAt,
    listing.availableAt,
    listing.imageUrls,
  ]);
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/** Empreinte d'une fiche agrégée et scorée. */
export function listingHash(listing: ScoredListing): string {
  const material = JSON.stringify([
    listing.price.value,
    listing.area.value,
    listing.rooms.value,
    listing.city.value,
    listing.title.value,
    listing.lifecycle,
    listing.tracking,
    listing.occurrences.map((o) => o.id).sort(),
    listing.scores.match.value,
    listing.scores.opportunity.value,
    listing.scores.visitProbability.value,
    listing.scores.risk.value,
    // Distances et baisse de prix : données dérivées affichées. Les inclure
    // garantit qu'une fiche est réécrite une fois quand elles apparaissent
    // (ex. adresse enfin géocodée), sans churn ensuite car elles sont stables.
    listing.distances.map((d) => `${d.label}:${d.durationMinutes}`).sort(),
    listing.priceDropped,
    listing.reappeared,
    // Contenu du payload affiché : sans ces champs dans le hash, une fiche
    // dont les photos, le DPE ou la description apparaissent après coup ne
    // serait JAMAIS réécrite (l'économie d'écriture § 30 deviendrait une perte
    // de données). Champs stables entre deux collectes → pas de churn.
    //
    // LA LISTE ÉTAIT INCOMPLÈTE, et le manque coûtait. Le montant des charges a
    // été retrouvé sur 131 occurrences en relisant leur description ; il n'a
    // atteint que 44 fiches, parce qu'il ne figurait pas ici — la fiche était
    // jugée « inchangée » et jamais réécrite. Même chose pour la colocation, le
    // quartier, le meublé, la disponibilité et le téléphone : tous s'affichent,
    // tous peuvent apparaître après coup. La règle est simple — CE QUI
    // S'AFFICHE DOIT ÊTRE DANS LE HASH.
    listing.imageUrls.length,
    listing.imageUrls[0] ?? null,
    listing.dpe.value,
    // Le GES s'affiche à côté du DPE, donc il est ici. Omis quand inconnu :
    // seules les fiches qui en gagnent un seront réécrites, une fois.
    ...(listing.ges.value !== null ? [`ges:${listing.ges.value}`] : []),
    listing.maxOccupants.value,
    // Même règle, côté fiche : omises quand inconnues, seules celles qui en
    // gagnent une sont réécrites.
    ...(listing.bedrooms.value !== null ? [`ch:${listing.bedrooms.value}`] : []),
    listing.features,
    ...(listing.applicationStatus != null ? [listing.applicationStatus] : []),
    // Les conditions du bailleur s'affichent — encart de fiche, badge de carte
    // — donc elles sont ici. Elles apparaissent presque toujours APRÈS COUP :
    // la description arrive tronquée de sa source, et c'est la visite de la
    // fiche qui la complète. Sans cette ligne, l'annonce serait jugée
    // inchangée, et la phrase de critères ne remonterait jamais à l'écran.
    listing.requirements,
    listing.description.value,
    listing.charges.value,
    // Affichés avec le loyer ; omis quand inconnus, pour ne pas réécrire tout
    // le stock — seules les fiches qui les portent le seront, une fois.
    ...(listing.chargesIncluded !== null ? [`cc:${listing.chargesIncluded}`] : []),
    ...(listing.deposit.value !== null ? [`deposit:${listing.deposit.value}`] : []),
    ...(listing.tenantFees.value !== null ? [`fees:${listing.tenantFees.value}`] : []),
    listing.flatShare.value,
    listing.furnished.value,
    // Le caractère étudiant et la nature du bailleur SE FILTRENT désormais en
    // direct depuis leurs propres colonnes. Sans eux ici, une fiche dont le
    // texte révèle un bail étudiant après coup ne serait jamais réécrite : la
    // colonne resterait nulle, et le filtre la laisserait passer à tort.
    listing.studentOnly,
    listing.contact.kind,
    listing.district.value,
    // LA FORME CANONIQUE EN PLUS DE LA BRUTE, et ce n'est pas une redondance :
    // elle a sa propre colonne, sur laquelle la liste filtre. Le jour ou une
    // graphie s'ajoute a la table des quartiers — « OUEST MADELEINE » range
    // sous Madeleine —, le texte de la source, lui, n'a pas bouge : sans cette
    // ligne, la fiche serait jugee inchangee et la colonne resterait fausse.
    canonicalDistrict(listing.district.value),
    listing.availableAt.value,
    listing.contact.phone,
    // Coordonnées : sans elles dans le hash, une fiche enfin géocodée ne serait
    // jamais réécrite → absente de la vue carte (§ 30 vs perte de données).
    listing.latitude.value,
    listing.longitude.value,
    listing.address.value,
    // Le type écarte parkings et locaux de la liste : un box reclassé restait
    // « appartement » à l'écran (relevé du 2026-09-15). Toujours présent : l'omettre
    // pour un type laisserait inchangée l'empreinte d'une fiche qui y revient.
    listing.propertyType.value,
  ]);
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * Un booléen « peut-être », rendu tel quel à SQLite.
 *
 * `null` RESTE `null`, et c'est essentiel : les filtres de la liste ne
 * l'écartent jamais (§17). Le convertir en 0 changerait « on ne sait pas » en
 * « non », et ferait disparaître des annonces sur une information que la
 * source n'a jamais donnée.
 */
const boolToInt = (value: boolean | null): number | null => (value === null ? null : value ? 1 : 0);

export interface UpsertReport {
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Fiches orphelines supprimées après fusion — absent si aucune. */
  readonly removed?: number;
}

/** Un point de l'historique de l'inventaire (§33). */
export interface DailyStat {
  readonly day: string;
  readonly matching: number;
  readonly uncertain: number;
  readonly rented: number;
  readonly total: number;
  readonly activeSources: number;
}

/**
 * Les champs dont la disparition SOUDAINE trahit un gabarit qui a changé.
 *
 * Trois, et pas quinze : ce sont ceux qu'une agence publie toujours quand elle
 * publie quelque chose. Un DPE ou une date de disponibilité manquent chez la
 * moitié des sources en régime normal — leur absence n'apprendrait rien.
 */
export type WatchedField = 'phone' | 'price' | 'photo';

/** Combien d'annonces portaient le champ, sur combien. */
export interface FieldFill {
  readonly total: number;
  readonly filled: number;
}

/** Comment se lit « le champ est là », colonne par colonne. */
const WATCHED_FIELD_SQL: readonly (readonly [WatchedField, string])[] = [
  ['phone', "contact_phone IS NOT NULL AND contact_phone != ''"],
  ['price', 'price IS NOT NULL'],
  ['photo', "json_array_length(json_extract(payload, '$.imageUrls')) > 0"],
];

/** Le passé récent d'une source, tel que la surveillance le lit. */
export interface SourceObservation {
  readonly sourceId: string;
  /** Annonces neuves par journée (clé `AAAA-MM-JJ`). */
  readonly newByDay: ReadonlyMap<string, number>;
  /** Raisons d'arrêt des derniers passages, du plus ANCIEN au plus récent. */
  readonly stopReasons: readonly string[];
  /**
   * Occurrences vivantes aujourd'hui.
   *
   * C'est CE CHIFFRE qui sépare l'agence en panne de l'agence qui n'a rien à
   * louer : trente sources n'ont aucune annonce active, et elles vont très
   * bien.
   */
  readonly activeCount: number;
  /** Remplissage de chaque champ surveillé, avant et depuis la coupure. */
  readonly fields: ReadonlyMap<WatchedField, { older: FieldFill; recent: FieldFill }>;
}

export interface Repository {
  /**
   * Fait vieillir les annonces d'une source qui ne les re-liste jamais (§32).
   * Le temps écoulé remplace le décompte d'absences, qui n'a pas de sens ici.
   */
  readonly expireByAge: (
    sourceId: string,
    thresholds: { possiblyInactiveAfterDays: number; inactiveAfterDays: number },
  ) => Promise<number>;

  /**
   * QUAND LE CORPUS A ÉTÉ REGROUPÉ POUR LA DERNIÈRE FOIS — et rien d'autre.
   *
   * Le regroupement relit tout le corpus vivant à chaque passage, quatre-vingt-
   * seize fois par jour, alors que quatre passages sur cinq n'ont rien vu
   * naître. Il se saute donc quand rien n'a bougé, et cette date borne le
   * calme : les scores vieillissent avec l'horloge, pas seulement avec les
   * annonces.
   */
  readonly regroupedAt: () => Promise<string | null>;
  readonly markRegrouped: (nowIso: string) => Promise<void>;

  /**
   * ÉTEINT LES ANNONCES RELAYÉES DONT LA SOURCE D'ORIGINE A RETIRÉ LA SIENNE.
   *
   * Une alerte e-mail ne se relit jamais : seule l'ancienneté pouvait la
   * retirer, et elle survivait des jours au bien qu'elle annonce. Mais la
   * référence qu'elle porte est celle du PORTAIL — « bienici:apimo-87354095 » —
   * et ce portail est parfois une source à part entière, qui relit son
   * inventaire et sait, elle, quand l'annonce a disparu.
   *
   * MÊME PORTAIL, MÊME IDENTIFIANT : c'est la même annonce, sans marge d'erreur
   * — on ne compare ni prix ni photo, on lit un identifiant. Le rapprochement
   * ordinaire ne peut pas le faire : il ne voit que les occurrences VIVANTES, et
   * l'occurrence directe a justement cessé de l'être. Relevé le 2026-09-16 :
   * trois alertes Bien'ici s'affichaient encore « en ligne » alors que la source
   * Bien'ici avait retiré exactement la même annonce.
   *
   * @param originIds les identifiants de sources réellement déclarés : un
   *   préfixe n'est cru que s'il désigne une source du registre.
   * @returns le nombre d'occurrences éteintes.
   */
  readonly retireRelayedByOrigin: (
    sourceId: string,
    originIds: readonly string[],
  ) => Promise<number>;

  /** Combien d'occurrences vivantes cette source compte aujourd'hui. */
  readonly activeOccurrenceCount: (sourceId: string) => Promise<number>;

  /**
   * Le passé récent de chaque source, pour juger qu'elle va mal.
   *
   * TROIS LECTURES D'UN COUP, et pas une par source : la surveillance regarde
   * deux cent douze sources à chaque passage, et deux cent douze allers-retours
   * coûteraient plus cher que la collecte elle-même.
   *
   * @param recentSince limite entre « ce que la source publiait » et « ce
   *   qu'elle publie depuis » pour la disparition d'un champ.
   * @param passes nombre de derniers passages dont on veut la raison d'arrêt.
   */
  readonly sourceObservations: (
    recentSince: string,
    passes: number,
  ) => Promise<readonly SourceObservation[]>;

  /**
   * Abonnements Web Push d'UN compte (§29).
   *
   * Ils étaient rendus tous ensemble : les alertes calculées pour un compte
   * partaient alors vers les appareils de tout le monde.
   */
  readonly pushSubscriptions: (
    userId: string,
  ) => Promise<readonly { endpoint: string; p256dh: string; auth: string }[]>;
  /** Retire un abonnement périmé — le service de push l'a déclaré mort. */
  readonly removePushSubscription: (endpoint: string) => Promise<void>;

  /**
   * L'adresse d'un compte, SI ELLE A ÉTÉ VÉRIFIÉE — sinon `null`.
   *
   * La vérification n'est pas une formalité ici : une adresse seulement SAISIE
   * peut être celle de quelqu'un d'autre, par faute de frappe ou à dessein.
   * Lui envoyer les annonces qu'un compte suit reviendrait à raconter la
   * recherche de logement d'un inconnu à un inconnu — et à faire de nous
   * l'outil qui l'a envoyée (§26).
   */
  readonly verifiedEmailFor: (userId: string) => Promise<string | null>;

  /**
   * Note ce que le transfert d'alertes d'un compte vient d'apporter (§6).
   *
   * Le compte a posé une règle dans SA boîte et n'a aucun retour : une règle
   * mal filtrée ne produit pas d'erreur, seulement du silence — le même
   * silence qu'un jour sans nouvelle annonce. C'est cette trace qui permet à
   * l'écran de réglages de trancher entre les deux.
   *
   * Les clés sont des JETONS, pas des identifiants de compte : le collecteur
   * ne lit que ce qui est écrit dans l'adresse, et un jeton inconnu ne
   * correspond à personne — la requête ne touche alors aucune ligne.
   */
  readonly recordAlertReception: (countByToken: ReadonlyMap<string, number>) => Promise<void>;

  /**
   * Écrit l'instantané du jour POUR CHAQUE COMPTE (une ligne par jour et par
   * compte, réécrite à chaque passage).
   */
  readonly recordDailyStat: (nowMs?: number) => Promise<void>;
  /** Historique de l'inventaire d'un compte, du plus ancien au plus récent. */
  readonly dailyStats: (userId: string, limit?: number) => Promise<readonly DailyStat[]>;

  /** Références déjà connues pour une source — alimente l'arrêt anticipé (§9). */
  knownRefs(sourceId: SourceId): Promise<Set<string>>;
  upsertOccurrences(listings: readonly NormalizedListing[]): Promise<UpsertReport>;
  allActiveOccurrences(): Promise<NormalizedListing[]>;
  /**
   * Rattrape les fiches ORPHELINES qu'une fusion passée a laissées derrière
   * elle (§14).
   *
   * La purge de `saveListings` épargne toute fiche portant une décision de
   * l'utilisateur — un favori, un archivage, un « contactée ». C'est la bonne
   * règle : elle ne peut pas savoir si cette décision a été recopiée ailleurs.
   * Résultat, une fiche fusionnée AVANT que le transfert d'état n'existe reste
   * en base et s'affiche en doublon.
   *
   * On retrouve ici sa remplaçante par les occurrences que sa charge utile
   * énumère, on lui transmet la décision, puis on supprime la ligne morte. Une
   * orpheline dont les occurrences se sont dispersées sur plusieurs fiches est
   * laissée telle quelle : on ne saurait pas à qui attribuer la décision (§17).
   *
   * @returns le nombre de fiches absorbées.
   */
  absorbOrphanListings(): Promise<number>;
  /**
   * Réaligne l'identifiant des occurrences sur leur clé naturelle
   * `source_id:source_ref` (§68 — rattrapage).
   *
   * Un changement passé du schéma de référence des alertes e-mail a laissé des
   * lignes dont l'`id` porte l'ancienne forme alors que `source_ref` porte la
   * nouvelle. Toute re-collecte de ces annonces échouait alors sur la
   * contrainte d'unicité `(source_id, source_ref)`.
   *
   * Ne touche jamais une ligne dont l'identifiant cible est déjà pris. Le cas
   * est hors d'atteinte tant que `UNIQUE (source_id, source_ref)` tient — d'où
   * l'absence de test dédié — mais la garde coûte une sous-requête et évite
   * qu'un rattrapage écrase une annonce.
   *
   * @returns le nombre d'identifiants réalignés.
   */
  realignOccurrenceIds(): Promise<number>;
  /**
   * Réécrit les champs DÉRIVÉS DU TEXTE d'occurrences déjà en base — adresse et
   * atouts (voir `rederiveFromText`). Sert au rattrapage quand l'extraction
   * s'améliore.
   *
   * Volontairement distinct d'`upsertOccurrences`, qui remet `lifecycle` à
   * `active` et `missing_runs` à zéro : un rattrapage ne doit RESSUSCITER
   * aucune annonce disparue de sa source (§32).
   *
   * @returns le nombre d'occurrences réécrites.
   */
  updateDerivedFields(occurrences: readonly NormalizedListing[]): Promise<number>;
  /** Ids d'occurrences avec une baisse de loyer depuis `sinceIso` (§17, §31). */
  recentPriceDropIds(sinceIso: string): Promise<Set<string>>;
  /** Ids d'occurrences retirées puis republiées depuis `sinceIso`. */
  recentReappearedIds(sinceIso: string): Promise<Set<string>>;
  saveListings(listings: readonly ScoredListing[]): Promise<UpsertReport>;
  /**
   * Retire les fiches dont plus AUCUNE occurrence n'est vivante.
   *
   * @returns le nombre de fiches retirées.
   */
  retireDepartedListings(): Promise<number>;
  /**
   * Range la PERTINENCE d'un lot de fiches pour UN compte.
   *
   * La fiche est commune ; la lecture qu'on en fait ne l'est pas. Sans cette
   * table, la liste d'un second compte serait filtrée sur le budget du
   * premier, et ses notifications aussi.
   *
   * @returns le nombre de lignes réellement écrites.
   */
  saveUserScores(userId: string, listings: readonly ScoredListing[]): Promise<number>;
  /** Les comptes que la collecte doit scorer. */
  scorableUsers(): Promise<string[]>;
  /**
   * Marque « loué » les fiches contenant une occurrence `sourceId:ref`.
   * @returns le nombre de fiches effectivement marquées.
   */
  markRented(sourceId: SourceId, refs: readonly string[]): Promise<number>;
  /**
   * Éteint sur-le-champ les occurrences que leur source dit retirées.
   * @param inactiveAfter seuil d'absences : le compteur y est porté, pour que
   *   le vieillissement ne les ramène pas au doute.
   * @returns le nombre d'occurrences éteintes.
   */
  markWithdrawn(
    sourceId: SourceId,
    refs: readonly string[],
    inactiveAfter: number,
  ): Promise<number>;
  loadSourceState(sourceId: SourceId): Promise<SourceRuntimeState>;
  saveSourceState(state: SourceRuntimeState): Promise<void>;
  recordRun(entry: CollectionRunRecord): Promise<void>;
  /**
   * Élague les journaux : traces d'exécution, historique des changements,
   * événements. Rend le nombre de lignes supprimées.
   */
  pruneLogs(nowMs: number): Promise<number>;

  /**
   * Incrémente le compteur d'absence et fait évoluer le cycle de vie (§32).
   *
   * @returns le nombre d'occurrences qui ont CHANGÉ DE STATUT — et non celles
   *   dont le compteur a monté. Le compteur monte à chaque passage pour toute
   *   annonce non revue ; le statut, lui, ne bouge qu'aux seuils. C'est cette
   *   différence qui dit au passage s'il a de quoi regrouper.
   */
  markMissing(
    sourceId: SourceId,
    seenRefs: ReadonlySet<string>,
    thresholds: LifecycleThresholds,
  ): Promise<number>;
  /**
   * Ce que chaque source perd entre deux passages — la matière du second signal
   * de cadence (voir `scheduler/scheduler.ts`).
   *
   * @param windowDays profondeur d'observation, en jours.
   * @param confirmedAfter absences consécutives à partir desquelles un retrait
   *   est acquis ; c'est `missingRunsBeforeInactive`.
   */
  vanishRates(windowDays: number, confirmedAfter: number): Promise<Map<SourceId, VanishRate>>;
  /**
   * Annonces à signaler : dans les critères, actives, jamais notifiées, et de
   * priorité suffisante (§29). Triées par priorité décroissante.
   */
  /**
   * @param traits Les préférences du compte — colocation, bail étudiant,
   *   bailleur, ameublement. Elles ne sont plus figées dans `matches_criteria`
   *   (elles se décochent, et décocher doit ramener les annonces) : il faut
   *   donc les appliquer ICI aussi, sans quoi l'on signalerait des colocations
   *   que l'écran n'affiche pas — le pire des deux mondes.
   */
  pendingNotifications(
    userId: string,
    minPriority: number,
    traits?: TraitFilters,
  ): Promise<NotifiableListing[]>;
  /**
   * Clés `prix|surface|ville|pièces` des annonces actives issues UNIQUEMENT de
   * sources directes (agences), jamais des alertes e-mail. Sert à taire la
   * notification d'une annonce e-mail dont un équivalent direct — meilleur
   * (téléphone, lien direct, frais) — existe déjà (§29). L'annonce e-mail reste
   * visible sur le site : seule sa notification est supprimée.
   */
  directListingSpecKeys(): Promise<ReadonlySet<string>>;
  /** Marque des annonces comme notifiées, pour ne jamais les re-signaler. */
  markNotified(userId: string, ids: readonly string[]): Promise<void>;

  /**
   * Annonces JUSTE au-dessus des critères, jamais signalées.
   *
   * Elles sont écartées de la liste par un seuil binaire — un euro de trop, et
   * l'annonce disparaît. Or c'est précisément la fourchette où l'on hésite. Le
   * dépassement est renvoyé avec chaque annonce : une notification qui ne dirait
   * pas EN QUOI l'annonce sort des critères ferait croire à une erreur.
   *
   * @param traits Les mêmes préférences que la liste, pour la même raison que
   *   dans `pendingNotifications` : élargir le budget de cinq pour cent n'est
   *   pas rouvrir ce qu'on a exclu. Sans elles, ce canal proposait des
   *   colocations et des locations étudiantes que l'écran n'affiche pas.
   */
  nearMatches(
    userId: string,
    criteria: NearMatchCriteria,
    traits?: TraitFilters,
  ): Promise<NearMatch[]>;

  /**
   * Favoris qui ont DISPARU de leur source, et qu'on n'a pas encore signalés.
   *
   * C'est l'alerte qui manquait le plus : une annonce mise de côté quittait la
   * liste sans un mot, et l'on continuait d'attendre une réponse pour un bien
   * déjà loué.
   *
   * PAS DE PRÉFÉRENCES ICI, ni dans `staleFavorites`, et c'est voulu : un
   * favori a été mis de côté à la main. Le taire parce qu'il ressemble à une
   * colocation reviendrait à corriger l'utilisateur sur son propre choix.
   */
  goneFavorites(userId: string): Promise<NotifiableListing[]>;
  markGoneNotified(userId: string, ids: readonly string[]): Promise<void>;

  /**
   * Favoris jamais contactés, mis de côté il y a plus de `hours` heures.
   *
   * Le marché ne patiente pas : un favori posé lundi et oublié jusqu'à jeudi
   * est, le plus souvent, une occasion manquée faute d'un rappel.
   */
  staleFavorites(userId: string, hours: number): Promise<NotifiableListing[]>;
  markReminded(userId: string, ids: readonly string[]): Promise<void>;
  /**
   * Candidatures qui rouvrent. `noteClosedApplications` retient les annonces
   * déjà signalées à ce compte dont la source vient de fermer les candidatures ;
   * `reopenedApplications` rend celles qui ont rouvert depuis, dans les critères ;
   * `markReopenNotified` efface la trace une fois l'alerte partie.
   *
   * `traits` pour la même raison qu'ailleurs : une annonce signalée avant que
   * l'on coche « exclure les colocations » resterait marquée, et sa réouverture
   * sonnerait pour un logement que la liste ne montre plus.
   */
  noteClosedApplications(userId: string): Promise<void>;
  reopenedApplications(userId: string, traits?: TraitFilters): Promise<NotifiableListing[]>;
  markReopenNotified(userId: string, ids: readonly string[]): Promise<void>;
  /** Annonces revenues en ligne et pas encore signalées à ce compte. */
  reappearedListings(userId: string, traits?: TraitFilters): Promise<NotifiableListing[]>;
  markReappearNotified(userId: string, ids: readonly string[], nowIso: string): Promise<void>;
  /**
   * Annonces pertinentes, actives, dotées d'un e-mail de contact et pour
   * lesquelles aucun brouillon n'a encore été créé (§22). Triées par priorité.
   */
  pendingDrafts(): Promise<DraftableListing[]>;
  /** Marque des annonces « brouillon créé », pour ne pas en recréer. */
  markDrafted(userId: string, ids: readonly string[]): Promise<void>;
  /**
   * Réglage applicatif partagé avec le site (§66), en JSON. `null` si absent :
   * les défauts du projet font alors seule autorité.
   */
  readSetting(key: string): Promise<string | null>;
  /**
   * Le même réglage, pour UN compte donné.
   *
   * `readSetting` lit celui du compte servi par défaut : c'est ce qu'il faut
   * partout où la collecte agit pour elle-même — son cache, ses états de
   * source. Dès qu'elle agit POUR QUELQU'UN, il lui faut celui-là.
   */
  readSettingFor(userId: string, key: string): Promise<string | null>;

  /**
   * Les identifiants declares pour une source PAYEE, tous comptes confondus.
   *
   * TOUS, ET NON CEUX D UN COMPTE : le stock ainsi collecte entre dans la base
   * COMMUNE, comme celui des alertes transferees. Un abonnement suffit donc a
   * servir tout le monde, et rien ne justifierait de collecter la meme source
   * autant de fois qu il y a de comptes.
   *
   * Le secret rendu est encore CHIFFRE : ce module ne connait pas la cle.
   */
  sourceCredentials(sourceId: string): Promise<readonly EncryptedCredential[]>;
  /** Écrit un réglage applicatif, écrasant le précédent. */
  writeSetting(key: string, value: string): Promise<void>;
  /** Le même réglage, écrit pour UN compte donné. */
  writeSettingFor(userId: string, key: string, value: string): Promise<void>;
  /** Bascule le favori d'une annonce. */
  /**
   * Met une fiche en favori POUR LE COMPTE SERVI par défaut.
   *
   * Réservé aux outils en ligne de commande, qui n'agissent que pour lui ;
   * l'API, elle, passe par `listing_user_state` avec l'identifiant de session.
   */
  setListingFavorite(listingId: string, favorite: boolean): Promise<void>;
  /** Passe des annonces au suivi « contactée » pour ce compte. */
  markContacted(userId: string, ids: readonly string[]): Promise<void>;
  httpCache(): HttpCacheStore;
  geocodeCache(): GeocodeCacheStore;
  /** Cache des diagnostics energetiques cherches chez l'ADEME. */
  dpeCache(): DpeCacheStore;
  /**
   * Tient pour VUES des annonces que la source confirme sans les rendre :
   * dernière vue datée, compteur d'absences remis à zéro, statut actif.
   */
  confirmSeen(sourceId: string, refs: readonly string[], nowIso: string): Promise<void>;
  /** Ce que les fiches ont appris, pour toute une source — lu une fois par passage. */
  detailDrafts(sourceId: string): Promise<Map<string, DetailMemoryEntry>>;
  saveDetailDrafts(
    sourceId: string,
    entries: readonly { readonly sourceRef: string; readonly draft: Partial<RawListing> }[],
    nowIso: string,
  ): Promise<void>;
  /** Les références portées par une page de liste à son dernier téléchargement. */
  pageRefs(url: string): Promise<readonly string[] | null>;
  savePageRefs(url: string, refs: readonly string[], nowIso: string): Promise<void>;
  transitCache(): TransitCacheStore;
}

/** Vue légère d'une annonce pour composer une notification. */
export interface NotifiableListing {
  readonly id: string;
  readonly title: string | null;
  readonly price: number | null;
  readonly area: number | null;
  readonly rooms: number | null;
  readonly city: string | null;
  readonly postalCode: string | null;
  /** Adresse de rue si publiée (numéro + voie) — pour un lien Maps précis (§20). */
  readonly address: string | null;
  /** Quartier si publié (ex. Orpi « Madeleine »), à défaut de rue exacte. */
  readonly district: string | null;
  /** Date d'emménagement possible (ISO) si publiée — pour l'afficher (§17, §20). */
  readonly availableAt: string | null;
  readonly actionPriority: number;
  /** URL de la fiche d'origine (première occurrence), si disponible. */
  readonly url: string | null;
  /** Photos (URLs du site d'origine, §11) — 10 au plus, ce qu'une alerte peut porter. */
  readonly photoUrls: readonly string[];
  /** Source de l'occurrence principale (ex. `email-alerts`), pour le dédoublonnage. */
  readonly sourceId: string | null;
  /** Téléphone publié : affiché dans la notif, tappable pour appeler (§21). */
  readonly phone: string | null;
}

/** Annonce éligible à un BROUILLON Gmail : pertinente et dotée d'un e-mail (§22). */
export interface DraftableListing {
  readonly id: string;
  /** Adresse e-mail de contact (destinataire du brouillon). */
  readonly email: string;
  /** Rue publiée (§20), pour situer le logement dans le message. `null` sinon. */
  readonly address: string | null;
  /** Quartier publié (§20), à défaut de rue. `null` sinon. */
  readonly district: string | null;
  /** Vue minimale pour composer le message (structurellement un MessageListing). */
  readonly listing: MessageListing;
}

/**
 * Clé de rapprochement d'une annonce sur ses caractéristiques observables
 * (loyer, surface, ville, pièces). Prix et surface sont arrondis à l'entier
 * pour absorber les écarts d'affichage entre sources (« 16 » vs « 16,4 »).
 * `null` si les signaux fiables manquent — on ne rapproche pas dans le vide (§17).
 */
export function listingSpecKey(
  price: number | null,
  area: number | null,
  city: string | null,
  rooms: number | null,
): string | null {
  if (price === null || area === null || city === null) return null;
  return `${Math.round(price)}|${Math.round(area)}|${city.toLowerCase()}|${rooms ?? '?'}`;
}

/**
 * Clé de REPLI, sans la ville : « loyer|surface|pièces ».
 *
 * Les alertes e-mail ne publient pas toujours la commune ; la clé stricte vaut
 * alors `null` et aucun rapprochement n'était tenté — d'où des notifications en
 * double (même bien vu par une agence ET par le portail). Toutes les sources du
 * projet ne couvrent que l'agglomération niçoise, et cette clé ne sert QU'À
 * taire une notification redondante (jamais à fusionner des fiches, §14) : le
 * risque d'une confusion reste sans conséquence, la fiche restant visible.
 */
export function looseSpecKey(
  price: number | null,
  area: number | null,
  rooms: number | null,
): string | null {
  if (price === null || area === null) return null;
  return `${Math.round(price)}|${Math.round(area)}|${rooms ?? '?'}`;
}

export interface LifecycleThresholds {
  readonly possiblyInactiveAfter: number;
  readonly inactiveAfter: number;
}

export interface CollectionRunRecord {
  readonly id: string;
  readonly sourceId: SourceId;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly requestCount: number;
  readonly pagesFetched: number;
  readonly listingsFound: number;
  readonly listingsNew: number;
  readonly listingsUpdated: number;
  readonly duplicates: number;
  readonly errors: number;
  readonly stopReason: string;
  readonly warnings: readonly string[];
}

/** État par défaut d'une source jamais exécutée. */
function defaultState(sourceId: SourceId): SourceRuntimeState {
  return {
    sourceId,
    health: 'healthy',
    lastRunAt: null,
    lastSuccessAt: null,
    last429At: null,
    lastBlockedAt: null,
    cooldownUntil: null,
    consecutiveErrors: 0,
    lastNewListingCount: 0,
    averageNewListingCount: 0,
  };
}

/**
 * Consigne une décision PERSONNELLE sur une annonce.
 *
 * Ces états — vu, archivé, favori, statut de suivi, alerte envoyée, brouillon
 * écrit — vivent encore dans des colonnes de `listings`, où le reste du code
 * les lit. Ils vivent AUSSI, depuis la migration 19, dans
 * `listing_user_state`, rattachés à un utilisateur : c'est là qu'ils iront le
 * jour où l'application en portera plusieurs, et une fiche partagée ne peut
 * pas garder le favori de l'un pour l'autre.
 *
 * ÉCRIRE AUX DEUX ENDROITS PLUTÔT QUE DE FIGER UNE COPIE : une table remplie
 * une fois par la migration puis laissée de côté aurait divergé dès le
 * lendemain, et la bascule serait partie de données fausses. Le coût est une
 * ligne écrite de plus par CLIC — un favori, un changement de statut : rien
 * au regard des milliers de lignes que lit une collecte (§30).
 */
/**
 * Une ligne de `listings` → l'objet qu'attend le notifieur.
 *
 * EXTRAITE D'UNE SEULE REQUÊTE. Elle vivait dans `pendingNotifications` ; les
 * familles d'alertes ajoutées depuis — favori disparu, rappel de candidature —
 * réclament exactement la même lecture du payload, et la recopier trois fois
 * aurait garanti que les trois divergent.
 */

/**
 * Ce qu'il faut savoir des critères pour juger de la proximité.
 *
 * LES BORNES CHIFFRÉES, TOUTES : chacune a sa marge (`NEAR_MATCH_MARGINS`) et
 * chacune peut être celle qui dépasse. N'en passer que deux revenait à ne
 * savoir relâcher — et surtout à ne savoir NOMMER — que le loyer et la surface.
 * Le plancher de loyer figure ici bien qu'il ne se relâche jamais : sans lui,
 * l'élargissement de la surface laissait entrer les caves.
 */
export interface NearMatchCriteria {
  readonly cities: readonly string[];
  readonly maxPrice: number;
  readonly minArea: number;
  readonly minPrice?: number;
  readonly minRooms?: number;
  readonly maxRooms?: number;
  readonly maxCommuteMinutes?: number;
  readonly availableBy?: string;
}

/** Une annonce proche, et EN QUOI elle dépasse. */
export interface NearMatch extends NotifiableListing {
  /** Phrase reprise dans la notification : « 735 € pour un budget de 700 € ». */
  readonly overshoot: string;
}

export function toNotifiable(row: Record<string, unknown>): NotifiableListing {
  let url: string | null = null;
  let photoUrls: string[] = [];
  let address: string | null = null;
  let district: string | null = null;
  let availableAt: string | null = null;
  let sourceId: string | null = null;
  let phone: string | null = null;
  try {
    const payload = JSON.parse(String(row['payload'] ?? '{}')) as {
      occurrences?: { sourceUrl?: unknown; sourceId?: unknown }[];
      imageUrls?: unknown[];
      address?: { value?: unknown };
      district?: { value?: unknown };
      availableAt?: { value?: unknown };
      contact?: { phone?: unknown };
    };
    const first = payload.occurrences?.[0]?.sourceUrl;
    if (typeof first === 'string') url = first;
    const firstSource = payload.occurrences?.[0]?.sourceId;
    if (typeof firstSource === 'string') sourceId = firstSource;
    if (typeof payload.contact?.phone === 'string') phone = payload.contact.phone;
    photoUrls = (payload.imageUrls ?? [])
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
      .slice(0, 10);
    if (typeof payload.address?.value === 'string') address = payload.address.value;
    if (typeof payload.district?.value === 'string') district = payload.district.value;
    if (typeof payload.availableAt?.value === 'string') availableAt = payload.availableAt.value;
  } catch {
    /* payload illisible : pas d'URL, le reste suffit */
  }
  return {
    id: String(row['id']),
    title: row['title'] === null ? null : String(row['title']),
    price: row['price'] === null ? null : Number(row['price']),
    area: row['area'] === null ? null : Number(row['area']),
    rooms: row['rooms'] === null ? null : Number(row['rooms']),
    city: row['city'] === null ? null : String(row['city']),
    postalCode: row['postal_code'] === null ? null : String(row['postal_code']),
    address,
    district,
    availableAt,
    actionPriority: Number(row['action_priority'] ?? 0),
    url,
    photoUrls,
    sourceId,
    phone,
  };
}

/**
 * Les comptes à scorer, `CURRENT_USER` en tête.
 *
 * Il vient toujours en premier et n'est jamais absent : c'est le sien que la
 * collecte sert, donc le seul à recevoir les temps de trajet réels, et une base
 * dont la table `users` n'est pas encore remplie ne doit pas produire une liste
 * vide — ce serait une collecte qui ne score personne.
 */
async function scorableUserIds(db: Database): Promise<string[]> {
  const result = await db.execute('SELECT id FROM users ORDER BY created_at');
  const ids = result.rows.map((row) => String(row['id']));
  return ids.includes(CURRENT_USER)
    ? [CURRENT_USER, ...ids.filter((id) => id !== CURRENT_USER)]
    : [CURRENT_USER, ...ids];
}

async function recordUserState(
  db: Database,
  userId: string,
  listingIds: readonly string[],
  patch: Readonly<Record<string, string | number | null>>,
): Promise<void> {
  if (listingIds.length === 0) return;
  const columns = Object.keys(patch);
  if (columns.length === 0) return;
  const now = new Date().toISOString();
  // `notified_at` garde sa PREMIÈRE valeur : une annonce re-signalée plus
  // tard ne doit pas remonter l'historique.
  const updates = columns
    .map((column) =>
      column === 'notified_at'
        ? `${column} = COALESCE(listing_user_state.${column}, excluded.${column})`
        : `${column} = excluded.${column}`,
    )
    .concat('updated_at = excluded.updated_at');
  await db.batch(
    listingIds.map((listingId) => ({
      sql: `INSERT INTO listing_user_state (user_id, listing_id, ${columns.join(', ')}, updated_at)
            VALUES (?, ?, ${columns.map(() => '?').join(', ')}, ?)
            ON CONFLICT(user_id, listing_id) DO UPDATE SET ${updates.join(', ')}`,
      args: [userId, listingId, ...columns.map((column) => patch[column] ?? null), now],
    })),
    'write',
  );
}

/**
 * Le trajet LE PLUS COURT vers les adresses de référence, en minutes.
 *
 * Le plus court et non le premier : on en configure plusieurs — travail, gare
 * — et « le plus proche » veut dire proche d'un point qui compte, pas du
 * premier de la liste. `null` quand aucune adresse de référence n'est réglée :
 * le tri par proximité relègue alors ces annonces en fin de liste plutôt que
 * de leur prêter une distance qu'on ignore.
 */
function shortestCommuteMinutes(listing: ScoredListing): number | null {
  const durations = listing.distances.map((distance) => distance.durationMinutes);
  return durations.length === 0 ? null : Math.min(...durations);
}

/**
 * Combien de fiches SANS PHOTO sont proposées à une seconde visite, par source
 * et par cycle.
 *
 * Cinq : assez pour rattraper un retard en quelques jours, assez peu pour qu'une
 * annonce réellement dépourvue de photo ne coûte qu'une poignée de requêtes par
 * passage — le budget d'une agence locale est de deux pages hors découverte.
 */
const REVISIT_PHOTOLESS_PER_RUN = 5;

/** Au-delà de deux semaines sans relecture, une fiche repasse par le parseur. */
const REVISIT_STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const REVISIT_STALE_PER_RUN = 2;

/**
 * L URL de l occurrence qui appartient a l agence destinataire.
 *
 * On compare le DOMAINE de son adresse a celui de chaque lien : c est le seul
 * rapprochement qui ne suppose rien. A defaut de correspondance — l agence
 * ecrit depuis un autre domaine, ce qui arrive — on garde la premiere
 * occurrence, comme avant.
 */
export function occurrenceMatching(
  occurrences: readonly { sourceUrl?: unknown }[] | undefined,
  email: string,
): string | null {
  const list = occurrences ?? [];
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  const root = domain.split('.').slice(-2).join('.');
  for (const occurrence of list) {
    const url = occurrence.sourceUrl;
    if (typeof url !== 'string') continue;
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === domain || host.endsWith('.' + root) || host === root) return url;
  }
  const first = list[0]?.sourceUrl;
  return typeof first === 'string' ? first : null;
}

/** Un identifiant de source, son secret encore chiffre. */
export interface EncryptedCredential {
  readonly userId: string;
  readonly login: string;
  readonly secretEncrypted: string;
}

export function createRepository(db: Database): Repository {
  return {
    async knownRefs(sourceId) {
      const result = await db.execute({
        sql: 'SELECT source_ref FROM occurrences WHERE source_id = ?',
        args: [sourceId],
      });
      const known = new Set(result.rows.map((row) => String(row['source_ref'])));

      /**
       * UNE FICHE SANS PHOTO N'EST PAS « CONNUE » : elle mérite une seconde
       * visite.
       *
       * Les scrapers ne visitent que ce qu'ils ne connaissent pas — c'est ce qui
       * les rend économes (§30). Mais cela fige aussi les fiches dans l'état où
       * l'extraction se trouvait le jour de leur collecte : quand un parseur
       * s'améliore, le passé ne le voit jamais.
       *
       * Relevé le 2026-09-07 sur Giletta : la fiche en base n'avait AUCUNE
       * photo, alors que la page en publie vingt-huit et que le parseur les lit
       * toutes aujourd'hui. Le correctif — lire `data-src`, la plateforme
       * différant le chargement — était arrivé après la collecte, et rien ne
       * pouvait le rattraper : ni le rejeu, qui ne retélécharge rien, ni la
       * collecte, qui saute les références connues.
       *
       * Même chose pour une fiche sans loyer ni description (Aurus, dont le
       * gabarit n'était pas lu, le 2026-09-14), ou d'un type indéterminé (dix
       * titres « Sommaire » le même jour, dont un local commercial passé pour
       * un logement).
       *
       * LE NOMBRE EST BORNÉ, et il le faut : une annonce que la source publie
       * réellement sans photo serait sinon revisitée à chaque passage, pour
       * rien, indéfiniment. Cinq par source et par cycle rattrapent un retard en
       * quelques jours sans peser sur le budget.
       */
      const photoless = await db.execute({
        sql: `SELECT source_ref FROM occurrences
              WHERE source_id = ? AND lifecycle != 'inactive'
                AND (json_array_length(COALESCE(json_extract(payload, '$.imageUrls'), '[]')) = 0
                  OR price IS NULL
                  OR property_type IN ('other', 'unknown')
                  OR COALESCE(json_extract(payload, '$.description'), '') = '')
              ORDER BY scraped_at ASC
              LIMIT ?`,
        args: [sourceId, REVISIT_PHOTOLESS_PER_RUN],
      });
      for (const row of photoless.rows) known.delete(String(row['source_ref']));

      /**
       * LES FICHES ANCIENNES AUSSI, par roulement. Les adaptateurs qui ne passent
       * pas par la mémoire des fiches (La Boîte Immo notamment) ne relisaient
       * jamais une annonce connue : relevé du 2026-09-15, dépôt de garantie à 0 %
       * en base chez AA Gestion ou Murta quand leurs pages le donnent toutes, lu
       * par un parseur corrigé depuis. Deux par source et par cycle, les plus
       * anciennes d'abord : tout le stock repasse par le parseur du jour.
       */
      const stale = await db.execute({
        sql: `SELECT source_ref FROM occurrences
              WHERE source_id = ? AND lifecycle != 'inactive' AND scraped_at < ?
              ORDER BY scraped_at ASC
              LIMIT ?`,
        args: [
          sourceId,
          new Date(Date.now() - REVISIT_STALE_AFTER_MS).toISOString(),
          REVISIT_STALE_PER_RUN,
        ],
      });
      for (const row of stale.rows) known.delete(String(row['source_ref']));

      return known;
    },

    async upsertOccurrences(listings) {
      if (listings.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

      // Une seule lecture pour tout le lot : on récupère les empreintes
      // existantes afin de décider quoi écrire (§30).
      const ids = listings.map((listing) => listing.id);
      const placeholders = ids.map(() => '?').join(',');
      const existing = await db.execute({
        sql: `SELECT id, content_hash, first_seen_at, price, area, available_at, lifecycle
              FROM occurrences WHERE id IN (${placeholders})`,
        args: ids,
      });

      const known = new Map(
        existing.rows.map((row) => [
          String(row['id']),
          {
            hash: String(row['content_hash']),
            firstSeenAt: String(row['first_seen_at']),
            price: row['price'] === null ? null : Number(row['price']),
            area: row['area'] === null ? null : Number(row['area']),
            availableAt: row['available_at'] === null ? null : String(row['available_at']),
            lifecycle: String(row['lifecycle']),
          },
        ]),
      );

      const inserts: Statement[] = [];
      const touches: string[] = [];
      let inserted = 0;
      let updated = 0;

      for (const listing of listings) {
        const hash = occurrenceHash(listing);
        const previous = known.get(listing.id);

        if (previous !== undefined && previous.hash === hash) {
          // UNE REPUBLICATION EST SOUVENT À L'IDENTIQUE, et ce raccourci la
          // rendait donc invisible : rien n'était consigné, seule la date de
          // dernière observation bougeait. On garde le raccourci — la fiche n'a
          // rien à réécrire — mais le retour, lui, s'inscrit.
          const retour = reappearanceStatement(listing, previous);
          if (retour !== null) inserts.push(retour);
          // Annonce identique : on ne réécrit rien d'autre que la date de
          // dernière observation, groupée plus bas en une seule requête.
          touches.push(listing.id);
          continue;
        }

        // §31 : consigner l'historique — baseline à la 1re observation, puis
        // uniquement quand loyer / surface / disponibilité changent.
        const retour = reappearanceStatement(listing, previous);
        if (retour !== null) inserts.push(retour);
        const changement = historyStatement(listing, previous);
        if (changement !== null) inserts.push(changement);

        if (previous === undefined) inserted += 1;
        else updated += 1;

        const payload = JSON.stringify(occurrencePayload(listing));

        inserts.push({
          sql: `
            INSERT INTO occurrences (
              id, source_id, source_ref, source_url, title, price, charges, charges_included,
              area, rooms, bedrooms, property_type, furnished, flat_share, city, postal_code,
              address, latitude, longitude, contact_phone, contact_email, contact_agency,
              contact_reference, published_at, available_at, first_seen_at, last_seen_at,
              scraped_at, lifecycle, payload, content_hash, missing_runs
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
            ON CONFLICT(source_id, source_ref) DO UPDATE SET
              -- L'identifiant est DÉRIVÉ de la clé naturelle. Viser cette
              -- dernière plutôt que lui rend l'écriture insensible à un
              -- changement de schéma d'identifiant : la ligne existante est
              -- retrouvée et son id remis d'aplomb, là où viser l'identifiant
              -- tentait une insertion et violait la contrainte d'unicité.
              id = excluded.id,
              source_url = excluded.source_url,
              title = excluded.title,
              price = excluded.price,
              charges = excluded.charges,
              charges_included = excluded.charges_included,
              area = excluded.area,
              rooms = excluded.rooms,
              bedrooms = excluded.bedrooms,
              property_type = excluded.property_type,
              furnished = excluded.furnished,
              flat_share = excluded.flat_share,
              city = excluded.city,
              postal_code = excluded.postal_code,
              address = excluded.address,
              latitude = excluded.latitude,
              longitude = excluded.longitude,
              contact_phone = excluded.contact_phone,
              contact_email = excluded.contact_email,
              contact_agency = excluded.contact_agency,
              contact_reference = excluded.contact_reference,
              published_at = excluded.published_at,
              available_at = excluded.available_at,
              last_seen_at = excluded.last_seen_at,
              scraped_at = excluded.scraped_at,
              lifecycle = 'active',
              payload = excluded.payload,
              content_hash = excluded.content_hash,
              missing_runs = 0
          `,
          args: [
            listing.id,
            listing.sourceId,
            listing.sourceRef,
            listing.sourceUrl,
            listing.title,
            listing.price,
            listing.charges,
            boolToInt(listing.chargesIncluded),
            listing.area,
            listing.rooms,
            listing.bedrooms,
            listing.propertyType,
            boolToInt(listing.furnished),
            boolToInt(listing.flatShare),
            listing.city,
            listing.postalCode,
            listing.address,
            listing.latitude,
            listing.longitude,
            listing.contact.phone,
            listing.contact.email,
            listing.contact.agencyName,
            listing.contact.reference,
            listing.publishedAt,
            listing.availableAt,
            // La date de première observation d'une annonce connue est
            // préservée : elle sert à mesurer la durée de publication (§31).
            previous?.firstSeenAt ?? listing.firstSeenAt,
            listing.lastSeenAt,
            listing.scrapedAt,
            'active',
            payload,
            hash,
          ],
        });
      }

      if (touches.length > 0) {
        const seenAt = listings[0]?.lastSeenAt ?? new Date().toISOString();
        // Relue et inchangée, la fiche l'a quand même été : sans `scraped_at`, la
        // relecture des plus anciennes reprendrait les mêmes à chaque passage.
        const scrapedAt = listings[0]?.scrapedAt ?? seenAt;
        inserts.push({
          sql: `UPDATE occurrences SET last_seen_at = ?, scraped_at = ?, missing_runs = 0,
                  lifecycle = 'active'
                WHERE id IN (${touches.map(() => '?').join(',')})`,
          args: [seenAt, scrapedAt, ...touches],
        });
      }

      await batchInSlices(db, inserts);

      return { inserted, updated, unchanged: touches.length };
    },

    async allActiveOccurrences() {
      const result = await db.execute(
        `SELECT * FROM occurrences WHERE lifecycle IN ('active', 'possiblyInactive')`,
      );
      return result.rows.map(rowToOccurrence);
    },

    async absorbOrphanListings() {
      const orphans = await db.execute(
        `SELECT id, payload FROM listings WHERE ${ORPHAN_PREDICATE}`,
      );
      if (orphans.rows.length === 0) return 0;

      // Le rattachement ACTUEL de chaque occurrence, en UNE lecture. La version
      // précédente interrogeait la base une fois par orpheline : autant
      // d'allers-retours vers Turso, facturés et lents, pour une donnée qui
      // tient en une table (§30).
      const groups = await db.execute(
        `SELECT id, group_id FROM occurrences WHERE group_id IS NOT NULL`,
      );
      const groupByOccurrence = new Map(
        groups.rows.map((row) => [String(row['id']), String(row['group_id'])]),
      );

      // Successeur = la fiche qui porte aujourd'hui les occurrences de
      // l'orpheline, telles que sa charge utile les énumère.
      const predecessors = new Map<string, string[]>();
      for (const row of orphans.rows) {
        const orphanId = String(row['id']);
        const successors = new Set(
          occurrenceIdsOf(row['payload'])
            .map((id) => groupByOccurrence.get(id))
            .filter((id): id is string => id !== undefined && id !== orphanId),
        );
        // Un seul successeur, sinon on ne saurait pas à qui donner la décision.
        const [successor] = successors;
        if (successors.size !== 1 || successor === undefined) continue;
        predecessors.set(successor, [...(predecessors.get(successor) ?? []), orphanId]);
      }

      return inheritUserState(db, predecessors);
    },

    async realignOccurrenceIds() {
      const result = await db.execute(
        `UPDATE occurrences
            SET id = source_id || ':' || source_ref
          WHERE id <> source_id || ':' || source_ref
            AND NOT EXISTS (
              SELECT 1 FROM occurrences other
               WHERE other.id = occurrences.source_id || ':' || occurrences.source_ref
            )`,
      );
      return result.rowsAffected;
    },

    async updateDerivedFields(occurrences) {
      if (occurrences.length === 0) return 0;
      const statements: Statement[] = occurrences.map((listing) => ({
        // Seuls l'adresse, la COMMUNE, le TYPE, la COLOCATION, les CHARGES, les
        // PIÈCES et la charge utile bougent — le DPE voyage dans cette dernière.
        // `flat_share` a sa propre colonne parce que le dédoublonnage et le
        // score la lisent sans ouvrir la charge utile : l'oublier ici aurait
        // rendu la correction invisible là où elle compte.
        //
        // `furnished` ÉTAIT PRÉCISÉMENT DANS CE CAS, et `available_at` l'était
        // aussi — même colonne dédiée, même absence de la charge utile, même
        // oubli ici. Ils ne bougeaient pas : le rejeu
        // annonçait « huit occurrences corrigées » à chaque passage, sans que
        // rien ne change jamais — il relisait la colonne inchangée et
        // recommençait. Une correction qui se répète sans effet est le signe
        // qu'on écrit ailleurs qu'on ne lit.
        // LA COMMUNE MANQUAIT ICI, et c'est ce qui rendait sa correction
        // inatteignable. Elle figure bien dans l'empreinte — donc un changement
        // MÉRITE une écriture — mais la requête du rejeu ne la touchait pas :
        // vingt-trois occurrences gardaient « voir l annonce » quoi qu'on
        // corrige en amont. Les alertes e-mail n'envoient chaque annonce qu'une
        // fois : sans ce rejeu, rien ne les réécrira jamais.
        // LA RÉFÉRENCE ÉTAIT DANS LE MÊME CAS : colonne dédiée, absente de la
        // charge utile, absente d'ici. Le rejeu la corrigeait en mémoire et la
        // base gardait sa valeur — 336 occurrences d'alerte e-mail affichaient
        // ainsi une référence que nous avions composée nous-mêmes.
        // `content_hash` suit, pour que la prochaine collecte ne réécrive pas
        // la ligne pour rien.
        sql: `UPDATE occurrences
              SET address = ?, city = ?, property_type = ?, flat_share = ?, furnished = ?,
                  charges = ?, rooms = ?, available_at = ?, contact_reference = ?,
                  payload = ?, content_hash = ?
              WHERE id = ?`,
        args: [
          listing.address,
          listing.city,
          listing.propertyType,
          listing.flatShare === null ? null : listing.flatShare ? 1 : 0,
          listing.furnished === null ? null : listing.furnished ? 1 : 0,
          listing.charges,
          listing.rooms,
          listing.availableAt,
          listing.contact.reference,
          JSON.stringify(occurrencePayload(listing)),
          occurrenceHash(listing),
          listing.id,
        ],
      }));
      await batchInSlices(db, statements);
      return statements.length;
    },

    async recentReappearedIds(sinceIso) {
      const result = await db.execute({
        sql: `SELECT DISTINCT occurrence_id FROM listing_history
              WHERE change = 'reappeared' AND recorded_at >= ?`,
        args: [sinceIso],
      });
      return new Set(result.rows.map((row) => String(row['occurrence_id'])));
    },

    async recentPriceDropIds(sinceIso) {
      const result = await db.execute({
        sql: `SELECT DISTINCT occurrence_id FROM listing_history
              WHERE change = 'price-drop' AND recorded_at >= ?`,
        args: [sinceIso],
      });
      return new Set(result.rows.map((row) => String(row['occurrence_id'])));
    },

    async saveListings(listings) {
      if (listings.length === 0) return { inserted: 0, updated: 0, unchanged: 0 };

      const ids = listings.map((listing) => listing.id);
      // Deux lectures indépendantes : les mener de front épargne une latence.
      // La seconde répond à « à quelle fiche ces occurrences appartenaient-elles
      // AVANT ce passage ? », question qu'il faut poser maintenant — le
      // rattachement plus bas écrase la réponse, et sans elle une fusion
      // perdrait le suivi porté par la fiche absorbée (voir `inheritUserState`).
      const [existing, predecessors] = await Promise.all([
        db.execute({
          sql: `SELECT id, content_hash FROM listings WHERE id IN (${ids.map(() => '?').join(',')})`,
          args: ids,
        }),
        previousGroups(db, listings),
      ]);
      const known = new Map(
        existing.rows.map((row) => [String(row['id']), String(row['content_hash'])]),
      );

      const statements: Statement[] = [];
      const touches: string[] = [];
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;

      for (const listing of listings) {
        const hash = listingHash(listing);
        const previous = known.get(listing.id);
        if (previous === hash) {
          unchanged += 1;
          touches.push(listing.id);
          continue;
        }
        if (previous === undefined) inserted += 1;
        else updated += 1;

        const serialized = serializeListing(listing);
        const list = listColumns(serialized);
        statements.push({
          sql: `
            INSERT INTO listings (
              id, title, price, area, rooms, property_type, city, postal_code,
              latitude, longitude, published_at, first_seen_at, last_seen_at,
              lifecycle, match_score, opportunity_score, visit_score,
              risk_score, action_priority, matches_criteria, payload, content_hash, updated_at,
              flat_share, student_only, furnished, landlord_kind, commute_minutes,
              available_at, district, list_payload, list_scores, list_hash
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title, price = excluded.price, area = excluded.area,
              rooms = excluded.rooms, property_type = excluded.property_type,
              city = excluded.city, postal_code = excluded.postal_code,
              latitude = excluded.latitude, longitude = excluded.longitude,
              published_at = excluded.published_at, last_seen_at = excluded.last_seen_at,
              lifecycle = excluded.lifecycle,
              match_score = excluded.match_score, opportunity_score = excluded.opportunity_score,
              visit_score = excluded.visit_score, risk_score = excluded.risk_score,
              action_priority = excluded.action_priority,
              matches_criteria = excluded.matches_criteria,
              payload = excluded.payload, content_hash = excluded.content_hash,
              updated_at = excluded.updated_at,
              -- Les traits que la LISTE filtre en direct. Ils doublent ce que
              -- porte le payload, volontairement : une colonne se lit en SQL,
              -- un JSON non (et le caractère étudiant ne s'y trouve nulle part,
              -- il se déduit du texte au scoring).
              flat_share = excluded.flat_share, student_only = excluded.student_only,
              furnished = excluded.furnished, landlord_kind = excluded.landlord_kind,
              commute_minutes = excluded.commute_minutes,
              -- Même raison que les précédentes : on filtre dessus, donc c'est
              -- une colonne. La disponibilité vivait sur l'occurrence et dans
              -- le JSON de la fiche, mais nulle part où une requête la lise.
              available_at = excluded.available_at,
              -- Le SLUG canonique, pas le texte de la source : « PORT » et
              -- « Le Port » désignent le même quartier, et un menu ne peut pas
              -- proposer les deux. Le texte d'origine reste dans la charge
              -- utile, intact (§15).
              district = excluded.district,
              -- La version que la liste recopie, et l'empreinte qui la date :
              -- une fiche réécrite sans elles se reconnaît à la lecture.
              list_payload = excluded.list_payload, list_scores = excluded.list_scores,
              list_hash = excluded.list_hash
          `,
          args: [
            listing.id,
            listing.title.value,
            listing.price.value,
            listing.area.value,
            listing.rooms.value,
            listing.propertyType.value,
            listing.city.value,
            listing.postalCode.value,
            listing.latitude.value,
            listing.longitude.value,
            listing.publishedAt.value,
            listing.firstSeenAt,
            listing.lastSeenAt,
            listing.lifecycle,
            listing.scores.match.value,
            listing.scores.opportunity.value,
            listing.scores.visitProbability.value,
            listing.scores.risk.value,
            actionPriority(listing.scores),
            listing.matchesCriteria ? 1 : 0,
            JSON.stringify(serialized),
            hash,
            new Date().toISOString(),
            boolToInt(listing.flatShare.value),
            listing.studentOnly ? 1 : 0,
            boolToInt(listing.furnished.value),
            listing.contact.kind === 'unknown' ? null : listing.contact.kind,
            shortestCommuteMinutes(listing),
            listing.availableAt.value,
            canonicalDistrict(listing.district.value),
            list.payload,
            list.scores,
            hash,
          ],
        });

        // Rattache les occurrences à leur fiche.
        statements.push({
          sql: `UPDATE occurrences SET group_id = ? WHERE id IN (${listing.occurrences
            .map(() => '?')
            .join(',')})`,
          args: [listing.id, ...listing.occurrences.map((o) => o.id)],
        });
      }

      // LA DATE D'UNE FICHE INCHANGÉE AVANÇAIT QUAND MÊME, côté occurrences,
      // mais pas sur la fiche : elle n'était réécrite que si son contenu
      // changeait. Une annonce republiée à l'identique pendant trois semaines
      // gardait donc la date du dernier changement, et la fiche annonçait
      // ensuite « vue pour la dernière fois » vingt jours trop tôt — au moment
      // précis où cette date décide si l'on se déplace.
      //
      // Une seule requête pour tout le lot, comme pour les occurrences, et
      // jamais en arrière : un passage plus ancien ne rajeunit pas une fiche.
      if (touches.length > 0) {
        const seenAt = listings[0]?.lastSeenAt ?? new Date().toISOString();
        statements.push({
          sql: `UPDATE listings SET last_seen_at = ?
                WHERE id IN (${touches.map(() => '?').join(',')}) AND last_seen_at < ?`,
          args: [seenAt, ...touches, seenAt],
        });
      }

      await batchInSlices(db, statements);

      // La fiche survivante hérite des décisions portées par celles qu'elle
      // absorbe, AVANT la purge : sans quoi soit on efface un « contactée »,
      // soit on garde en base une fiche morte qui ressort en doublon.
      await inheritUserState(db, predecessors);

      // Fiches ORPHELINES : quand deux fiches fusionnent, le groupe survivant
      // reçoit un nouvel identifiant et les occurrences lui sont rattachées —
      // l'ancienne ligne restait en base, plus référencée par rien. Elle
      // continuait d'être comptée et affichée, donc de ressortir en doublon.
      //
      // La suppression ne perd rien : le contenu vit dans la fiche survivante.
      // On épargne toutefois celles qui portent une décision d'un compte
      // (favori, archivage, suivi) — mieux vaut une ligne morte qu'un choix
      // effacé (§14).
      const orphans = await db.execute(`
        DELETE FROM listings
        WHERE ${ORPHAN_PREDICATE}
          AND id NOT IN (${DECIDED_LISTINGS})
      `);
      const removed = orphans.rowsAffected ?? 0;

      return { inserted, updated, unchanged, ...(removed > 0 ? { removed } : {}) };
    },

    /**
     * LA FICHE SURVIVAIT À SES OCCURRENCES, et se montrait après leur mort.
     *
     * Le cycle de vie d'une fiche se déduit de celui de ses occurrences —
     * `mergeGroup` le fait, et bien : toutes inactives, la fiche l'est aussi.
     * Mais le regroupement ne travaille que sur le corpus VIVANT
     * (`allActiveOccurrences`). Une fiche dont la dernière occurrence vient de
     * s'éteindre n'est donc plus jamais revisitée : sa ligne garde le cycle de
     * vie qu'on lui a donné la dernière fois qu'elle avait encore une
     * occurrence active — `active`, le plus souvent. Plus rien ne la retire.
     *
     * MESURÉ LE 2026-09-07 : soixante-quatorze fiches dans ce cas, dont onze
     * passaient les critères et s'affichaient donc dans la liste. Parmi elles,
     * les deux canaux BEP d'un même studio à 650 € — deux lignes pour un
     * logement qui n'était plus à louer depuis six jours. Le doublon se voyait ;
     * la cause était ailleurs.
     *
     * L'ORPHELINAGE NE COUVRAIT PAS CE CAS : il vise les fiches que plus aucune
     * occurrence ne DÉSIGNE, après une fusion. Ici les occurrences désignent
     * toujours leur fiche — elles sont simplement toutes mortes.
     *
     * ON RETIRE, ON N'EFFACE PAS. La fiche garde ses photos, son historique de
     * prix et les décisions prises dessus ; elle sort seulement de la liste,
     * comme n'importe quelle annonce expirée (§32).
     */
    async retireDepartedListings() {
      const result = await db.execute({
        sql: `UPDATE listings SET lifecycle = 'inactive', updated_at = ?
              WHERE lifecycle != 'inactive'
                AND NOT EXISTS (
                  SELECT 1 FROM occurrences
                  WHERE occurrences.group_id = listings.id
                    AND occurrences.lifecycle != 'inactive'
                )`,
        args: [new Date().toISOString()],
      });
      return result.rowsAffected ?? 0;
    },

    async saveUserScores(userId, listings) {
      if (listings.length === 0) return 0;

      /**
       * ON NE SCORE QUE DES FICHES QUI EXISTENT ENCORE.
       *
       * Le regroupement peut faire disparaître une fiche entre le moment où
       * elle est scorée et celui où le score s'écrit : `saveListings` purge les
       * fiches orphelines, celles qu'aucune occurrence ne réclame plus après
       * une fusion. Écrire un score pour l'une d'elles viole la clé étrangère
       * et fait ÉCHOUER LA COLLECTE ENTIÈRE — relevé le 2026-09-09, après une
       * collecte qui avait pourtant abouti à ses 2 594 fiches.
       *
       * Le score d'une fiche supprimée n'a aucun lecteur : l'ignorer ne perd
       * rien, là où l'exception perdait tout le passage.
       */
      const vivantes = await db.execute('SELECT id FROM listings');
      const connues = new Set(vivantes.rows.map((row) => String(row['id'])));
      const listingsVivantes = listings.filter((listing) => connues.has(listing.id));
      if (listingsVivantes.length === 0) return 0;
      listings = listingsVivantes;

      const existing = await db.execute({
        sql: `SELECT listing_id, content_hash FROM listing_user_score WHERE user_id = ?`,
        args: [userId],
      });
      const known = new Map(
        existing.rows.map((row) => [String(row['listing_id']), String(row['content_hash'])]),
      );

      const now = new Date().toISOString();
      const statements: Statement[] = [];
      for (const listing of listings) {
        // MÊME EMPREINTE QUE LA FICHE, plus le compte : ce qui n'a pas bougé
        // n'est pas réécrit. Sans cela, chaque collecte réécrirait toutes les
        // lignes de tous les comptes (§30).
        // Les raisons dépendent des critères du compte, les trajets de ses
        // points : ni les unes ni les autres ne figurent dans l'empreinte de la fiche.
        const scores = JSON.stringify(listing.scores);
        const distances = JSON.stringify(listing.distances);
        const personal = createHash('sha256')
          .update(scores + distances)
          .digest('hex')
          .slice(0, 16);
        const hash = `${listingHash(listing)}:${personal}`;
        if (known.get(listing.id) === hash) continue;
        statements.push({
          sql: `INSERT INTO listing_user_score (
                  user_id, listing_id, matches_criteria, action_priority,
                  match_score, opportunity_score, visit_score, risk_score,
                  commute_minutes, scores, distances, content_hash, updated_at,
                  list_scores, list_hash
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id, listing_id) DO UPDATE SET
                  matches_criteria = excluded.matches_criteria,
                  action_priority = excluded.action_priority,
                  match_score = excluded.match_score,
                  opportunity_score = excluded.opportunity_score,
                  visit_score = excluded.visit_score,
                  risk_score = excluded.risk_score,
                  commute_minutes = excluded.commute_minutes,
                  scores = excluded.scores,
                  distances = excluded.distances,
                  content_hash = excluded.content_hash,
                  updated_at = excluded.updated_at,
                  list_scores = excluded.list_scores,
                  list_hash = excluded.list_hash`,
          args: [
            userId,
            listing.id,
            listing.matchesCriteria ? 1 : 0,
            actionPriority(listing.scores),
            listing.scores.match.value,
            listing.scores.opportunity.value,
            listing.scores.visitProbability.value,
            listing.scores.risk.value,
            shortestCommuteMinutes(listing),
            scores,
            distances,
            hash,
            now,
            reasonlessScores(listing.scores),
            hash,
          ],
        });
      }

      await batchInSlices(db, statements);
      return statements.length;
    },

    async scorableUsers() {
      return scorableUserIds(db);
    },

    async regroupedAt() {
      const result = await db.execute('SELECT last_at FROM regroup_state WHERE id = 1');
      const raw = result.rows[0]?.['last_at'];
      return typeof raw === 'string' ? raw : null;
    },

    async markRegrouped(nowIso) {
      await db.execute({
        sql: `INSERT INTO regroup_state (id, last_at) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET last_at = excluded.last_at`,
        args: [nowIso],
      });
    },

    async expireByAge(sourceId, thresholds) {
      // `last_seen_at` est la dernière fois que la source l'a MENTIONNÉE : pour
      // une annonce annoncée une seule fois, c'est sa date de parution.
      const moved = await db.batch(
        [
          {
            sql: `UPDATE occurrences SET lifecycle = 'possiblyInactive'
                  WHERE source_id = ? AND lifecycle = 'active'
                    AND julianday('now') - julianday(last_seen_at) >= ?`,
            args: [sourceId, thresholds.possiblyInactiveAfterDays],
          },
          {
            sql: `UPDATE occurrences SET lifecycle = 'inactive'
                  WHERE source_id = ? AND lifecycle != 'inactive'
                    AND julianday('now') - julianday(last_seen_at) >= ?`,
            args: [sourceId, thresholds.inactiveAfterDays],
          },
        ],
        'write',
      );
      return moved.reduce((total, result) => total + result.rowsAffected, 0);
    },

    async retireRelayedByOrigin(sourceId, originIds) {
      // Sans source d'origine déclarée, aucun préfixe n'est croyable.
      const origins = [...new Set(originIds)].filter((id) => id !== sourceId && id !== '');
      if (origins.length === 0) return 0;
      const places = origins.map(() => '?').join(',');
      const result = await db.execute({
        // `relais.source_ref` vaut « <source d'origine>:<référence chez elle> ».
        sql: `UPDATE occurrences AS relais SET lifecycle = 'inactive'
              WHERE relais.source_id = ?
                AND relais.lifecycle != 'inactive'
                AND instr(relais.source_ref, ':') > 1
                AND substr(relais.source_ref, 1, instr(relais.source_ref, ':') - 1) IN (${places})
                AND EXISTS (
                  SELECT 1 FROM occurrences AS origine
                   WHERE origine.source_id =
                           substr(relais.source_ref, 1, instr(relais.source_ref, ':') - 1)
                     AND origine.source_ref =
                           substr(relais.source_ref, instr(relais.source_ref, ':') + 1)
                     AND origine.lifecycle = 'inactive')`,
        args: [sourceId, ...origins],
      });
      return result.rowsAffected;
    },

    async activeOccurrenceCount(sourceId) {
      const result = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM occurrences WHERE source_id = ? AND lifecycle != 'inactive'",
        args: [sourceId],
      });
      return Number(result.rows[0]?.['n'] ?? 0);
    },

    async sourceObservations(recentSince, passes) {
      const [daily, reasons, fields] = await db.batch(
        [
          {
            sql: `SELECT source_id AS src, substr(started_at, 1, 10) AS day,
                         SUM(listings_new) AS n
                    FROM collection_runs GROUP BY src, day ORDER BY day`,
            args: [],
          },
          {
            // Les N derniers passages de CHAQUE source. Sans la numérotation
            // par source, un `LIMIT` global ne rendrait que les passages des
            // sources les plus bavardes.
            sql: `SELECT src, stop_reason FROM (
                    SELECT source_id AS src, stop_reason, started_at,
                           ROW_NUMBER() OVER (
                             PARTITION BY source_id ORDER BY started_at DESC
                           ) AS rang
                      FROM collection_runs
                  ) WHERE rang <= ? ORDER BY src, started_at`,
            args: [passes],
          },
          {
            // Les annonces ÉTEINTES comptent dans la référence : ce qu'une
            // source publiait il y a dix jours dit ce qu'elle sait publier,
            // que le bien soit encore libre ou non.
            sql: `SELECT source_id AS src,
                     SUM(CASE WHEN lifecycle != 'inactive' THEN 1 ELSE 0 END) AS actifs,
                     SUM(CASE WHEN first_seen_at > ?1 THEN 1 ELSE 0 END) AS recentN,
                     SUM(CASE WHEN first_seen_at <= ?1 THEN 1 ELSE 0 END) AS olderN,
                     ${WATCHED_FIELD_SQL.map(
                       ([name, predicate]) => `
                     SUM(CASE WHEN first_seen_at > ?1 AND ${predicate} THEN 1 ELSE 0 END)
                       AS recent_${name},
                     SUM(CASE WHEN first_seen_at <= ?1 AND ${predicate} THEN 1 ELSE 0 END)
                       AS older_${name}`,
                     ).join(',')}
                   FROM occurrences GROUP BY src`,
            args: [recentSince],
          },
        ],
        'read',
      );

      interface Accumulator {
        newByDay: Map<string, number>;
        stopReasons: string[];
        activeCount: number;
        fields: Map<WatchedField, { older: FieldFill; recent: FieldFill }>;
      }
      const observations = new Map<string, Accumulator>();
      const of = (sourceId: string): Accumulator => {
        const found = observations.get(sourceId);
        if (found !== undefined) return found;
        const fresh: Accumulator = {
          newByDay: new Map(),
          stopReasons: [],
          activeCount: 0,
          fields: new Map(),
        };
        observations.set(sourceId, fresh);
        return fresh;
      };

      for (const row of daily?.rows ?? []) {
        of(String(row['src'])).newByDay.set(String(row['day']), Number(row['n'] ?? 0));
      }
      for (const row of reasons?.rows ?? []) {
        of(String(row['src'])).stopReasons.push(String(row['stop_reason']));
      }
      for (const row of fields?.rows ?? []) {
        const entry = of(String(row['src']));
        entry.activeCount = Number(row['actifs'] ?? 0);
        const recentTotal = Number(row['recentN'] ?? 0);
        const olderTotal = Number(row['olderN'] ?? 0);
        for (const [name] of WATCHED_FIELD_SQL) {
          entry.fields.set(name, {
            recent: { total: recentTotal, filled: Number(row[`recent_${name}`] ?? 0) },
            older: { total: olderTotal, filled: Number(row[`older_${name}`] ?? 0) },
          });
        }
      }

      return [...observations].map(([sourceId, entry]) => ({ sourceId, ...entry }));
    },

    /**
     * LES ABONNEMENTS D'UN COMPTE — et d'aucun autre.
     *
     * Sans ce filtre, l'envoi prenait TOUS les abonnements : un second compte
     * recevait des notifications calculées sur le budget, la surface et les
     * quartiers de quelqu'un d'autre.
     *
     * La collecte n'est plus mono-compte : elle score chaque utilisateur avec
     * SES critères (`listing_user_score`) et notifie chacun séparément. Ce
     * filtre n'est donc plus un pis-aller — c'est la clause qui rend l'envoi
     * personnel.
     */
    async pushSubscriptions(userId) {
      const result = await db.execute({
        sql: 'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ? ORDER BY created_at',
        args: [userId],
      });
      return result.rows.map((row) => ({
        endpoint: String(row['endpoint']),
        p256dh: String(row['p256dh']),
        auth: String(row['auth']),
      }));
    },

    async removePushSubscription(endpoint) {
      await db.execute({
        sql: 'DELETE FROM push_subscriptions WHERE endpoint = ?',
        args: [endpoint],
      });
    },

    async verifiedEmailFor(userId) {
      const result = await db.execute({
        // `email_verified = 1` DANS LA REQUÊTE, et non chez l'appelant : c'est
        // la condition qui protège quelqu'un dont l'adresse a été saisie de
        // travers. Laissée au dehors, elle finit par être oubliée par le
        // deuxième appelant.
        sql: "SELECT email FROM users WHERE id = ? AND email_verified = 1 AND email != ''",
        args: [userId],
      });
      const row = result.rows[0];
      return row === undefined ? null : String(row['email']);
    },

    async recordAlertReception(countByToken) {
      const now = new Date().toISOString();
      for (const [token, count] of countByToken) {
        // Le cumul s'incrémente, l'horodatage se remplace : « combien depuis
        // toujours » et « est-ce que ça marche encore » sont deux questions.
        await db.execute({
          sql: `UPDATE users
                SET alert_last_received_at = ?,
                    alert_received_count = alert_received_count + ?
                WHERE alert_token = ?`,
          args: [now, count, token],
        });
      }
    },

    /**
     * L'INSTANTANÉ DU JOUR, UNE LIGNE PAR COMPTE.
     *
     * « 42 annonces pertinentes » n'a de sens que pour quelqu'un : c'est un
     * budget, une surface, des quartiers. Le décompte se lisait sur
     * `listings.matches_criteria`, calculé pour le seul compte que sert la
     * collecte ; la page Statistiques d'un second compte affichait donc la
     * courbe du premier, sans que rien ne le trahisse — une courbe est toujours
     * vraisemblable.
     *
     * `total` et `active_sources` décrivent le marché et la collecte : ils sont
     * les mêmes pour tout le monde, et recopiés tels quels sur chaque ligne.
     */
    async recordDailyStat(nowMs = Date.now()) {
      const day = new Date(nowMs).toISOString().slice(0, 10);
      const now = new Date(nowMs).toISOString();

      // QUI A BESOIN D'UN RECALCUL, et personne le plus souvent. Le reste de
      // cette méthode balaie les occurrences puis les annonces, une fois par
      // utilisateur — et le faisait à CHAQUE réveil, soit quatre-vingt-seize
      // fois par jour, pour réécrire une statistique JOURNALIÈRE sur la même
      // ligne. C'est ce genre de dépense qui a épuisé le quota de lectures de
      // Turso le 24 septembre 2026. Une heure de retard sur une courbe
      // quotidienne ne se voit pas ; son coût, si.
      const candidats: string[] = [];
      for (const userId of await scorableUserIds(db)) {
        const row = (
          await db.execute({
            sql: 'SELECT recorded_at FROM daily_stats WHERE user_id = ? AND day = ?',
            args: [userId, day],
          })
        ).rows[0];
        const releve = row === undefined ? Number.NaN : Date.parse(String(row['recorded_at']));
        // Pas de ligne, ou date illisible : on recalcule. Le jour doit avoir la
        // sienne, et un instantané manquant n'est pas reconstituable après coup.
        if (!Number.isFinite(releve) || nowMs - releve >= DAILY_STAT_MAX_AGE_MS) {
          candidats.push(userId);
        }
      }
      if (candidats.length === 0) return;

      const sources = (
        await db.execute(
          "SELECT COUNT(DISTINCT source_id) AS n FROM occurrences WHERE lifecycle = 'active'",
        )
      ).rows[0];

      const statements: { sql: string; args: (string | number)[] }[] = [];
      for (const userId of candidats) {
        const row = (
          await db.execute({
            sql: `SELECT
                    SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND lifecycle = 'active'
                              AND COALESCE(us.archived, 0) = 0 AND rented = 0
                             THEN 1 ELSE 0 END) AS matching,
                    SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1
                              AND lifecycle = 'possiblyInactive'
                              AND COALESCE(us.archived, 0) = 0 AND rented = 0
                             THEN 1 ELSE 0 END) AS uncertain,
                    SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND rented = 1
                             THEN 1 ELSE 0 END) AS rented,
                    COUNT(*) AS total
                  FROM listings
                  LEFT JOIN listing_user_score sc
                    ON sc.listing_id = listings.id AND sc.user_id = ?
                  LEFT JOIN listing_user_state us
                    ON us.listing_id = listings.id AND us.user_id = ?`,
            args: [userId, userId],
          })
        ).rows[0];

        statements.push({
          sql: `INSERT INTO daily_stats (user_id, day, matching, uncertain, rented, total, active_sources, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, day) DO UPDATE SET
                  matching = excluded.matching, uncertain = excluded.uncertain,
                  rented = excluded.rented, total = excluded.total,
                  active_sources = excluded.active_sources, recorded_at = excluded.recorded_at`,
          args: [
            userId,
            day,
            Number(row?.['matching'] ?? 0),
            Number(row?.['uncertain'] ?? 0),
            Number(row?.['rented'] ?? 0),
            Number(row?.['total'] ?? 0),
            Number(sources?.['n'] ?? 0),
            now,
          ],
        });
      }

      if (statements.length > 0) await db.batch(statements, 'write');
    },

    async dailyStats(userId, limit = 90) {
      const result = await db.execute({
        sql: 'SELECT * FROM daily_stats WHERE user_id = ? ORDER BY day DESC LIMIT ?',
        args: [userId, limit],
      });
      return result.rows
        .map((r) => ({
          day: String(r['day']),
          matching: Number(r['matching']),
          uncertain: Number(r['uncertain']),
          rented: Number(r['rented']),
          total: Number(r['total']),
          activeSources: Number(r['active_sources']),
        }))
        .reverse();
    },

    async markRented(sourceId, refs) {
      if (refs.length === 0) return 0;
      const placeholders = refs.map(() => '?').join(',');
      // La fiche est reliée à ses occurrences par `group_id`. On marque « loué »
      // toute fiche possédant une occurrence `sourceId:ref` signalée.
      const result = await db.execute({
        sql: `UPDATE listings SET rented = 1, updated_at = ?
              WHERE rented = 0 AND id IN (
                SELECT group_id FROM occurrences
                WHERE source_id = ? AND source_ref IN (${placeholders}) AND group_id IS NOT NULL
              )`,
        args: [new Date().toISOString(), sourceId, ...refs],
      });
      return result.rowsAffected;
    },

    async markWithdrawn(sourceId, refs, inactiveAfter) {
      if (refs.length === 0) return 0;
      const result = await db.execute({
        sql: `UPDATE occurrences SET lifecycle = 'inactive', missing_runs = MAX(missing_runs, ?)
              WHERE source_id = ? AND lifecycle != 'inactive'
                AND source_ref IN (${refs.map(() => '?').join(',')})`,
        args: [inactiveAfter, sourceId, ...refs],
      });
      return result.rowsAffected;
    },

    async loadSourceState(sourceId) {
      const result = await db.execute({
        sql: 'SELECT * FROM source_state WHERE source_id = ?',
        args: [sourceId],
      });
      const row = result.rows[0];
      if (row === undefined) return defaultState(sourceId);

      const text = (key: string): string | null => {
        const value = row[key];
        return value === null || value === undefined ? null : String(value);
      };

      return {
        sourceId,
        health: (text('health') ?? 'healthy') as SourceRuntimeState['health'],
        lastRunAt: text('last_run_at'),
        lastSuccessAt: text('last_success_at'),
        last429At: text('last_429_at'),
        lastBlockedAt: text('last_blocked_at'),
        cooldownUntil: text('cooldown_until'),
        consecutiveErrors: Number(row['consecutive_errors'] ?? 0),
        lastNewListingCount: Number(row['last_new_listing_count'] ?? 0),
        averageNewListingCount: Number(row['average_new_listing_count'] ?? 0),
        lastFullPassAt: text('last_full_pass_at'),
        memo: text('memo'),
      };
    },

    async saveSourceState(state) {
      await db.execute({
        sql: `
          INSERT INTO source_state (
            source_id, health, last_run_at, last_success_at, last_429_at, last_blocked_at,
            cooldown_until, consecutive_errors, last_new_listing_count,
            average_new_listing_count, last_full_pass_at, memo, updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(source_id) DO UPDATE SET
            health = excluded.health, last_run_at = excluded.last_run_at,
            last_success_at = excluded.last_success_at, last_429_at = excluded.last_429_at,
            last_blocked_at = excluded.last_blocked_at, cooldown_until = excluded.cooldown_until,
            consecutive_errors = excluded.consecutive_errors,
            last_new_listing_count = excluded.last_new_listing_count,
            average_new_listing_count = excluded.average_new_listing_count,
            last_full_pass_at = excluded.last_full_pass_at,
            memo = excluded.memo,
            updated_at = excluded.updated_at
        `,
        args: [
          state.sourceId,
          state.health,
          state.lastRunAt,
          state.lastSuccessAt,
          state.last429At,
          state.lastBlockedAt,
          state.cooldownUntil,
          state.consecutiveErrors,
          state.lastNewListingCount,
          state.averageNewListingCount,
          state.lastFullPassAt ?? null,
          state.memo ?? null,
          new Date().toISOString(),
        ],
      });
    },

    async recordRun(entry) {
      await db.execute({
        sql: `INSERT INTO collection_runs (
                id, source_id, started_at, finished_at, request_count, pages_fetched,
                listings_found, listings_new, listings_updated, duplicates, errors,
                stop_reason, warnings
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          entry.id,
          entry.sourceId,
          entry.startedAt,
          entry.finishedAt,
          entry.requestCount,
          entry.pagesFetched,
          entry.listingsFound,
          entry.listingsNew,
          entry.listingsUpdated,
          entry.duplicates,
          entry.errors,
          entry.stopReason,
          JSON.stringify(entry.warnings),
        ],
      });
    },

    async markMissing(sourceId, seenRefs, thresholds) {
      // Une annonce non revue voit son compteur augmenter. Elle ne disparaît
      // jamais : elle change seulement de statut (§32).
      const refs = [...seenRefs];
      const exclusion =
        refs.length > 0 ? `AND source_ref NOT IN (${refs.map(() => '?').join(',')})` : '';

      await db.execute({
        sql: `UPDATE occurrences SET missing_runs = missing_runs + 1
              WHERE source_id = ? AND lifecycle != 'inactive' ${exclusion}`,
        args: [sourceId, ...refs],
      });

      // LE STATUT NE SE RÉÉCRIT QUE S'IL CHANGE : sans la clause sur le
      // `lifecycle` courant, ces deux requêtes réaffirmaient à chaque passage
      // un statut déjà acquis, et leur `rowsAffected` ne distinguait plus une
      // transition d'une répétition.
      const moved = await db.batch(
        [
          {
            sql: `UPDATE occurrences SET lifecycle = 'possiblyInactive'
                  WHERE source_id = ? AND missing_runs >= ? AND missing_runs < ?
                    AND lifecycle = 'active'`,
            args: [sourceId, thresholds.possiblyInactiveAfter, thresholds.inactiveAfter],
          },
          {
            sql: `UPDATE occurrences SET lifecycle = 'inactive'
                  WHERE source_id = ? AND missing_runs >= ? AND lifecycle != 'inactive'`,
            args: [sourceId, thresholds.inactiveAfter],
          },
        ],
        'write',
      );
      return moved.reduce((total, result) => total + result.rowsAffected, 0);
    },

    async vanishRates(windowDays, confirmedAfter) {
      /**
       * UNE ANNONCE JAMAIS REVUE N'EST PAS TOUJOURS UNE ANNONCE COURTE.
       *
       * Deux pièges, et il faut les deux gardes pour que le chiffre veuille dire
       * quelque chose.
       *
       * Le premier est la source en panne : `missing_runs` répond, puisqu'il ne
       * monte qu'aux passages jugés concluants — une liste qui a échoué ne
       * compte personne pour absent. Exiger le seuil de retrait, c'est exiger
       * que la source soit repassée en bon état autant de fois.
       *
       * Le second est la page qui tourne. `citya` et `rentumo` font défiler un
       * catalogue national : des dizaines de références apparaissent puis
       * repartent ENSEMBLE, au même passage, et signent la pagination, pas le
       * marché. Relevé du 2026-09-17 : sur 254 annonces vues une seule fois, 197
       * arrivaient par lots de trois ou plus. Un lot ne compte donc pas.
       */
      const result = await db.execute({
        sql: `SELECT source_id AS src,
                     COUNT(*) AS retirees,
                     SUM(CASE WHEN seule = 1 AND lot < ? THEN 1 ELSE 0 END) AS fuyantes
                FROM (
                  SELECT source_id, missing_runs,
                         CASE WHEN last_seen_at = first_seen_at THEN 1 ELSE 0 END AS seule,
                         SUM(CASE WHEN last_seen_at = first_seen_at THEN 1 ELSE 0 END)
                           OVER (PARTITION BY source_id, first_seen_at) AS lot
                    FROM occurrences
                   WHERE julianday('now') - julianday(first_seen_at) <= ?
                )
               WHERE missing_runs >= ?
               GROUP BY source_id`,
        args: [VANISH_BATCH, windowDays, confirmedAfter],
      });

      return new Map(
        result.rows.map((row) => [
          String(row['src']),
          { retired: Number(row['retirees'] ?? 0), vanished: Number(row['fuyantes'] ?? 0) },
        ]),
      );
    },

    async pendingNotifications(userId, minPriority, traits = {}) {
      const preferences = traitConditions(traits);
      const extra = preferences.sql.length > 0 ? `AND ${preferences.sql.join(' AND ')}` : '';
      const result = await db.execute({
        /**
         * TOUT CE QUI SE DÉCIDE ICI EST PERSONNEL, et rien ne l'était.
         *
         * « Correspond aux critères » et la priorité viennent du score DU
         * COMPTE ; « déjà notifiée » et « archivée » de son état. La requête
         * lisait les colonnes de `listings` — calculées pour un seul
         * utilisateur — donc un second compte recevait des alertes filtrées
         * sur le budget du premier, et taisait celles que le premier avait
         * déjà vues.
         *
         * `lifecycle = 'active'` (et non « != inactive ») : une annonce
         * `possiblyInactive` a déjà disparu de sa source lors de plusieurs
         * passages — la pousser en notification enverrait très probablement
         * vers une annonce expirée. Elle reste VISIBLE sur le site (décision
         * utilisateur), mais on ne la notifie pas (§29, §33).
         */
        sql: `SELECT listings.id, listings.title, listings.price, listings.area, listings.rooms,
                     listings.city, listings.postal_code, sc.action_priority, listings.payload
              FROM listings
              JOIN listing_user_score AS sc
                ON sc.listing_id = listings.id AND sc.user_id = ?
              LEFT JOIN listing_user_state AS us
                ON us.listing_id = listings.id AND us.user_id = ?
              WHERE sc.matches_criteria = 1
                AND COALESCE(us.notified, 0) = 0
                AND COALESCE(us.archived, 0) = 0
                AND ${OPEN_TO_APPLICATIONS_SQL}
                AND listings.lifecycle = 'active'
                AND listings.rented = 0
                AND COALESCE(sc.action_priority, 0) >= ?
                ${extra}
              ORDER BY sc.action_priority DESC`,
        args: [userId, userId, minPriority, ...preferences.args],
      });

      return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
    },

    async directListingSpecKeys() {
      // Annonces actives dont AUCUNE occurrence n'est une alerte e-mail : elles
      // constituent les biens « directs » de référence.
      const result = await db.execute(
        `SELECT price, area, city, rooms FROM listings
         WHERE lifecycle != 'inactive' AND rented = 0
           AND price IS NOT NULL AND area IS NOT NULL
           AND id NOT IN (SELECT group_id FROM occurrences WHERE source_id = 'email-alerts')`,
      );
      const keys = new Set<string>();
      for (const row of result.rows) {
        const price = row['price'] === null ? null : Number(row['price']);
        const area = row['area'] === null ? null : Number(row['area']);
        const rooms = row['rooms'] === null ? null : Number(row['rooms']);
        const city = row['city'] === null ? null : String(row['city']);
        // On indexe les DEUX formes : la stricte (avec ville) et le repli sans
        // ville, pour rattraper les annonces e-mail dont la commune manque.
        const strict = listingSpecKey(price, area, city, rooms);
        if (strict !== null) keys.add(strict);
        const loose = looseSpecKey(price, area, rooms);
        if (loose !== null) keys.add(loose);
      }
      return keys;
    },

    async pruneLogs(nowMs) {
      const cutoff = (days: number): string =>
        new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
      const result = await db.batch(
        [
          // Une trace d'exécution sert à comprendre POURQUOI une source s'est
          // tue cette semaine, pas l'an dernier.
          { sql: 'DELETE FROM collection_runs WHERE started_at < ?', args: [cutoff(RUN_LOG_DAYS)] },
          // L'historique des prix nourrit le signal « prix en baisse », qui ne
          // regarde que les quatorze derniers jours. Six mois laissent large.
          {
            sql: 'DELETE FROM listing_history WHERE recorded_at < ?',
            args: [cutoff(HISTORY_DAYS)],
          },
          { sql: 'DELETE FROM events WHERE occurred_at < ?', args: [cutoff(EVENT_DAYS)] },
        ],
        'write',
      );
      return result.reduce((total, one) => total + one.rowsAffected, 0);
    },

    async nearMatches(userId, criteria, traits = {}) {
      const cities = criteria.cities.filter((city) => city !== '');
      if (cities.length === 0) return [];
      // UNE MARGE PAR CRITÈRE, définie et justifiée dans `criteria.ts`.
      const bounds = nearMatchBounds(criteria);
      const placeholders = cities.map(() => '?').join(',');

      /**
       * Les mêmes exclusions que la liste : élargir le budget n'est pas rouvrir
       * ce qu'on a écarté. Seuls le TRAJET et la DATE y prennent leur borne
       * élargie — ce sont des quantités, elles ont un voisinage ; colocation,
       * bail étudiant, bailleur, ameublement et quartier n'en ont pas et
       * passent tels quels (`NEAR_MATCH_NEVER_RELAXED`).
       */
      const preferences = traitConditions({
        ...traits,
        ...(traits.maxCommuteMinutes !== undefined && bounds.maxCommuteMinutes !== undefined
          ? { maxCommuteMinutes: bounds.maxCommuteMinutes }
          : {}),
        ...(traits.availableBy !== undefined &&
        traits.availableBy !== '' &&
        bounds.availableBy !== undefined
          ? { availableBy: bounds.availableBy }
          : {}),
      });
      const extra = preferences.sql.length > 0 ? `AND ${preferences.sql.join(' AND ')}` : '';

      /**
       * AU MOINS UN CRITÈRE DÉPASSÉ, sinon l'annonce est « proche » de rien et
       * la notification n'aurait pas de phrase à porter. Une seule liste, dans
       * le même ordre que celle des marges.
       */
      const beyond = ['listings.price > ?', '(listings.area IS NOT NULL AND listings.area < ?)'];
      const beyondArgs: (string | number)[] = [criteria.maxPrice, criteria.minArea];
      if (criteria.maxCommuteMinutes !== undefined) {
        beyond.push('(sc.commute_minutes IS NOT NULL AND sc.commute_minutes > ?)');
        beyondArgs.push(criteria.maxCommuteMinutes);
      }
      if (criteria.availableBy !== undefined && criteria.availableBy !== '') {
        beyond.push('(listings.available_at IS NOT NULL AND listings.available_at > ?)');
        beyondArgs.push(`${criteria.availableBy}T23:59:59.999Z`);
      }
      if (criteria.minRooms !== undefined) {
        beyond.push('(listings.rooms IS NOT NULL AND listings.rooms < ?)');
        beyondArgs.push(criteria.minRooms);
      }
      if (criteria.maxRooms !== undefined) {
        beyond.push('(listings.rooms IS NOT NULL AND listings.rooms > ?)');
        beyondArgs.push(criteria.maxRooms);
      }

      /**
       * Les bornes élargies qui ne tiennent pas dans un `?` fixe : un critère
       * absent n'ajoute rien, et une valeur INCONNUE ne disqualifie jamais — un
       * nombre de pièces non publié n'est pas un nombre de pièces insuffisant.
       */
      const within: string[] = [];
      const withinArgs: number[] = [];
      if (bounds.minRooms !== undefined) {
        within.push('AND (listings.rooms IS NULL OR listings.rooms >= ?)');
        withinArgs.push(bounds.minRooms);
      }
      if (bounds.maxRooms !== undefined) {
        within.push('AND (listings.rooms IS NULL OR listings.rooms <= ?)');
        withinArgs.push(bounds.maxRooms);
      }

      // LE PLANCHER DE LOYER NE SE RELÂCHE PAS : il écarte les parkings et les
      // caves étiquetés « appartement » (~100 €). Il manquait ici, et une cave
      // de 19 m² à 150 € passait pour un logement presque assez grand.
      const floor = criteria.minPrice === undefined ? '' : 'AND listings.price >= ?';

      const result = await db.execute({
        // LA VILLE RESTE ÉLIMINATOIRE. Un logement dans une autre commune n'est
        // pas « proche des critères », il est ailleurs — l'élargissement porte
        // sur des quantités, pas sur la géographie.
        sql: `SELECT listings.id, listings.title, listings.price, listings.area, listings.rooms,
                     listings.city, listings.postal_code, sc.action_priority,
                     sc.commute_minutes, listings.payload
              FROM listings
              JOIN listing_user_score AS sc
                ON sc.listing_id = listings.id AND sc.user_id = ?
              LEFT JOIN listing_user_state AS us
                ON us.listing_id = listings.id AND us.user_id = ?
              WHERE sc.matches_criteria = 0
                AND COALESCE(us.notified, 0) = 0
                AND listings.lifecycle = 'active'
                AND COALESCE(us.archived, 0) = 0
                AND listings.rented = 0
                AND LOWER(listings.city) IN (${placeholders})
                AND listings.price IS NOT NULL AND listings.price <= ?
                ${floor}
                AND (listings.area IS NULL OR listings.area >= ?)
                ${within.join('\n                ')}
                AND (${beyond.join(' OR ')})
                ${extra}
              ORDER BY sc.action_priority DESC`,
        args: [
          userId,
          userId,
          ...cities.map((city) => city.toLowerCase()),
          bounds.maxPrice,
          ...(criteria.minPrice === undefined ? [] : [criteria.minPrice]),
          bounds.minArea,
          ...withinArgs,
          ...beyondArgs,
          ...preferences.args,
        ],
      });

      return result.rows.map((row) => {
        const record = row as Record<string, unknown>;
        const listing = toNotifiable(record);
        const commute = record['commute_minutes'];
        return {
          ...listing,
          // CE QUI DÉPASSE, NOMMÉ : « 735 € pour un budget de 700 € ».
          overshoot: describeOvershoot(
            { ...listing, commuteMinutes: typeof commute === 'number' ? commute : null },
            criteria,
          ),
        };
      });
    },

    /**
     * LA PRIORITÉ AFFICHÉE EST CELLE DU DESTINATAIRE. Elle venait de
     * `listings.action_priority`, calculée pour le compte que sert la
     * collecte : la notification d'un second compte annonçait « ⭐ Priorité
     * 82/100 » d'après les critères de quelqu'un d'autre.
     */
    async goneFavorites(userId) {
      const result = await db.execute({
        // `possiblyInactive` NE SUFFIT PAS : elle signifie « pas revue au
        // dernier passage », ce qui arrive pour une page momentanément en
        // erreur. On attend `inactive` — plusieurs passages sans la revoir — ou
        // le marquage « loué », qui est une certitude.
        sql: `SELECT l.id, l.title, l.price, l.area, l.rooms, l.city, l.postal_code,
                     COALESCE(sc.action_priority, 0) AS action_priority, l.payload
              FROM listings l
              JOIN listing_user_state us ON us.listing_id = l.id AND us.user_id = ?
              LEFT JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = ?
              WHERE us.favorite = 1
                AND us.gone_notified_at IS NULL
                AND (l.lifecycle = 'inactive' OR l.rented = 1)
              ORDER BY COALESCE(sc.action_priority, 0) DESC`,
        args: [userId, userId],
      });
      return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
    },

    async markGoneNotified(userId, ids) {
      if (ids.length === 0) return;
      await recordUserState(db, userId, ids, { gone_notified_at: new Date().toISOString() });
    },

    async staleFavorites(userId, hours) {
      const since = new Date(Date.now() - hours * 3_600_000).toISOString();
      const result = await db.execute({
        // Un favori déjà contacté n'a pas besoin de rappel : c'est le silence
        // d'en face qui compte alors, pas le nôtre.
        sql: `SELECT l.id, l.title, l.price, l.area, l.rooms, l.city, l.postal_code,
                     COALESCE(sc.action_priority, 0) AS action_priority, l.payload
              FROM listings l
              JOIN listing_user_state us ON us.listing_id = l.id AND us.user_id = ?
              LEFT JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = ?
              WHERE us.favorite = 1
                AND us.reminded_at IS NULL
                AND us.archived = 0
                AND us.tracking IN ('new', 'toContact')
                AND l.lifecycle = 'active'
                AND l.rented = 0
                AND COALESCE(us.favorited_at, us.updated_at) <= ?
              ORDER BY COALESCE(sc.action_priority, 0) DESC`,
        args: [userId, userId, since],
      });
      return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
    },

    async noteClosedApplications(userId) {
      // Seulement ce que ce compte a déjà reçu : une annonce jamais signalée
      // rouvrant ses candidatures part comme une nouvelle annonce, pas en double.
      await db.execute({
        sql: `UPDATE listing_user_state SET applications_closed_at = ?
              WHERE user_id = ? AND notified = 1 AND applications_closed_at IS NULL
                AND listing_id IN (
                  SELECT id FROM listings
                  WHERE json_extract(payload, '$.applicationStatus') = 'full'
                )`,
        args: [new Date().toISOString(), userId],
      });
    },

    async reopenedApplications(userId, traits = {}) {
      const preferences = traitConditions(traits);
      const extra = preferences.sql.length > 0 ? `AND ${preferences.sql.join(' AND ')}` : '';
      const result = await db.execute({
        sql: `SELECT listings.id, listings.title, listings.price, listings.area, listings.rooms,
                     listings.city, listings.postal_code, sc.action_priority, listings.payload
              FROM listings
              JOIN listing_user_state AS us
                ON us.listing_id = listings.id AND us.user_id = ?
              JOIN listing_user_score AS sc
                ON sc.listing_id = listings.id AND sc.user_id = ?
              WHERE us.applications_closed_at IS NOT NULL
                AND COALESCE(us.archived, 0) = 0
                AND sc.matches_criteria = 1
                AND ${OPEN_TO_APPLICATIONS_SQL}
                AND listings.lifecycle = 'active'
                AND listings.rented = 0
                ${extra}
              ORDER BY sc.action_priority DESC`,
        args: [userId, userId, ...preferences.args],
      });
      return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
    },

    async markReopenNotified(userId, ids) {
      if (ids.length === 0) return;
      await recordUserState(db, userId, ids, { applications_closed_at: null });
    },

    /**
     * LES ANNONCES REVENUES EN LIGNE, pas encore signalées.
     *
     * Le drapeau vient de la fiche elle-même : la collecte l'y pose quand une
     * occurrence retirée reparaît, sur une fenêtre de quatorze jours. Au-delà,
     * une republication n'a plus rien d'une occasion à saisir.
     *
     * `reappear_notified_at` PLUTÔT QUE `notified` : ce dernier dit qu'on a
     * signalé l'annonce la première fois. Les confondre ferait taire le
     * retour, ou resonnerait l'arrivée.
     */
    async reappearedListings(userId, traits = {}) {
      const preferences = traitConditions(traits);
      const extra = preferences.sql.length > 0 ? `AND ${preferences.sql.join(' AND ')}` : '';
      const result = await db.execute({
        sql: `SELECT listings.id, listings.title, listings.price, listings.area, listings.rooms,
                     listings.city, listings.postal_code, sc.action_priority, listings.payload
              FROM listings
              JOIN listing_user_score AS sc
                ON sc.listing_id = listings.id AND sc.user_id = ?
              LEFT JOIN listing_user_state AS us
                ON us.listing_id = listings.id AND us.user_id = ?
              WHERE json_extract(listings.payload, '$.reappeared') = 1
                AND us.reappear_notified_at IS NULL
                AND COALESCE(us.archived, 0) = 0
                AND sc.matches_criteria = 1
                AND ${OPEN_TO_APPLICATIONS_SQL}
                AND listings.lifecycle = 'active'
                AND listings.rented = 0
                ${extra}
              ORDER BY sc.action_priority DESC`,
        args: [userId, userId, ...preferences.args],
      });
      return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
    },

    async markReappearNotified(userId, ids, nowIso) {
      if (ids.length === 0) return;
      await recordUserState(db, userId, ids, { reappear_notified_at: nowIso });
    },

    async markReminded(userId, ids) {
      if (ids.length === 0) return;
      await recordUserState(db, userId, ids, { reminded_at: new Date().toISOString() });
    },

    async markNotified(userId, ids) {
      if (ids.length === 0) return;
      // SEUL L'ÉTAT DU COMPTE EST ÉCRIT. La colonne `notified` de `listings`
      // l'était aussi : « signalée » devenait alors vrai pour TOUT LE MONDE,
      // si bien qu'un second compte ne recevait jamais une annonce que le
      // premier avait déjà vue. `COALESCE` sur la date garde celle de la
      // PREMIÈRE alerte : une annonce re-signalée ne remonte pas l'historique.
      await recordUserState(db, userId, ids, {
        notified: 1,
        notified_at: new Date().toISOString(),
      });
    },

    /**
     * LES BROUILLONS RESTENT CEUX DE `CURRENT_USER`, à dessein.
     *
     * Un brouillon est un message signé : il porte le nom, la situation et le
     * dossier de qui l'envoie. Il n'y a donc rien à en tirer pour un autre
     * compte, et cette commande s'exécute à la main, depuis la machine de son
     * propriétaire. `listings.matches_criteria` — la colonne mono-compte que
     * `listing_user_score` remplace partout ailleurs — est exactement la bonne
     * source ici : c'est celle de la collecte, donc la sienne. Ses DÉCISIONS
     * (favori, archivage, brouillon) se lisent en revanche dans son état : la
     * fiche ne les porte plus.
     */
    async pendingDrafts() {
      const result = await db.execute({
        // LES FAVORIS COMPTENT AUTANT QUE LES CRITÈRES, et même davantage : le
        // critère est une règle écrite une fois, le favori est un choix fait
        // devant l'annonce. On ne préparait pourtant de brouillon que pour les
        // premiers — un logement mis de côté à la main n'en obtenait aucun, ce
        // qui est l'inverse de ce qu'on attend d'un raccourci.
        sql: `SELECT listings.id, listings.payload FROM listings
              LEFT JOIN listing_user_state AS us
                ON us.listing_id = listings.id AND us.user_id = ?
              WHERE (listings.matches_criteria = 1 OR COALESCE(us.favorite, 0) = 1)
                AND listings.rented = 0 AND listings.lifecycle != 'inactive'
                AND COALESCE(us.archived, 0) = 0 AND COALESCE(us.drafted, 0) = 0
              ORDER BY COALESCE(us.favorite, 0) DESC, listings.action_priority DESC`,
        args: [CURRENT_USER],
      });
      const out: DraftableListing[] = [];
      for (const row of result.rows) {
        let payload: {
          propertyType?: MessageListing['propertyType'];
          area?: MessageListing['area'];
          city?: MessageListing['city'];
          price?: MessageListing['price'];
          contact?: MessageListing['contact'];
          address?: { value?: unknown };
          district?: { value?: unknown };
          occurrences?: { sourceUrl?: unknown }[];
        };
        try {
          payload = JSON.parse(String(row['payload'] ?? '{}'));
        } catch {
          continue;
        }
        const email = payload.contact?.email;
        // Un brouillon a besoin d'un destinataire : sans e-mail, on n'en crée pas.
        if (typeof email !== 'string' || email === '') continue;
        if (
          payload.propertyType === undefined ||
          payload.area === undefined ||
          payload.city === undefined ||
          payload.price === undefined ||
          payload.contact === undefined
        ) {
          continue;
        }
        // LE LIEN DOIT DÉSIGNER L'AGENCE À QUI L'ON ÉCRIT. Une fiche fusionnée
        // porte plusieurs occurrences — le même studio publié par deux agences —
        // et le contact retenu n'est pas forcément celui de la première. Relevé
        // le 2026-09-08 : un bien de Giletta portait l'adresse d'Acropolis, qui
        // le publie aussi. Écrire à l'une en pointant la page de l'autre, c'est
        // envoyer un concurrent à son destinataire.
        //
        // Le DOMAINE DE L'ADRESSE tranche sans rien supposer : `providedBy` dit
        // qui a fourni la fiche, jamais qui a fourni l'e-mail.
        const first = occurrenceMatching(payload.occurrences, email);
        out.push({
          id: String(row['id']),
          email,
          address: typeof payload.address?.value === 'string' ? payload.address.value : null,
          district: typeof payload.district?.value === 'string' ? payload.district.value : null,
          listing: {
            propertyType: payload.propertyType,
            area: payload.area,
            city: payload.city,
            price: payload.price,
            contact: payload.contact,
            sourceUrl: first,
          },
        });
      }
      return out;
    },

    async markDrafted(userId, ids) {
      await recordUserState(db, userId, ids, { drafted: 1 });
    },

    async markContacted(userId, ids) {
      await recordUserState(db, userId, ids, { tracking: 'contacted' });
    },

    async setListingFavorite(listingId, favorite) {
      // LA DATE DE MISE EN FAVORI, pour le rappel de candidature. `updated_at`
      // ne pouvait pas servir : il bouge à chaque consultation, si bien qu'un
      // favori déposé il y a une semaine mais rouvert ce matin paraissait tout
      // neuf. Retirer le favori efface la date ET le rappel : le remettre
      // repart d'une intention neuve.
      await recordUserState(db, CURRENT_USER, [listingId], {
        favorite: favorite ? 1 : 0,
        favorited_at: favorite ? new Date().toISOString() : null,
        ...(favorite ? {} : { reminded_at: null, gone_notified_at: null }),
      });
    },

    // `app_settings` a pour clé primaire (utilisateur, réglage) depuis les
    // comptes. Ces deux requêtes l'ignoraient : la lecture pouvait rendre le
    // réglage de n'importe qui, et l'écriture échouait carrément — SQLite
    // refuse un `ON CONFLICT(key)` qui ne désigne aucune contrainte. La
    // collecte n'a qu'un utilisateur, mais elle doit viser le bon.
    async readSetting(key) {
      const result = await db.execute({
        sql: 'SELECT value FROM app_settings WHERE user_id = ? AND key = ?',
        args: [CURRENT_USER, key],
      });
      const row = result.rows[0];
      return row === undefined ? null : String(row['value']);
    },

    async sourceCredentials(sourceId) {
      const result = await db.execute({
        sql: `SELECT user_id, login, secret_encrypted FROM source_credentials
              WHERE source_id = ? ORDER BY updated_at DESC`,
        args: [sourceId],
      });
      return result.rows.map((row) => ({
        userId: String(row['user_id']),
        login: String(row['login']),
        secretEncrypted: String(row['secret_encrypted']),
      }));
    },

    async readSettingFor(userId, key) {
      const result = await db.execute({
        sql: 'SELECT value FROM app_settings WHERE user_id = ? AND key = ?',
        args: [userId, key],
      });
      const row = result.rows[0];
      return row === undefined ? null : String(row['value']);
    },

    async writeSettingFor(userId, key, value) {
      await db.execute({
        sql: `INSERT INTO app_settings (user_id, key, value, updated_at) VALUES (?,?,?,?)
              ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                                      updated_at = excluded.updated_at`,
        args: [userId, key, value, new Date().toISOString()],
      });
    },

    async writeSetting(key, value) {
      await db.execute({
        sql: `INSERT INTO app_settings (user_id, key, value, updated_at) VALUES (?,?,?,?)
              ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                                      updated_at = excluded.updated_at`,
        args: [CURRENT_USER, key, value, new Date().toISOString()],
      });
    },

    httpCache(): HttpCacheStore {
      return {
        async get(url) {
          const result = await db.execute({
            sql: 'SELECT etag, last_modified, fetched_at FROM http_cache WHERE url = ?',
            args: [url],
          });
          const row = result.rows[0];
          if (row === undefined) return null;
          return {
            etag: row['etag'] === null ? null : String(row['etag']),
            lastModified: row['last_modified'] === null ? null : String(row['last_modified']),
            fetchedAt: String(row['fetched_at']),
          } satisfies CacheEntry;
        },
        async set(url, entry) {
          await db.execute({
            sql: `INSERT INTO http_cache (url, etag, last_modified, fetched_at)
                  VALUES (?,?,?,?)
                  ON CONFLICT(url) DO UPDATE SET
                    etag = excluded.etag,
                    last_modified = excluded.last_modified,
                    fetched_at = excluded.fetched_at`,
            args: [url, entry.etag, entry.lastModified, entry.fetchedAt],
          });
        },
      };
    },

    geocodeCache(): GeocodeCacheStore {
      return {
        async get(query) {
          const result = await db.execute({
            sql: `SELECT lat, lon, geocoded_at, label, postcode
                  FROM geocode_cache WHERE query = ?`,
            args: [query],
          });
          const row = result.rows[0];
          if (row === undefined) return null;
          return {
            lat: row['lat'] === null ? null : Number(row['lat']),
            lon: row['lon'] === null ? null : Number(row['lon']),
            geocodedAt: String(row['geocoded_at']),
            label: row['label'] === null ? null : String(row['label']),
            postcode: row['postcode'] === null ? null : String(row['postcode']),
          };
        },
        async set(query, entry) {
          await db.execute({
            sql: `INSERT INTO geocode_cache (query, lat, lon, geocoded_at, label, postcode)
                  VALUES (?,?,?,?,?,?)
                  ON CONFLICT(query) DO UPDATE SET
                    lat = excluded.lat, lon = excluded.lon,
                    geocoded_at = excluded.geocoded_at,
                    label = excluded.label, postcode = excluded.postcode`,
            args: [
              query,
              entry.lat,
              entry.lon,
              entry.geocodedAt,
              entry.label ?? null,
              entry.postcode ?? null,
            ],
          });
        },
      };
    },

    async detailDrafts(sourceId) {
      const result = await db.execute({
        sql: 'SELECT source_ref, draft, fetched_at FROM detail_drafts WHERE source_id = ?',
        args: [sourceId],
      });
      const memory = new Map<string, DetailMemoryEntry>();
      for (const row of result.rows) {
        try {
          const draft: unknown = JSON.parse(String(row['draft']));
          if (typeof draft !== 'object' || draft === null) continue;
          memory.set(String(row['source_ref']), {
            draft: draft as Partial<RawListing>,
            fetchedAt: String(row['fetched_at']),
          });
        } catch {
          // Une ligne illisible ne dit rien : la fiche sera relue, voilà tout.
        }
      }
      return memory;
    },

    async saveDetailDrafts(sourceId, entries, nowIso) {
      if (entries.length === 0) return;
      await db.batch(
        entries.map((entry) => ({
          sql: `INSERT INTO detail_drafts (source_id, source_ref, draft, fetched_at)
                VALUES (?,?,?,?)
                ON CONFLICT(source_id, source_ref) DO UPDATE SET
                  draft = excluded.draft, fetched_at = excluded.fetched_at`,
          args: [sourceId, entry.sourceRef, JSON.stringify(entry.draft), nowIso],
        })),
        'write',
      );
    },

    async confirmSeen(sourceId, refs, nowIso) {
      // Par tranches : une clause `IN` a une limite de paramètres, et un
      // inventaire de mille annonces la dépasserait sur certains moteurs.
      const unique = [...new Set(refs)];
      const statements: Statement[] = [];
      for (let start = 0; start < unique.length; start += 400) {
        const slice = unique.slice(start, start + 400);
        statements.push({
          sql: `UPDATE occurrences SET last_seen_at = ?, missing_runs = 0, lifecycle = 'active'
                WHERE source_id = ? AND source_ref IN (${slice.map(() => '?').join(',')})`,
          args: [nowIso, sourceId, ...slice],
        });
      }
      if (statements.length > 0) await db.batch(statements, 'write');
    },

    async pageRefs(url) {
      const result = await db.execute({
        sql: 'SELECT refs FROM page_refs WHERE url = ?',
        args: [url],
      });
      const raw = result.rows[0]?.['refs'];
      if (typeof raw !== 'string') return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((ref): ref is string => typeof ref === 'string')
          : null;
      } catch {
        // Illisible : on ne sait rien de cette page, et c'est ce qu'on dit.
        return null;
      }
    },

    async savePageRefs(url, refs, nowIso) {
      await db.execute({
        sql: `INSERT INTO page_refs (url, refs, updated_at) VALUES (?,?,?)
              ON CONFLICT(url) DO UPDATE SET refs = excluded.refs, updated_at = excluded.updated_at`,
        args: [url, JSON.stringify(refs), nowIso],
      });
    },

    dpeCache(): DpeCacheStore {
      return {
        async get(key) {
          const result = await db.execute({
            sql: `SELECT label, ges_label, built_year, area, searched_at
                  FROM dpe_cache WHERE key = ?`,
            args: [key],
          });
          const row = result.rows[0];
          if (row === undefined) return null;
          // `label` nul = recherche infructueuse MEMORISEE. C'est une reponse,
          // pas un trou : sans elle, l'adresse serait rappelee a chaque passage.
          const label = row['label'] === null ? null : String(row['label']);
          return {
            record:
              label === null
                ? null
                : {
                    label,
                    gesLabel: row['ges_label'] === null ? null : String(row['ges_label']),
                    builtYear: row['built_year'] === null ? null : Number(row['built_year']),
                    area: Number(row['area']),
                  },
            searchedAt: String(row['searched_at']),
          };
        },
        async set(key, entry) {
          await db.execute({
            sql: `INSERT INTO dpe_cache (key, label, ges_label, built_year, area, searched_at)
                  VALUES (?,?,?,?,?,?)
                  ON CONFLICT(key) DO UPDATE SET
                    label = excluded.label, ges_label = excluded.ges_label,
                    built_year = excluded.built_year, area = excluded.area,
                    searched_at = excluded.searched_at`,
            args: [
              key,
              entry.record?.label ?? null,
              entry.record?.gesLabel ?? null,
              entry.record?.builtYear ?? null,
              entry.record?.area ?? null,
              entry.searchedAt,
            ],
          });
        },
      };
    },

    transitCache(): TransitCacheStore {
      return {
        async get(key) {
          const result = await db.execute({
            sql: 'SELECT minutes FROM transit_cache WHERE key = ?',
            args: [key],
          });
          const row = result.rows[0];
          if (row === undefined) return null;
          return { minutes: row['minutes'] === null ? null : Number(row['minutes']) };
        },
        async set(key, entry) {
          await db.execute({
            sql: `INSERT INTO transit_cache (key, minutes, cached_at)
                  VALUES (?,?,?)
                  ON CONFLICT(key) DO UPDATE SET
                    minutes = excluded.minutes, cached_at = excluded.cached_at`,
            args: [key, entry.minutes, new Date().toISOString()],
          });
        },
      };
    },
  };
}

/** Sérialise la fiche complète stockée dans `listings.payload`. */
function serializeListing(listing: ScoredListing): Record<string, unknown> {
  return {
    title: listing.title,
    description: listing.description,
    price: listing.price,
    charges: listing.charges,
    chargesIncluded: listing.chargesIncluded,
    deposit: listing.deposit,
    tenantFees: listing.tenantFees,
    area: listing.area,
    rooms: listing.rooms,
    propertyType: listing.propertyType,
    furnished: listing.furnished,
    flatShare: listing.flatShare,
    dpe: listing.dpe,
    ges: listing.ges,
    maxOccupants: listing.maxOccupants,
    features: listing.features,
    requirements: listing.requirements,
    address: listing.address,
    district: listing.district,
    city: listing.city,
    postalCode: listing.postalCode,
    latitude: listing.latitude,
    longitude: listing.longitude,
    contact: listing.contact,
    publishedAt: listing.publishedAt,
    availableAt: listing.availableAt,
    imageUrls: listing.imageUrls,
    videoUrl: listing.videoUrl,
    views: listing.views,
    favorites: listing.favorites,
    scores: listing.scores,
    distances: listing.distances,
    priceDropped: listing.priceDropped,
    reappeared: listing.reappeared,
    applicationStatus: listing.applicationStatus ?? null,
    occurrences: listing.occurrences.map((occurrence) => ({
      id: occurrence.id,
      sourceId: occurrence.sourceId,
      sourceUrl: occurrence.sourceUrl,
      price: occurrence.price,
      area: occurrence.area,
      lastSeenAt: occurrence.lastSeenAt,
    })),
  };
}

/**
 * Une fiche n'est plus rattachée à aucune occurrence : sa remplaçante les a
 * toutes prises. Écrit une seule fois — le prédicat servait à trois endroits.
 */
/**
 * Durées de conservation des journaux.
 *
 * Rien de tout cela n'est lu par l'application : ce sont des traces qu'on
 * consulte quand quelque chose cloche. Elles ne coûtaient aucune lecture, mais
 * elles ne s'effaçaient jamais non plus — 379 exécutions et 457 changements de
 * prix accumulés en trois semaines, sans fin prévue. Une base qui n'oublie
 * rien finit par peser pour des données que personne ne relira.
 *
 * L'historique garde le plus longtemps : il nourrit le signal « prix en
 * baisse », qui ne regarde que quatorze jours — six mois laissent large.
 */
const RUN_LOG_DAYS = 90;
const HISTORY_DAYS = 180;
const EVENT_DAYS = 90;

/**
 * Âge au-delà duquel la ligne du jour est recalculée.
 *
 * Une heure : la page Statistiques montre une courbe par JOUR, et personne n'y
 * lit un quart d'heure. En dessous, on repayait le balayage pour rien.
 */
const DAILY_STAT_MAX_AGE_MS = 60 * 60 * 1000;

const ORPHAN_PREDICATE = 'id NOT IN (SELECT group_id FROM occurrences WHERE group_id IS NOT NULL)';

/** Les fiches sur lesquelles un compte, quel qu'il soit, a décidé quelque chose. */
const DECIDED_LISTINGS = `SELECT listing_id FROM listing_user_state
  WHERE favorite = 1 OR archived = 1 OR tracking NOT IN ('none', 'new')`;

/** Identifiants d'occurrence énumérés par la charge utile d'une fiche. */
function occurrenceIdsOf(payload: unknown): string[] {
  try {
    const parsed = JSON.parse(String(payload ?? '{}')) as { occurrences?: { id?: unknown }[] };
    return (parsed.occurrences ?? [])
      .map((occurrence) => occurrence.id)
      .filter((id): id is string => typeof id === 'string');
  } catch {
    return []; // charge utile illisible : on n'y touche pas
  }
}

/**
 * Fiche à laquelle chaque occurrence était rattachée AVANT ce passage.
 *
 * @returns pour chaque fiche écrite, les identifiants des fiches dont elle
 *          reprend des occurrences — vide dans le cas courant, où rien n'a
 *          changé de groupe.
 */
async function previousGroups(
  db: Database,
  listings: readonly ScoredListing[],
): Promise<Map<string, string[]>> {
  if (listings.length === 0) return new Map();

  // Toute la table de rattachement en UNE lecture, sans paramètre lié. Passer
  // un placeholder par occurrence du corpus — près d'un millier — frôlait la
  // limite de variables de SQLite pour un gain nul : la colonne est indexée et
  // le filtrage se fait en mémoire.
  const rows = await db.execute(`SELECT id, group_id FROM occurrences WHERE group_id IS NOT NULL`);
  const groupByOccurrence = new Map(
    rows.rows.map((row) => [String(row['id']), String(row['group_id'])]),
  );

  const predecessors = new Map<string, string[]>();
  for (const listing of listings) {
    const previous = new Set<string>();
    for (const occurrence of listing.occurrences) {
      const group = groupByOccurrence.get(occurrence.id);
      if (group !== undefined && group !== listing.id) previous.add(group);
    }
    if (previous.size > 0) predecessors.set(listing.id, [...previous]);
  }
  return predecessors;
}

/**
 * Transmet à la fiche survivante ce que l'utilisateur avait décidé sur celles
 * qu'elle absorbe (§14, §35).
 *
 * QUAND DEUX FICHES FUSIONNENT, le groupe prend l'identifiant de son occurrence
 * la plus ancienne : l'autre ligne devient orpheline. Elle porte pourtant
 * peut-être un favori, un archivage ou un « contactée ». La purge l'épargnait
 * donc — au prix d'un DOUBLON bien visible, exactement le symptôme observé le
 * 2026-09-03 sur une annonce à 670 €.
 *
 * On ne choisit pas entre perdre la décision et garder le doublon : la
 * décision remonte, PUIS la ligne morte part — ici même, et pas dans la purge
 * générale, qui épargne à juste titre toute fiche portant une décision. Elle ne
 * peut pas savoir que celle-ci a été recopiée ailleurs ; nous, si.
 *
 * Les drapeaux se cumulent (un favori reste un favori) ; le SUIVI n'est repris
 * que si la fiche survivante n'en porte pas déjà un — on ne fait jamais reculer
 * un statut plus avancé.
 *
 * COMPTE PAR COMPTE, dans `listing_user_state`. La fusion se faisait sur les
 * colonnes de `listings` : les décisions des comptes, rangées ailleurs,
 * disparaissaient avec la ligne absorbée.
 */
async function inheritUserState(
  db: Database,
  predecessors: ReadonlyMap<string, string[]>,
): Promise<number> {
  let absorbedCount = 0;
  const now = new Date().toISOString();

  for (const [survivor, absorbed] of predecessors) {
    const placeholders = absorbed.map(() => '?').join(',');

    // Une ligne par compte, agrégée sur les fiches absorbées. Le `WHERE`
    // précède l'`ON CONFLICT` : SQLite l'exige d'un upsert alimenté par `SELECT`.
    await db.execute({
      sql: `INSERT INTO listing_user_state
              (user_id, listing_id, viewed, archived, favorite, tracking,
               notified, notified_at, drafted, favorited_at, updated_at)
            SELECT user_id, ?, MAX(viewed), MAX(archived), MAX(favorite),
                   COALESCE(MAX(CASE WHEN tracking NOT IN ('new', 'none') THEN tracking END), 'new'),
                   MAX(notified), MIN(notified_at), MAX(drafted), MIN(favorited_at), ?
              FROM listing_user_state
             WHERE listing_id IN (${placeholders})
               AND EXISTS (SELECT 1 FROM listings WHERE id = ?)
             GROUP BY user_id
            ON CONFLICT(user_id, listing_id) DO UPDATE SET
              viewed = MAX(listing_user_state.viewed, excluded.viewed),
              archived = MAX(listing_user_state.archived, excluded.archived),
              favorite = MAX(listing_user_state.favorite, excluded.favorite),
              tracking = CASE WHEN listing_user_state.tracking IN ('new', 'none')
                              THEN excluded.tracking ELSE listing_user_state.tracking END,
              notified = MAX(listing_user_state.notified, excluded.notified),
              notified_at = COALESCE(listing_user_state.notified_at, excluded.notified_at),
              drafted = MAX(listing_user_state.drafted, excluded.drafted),
              favorited_at = COALESCE(listing_user_state.favorited_at, excluded.favorited_at),
              updated_at = excluded.updated_at`,
      args: [survivor, now, ...absorbed, survivor],
    });

    // La décision est en sûreté : la ligne absorbée peut disparaître, à
    // condition qu'elle ne porte plus aucune occurrence (une fusion partielle
    // la laisse vivante, avec ce qui lui reste). Son état part avec elle, sans
    // compter sur les clés étrangères.
    const removed = await db.execute({
      sql: `DELETE FROM listings WHERE id IN (${placeholders}) AND ${ORPHAN_PREDICATE}`,
      args: absorbed,
    });
    if (removed.rowsAffected > 0) {
      await db.execute({
        sql: `DELETE FROM listing_user_state
               WHERE listing_id IN (${placeholders})
                 AND listing_id NOT IN (SELECT id FROM listings)`,
        args: absorbed,
      });
    }
    absorbedCount += removed.rowsAffected;
  }

  return absorbedCount;
}

/**
 * Charge utile JSON d'une occurrence : tout ce que les colonnes ne portent pas.
 * Une seule définition, en regard de `rowToOccurrence` qui la relit — les deux
 * doivent rester le miroir l'une de l'autre.
 */
function occurrencePayload(listing: NormalizedListing): Record<string, unknown> {
  return {
    description: listing.description,
    imageUrls: listing.imageUrls,
    videoUrl: listing.videoUrl,
    views: listing.views,
    favorites: listing.favorites,
    chargesIncluded: listing.chargesIncluded,
    deposit: listing.deposit,
    tenantFees: listing.tenantFees,
    dpe: listing.dpe,
    ges: listing.ges,
    previousPrice: listing.previousPrice,
    maxOccupants: listing.maxOccupants,
    district: listing.district,
    features: listing.features,
    applicationStatus: listing.applicationStatus ?? null,
    contactName: listing.contact.name,
    contactFormUrl: listing.contact.formUrl,
    landlordKind: listing.contact.kind,
  };
}

/** Reconstruit une occurrence à partir d'une ligne SQL. */
function rowToOccurrence(row: Record<string, unknown>): NormalizedListing {
  const payload = JSON.parse(String(row['payload'] ?? '{}')) as Record<string, unknown>;
  const num = (key: string): number | null =>
    row[key] === null || row[key] === undefined ? null : Number(row[key]);
  const text = (key: string): string | null =>
    row[key] === null || row[key] === undefined ? null : String(row[key]);
  const bool = (key: string): boolean | null => {
    const value = row[key];
    return value === null || value === undefined ? null : Number(value) === 1;
  };

  return {
    id: String(row['id']),
    sourceId: String(row['source_id']),
    sourceRef: String(row['source_ref']),
    sourceUrl: String(row['source_url']),
    title: text('title'),
    description: (payload['description'] as string | null) ?? null,
    price: num('price'),
    charges: num('charges'),
    chargesIncluded: (payload['chargesIncluded'] as boolean | null) ?? null,
    deposit: (payload['deposit'] as number | null | undefined) ?? null,
    tenantFees: (payload['tenantFees'] as number | null | undefined) ?? null,
    area: num('area'),
    rooms: num('rooms'),
    bedrooms: num('bedrooms'),
    propertyType: String(row['property_type']) as NormalizedListing['propertyType'],
    furnished: bool('furnished'),
    flatShare: bool('flat_share'),
    dpe: (payload['dpe'] as string | null) ?? null,
    ges: (payload['ges'] as string | null) ?? null,
    previousPrice: (payload['previousPrice'] as number | null) ?? null,
    maxOccupants: (payload['maxOccupants'] as number | null) ?? null,
    features: Array.isArray(payload['features']) ? (payload['features'] as string[]) : [],
    address: text('address'),
    district: (payload['district'] as string | null) ?? null,
    city: text('city'),
    postalCode: text('postal_code'),
    latitude: num('latitude'),
    longitude: num('longitude'),
    contact: {
      name: (payload['contactName'] as string | null) ?? null,
      agencyName: text('contact_agency'),
      phone: text('contact_phone'),
      email: text('contact_email'),
      formUrl: (payload['contactFormUrl'] as string | null) ?? null,
      reference: text('contact_reference'),
      kind: (payload['landlordKind'] as 'agency' | 'private' | 'unknown') ?? 'unknown',
      providedBy: [String(row['source_id'])],
    },
    publishedAt: text('published_at'),
    availableAt: text('available_at'),
    imageUrls: (payload['imageUrls'] as string[] | undefined) ?? [],
    videoUrl: (payload['videoUrl'] as string | null | undefined) ?? null,
    views: (payload['views'] as number | null) ?? null,
    favorites: (payload['favorites'] as number | null) ?? null,
    applicationStatus:
      payload['applicationStatus'] === 'open' || payload['applicationStatus'] === 'full'
        ? payload['applicationStatus']
        : null,
    firstSeenAt: String(row['first_seen_at']),
    lastSeenAt: String(row['last_seen_at']),
    scrapedAt: String(row['scraped_at']),
    lifecycle: String(row['lifecycle']) as NormalizedListing['lifecycle'],
  };
}
