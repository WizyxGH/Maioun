/**
 * Routes de l'API (§36, §37, §35, §33, §63).
 *
 * Servi par le Worker Cloudflare, seul détenteur du jeton Turso. Ce module ne
 * dépend que des standards Web (`Request`, `Response`, `URL`) et de l'interface
 * `Client` de libsql — jamais de `node:fs`.
 *
 * IL A EU UN SECOND TRANSPORT, un serveur local qui servait aussi le site
 * depuis la machine. Il a été retiré (décision du 2026-09-04) : deux chemins
 * pour le même écran, c'était deux fois les mêmes cas à tenir, et le mode
 * publié couvre désormais tout ce que faisait l'autre. Ce qui est parti avec
 * lui : le dépôt et le téléchargement des PIÈCES du dossier, qui vivaient sur
 * ce disque-là. La route répond 501 et le dit.
 *
 * Routes :
 *   GET   /api/listings              liste triée par priorité d'action (§36)
 *   GET   /api/listings/:id          fiche complète (§37)
 *   PATCH /api/listings/:id          mise à jour du statut de suivi (§35)
 *   POST  /api/listings/:id/contact  enregistrement d'un contact manuel (§22)
 *   GET   /api/sources               état des sources (§63)
 *   GET   /api/stats                 statistiques de suivi (§33)
 *   GET/PUT /api/config              critères de recherche (§66)
 *   GET     /api/alerts             historique des annonces signalées (§29)
 *   GET/PUT /api/settings/<clé>      réglages du compte (recherches, repères)
 *   GET     /api/agencies            annuaire des agences rencontrées
 *   GET     /api/agencies/<nom>      une agence et ses annonces
 *   POST    /api/push                abonnement Web Push du compte (§29)
 *   POST    /api/push/unsubscribe    désabonnement
 *   /api/documents…                  501 : elles vivaient sur le disque local
 */

import type { Client } from '@libsql/client';
import { OPEN_TO_APPLICATIONS_SQL, traitConditions } from '../core/trait-filters.js';
import { shareAlive, survivalCurve } from '../core/survival.js';
import {
  ANONYMOUS_USER,
  CURRENT_USER,
  MVP_CRITERIA,
  NOTIFICATION_PREFERENCES_SETTING,
  CHANGELOG_SETTING,
  ALERTS_SEEN_SETTING,
  ONE_SHOT_SOURCES,
  districtBySlug,
  districtLabel,
  NICE_DISTRICTS,
  TENANT_PROFILE_SETTING,
  ONBOARDING_SETTING,
  REFERENCE_POINTS_SETTING,
  SAVED_SEARCHES_SETTING,
  SEARCH_CRITERIA_SETTING,
} from '@maioun/shared';

/**
 * Fonctionnalités disponibles uniquement en mode local (elles touchent le
 * disque de l'utilisateur). Le Worker cloud ne les fournit pas : les pièces de
 * candidature et le fichier de filtres ne quittent jamais la machine (§25, §26).
 */
/** Sous-ensemble des filtres utilisé pour le raffinage « live » des listes. */
/**
 * Les critères appliqués À LA LECTURE de la liste, et non à la collecte.
 *
 * TOUT CE QUI EST ICI PREND EFFET IMMÉDIATEMENT. Seuls le loyer et la surface
 * l'étaient ; les quatre autres se figeaient dans `matches_criteria` au moment
 * de la collecte, si bien que cocher « exclure les colocations » ne changeait
 * rien à la liste qu'on avait sous les yeux — et rien ne le disait.
 */
export interface LiveFilters {
  readonly maxPrice: number;
  readonly minPrice?: number;
  readonly minArea: number;
  readonly excludeFlatShare?: boolean;
  readonly excludeStudent?: boolean;
  readonly landlordFilter?: 'all' | 'private' | 'agency';
  readonly furnishedFilter?: 'all' | 'furnished' | 'unfurnished';
  readonly maxCommuteMinutes?: number;
  readonly availableBy?: string;
  readonly districts?: readonly string[];
  readonly includeUnknownDistrict?: boolean;
  /**
   * Communes, en minuscules. Ne sert qu'au visiteur : pour un compte, la
   * commune est déjà jugée dans `matches_criteria`.
   */
  readonly cities?: readonly string[];
}

/**
 * CE QU'ON PEUT LIRE SANS COMPTE — le catalogue, et rien de plus.
 *
 * Consulter est libre : demander une inscription pour savoir ce qu'il y a à
 * louer ferait fuir avant d'avoir montré quoi que ce soit. Ces quatre
 * ressources décrivent le MARCHÉ, pas une personne : les annonces, les
 * quartiers où il y en a, les sources d'où elles viennent, les agences qui les
 * publient.
 *
 * TOUT LE RESTE EXIGE UNE SESSION, y compris en lecture. Les statistiques, les
 * alertes, les réglages et les critères disent quelque chose de QUELQU'UN —
 * les servir à un inconnu serait les publier.
 *
 * En GET uniquement, et le vérificateur l'impose à côté : une ressource de
 * cette liste ne devient pas modifiable pour autant.
 */
const ANONYMOUS_READS: ReadonlySet<string> = new Set([
  'listings',
  'districts',
  'sources',
  'agencies',
  // La répartition des loyers décrit le marché, comme les quartiers.
  'price-histogram',
]);

/** Statuts de suivi acceptés par l'API (§35). */
const TRACKING_STATUSES = new Set([
  'new',
  'toContact',
  'contacted',
  'replied',
  'visitOffered',
  'visitScheduled',
  'visited',
  'rejected',
  'rented',
  'ignored',
]);

/** Réponse d'erreur JSON, sans détail exploitable. */
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function json(data: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Les données sont personnelles : aucun cache intermédiaire.
      'cache-control': 'private, no-store',
      ...cors,
    },
  });
}

/**
 * Reconstitue une fiche à partir de sa ligne et de son payload JSON.
 *
 * La ligne vient de la jointure avec l'état et le score DU LECTEUR : c'est elle
 * qui porte ce qui est personnel — raisons du score, trajets (voir
 * `personalScoring`). Le payload commun ne les fournit jamais : le 2026-09-11,
 * un visiteur anonyme y lisait « Travail : 62 min, 14,4 km à vol d'oiseau »,
 * de quoi situer le domicile du compte principal.
 */
export function rowToListing(row: Record<string, unknown>): Record<string, unknown> {
  // `payload_light` n'existe que pour la LISTE, où description et raisons de
  // score ont été retirées en SQL. La fiche, elle, n'a que `payload`.
  const source = row['payload_light'] ?? row['payload'];
  /**
   * UNE FICHE ALLÉGÉE DOIT SE DIRE TELLE, et rien ne le disait.
   *
   * Le site garde une seule collection d'annonces. Celle qu'il va chercher
   * pour l'écran de fiche — complète — y était écrasée par la version allégée
   * de la liste dès que celle-ci arrivait, et l'écran ne redemandait pas la
   * complète : de son point de vue, l'annonce était déjà là.
   *
   * Il affichait alors `description.value` sur une description RETIRÉE en SQL,
   * ce qui lève, ce qui fait tomber tout le rendu React — page blanche, sans
   * un mot. La course dépendait de l'ordre d'arrivée des deux requêtes : la
   * fiche s'ouvrait correctement une fois sur deux.
   */
  const partial = row['payload_light'] !== undefined && row['payload_light'] !== null;
  const payload = JSON.parse(String(source ?? '{}')) as Record<string, unknown>;
  const reason = archiveReason(row, payload['applicationStatus'] === 'full');
  return {
    id: String(row['id']),
    lifecycle: row['lifecycle'],
    // Les champs personnels ne se lisent QUE sous leurs alias `user_*` : voir
    // `readerColumns`.
    tracking: row['user_tracking'] ?? 'new',
    firstSeenAt: row['first_seen_at'],
    lastSeenAt: row['last_seen_at'],
    matchesCriteria: Number(row['user_matches_criteria'] ?? 0) === 1,
    actionPriority: Number(row['user_action_priority'] ?? 0),
    viewed: Number(row['user_viewed'] ?? 0) === 1,
    archived: reason !== null,
    archiveReason: reason,
    favorite: Number(row['user_favorite'] ?? 0) === 1,
    rented: Number(row['rented'] ?? 0) === 1,
    ...(partial ? { partial: true } : {}),
    /**
     * LA DATE DE L'ALERTE, ET SON ABSENCE VIDAIT TOUT L'HISTORIQUE.
     *
     * L'écran des notifications ne garde que les annonces qui portent cette
     * date — c'est elle qui les classe et les groupe par jour. Sans elle,
     * chaque ligne était écartée, et la page annonçait « aucune alerte sur les
     * trente derniers jours » alors que la base en comptait cent dix-huit.
     *
     * La ligne existait dans le client qui parlait à Turso directement. Elle
     * n'a pas été reprise quand l'API est passée par le Worker, le 2026-09-04 :
     * `notified_at` était bien SÉLECTIONNÉ en SQL, il n'était simplement plus
     * recopié ici. Rien ne pouvait le signaler — un champ absent d'un objet
     * JavaScript ne lève pas, il vaut `undefined`, et un filtre le rejette en
     * silence. Les données fictives de la démonstration, elles, le portaient :
     * les scénarios end-to-end passaient donc, sur un historique bien rempli.
     */
    /**
     * LA DATE DU COMPTE, et elle seule. La colonne `notified_at` de `listings`
     * servait de repli : c'était celle du compte principal, montrée à tous.
     * La migration 0041 l'a recopiée dans son état.
     */
    notifiedAt: row['user_notified_at'] ?? null,
    goneNotifiedAt: row['gone_notified_at'] ?? null,
    remindedAt: row['reminded_at'] ?? null,
    ...payload,
    ...personalScoring(row, payload, partial),
  };
}

/** Pourquoi une fiche est rangée avec les archivées, ou `null`. */
export type ArchiveReason = 'rented' | 'offline' | 'applicationsFull' | 'user';

/**
 * Archivée d'office quand la source est formelle — louée, retirée, fermée aux
 * candidatures —, sans écriture : c'est vrai pour tous les comptes, et cela
 * cesse de l'être si l'annonce revient. Sinon, par le geste du lecteur.
 */
export function archiveReason(
  row: Record<string, unknown>,
  applicationFull: boolean,
): ArchiveReason | null {
  if (Number(row['rented'] ?? 0) === 1) return 'rented';
  if (row['lifecycle'] === 'inactive') return 'offline';
  if (applicationFull) return 'applicationsFull';
  return Number(row['user_archived'] ?? 0) === 1 ? 'user' : null;
}

/**
 * Ni louée ni retirée d'après la source. Le doute (`possiblyInactive`) reste
 * disponible : seule la certitude archive.
 */
const AVAILABLE_SQL = "listings.lifecycle != 'inactive' AND listings.rented = 0";

/** Un score tel que la fiche le range : une valeur, des raisons. */
type StoredScores = Record<string, { value?: unknown; reasons?: unknown }>;

function parseJson<T>(raw: unknown): T | null {
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * LE DÉTAIL DU SCORE ET LES TRAJETS SONT CEUX DU LECTEUR.
 *
 * La fiche commune porte ceux du compte principal : ses raisons citent son
 * budget (« 950 € ≤ 1 000 € de budget »), ses trajets situent son domicile.
 * Chaque compte reçoit les siens, lus dans `listing_user_score`. Sans ligne —
 * visiteur anonyme, fiche pas encore scorée —, aucun trajet et des scores
 * sans raisons : l'inconnu plutôt que les critères de quelqu'un d'autre.
 */
function personalScoring(
  row: Record<string, unknown>,
  payload: Record<string, unknown>,
  partial: boolean,
): { scores?: StoredScores; distances: unknown[] } {
  const own = parseJson<StoredScores>(row['user_scores']);
  const shared = payload['scores'] as StoredScores | undefined;
  const base = own ?? shared;
  // La liste allégée ne transporte pas les raisons ; sans score propre, on les tait.
  const withoutReasons = partial || own === null;
  const scores =
    base === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(base).map(([name, score]) => [
            name,
            withoutReasons ? { ...score, reasons: [] } : score,
          ]),
        );
  return {
    ...(scores !== undefined ? { scores } : {}),
    distances: parseJson<unknown[]>(row['user_distances']) ?? [],
  };
}

/**
 * Une fiche VUE PAR QUELQU'UN.
 *
 * Les annonces sont communes ; « je l'ai mise en favori », « je l'ai
 * contactée », « je l'ai archivée » ne le sont pas. Ces états vivent dans
 * `listing_user_state`, une ligne par (utilisateur, annonce), et seulement pour
 * les annonces sur lesquelles quelqu'un a fait quelque chose.
 *
 * D'où la jointure GAUCHE et les `COALESCE` : une annonce que vous n'avez
 * jamais touchée n'a pas de ligne, et vaut donc « ni vue, ni archivée, ni
 * favorite, statut nouveau ».
 *
 * ATTENTION AUX HOMONYMES. `listings` a gardé ses colonnes d'avant le
 * multi-compte (`viewed`, `favorite`, `tracking`, `matches_criteria`…). Deux
 * colonnes du même nom dans un résultat : libsql rend la PREMIÈRE. Placé en
 * tête, `listings.*` imposait donc l'état du compte principal à tous les
 * lecteurs, visiteurs compris. D'où des colonnes explicites et un préfixe
 * `user_` que `listings` ne porte pas.
 */
/**
 * L'état PERSONNEL et le SCORE personnel, joints ensemble.
 *
 * `listing_user_state` porte les décisions — vu, archivé, favori, suivi.
 * `listing_user_score` porte la pertinence : « correspond à MES critères »,
 * « priorité pour MOI », « trajet depuis MON domicile ». Cette seconde table
 * est née le jour où le multi-compte a cessé d'être théorique : `listings`
 * portait ces valeurs, calculées pour un seul utilisateur, et les servait à
 * tout le monde.
 *
 * DEUX JOINTURES GAUCHES, ET LE MÊME `user_id` DEUX FOIS : une annonce qu'on
 * n'a jamais touchée n'a pas de ligne d'état, et une annonce apparue depuis la
 * dernière collecte n'a pas encore de ligne de score. Ni l'une ni l'autre ne
 * doit disparaître de la base — elles valent « rien décidé » et « pas encore
 * évaluée ».
 */
const USER_STATE_JOIN = `LEFT JOIN listing_user_state AS us
   ON us.listing_id = listings.id AND us.user_id = ?
 LEFT JOIN listing_user_score AS sc
   ON sc.listing_id = listings.id AND sc.user_id = ?`;

/** Une constante du code en littéral SQL. Jamais une saisie : celles-ci sont liées. */
function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Le catalogue d'un visiteur : des logements, en ligne, dans la commune par
 * défaut. En littéraux plutôt qu'en paramètres, pour servir aussi en colonne
 * sans décaler les arguments de la requête.
 */
const CATALOGUE_BASE_SQL = `listings.lifecycle != 'inactive'
  AND listings.property_type NOT IN ('parking', 'commercial')`;
const CATALOGUE_SQL = `${CATALOGUE_BASE_SQL}
  AND listings.city IN (${MVP_CRITERIA.cities.map(sqlText).join(', ')})`;

/**
 * Les champs personnels du lecteur, sous des noms que `listings` ne porte pas.
 *
 * Un visiteur n'a pas de score : « dans les critères » vaut pour lui
 * « dans le catalogue », ce que sa liste montre par défaut. Sans quoi chaque
 * fiche lui afficherait « hors critères ».
 */
function readerColumns(userId: string): string {
  const matches =
    userId === ANONYMOUS_USER ? `(${CATALOGUE_SQL})` : 'COALESCE(sc.matches_criteria, 0)';
  return `${matches} AS user_matches_criteria,
  COALESCE(sc.action_priority, 0) AS user_action_priority,
  COALESCE(us.viewed, 0) AS user_viewed,
  COALESCE(us.archived, 0) AS user_archived,
  COALESCE(us.favorite, 0) AS user_favorite,
  COALESCE(us.tracking, 'new') AS user_tracking,
  us.notified_at AS user_notified_at,
  us.gone_notified_at AS gone_notified_at,
  us.reminded_at AS reminded_at,
  sc.distances AS user_distances`;
}

/**
 * Les colonnes d'une fiche : la fiche commune, puis le lecteur.
 *
 * @param payload la fiche entière par défaut ; les alertes passent la version
 *   allégée (`LIST_PAYLOAD`).
 */
function listingColumns(userId: string, payload = 'listings.payload AS payload'): string {
  return `listings.id AS id,
  listings.lifecycle AS lifecycle,
  listings.first_seen_at AS first_seen_at,
  listings.last_seen_at AS last_seen_at,
  listings.rented AS rented,
  ${payload},
  sc.scores AS user_scores,
  ${readerColumns(userId)}`;
}

/**
 * Ce que la LISTE n'a pas besoin de transporter.
 *
 * Les fiches actives pèsent 5,3 Mo de `payload`, envoyés à chaque chargement.
 * Sur le palier gratuit d'un Worker — dix millisecondes de processeur par
 * requête — analyser puis réémettre tout cela à chaque fois est le premier
 * poste de dépense, et de loin.
 *
 * DEUX CHAMPS SEULEMENT SONT RETIRÉS, et parce que la carte ne les lit pas :
 *
 *   - `description` (0,70 Mo) : la carte affiche un titre, jamais le texte ;
 *   - les `reasons` des quatre scores (0,78 Mo) : la carte montre une barre de
 *     priorité, et le détail des raisons appartient à la fiche (§37).
 *
 * CE QUI RESTE, ET POURQUOI. Les photos servent au carrousel de la carte, le
 * contact à son bouton d'appel, les occurrences au filtre par source : les
 * couper aurait cassé l'écran pour économiser un peu moins.
 *
 * La FICHE, elle, recharge tout : `getListing` ne passe pas par ici.
 *
 * La liste principale lit désormais une version préparée à l'écriture
 * (`listColumnsSql`) ; ce calcul reste celui des alertes, et son repli.
 */
const LIST_PAYLOAD_EXPRESSION = `json_remove(listings.payload,
  '$.description',
  '$.scores.match.reasons',
  '$.scores.opportunity.reasons',
  '$.scores.visitProbability.reasons',
  '$.scores.risk.reasons')`;
const LIST_PAYLOAD = `${LIST_PAYLOAD_EXPRESSION} AS payload_light`;

/**
 * Les colonnes de la LISTE : de quoi recopier la fiche préparée à l'écriture
 * (`core/list-payload.ts`) sans analyser ni réémettre son JSON.
 *
 * Les champs personnels sont ceux de la fiche complète (`readerColumns`) : la
 * liste ne doit pas contredire la fiche qui la remplace à l'ouverture.
 *
 * `list_hash` différent de `content_hash` : la fiche a été réécrite par un code
 * qui ignore les colonnes préparées. On rend alors de quoi refaire le calcul
 * d'avant — `payload_light` et le score brut —, et seulement dans ce cas.
 */
function listColumnsSql(userId: string): string {
  return `listings.id AS id,
  listings.lifecycle AS lifecycle,
  listings.first_seen_at AS first_seen_at,
  listings.last_seen_at AS last_seen_at,
  listings.rented AS rented,
  ${readerColumns(userId)},
  sc.list_hash IS sc.content_hash AS score_ready,
  CASE WHEN listings.list_hash IS listings.content_hash THEN listings.list_payload END AS list_payload,
  CASE WHEN listings.list_hash IS listings.content_hash THEN listings.list_scores END AS list_scores,
  CASE WHEN listings.list_hash IS listings.content_hash
    THEN json_extract(listings.list_payload, '$.applicationStatus') IS 'full' END AS application_full,
  CASE WHEN listings.list_hash IS NOT listings.content_hash THEN ${LIST_PAYLOAD_EXPRESSION} END AS payload_light,
  CASE WHEN sc.list_hash IS sc.content_hash THEN sc.list_scores END AS own_list_scores,
  CASE WHEN sc.list_hash IS NOT sc.content_hash OR listings.list_hash IS NOT listings.content_hash
    THEN sc.scores END AS user_scores`;
}

/** Encode une valeur de colonne ; `null` pour une colonne absente. */
function jsonValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Une fiche de la liste, en JSON, par ASSEMBLAGE de textes déjà encodés.
 *
 * `JSON.parse` de ce texte vaut `rowToListing(row)`, clé pour clé. L'ordre
 * compte : les champs de la ligne d'abord, la fiche ensuite, les scores et
 * trajets du lecteur en dernier — c'est la dernière occurrence d'une clé qui
 * l'emporte à la lecture, comme l'étalement dans `rowToListing`.
 */
export function listItemJson(row: Record<string, unknown>): string {
  const stored = row['list_payload'];
  if (typeof stored !== 'string' || !stored.startsWith('{') || !stored.endsWith('}')) {
    return JSON.stringify(rowToListing(row));
  }
  const body = stored.slice(1, -1);
  const reason = archiveReason(row, Number(row['application_full']) === 1);
  const scores = listScoresJson(row);
  return (
    `{"id":${JSON.stringify(String(row['id']))}` +
    `,"lifecycle":${jsonValue(row['lifecycle'])}` +
    `,"tracking":${jsonValue(row['user_tracking'] ?? 'new')}` +
    `,"firstSeenAt":${jsonValue(row['first_seen_at'])}` +
    `,"lastSeenAt":${jsonValue(row['last_seen_at'])}` +
    `,"matchesCriteria":${Number(row['user_matches_criteria'] ?? 0) === 1}` +
    `,"actionPriority":${jsonValue(Number(row['user_action_priority'] ?? 0))}` +
    `,"viewed":${Number(row['user_viewed'] ?? 0) === 1}` +
    `,"archived":${reason !== null}` +
    `,"archiveReason":${jsonValue(reason)}` +
    `,"favorite":${Number(row['user_favorite'] ?? 0) === 1}` +
    `,"rented":${Number(row['rented'] ?? 0) === 1}` +
    `,"partial":true` +
    `,"notifiedAt":${jsonValue(row['user_notified_at'])}` +
    `,"goneNotifiedAt":${jsonValue(row['gone_notified_at'])}` +
    `,"remindedAt":${jsonValue(row['reminded_at'])}` +
    (body === '' ? '' : `,${body}`) +
    (scores === null ? '' : `,"scores":${scores}`) +
    `,"distances":${listDistancesJson(row)}}`
  );
}

/** Les scores du lecteur, à défaut ceux de la fiche ; raisons vidées. */
function listScoresJson(row: Record<string, unknown>): string | null {
  const own = row['own_list_scores'];
  if (typeof own === 'string') return own;
  const shared = typeof row['list_scores'] === 'string' ? row['list_scores'] : null;
  // Score du compte écrit sans sa version préparée : le calcul d'avant.
  if (row['user_scores'] !== null && row['user_scores'] !== undefined) {
    const payload = { scores: parseJson<StoredScores>(shared) ?? undefined };
    const { scores } = personalScoring(row, payload, true);
    return scores === undefined ? null : JSON.stringify(scores);
  }
  return shared;
}

/** Les trajets du lecteur ; recopiés tels quels quand la collecte les a écrits. */
function listDistancesJson(row: Record<string, unknown>): string {
  const raw = row['user_distances'];
  if (Number(row['score_ready']) === 1) {
    return typeof raw === 'string' && raw !== '' && raw !== 'null' ? raw : '[]';
  }
  return JSON.stringify(parseJson<unknown[]>(raw) ?? []);
}

/** Ce qui décrit une interrogation de la liste, sans l'exécuter. */
interface ListQuery {
  readonly filter: string;
  readonly filterArgs: readonly (string | number)[];
  readonly orderBy: string;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Traduit les paramètres d'URL en clauses SQL.
 *
 * Extrait de `listListings` pour être partagé avec le calcul de version : les
 * deux DOIVENT filtrer à l'identique, faute de quoi la version dirait « rien
 * n'a changé » pour un ensemble qui n'est pas celui qu'on rend.
 */
/**
 * Les ordres de tri acceptés, et leur traduction en SQL.
 *
 * UNE TABLE plutôt qu'une cascade de ternaires : c'est elle qu'on relit pour
 * savoir ce que le site propose, et un tri inconnu retombe sur la priorité
 * plutôt que de rendre une liste dans un ordre arbitraire.
 *
 * LES VALEURS MANQUANTES VONT EN DERNIER, toujours. SQLite classe les NULL en
 * tête d'un tri croissant : les cinq premières annonces du classement « moins
 * cher » n'avaient pas de prix du tout, et celles du classement « le plus
 * proche » seraient celles dont on ignore où elles sont.
 *
 * « LE PLUS PROCHE » TRIE SUR UNE DURÉE, pas sur des kilomètres. La distance
 * n'est délibérément pas publiée (§26 : couplée aux coordonnées de l'annonce,
 * elle permettrait de retrouver le domicile). Une durée de trajet répond de
 * toute façon mieux à la question qu'on se pose vraiment.
 */
const ORDER_BY: Readonly<Record<string, string>> = {
  priority: 'sc.action_priority DESC, first_seen_at DESC',
  recent: 'first_seen_at DESC',
  price: 'price IS NULL, price ASC',
  closest: 'sc.commute_minutes IS NULL, sc.commute_minutes ASC, sc.action_priority DESC',
  // LA SURFACE, DE LA PLUS GRANDE À LA PLUS PETITE. `area IS NULL` en tête de
  // clause : sans lui, SQLite place les NULL en premier d'un tri décroissant,
  // et les annonces dont la surface est inconnue coifferaient les plus
  // grandes — le contraire de ce qu'on demande en triant par surface.
  area: 'area IS NULL, area DESC, sc.action_priority DESC',
};

/**
 * `anonymous` : le lecteur n'a pas de compte, donc aucun score personnel.
 *
 * LA CONSULTATION LIBRE MONTRAIT UNE LISTE VIDE, depuis qu'elle existe. La liste
 * ne garde que les annonces « dans les critères » du lecteur — lues dans SES
 * scores. L'identité anonyme n'en possède aucun, par construction : rien ne
 * passait. Relevé le 2026-09-11 : « 0 annonce sur 0 » pour quiconque arrivait
 * de la page de présentation, qui promet « toutes les locations de Nice ». Les
 * scénarios de bout en bout ne pouvaient pas le voir : ils tournent en
 * démonstration, où l'on est toujours connecté.
 *
 * Un visiteur voit donc le CATALOGUE : les annonces actives de logement dans
 * la commune par défaut, les plus récentes d'abord — sans score, « priorité »
 * n'a pas de sens pour lui. Il affine avec les filtres de l'écran.
 */
export function buildListQuery(url: URL, filters?: LiveFilters, anonymous = false): ListQuery {
  const limit = Math.min(
    500,
    Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '30', 10)),
  );
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10));

  /**
   * §36 : par défaut, le classement suit la priorité d'action — pas le prix.
   *
   * « RÉCENT » SE COMPTE À LA DÉCOUVERTE, pas à la dernière vue. `last_seen_at`
   * se rafraîchit à CHAQUE collecte : une annonce en ligne depuis trois mois y
   * paraissait plus récente qu'une trouvée le matin même. Relevé du
   * 2026-09-05 : la première du classement avait été découverte quatre jours
   * plus tôt, la vingtième le jour même. `first_seen_at` est complet — aucune
   * valeur nulle — et dit ce que l'utilisateur entend par « nouveau » :
   * nouveau POUR LUI. `published_at` serait plus juste encore, mais manque
   * dans deux tiers des fiches.
   *
   * « MOINS CHER » MET LES SANS-PRIX EN DERNIER. SQLite classe les valeurs
   * nulles EN TÊTE d'un tri croissant : les cinq premières annonces du
   * classement « prix » n'avaient pas de prix du tout.
   */
  const sort = url.searchParams.get('sort') ?? 'priority';
  // Sans score, la priorité est la même partout : on classe par nouveauté.
  const tri = anonymous && (sort === 'priority' || sort === 'closest') ? 'recent' : sort;
  const orderBy = ORDER_BY[tri] ?? ORDER_BY['priority']!;

  // §53 scénario 3 : les annonces hors critères ne remontent pas par défaut.
  const includeAll = url.searchParams.get('all') === 'true';
  const conditions: string[] = [];
  const filterArgs: Array<string | number> = [];

  // TOUS les filtres s'appliquent en direct : les changer depuis l'interface
  // se répercute sur la liste immédiatement, sans re-collecter. Un champ NULL
  // n'exclut JAMAIS — c'est ce qui évite qu'une annonce disparaisse parce que
  // la source s'est tue sur un détail.
  const applyFilters = (live: LiveFilters): void => {
    conditions.push('(price IS NULL OR price <= ?)');
    filterArgs.push(live.maxPrice);
    if (live.minPrice !== undefined) {
      conditions.push('(price IS NULL OR price >= ?)');
      filterArgs.push(live.minPrice);
    }
    conditions.push('(area IS NULL OR area >= ?)');
    filterArgs.push(live.minArea);
    // Les préférences vivent dans `core/trait-filters` : la LISTE et les
    // NOTIFICATIONS s'en servent toutes deux, et deux copies auraient fini
    // par diverger — on aurait alors signalé ce qu'on n'affiche pas.
    const traits = traitConditions(live);
    conditions.push(...traits.sql);
    filterArgs.push(...traits.args);
  };

  if (!includeAll && anonymous && filters === undefined) {
    // Même prédicat que son « dans les critères » : la liste et la fiche concordent.
    conditions.push(`(${CATALOGUE_SQL})`);
  } else if (!includeAll && anonymous && filters !== undefined) {
    // Recherche partagée : le catalogue, mais dans SES communes et SES critères.
    const cities =
      filters.cities !== undefined && filters.cities.length > 0
        ? filters.cities
        : MVP_CRITERIA.cities;
    conditions.push(
      `(${CATALOGUE_BASE_SQL})`,
      `LOWER(listings.city) IN (${cities.map(() => '?').join(',')})`,
    );
    filterArgs.push(...cities);
    applyFilters(filters);
  } else if (!includeAll) {
    conditions.push('COALESCE(sc.matches_criteria, 0) = 1');
    if (filters !== undefined) applyFilters(filters);
  }

  // Archivées à la main ou d'office — louées, retirées, fermées aux
  // candidatures : masquées, favoris compris, sauf dans la vue des archivées.
  if (url.searchParams.get('archived') !== 'true') {
    conditions.push('COALESCE(us.archived, 0) = 0', OPEN_TO_APPLICATIONS_SQL, AVAILABLE_SQL);
  }
  // Vue « favoris uniquement » sur demande.
  if (url.searchParams.get('favorite') === 'true') {
    conditions.push('COALESCE(us.favorite, 0) = 1');
  }

  return {
    filter: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    filterArgs,
    orderBy,
    limit,
    offset,
  };
}

/**
 * Une empreinte de la liste, obtenue SANS la transporter.
 *
 * POURQUOI. La liste ne bouge qu'à la collecte, toutes les vingt minutes, ou
 * quand on met une annonce en favori. Entre-temps, chaque ouverture de page
 * renvoyait les mêmes 3,8 Mo — analysés puis réémis par un Worker qui ne
 * dispose que de dix millisecondes de processeur.
 *
 * Trois agrégats suffisent à savoir si quoi que ce soit a changé : combien de
 * fiches, la plus récente modification d'annonce, et la plus récente
 * modification d'état pour CE compte. Un favori posé change la troisième.
 *
 * Cette requête remplace le `COUNT(*)` qu'on faisait déjà : à contenu
 * inchangé, on passe donc de deux interrogations dont une lourde à une seule
 * légère.
 */
/**
 * Change à chaque évolution de la FORME de la réponse : une copie gardée par le
 * navigateur avant un déploiement ne doit pas être revalidée après.
 */
const LIST_FORMAT = 'liste-3';

async function listSignature(
  db: Client,
  query: ListQuery,
  userId: string,
): Promise<{ etag: string; total: number }> {
  // Le score du compte compte aussi : la collecte le réécrit quand les critères
  // changent, sans toucher ni à la fiche ni à l'état.
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS n,
                 MAX(listings.updated_at) AS listing_at,
                 MAX(us.updated_at) AS state_at,
                 MAX(sc.updated_at) AS score_at
          FROM listings ${USER_STATE_JOIN} ${query.filter}`,
    args: [userId, userId, ...query.filterArgs],
  });
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const total = Number(row['n'] ?? 0);
  /**
   * LE COMPTE ET SES FILTRES FONT PARTIE DE L'EMPREINTE. Le navigateur range la
   * réponse sous son adresse seule : sans le compte, une autre session sur le
   * même navigateur pouvait se voir confirmer la copie du précédent. Sans les
   * filtres, changer de quartiers pour un nombre égal d'annonces aussi.
   */
  const parts = [
    LIST_FORMAT,
    userId,
    total,
    String(row['listing_at'] ?? ''),
    String(row['state_at'] ?? ''),
    String(row['score_at'] ?? ''),
    query.filter,
    JSON.stringify(query.filterArgs),
    query.orderBy,
    query.limit,
    query.offset,
  ];
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('\n')));
  const hex = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return { etag: `W/"${hex}"`, total };
}

/** `If-None-Match` désigne-t-il cette version ? Comparaison faible, liste permise. */
export function etagMatches(header: string | null, etag: string): boolean {
  if (header === null) return false;
  const bare = (tag: string): string => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => tag.trim() === '*' || bare(tag) === bare(etag));
}

/** Le corps de la réponse, assemblé sans passer par des objets. */
async function listListingsJson(
  db: Client,
  query: ListQuery,
  userId: string,
  total: number,
): Promise<string> {
  const result = await db.execute({
    sql: `SELECT ${listColumnsSql(userId)} FROM listings ${USER_STATE_JOIN} ${query.filter}
          ORDER BY ${query.orderBy} LIMIT ? OFFSET ?`,
    args: [userId, userId, ...query.filterArgs, query.limit, query.offset],
  });
  const items = result.rows.map((row) => listItemJson(row as Record<string, unknown>));
  return `{"listings":[${items.join(',')}],"total":${total},"limit":${query.limit},"offset":${query.offset}}`;
}

/**
 * LA FICHE QUI A REPRIS UNE ANNONCE ABSORBÉE, ou `null`.
 *
 * Quand deux fiches n'en font plus qu'une, le groupe survivant porte
 * l'identifiant de l'occurrence la plus anciennement connue et l'autre ligne
 * est supprimée (voir la purge des orphelines). Tout ce qui désignait
 * l'ancienne — une liste déjà affichée, un lien collé, une notification —
 * tombait alors sur « annonce introuvable » alors que le logement est toujours
 * là, sous un autre identifiant.
 *
 * LA TRACE EST DANS LES OCCURRENCES : l'ancien identifiant y reste celui d'une
 * occurrence, et son `group_id` nomme la fiche qui la porte aujourd'hui. Rien
 * à écrire ni à garder en plus : la table de renvoi existait déjà.
 */
async function absorbedInto(db: Client, id: string): Promise<string | null> {
  const result = await db.execute({
    sql: `SELECT o.group_id AS id FROM occurrences AS o
          JOIN listings ON listings.id = o.group_id
          WHERE o.id = ? AND o.group_id != o.id`,
    args: [id],
  });
  const heir = result.rows[0]?.['id'];
  return typeof heir === 'string' ? heir : null;
}

async function getListing(db: Client, id: string, userId: string): Promise<unknown | null> {
  const readRow = async (key: string): Promise<Record<string, unknown> | undefined> => {
    const result = await db.execute({
      sql: `SELECT ${listingColumns(userId)} FROM listings ${USER_STATE_JOIN} WHERE listings.id = ?`,
      args: [userId, userId, key],
    });
    return result.rows[0] as Record<string, unknown> | undefined;
  };

  let listingId = id;
  let row = await readRow(listingId);
  // Identifiant inconnu : peut-être celui d'une fiche absorbée par une autre.
  // La fiche rendue porte alors SON identifiant — l'écran corrige son adresse.
  if (row === undefined) {
    const heir = await absorbedInto(db, id);
    if (heir === null) return null;
    listingId = heir;
    row = await readRow(listingId);
    if (row === undefined) return null;
  }

  // LE JOURNAL EST PERSONNEL. Sans le filtre par compte, la fiche montrait les
  // démarches de TOUS les comptes : qui avait écrit, quand, et le texte du
  // message. La colonne existait depuis le passage au multi-compte, personne ne
  // s'en servait ici.
  const attempts = await db.execute({
    sql: 'SELECT * FROM contact_attempts WHERE listing_id = ? AND user_id = ? ORDER BY sent_at DESC',
    args: [listingId, userId],
  });

  /** Relit la liste JSON des pièces jointes, tolérante aux valeurs anciennes. */
  function parseDocumentsList(raw: unknown): string[] {
    if (typeof raw !== 'string' || raw === '') return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }

  return {
    ...rowToListing(row),
    contactAttempts: attempts.rows.map((attempt) => ({
      id: attempt['id'],
      channel: attempt['channel'],
      trigger: attempt['trigger'],
      sentAt: attempt['sent_at'],
      followUpIndex: Number(attempt['follow_up_index']),
      outcome: attempt['outcome'],
      documents: parseDocumentsList(attempt['documents']),
    })),
  };
}

/**
 * L'annuaire des agences rencontrées.
 *
 * IL N'EXISTAIT PAS. Le nom d'une agence apparaissait sur une fiche, sans rien
 * derrière : impossible de savoir combien d'annonces elle publiait, ni de
 * retrouver son numéro sans rouvrir une annonce au hasard. Or c'est une
 * question qu'on se pose vraiment — une agence qu'on a déjà appelée, un
 * interlocuteur qui a plusieurs biens dans le quartier.
 *
 * L'AGRÉGATION SE FAIT EN BASE, en une requête. La faire côté navigateur
 * aurait demandé de transporter les coordonnées de toutes les annonces, que la
 * liste retire précisément pour ne pas les payer (§30).
 *
 * Le nom est la clé, faute de mieux : les sources ne publient pas
 * d'identifiant d'agence. Deux orthographes donneront donc deux entrées — on
 * préfère ça à un regroupement inventé (§17).
 */
async function listAgencies(db: Client): Promise<unknown> {
  const result = await db.execute(`
    -- group_id et non listing_id : c'est ainsi que la table occurrences
    -- designe la fiche qui la regroupe. Le mauvais nom compilait sans broncher
    -- (une chaine SQL n'est pas typee) et l'ecran affichait « aucune agence
    -- identifiee » alors que 966 occurrences en nomment une.
    SELECT o.contact_agency                AS name,
           COUNT(DISTINCT o.group_id)      AS listings,
           MAX(o.contact_phone)            AS phone,
           MAX(o.contact_email)            AS email,
           GROUP_CONCAT(DISTINCT o.source_id) AS sources,
           MAX(l.last_seen_at)             AS lastSeenAt
    FROM occurrences o
    JOIN listings l ON l.id = o.group_id
    WHERE o.contact_agency IS NOT NULL AND TRIM(o.contact_agency) != ''
      AND l.lifecycle != 'inactive' AND l.rented = 0
    GROUP BY o.contact_agency
    ORDER BY listings DESC, name ASC
  `);

  return {
    agencies: result.rows.map((row) => ({
      name: String(row['name']),
      listings: Number(row['listings']),
      phone: row['phone'] ?? null,
      email: row['email'] ?? null,
      sources: String(row['sources'] ?? '')
        .split(',')
        .filter((one) => one !== ''),
      lastSeenAt: row['lastSeenAt'] ?? null,
    })),
  };
}

/** Une agence et ce qu'elle propose en ce moment. */
async function getAgency(db: Client, name: string, userId: string): Promise<unknown> {
  const listings = await db.execute({
    sql: `SELECT ${listingColumns(userId)} FROM listings ${USER_STATE_JOIN}
          WHERE listings.id IN (
            SELECT group_id FROM occurrences WHERE contact_agency = ?
          )
          AND listings.lifecycle != 'inactive' AND listings.rented = 0
          ORDER BY COALESCE(sc.action_priority, 0) DESC, listings.last_seen_at DESC
          LIMIT 200`,
    args: [userId, userId, name],
  });

  const contact = await db.execute({
    sql: `SELECT MAX(contact_phone) AS phone, MAX(contact_email) AS email,
                 GROUP_CONCAT(DISTINCT source_id) AS sources
          FROM occurrences WHERE contact_agency = ?`,
    args: [name],
  });
  const row = contact.rows[0];

  return {
    agency: {
      name,
      listings: listings.rows.length,
      phone: row?.['phone'] ?? null,
      email: row?.['email'] ?? null,
      sources: String(row?.['sources'] ?? '')
        .split(',')
        .filter((one) => one !== ''),
    },
    listings: listings.rows.map((one) => rowToListing(one as Record<string, unknown>)),
  };
}

/**
 * Les annonces dont ce compte a été PRÉVENU, quel que soit leur sort depuis.
 *
 * L'historique se construisait à partir de la liste courante, et perdait donc
 * tout ce que la liste écarte. Relevé du 2026-09-05 : sur cent seize annonces
 * signalées, trente-deux restaient visibles — les quatre-vingt-quatre autres
 * étaient devenues « hors critères » parce que la détection des colocations et
 * des locations étudiantes s'était AMÉLIORÉE, et les excluait désormais.
 *
 * C'est juste pour la liste, et faux pour un historique. « Vous avez été
 * prévenu de cette annonce » est un fait passé : le reclasser ne l'efface pas.
 * Cette route ignore donc les critères, l'archivage et le cycle de vie, et ne
 * retient qu'une chose — une alerte est-elle partie.
 *
 * Deux cents entrées au plus : un historique se parcourt, il ne s'archive pas.
 */
async function listAlerts(db: Client, userId: string): Promise<unknown> {
  const result = await db.execute({
    sql: `SELECT ${listingColumns(userId, LIST_PAYLOAD)} FROM listings ${USER_STATE_JOIN}
          WHERE us.notified_at IS NOT NULL
             OR us.gone_notified_at IS NOT NULL
             OR us.reminded_at IS NOT NULL
          ORDER BY MAX(
            COALESCE(us.notified_at, ''),
            COALESCE(us.gone_notified_at, ''),
            COALESCE(us.reminded_at, '')
          ) DESC LIMIT 200`,
    args: [userId, userId],
  });
  return {
    listings: result.rows.map((row) => rowToListing(row as Record<string, unknown>)),
  };
}

async function listSources(db: Client): Promise<unknown> {
  const states = await db.execute('SELECT * FROM source_state ORDER BY source_id');
  const runs = await db.execute(`
    SELECT source_id, started_at, listings_found, listings_new, request_count, stop_reason, errors
    FROM collection_runs ORDER BY started_at DESC LIMIT 50
  `);

  return {
    sources: states.rows.map((row) => ({
      sourceId: row['source_id'],
      health: row['health'],
      lastRunAt: row['last_run_at'],
      lastSuccessAt: row['last_success_at'],
      last429At: row['last_429_at'],
      cooldownUntil: row['cooldown_until'],
      consecutiveErrors: Number(row['consecutive_errors']),
      averageNewListingCount: Number(row['average_new_listing_count']),
    })),
    recentRuns: runs.rows,
  };
}

/**
 * @param userId Les chiffres d'ENGAGEMENT lui appartiennent : ce qu'il a vu,
 *   archivé, suivi, et les messages qu'il a envoyés. Sans lui, la page
 *   additionnait les gestes de tous les comptes — un compte y lisait l'activité
 *   des autres, et ses propres chiffres étaient faux.
 *
 *   LE MARCHÉ EST COMMUN, LA PERTINENCE NE L'EST PAS. Le nombre d'annonces
 *   actives ou louées décrit le marché ; « pertinentes » décrit un budget, une
 *   surface, des quartiers — donc quelqu'un. Ces chiffres se lisaient sur
 *   `listings.matches_criteria`, calculé par la collecte pour un seul compte :
 *   le second lisait le décompte du premier. Ils viennent désormais de
 *   `listing_user_score`, comme la liste et les alertes.
 */
/**
 * Au-delà, un passage livre du STOCK et non des nouveautés : un passage
 * ordinaire découvre 1 à 10 annonces par source, un premier passage ou un
 * rattrapage de 16 à plusieurs centaines (relevé du 2026-09-11).
 */
const STOCK_BATCH = 15;

async function getStats(db: Client, userId: string): Promise<unknown> {
  // §33 : statistiques simples pour commencer, pas de modèle complexe.
  const [listings, engagement, contacts, outcomes, byTracking, bySource] = await Promise.all([
    db.execute({
      sql: `
      SELECT COUNT(*) AS total,
             -- « Pertinentes » ne compte QUE les annonces encore ACTIVES.
             -- Auparavant ce total incluait aussi les « possiblement
             -- inactives » — disparues de leur source depuis plusieurs
             -- collectes, donc probablement louées : le chiffre annonçait
             -- près du double d'opportunités réelles (§33, §17).
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND lifecycle = 'active'
                      AND COALESCE(us.archived, 0) = 0
                      AND rented = 0 THEN 1 ELSE 0 END) AS matching,
             -- Comptées à part : toujours affichées et consultables, mais à
             -- vérifier avant de s'en réjouir.
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND lifecycle = 'possiblyInactive'
                      AND COALESCE(us.archived, 0) = 0 AND rented = 0 THEN 1 ELSE 0 END) AS uncertain,
             SUM(CASE WHEN lifecycle = 'active' THEN 1 ELSE 0 END) AS active,
             SUM(CASE WHEN COALESCE(sc.matches_criteria, 0) = 1 AND rented = 1 THEN 1 ELSE 0 END) AS rented
      -- La colonne listings.archived était lue ici : celle du temps où
      -- l'archivage était un fait sur la fiche. Ce qu'UN compte a rangé ne
      -- doit pas disparaître du décompte des autres.
      FROM listings
      LEFT JOIN listing_user_score sc ON sc.listing_id = listings.id AND sc.user_id = ?
      LEFT JOIN listing_user_state us ON us.listing_id = listings.id AND us.user_id = ?
    `,
      args: [userId, userId],
    }),
    db.execute({
      sql: `SELECT SUM(us.viewed) AS viewed, SUM(us.archived) AS archived
            FROM listing_user_state us
            JOIN listings l ON l.id = us.listing_id
            JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = us.user_id
            WHERE us.user_id = ? AND sc.matches_criteria = 1`,
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT COUNT(*) AS total FROM contact_attempts WHERE user_id = ?',
      args: [userId],
    }),
    db.execute({
      sql: 'SELECT outcome, COUNT(*) AS n FROM contact_attempts WHERE user_id = ? GROUP BY outcome',
      args: [userId],
    }),
    /**
     * LE SUIVI VIENT DE `listing_user_state`, et non plus de la colonne
     * `tracking` de `listings`. Celle-ci est le vestige du temps où il n'y
     * avait qu'un utilisateur : elle vaut « new » pour tout le monde, si bien
     * que la répartition affichée était celle d'un seul compte — le premier à
     * avoir touché la fiche.
     *
     * Les annonces sur lesquelles personne n'a rien fait n'ont PAS de ligne :
     * elles comptent pour « new », qui est bien leur état.
     */
    db.execute({
      sql: `SELECT COALESCE(us.tracking, 'new') AS tracking, COUNT(*) AS n
            FROM listings l
            LEFT JOIN listing_user_state us ON us.listing_id = l.id AND us.user_id = ?
            JOIN listing_user_score sc ON sc.listing_id = l.id AND sc.user_id = ?
            WHERE sc.matches_criteria = 1
            GROUP BY COALESCE(us.tracking, 'new')`,
      args: [userId, userId],
    }),
    db.execute(`
      SELECT source_id, COUNT(*) AS n FROM occurrences
      WHERE lifecycle IN ('active', 'possiblyInactive') GROUP BY source_id ORDER BY n DESC
    `),
  ]);

  const toMap = (rows: readonly Record<string, unknown>[], key: string): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const row of rows) map[String(row[key])] = Number(row['n']);
    return map;
  };

  // Historique de l'inventaire DE CE COMPTE, du plus ancien au plus récent
  // (§33). « Pertinentes » est un décompte personnel : la table en garde une
  // ligne par compte et par jour depuis la migration 0029.
  const history = await db.execute({
    sql: 'SELECT * FROM daily_stats WHERE user_id = ? ORDER BY day DESC LIMIT 90',
    args: [userId],
  });

  /**
   * COMBIEN DE TEMPS UNE ANNONCE RESTE DISPONIBLE — mesuré, pas supposé.
   *
   * Une annonce éteinte a vécu de sa découverte à sa dernière observation. Une
   * annonce ENCORE EN LIGNE n'a pas fini de vivre : elle compte pour « au moins
   * n jours » et non pour une disparition, faute de quoi la mesure ne compterait
   * que les mortes et sous-estimerait toujours (voir `core/survival.ts`).
   *
   * C'est un fait sur le MARCHÉ, pas sur une personne : aucune jointure de
   * compte ici, le chiffre est le même pour tout le monde.
   *
   * SEULES COMPTENT LES ANNONCES VUES NAÎTRE. Le stock déjà en ligne quand une
   * source entre dans la collecte — ses premières 24 h — ou qu'elle livre d'un
   * bloc (plus de `STOCK_BATCH` d'un coup : rattrapage, correctif de
   * pagination) avait souvent des semaines d'âge : le compter depuis notre
   * découverte gonflait la survie (87 % à J+7 affichés, 79 % sur les seules
   * nouvelles). Les sources à annonce unique en sont exclues aussi : leur fin
   * est posée par un minuteur, pas observée.
   *
   * La durée s'arrête à la DERNIÈRE OBSERVATION, lue sur les occurrences :
   * `listings.last_seen_at` n'est pas réécrit quand la fiche ne change pas.
   */
  const oneShot = ONE_SHOT_SOURCES.map(() => '?').join(',');
  const lifetimes = await db.execute({
    sql: `
      WITH debut AS (
        SELECT source_id, MIN(first_seen_at) AS debut FROM occurrences GROUP BY source_id
      ),
      lot AS (
        SELECT source_id, first_seen_at, COUNT(*) AS n
        FROM occurrences GROUP BY source_id, first_seen_at
      ),
      stock AS (
        SELECT o.group_id FROM occurrences o
        JOIN debut d ON d.source_id = o.source_id
        JOIN lot b ON b.source_id = o.source_id AND b.first_seen_at = o.first_seen_at
        JOIN listings l ON l.id = o.group_id AND l.first_seen_at = o.first_seen_at
        WHERE julianday(o.first_seen_at) - julianday(d.debut) < 1 OR b.n > ?
      ),
      vu AS (
        SELECT group_id, MAX(last_seen_at) AS vu FROM occurrences GROUP BY group_id
      )
      SELECT CASE WHEN l.lifecycle = 'inactive' OR l.rented = 1 THEN 1 ELSE 0 END AS ended,
             julianday(COALESCE(vu.vu, l.last_seen_at)) - julianday(l.first_seen_at) AS days
      FROM listings l
      LEFT JOIN vu ON vu.group_id = l.id
      WHERE l.id NOT IN (SELECT group_id FROM stock WHERE group_id IS NOT NULL)
        AND l.id NOT IN (
          SELECT group_id FROM occurrences
          WHERE group_id IS NOT NULL AND source_id IN (${oneShot})
        )
    `,
    args: [STOCK_BATCH, ...ONE_SHOT_SOURCES],
  });
  const observed = lifetimes.rows.map((row) => ({
    days: Number(row['days']),
    ended: Number(row['ended']) === 1,
  }));
  const curve = survivalCurve(observed);

  return {
    survival: {
      medianDays: curve.medianDays,
      completed: curve.completed,
      censored: curve.censored,
      horizonDays: Math.round(curve.horizonDays),
      // Part encore en ligne à J+1, J+3, J+7 — `null` au-delà de l'horizon —,
      // et combien d'annonces l'ont atteint : la part se lit avec son effectif.
      aliveAfter: [1, 3, 7].map((day) => ({
        day,
        share: shareAlive(curve, day),
        atRisk: observed.filter((one) => one.days >= day).length,
      })),
    },
    history: history.rows
      .map((r) => ({
        day: String(r['day']),
        matching: Number(r['matching']),
        uncertain: Number(r['uncertain']),
        rented: Number(r['rented']),
        total: Number(r['total']),
        activeSources: Number(r['active_sources']),
      }))
      .reverse(),
    listings: {
      total: Number(listings.rows[0]?.['total'] ?? 0),
      matching: Number(listings.rows[0]?.['matching'] ?? 0),
      uncertain: Number(listings.rows[0]?.['uncertain'] ?? 0),
      rented: Number(listings.rows[0]?.['rented'] ?? 0),
      active: Number(listings.rows[0]?.['active'] ?? 0),
      viewed: Number(engagement.rows[0]?.['viewed'] ?? 0),
      archived: Number(engagement.rows[0]?.['archived'] ?? 0),
    },
    byTracking: toMap(byTracking.rows as Record<string, unknown>[], 'tracking'),
    bySource: toMap(bySource.rows as Record<string, unknown>[], 'source_id'),
    contacts: {
      total: Number(contacts.rows[0]?.['total'] ?? 0),
      byOutcome: toMap(outcomes.rows as Record<string, unknown>[], 'outcome'),
    },
  };
}

/**
 * Met à jour l'état d'une fiche : statut de suivi (§35), « consultée » (§37)
 * et/ou « archivée ». Chaque champ est optionnel ; on ne touche que ceux
 * fournis. Ces colonnes ne sont jamais écrasées par la collecte, donc l'état
 * survit aux re-collectes et aux redémarrages.
 */
async function updateListing(
  db: Client,
  id: string,
  request: Request,
  userId: string,
): Promise<Response | unknown> {
  const body = (await request.json().catch(() => null)) as {
    tracking?: string;
    viewed?: boolean;
    archived?: boolean;
    favorite?: boolean;
  } | null;
  if (body === null) return jsonError(400, 'Corps de requête invalide');

  if (body.tracking !== undefined && !TRACKING_STATUSES.has(body.tracking)) {
    return jsonError(400, 'Statut de suivi invalide');
  }
  const patch = userStatePatch(body);
  if (Object.keys(patch).length === 0) return jsonError(400, 'Aucun champ à mettre à jour');

  // Même renvoi qu'à la lecture : un favori posé depuis une liste d'avant une
  // fusion doit se ranger sur la fiche qui a repris l'annonce, pas se perdre.
  let listingId = id;
  let written = await writeUserState(db, listingId, userId, patch);
  if (written === 0) {
    const heir = await absorbedInto(db, id);
    if (heir !== null) {
      listingId = heir;
      written = await writeUserState(db, listingId, userId, patch);
    }
  }
  if (written === 0) return jsonError(404, 'Annonce introuvable');
  return { id: listingId, ...body };
}

/** Les champs du corps qui sont des décisions personnelles, en colonnes SQL. */
function userStatePatch(body: {
  viewed?: unknown;
  archived?: unknown;
  favorite?: unknown;
  tracking?: unknown;
}): Record<string, string | number> {
  const patch: Record<string, string | number> = {};
  if (typeof body.viewed === 'boolean') patch['viewed'] = body.viewed ? 1 : 0;
  if (typeof body.archived === 'boolean') patch['archived'] = body.archived ? 1 : 0;
  if (typeof body.favorite === 'boolean') patch['favorite'] = body.favorite ? 1 : 0;
  if (typeof body.tracking === 'string') patch['tracking'] = body.tracking;
  return patch;
}

/**
 * Consigne une décision PERSONNELLE : favori, archivage, statut, consultation.
 *
 * `listing_user_state` seulement. Les colonnes homonymes de `listings` étaient
 * écrites aussi, par n'importe quel compte : elles devenaient l'état de tous.
 *
 * @returns 0 quand l'annonce n'existe pas — rien n'est alors écrit.
 */
async function writeUserState(
  db: Client,
  listingId: string,
  userId: string,
  patch: Readonly<Record<string, string | number>>,
): Promise<number> {
  const columns = Object.keys(patch);
  if (columns.length === 0) return 0;
  // `INSERT … SELECT` sur la fiche : une annonce inconnue n'insère rien, sans
  // dépendre de l'application des clés étrangères.
  const result = await db.execute({
    sql: `INSERT INTO listing_user_state (user_id, listing_id, ${columns.join(', ')}, updated_at)
          SELECT ?, id, ${columns.map(() => '?').join(', ')}, ? FROM listings WHERE id = ?
          ON CONFLICT(user_id, listing_id) DO UPDATE SET ${columns
            .map((column) => `${column} = excluded.${column}`)
            .concat('updated_at = excluded.updated_at')
            .join(', ')}`,
    args: [
      userId,
      ...columns.map((column) => patch[column] ?? null),
      new Date().toISOString(),
      listingId,
    ],
  });
  return result.rowsAffected;
}

/**
 * Enregistre une prise de contact déclenchée manuellement (§22).
 *
 * L'API n'envoie RIEN : l'utilisateur a envoyé son message lui-même, cette
 * route ne fait que consigner le fait pour le suivi et les statistiques (§33).
 */
async function recordContact(
  db: Client,
  id: string,
  request: Request,
  userId: string,
): Promise<Response | unknown> {
  const body = (await request.json().catch(() => null)) as {
    channel?: string;
    message?: string;
    sourceId?: string;
    documents?: unknown;
  } | null;

  const channel = body?.channel ?? 'manual';
  const now = new Date().toISOString();

  // §25 : trace locale des pièces déclarées jointes. On ne conserve que des
  // noms (chaînes), jamais le contenu — les fichiers vivent dans data/.
  const documents = Array.isArray(body?.documents)
    ? body.documents.filter((name): name is string => typeof name === 'string')
    : [];

  // « Deuxième relance » se compte sur SES propres messages : le compte d'à
  // côté ayant écrit deux fois, on annonçait une troisième relance à qui
  // n'avait rien envoyé.
  const previous = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM contact_attempts WHERE listing_id = ? AND user_id = ?',
    args: [id, userId],
  });
  const followUpIndex = Number(previous.rows[0]?.['n'] ?? 0);

  await db.execute({
    // `user_id` MANQUAIT : la colonne retombait sur sa valeur par défaut, et
    // toutes les démarches de tous les comptes s'enregistraient sous le même
    // nom. Les lire correctement supposait d'abord de les écrire correctement.
    sql: `INSERT INTO contact_attempts
            (id, listing_id, user_id, source_id, channel, trigger, sent_at, message, follow_up_index, outcome, documents, updated_at)
          VALUES (?,?,?,?,?,'manual',?,?,?, 'pending', ?, ?)`,
    args: [
      crypto.randomUUID(),
      id,
      userId,
      body?.sourceId ?? 'unknown',
      channel,
      now,
      body?.message ?? '',
      followUpIndex,
      JSON.stringify(documents),
      now,
    ],
  });

  await writeUserState(db, id, userId, { tracking: 'contacted' });

  return { id, followUpIndex, sentAt: now, documents };
}

/**
 * Abonnements Web Push (§29).
 *
 * ILS N'AVAIENT AUCUNE ROUTE. Seul l'accès direct à Turso savait les écrire,
 * depuis le navigateur — si bien que sur l'installation recommandée, celle qui
 * passe par le Worker, activer les notifications ne s'enregistrait nulle part.
 * Le navigateur acceptait l'abonnement, la page affichait « activé », et aucune
 * alerte n'arrivait jamais.
 *
 * L'abonnement APPARTIENT À UN COMPTE : c'est ce qui permettra d'envoyer à la
 * bonne personne quand ils seront plusieurs.
 *
 * Le désabonnement passe par un POST et non un DELETE : l'identifiant d'un
 * abonnement est une URL entière, trop longue et trop chargée pour un segment
 * de chemin, et tous les intermédiaires ne transmettent pas le corps d'un
 * DELETE.
 */
async function handlePushRoute(
  db: Client,
  method: string,
  action: string | undefined,
  request: Request,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  if (method !== 'POST') return jsonError(404, 'Route inconnue');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null) return jsonError(400, 'Corps illisible');

  const endpoint = typeof body['endpoint'] === 'string' ? body['endpoint'] : '';
  if (endpoint === '') return jsonError(400, 'Abonnement incomplet');

  if (action === 'unsubscribe') {
    await db.execute({
      sql: 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?',
      args: [endpoint, userId],
    });
    return json({ ok: true }, cors);
  }

  const p256dh = typeof body['p256dh'] === 'string' ? body['p256dh'] : '';
  const auth = typeof body['auth'] === 'string' ? body['auth'] : '';
  // Sans les deux clés, la collecte ne pourrait pas chiffrer l'envoi : on
  // refuse plutôt que d'enregistrer un abonnement qui échouera en silence.
  if (p256dh === '' || auth === '') return jsonError(400, 'Abonnement incomplet');

  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at, user_id)
          VALUES (?,?,?,?,?)
          ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh,
                                              auth = excluded.auth,
                                              user_id = excluded.user_id,
                                              failures = 0`,
    args: [endpoint, p256dh, auth, new Date().toISOString(), userId],
  });
  return json({ ok: true }, cors);
}

/**
 * Réglages de compte, un par clé (`/api/settings/<clé>`).
 *
 * Les recherches enregistrées et les points de référence vivaient dans
 * `app_settings` mais n'avaient AUCUNE route : seul l'accès direct à Turso
 * savait les écrire, depuis le navigateur. Sur l'installation recommandée —
 * celle qui passe par le Worker — ils ne se conservaient donc pas, sans que
 * rien ne le dise.
 *
 * La liste des clés est FERMÉE. Ouvrir `app_settings` à une clé arbitraire
 * laisserait n'importe quel compte écrire n'importe quoi dans une table que la
 * collecte relit.
 */
const WRITABLE_SETTINGS: readonly string[] = [
  SAVED_SEARCHES_SETTING,
  REFERENCE_POINTS_SETTING,
  NOTIFICATION_PREFERENCES_SETTING,
  ONBOARDING_SETTING,
  CHANGELOG_SETTING,
  ALERTS_SEEN_SETTING,
  TENANT_PROFILE_SETTING,
];

async function handleSettingsRoute(
  db: Client,
  method: string,
  key: string | undefined,
  request: Request,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  if (key === undefined || !WRITABLE_SETTINGS.includes(key)) {
    return jsonError(404, 'Réglage inconnu');
  }

  if (method === 'GET') {
    const stored = await db.execute({
      sql: 'SELECT value FROM app_settings WHERE user_id = ? AND key = ?',
      args: [userId, key],
    });
    const raw = stored.rows[0]?.['value'];
    if (typeof raw !== 'string') return json(null, cors);
    try {
      return json(JSON.parse(raw), cors);
    } catch {
      // Valeur illisible : on rend « rien de réglé » plutôt que de bloquer
      // l'écran sur une ligne qu'on ne sait plus lire.
      return json(null, cors);
    }
  }

  if (method === 'PUT') {
    const body = await request.json().catch(() => undefined);
    if (body === undefined) return jsonError(400, 'Corps illisible');
    await db.execute({
      sql: `INSERT INTO app_settings (user_id, key, value, updated_at) VALUES (?,?,?,?)
            ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                                    updated_at = excluded.updated_at`,
      args: [userId, key, JSON.stringify(body), new Date().toISOString()],
    });
    return json(body, cors);
  }

  return jsonError(404, 'Route inconnue');
}

/** Filtres de recherche éditables depuis l'interface, en mode local (§66). */
/**
 * Critères de recherche (§66).
 *
 * ILS VIVENT EN BASE, ET NULLE PART AILLEURS. Ils ont longtemps eu deux
 * domiciles : `config/search.json` sur la machine de collecte, et
 * `app_settings` pour le site. Les deux ne disaient pas toujours la même
 * chose, et rien n'indiquait lequel faisait autorité. Le fichier a été retiré ;
 * la base suit l'utilisateur d'un appareil à l'autre, ce qu'un fichier ne
 * saura jamais faire.
 *
 * Chaque compte a les siens : la clé est (utilisateur, réglage).
 */
async function handleConfigRoute(
  db: Client,
  method: string,
  request: Request,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  if (method === 'GET') {
    const stored = await db.execute({
      sql: 'SELECT value FROM app_settings WHERE user_id = ? AND key = ?',
      args: [userId, SEARCH_CRITERIA_SETTING],
    });
    const raw = stored.rows[0]?.['value'];
    if (typeof raw !== 'string') return json(DEFAULT_FILTERS, cors);
    try {
      return json(JSON.parse(raw), cors);
    } catch {
      // Valeur illisible : on rend les défauts plutôt que de bloquer l'écran.
      return json(DEFAULT_FILTERS, cors);
    }
  }
  if (method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== 'object') return jsonError(400, 'Filtres invalides');
    await db.execute({
      sql: `INSERT INTO app_settings (user_id, key, value, updated_at) VALUES (?,?,?,?)
            ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value,
                                                    updated_at = excluded.updated_at`,
      args: [userId, SEARCH_CRITERIA_SETTING, JSON.stringify(body), new Date().toISOString()],
    });
    return json(body, cors);
  }
  return json({ error: 'Route inconnue' }, cors, 404);
}

/** Ce qu'on rend tant que personne n'a rien réglé. */
const DEFAULT_FILTERS = {
  cities: [...MVP_CRITERIA.cities],
  maxPrice: MVP_CRITERIA.maxPrice,
  minArea: MVP_CRITERIA.minArea,
  ...(MVP_CRITERIA.minPrice !== undefined ? { minPrice: MVP_CRITERIA.minPrice } : {}),
};

/**
 * Budget et surface tels que CET utilisateur les a réglés, appliqués en direct
 * à la liste : resserrer son budget doit se voir tout de suite, sans attendre
 * la collecte suivante. Les exclusions (colocation, étudiant, bailleur,
 * ameublement, quartier, disponibilité) suivent le même chemin depuis qu'elles
 * ont quitté le score : voir `core/trait-filters`.
 */
async function liveFilters(db: Client, userId: string): Promise<LiveFilters | undefined> {
  const stored = await db.execute({
    sql: 'SELECT value FROM app_settings WHERE user_id = ? AND key = ?',
    args: [userId, SEARCH_CRITERIA_SETTING],
  });
  const raw = stored.rows[0]?.['value'];
  if (typeof raw !== 'string') return undefined;
  try {
    // Les défauts du projet comblent les clés manquantes, exactement comme
    // `withStoredCriteria` le fait pour les alertes.
    return parseLiveFilters(JSON.parse(raw), true);
  } catch {
    return undefined;
  }
}

/** Un nombre utilisable en SQL : `1e999` se lit `Infinity` en JSON. */
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Le loyer plancher du projet, quand on comble les clés absentes.
 *
 * IL S'EFFACE SOUS UN PLAFOND PLUS BAS. Un plancher qu'on n'a pas choisi ne
 * doit pas vider la liste de quelqu'un qui cherche à 200 € ; la valeur
 * explicitement transmise, elle, est respectée telle quelle.
 */
function plancherDuProjet(defauts: boolean, maxPrice: number): number | undefined {
  if (!defauts || MVP_CRITERIA.minPrice === undefined) return undefined;
  return MVP_CRITERIA.minPrice <= maxPrice ? MVP_CRITERIA.minPrice : undefined;
}

/**
 * Des critères enregistrés ou reçus → ce que la liste sait appliquer.
 *
 * UNE SEULE LECTURE pour le compte et pour le visiteur : un lien partagé filtre
 * exactement comme les mêmes critères posés dans un compte.
 *
 * @param defauts combler les clés manquantes avec celles du projet, au lieu de
 *   rendre `undefined`.
 *
 *   UNE LIGNE DE RÉGLAGES SANS LOYER NI SURFACE FAISAIT CESSER TOUT FILTRAGE :
 *   la liste retombait sur « aucun filtre », quartiers et exclusions compris,
 *   pendant que les alertes, elles, continuaient d'appliquer les défauts —
 *   `withStoredCriteria` les comble champ par champ. Les deux se
 *   contredisaient, et c'est la liste qui montrait ce qu'on avait exclu.
 *
 *   Un LIEN PARTAGÉ ne les comble pas : il vient d'une adresse, pas d'un
 *   réglage enregistré, et un budget illisible y signale une adresse abîmée
 *   plutôt qu'une préférence absente. Mieux vaut le dire que filtrer sur des
 *   valeurs que personne n'a choisies.
 */
export function parseLiveFilters(value: unknown, defauts = false): LiveFilters | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const parsed = value as Partial<Record<keyof LiveFilters, unknown>>;
  if (!defauts && (!finite(parsed.maxPrice) || !finite(parsed.minArea))) return undefined;
  /** La valeur lue, ou celle du projet quand on comble. */
  const nombre = (lu: unknown, defaut: number | undefined): number | undefined =>
    finite(lu) ? lu : defauts ? defaut : undefined;
  const maxPrice = nombre(parsed.maxPrice, MVP_CRITERIA.maxPrice) ?? MVP_CRITERIA.maxPrice;
  const minPrice = finite(parsed.minPrice) ? parsed.minPrice : plancherDuProjet(defauts, maxPrice);
  const maxCommuteMinutes = nombre(parsed.maxCommuteMinutes, MVP_CRITERIA.maxCommuteMinutes);
  return {
    maxPrice,
    minArea: nombre(parsed.minArea, MVP_CRITERIA.minArea) ?? MVP_CRITERIA.minArea,
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxCommuteMinutes !== undefined ? { maxCommuteMinutes } : {}),
    ...(parsed.excludeFlatShare === true ? { excludeFlatShare: true } : {}),
    ...(parsed.excludeStudent === true ? { excludeStudent: true } : {}),
    ...(parsed.landlordFilter === 'private' || parsed.landlordFilter === 'agency'
      ? { landlordFilter: parsed.landlordFilter }
      : {}),
    ...(parsed.furnishedFilter === 'furnished' || parsed.furnishedFilter === 'unfurnished'
      ? { furnishedFilter: parsed.furnishedFilter }
      : {}),
    // LA FORME EST VERIFIEE ICI, et il le faut : cette valeur part dans une
    // comparaison SQL. Elle est parametree, donc rien ne s'injecte, mais une
    // chaine quelconque produirait un filtre silencieusement faux — refuser
    // ce qui n'est pas une date vaut mieux que filtrer sur du vide.
    ...(typeof parsed.availableBy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.availableBy)
      ? { availableBy: parsed.availableBy }
      : {}),
    // ON NE GARDE QUE DES QUARTIERS CONNUS. Ces valeurs partent dans un `IN`
    // paramétré, donc rien ne s'injecte ; mais un slug inventé produirait un
    // filtre qui ne rend jamais rien, et l'écran n'aurait aucun moyen de le
    // dire. Mieux vaut l'ignorer que filtrer sur du vide.
    ...(Array.isArray(parsed.districts)
      ? {
          districts: parsed.districts.filter(
            (slug): slug is string =>
              typeof slug === 'string' && districtBySlug(slug) !== undefined,
          ),
        }
      : {}),
    // Seul le REFUS se transmet : absent, les inconnus sont gardés.
    ...(parsed.includeUnknownDistrict === false ? { includeUnknownDistrict: false } : {}),
  };
}

/** Au-delà, ce n'est plus un lien de recherche mais une adresse bricolée. */
const MAX_SHARED_CRITERIA = 4000;
const MAX_SHARED_CITIES = 20;

/**
 * Les critères d'une recherche partagée, passés par un visiteur en `criteria`.
 *
 * LUS, JAMAIS ÉCRITS : ils filtrent cette réponse et rien d'autre. Un visiteur
 * n'a pas de compte où les ranger.
 *
 * @returns `undefined` sans paramètre, `null` s'il est illisible.
 */
export function sharedCriteria(url: URL): LiveFilters | undefined | null {
  const raw = url.searchParams.get('criteria');
  if (raw === null) return undefined;
  if (raw.length > MAX_SHARED_CRITERIA) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const filters = parseLiveFilters(value);
  if (filters === undefined) return null;
  const cities = (value as { cities?: unknown }).cities;
  if (!Array.isArray(cities)) return null;
  const communes = [
    ...new Set(
      cities
        .filter((city): city is string => typeof city === 'string')
        .map((city) => city.trim().toLowerCase())
        .filter((city) => city !== '' && city.length <= 80),
    ),
  ];
  if (communes.length > MAX_SHARED_CITIES) return null;
  return { ...filters, cities: communes };
}

/** Ressource `listings` : collection, élément et sous-ressource `contact`. */
async function handleListingsRoute(
  db: Client,
  method: string,
  id: string | undefined,
  action: string | undefined,
  url: URL,
  request: Request,
  cors: Record<string, string>,
  userId: string,
): Promise<Response> {
  // Collection : GET /api/listings
  if (id === undefined && method === 'GET') {
    const anonymous = userId === ANONYMOUS_USER;
    // Un compte lit SES critères ; le paramètre ne vaut que pour un visiteur.
    const shared = anonymous ? sharedCriteria(url) : undefined;
    if (shared === null) return json({ error: 'Critères illisibles' }, cors, 400);
    const filters = anonymous ? shared : await liveFilters(db, userId);
    const query = buildListQuery(url, filters, anonymous);
    const { etag, total } = await listSignature(db, query, userId);

    // REQUÊTE CONDITIONNELLE. Le navigateur renvoie l'empreinte qu'il détient ;
    // si rien n'a bougé, on répond 304 sans corps et il ressert sa copie. Le
    // code de la page n'en sait rien : il reçoit un 200 et ses données.
    if (etagMatches(request.headers.get('If-None-Match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: { ...cors, ETag: etag, 'Cache-Control': 'private, no-cache' },
      });
    }

    const body = await listListingsJson(db, query, userId, total);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...cors,
        ETag: etag,
        // `no-cache` et NON `no-store` : le navigateur GARDE la réponse et
        // revient simplement demander si elle est toujours bonne. C'est ce qui
        // rend le 304 possible.
        'Cache-Control': 'private, no-cache',
      },
    });
  }
  if (id === undefined) return json({ error: 'Route inconnue' }, cors, 404);

  // Sous-ressource : POST /api/listings/:id/contact
  if (action === 'contact') {
    if (method !== 'POST') return json({ error: 'Route inconnue' }, cors, 404);
    const result = await recordContact(db, id, request, userId);
    return result instanceof Response ? result : json(result, cors, 201);
  }
  if (action !== undefined) return json({ error: 'Route inconnue' }, cors, 404);

  // Élément : GET ou PATCH /api/listings/:id
  if (method === 'GET') {
    const listing = await getListing(db, id, userId);
    return listing === null
      ? json({ error: 'Annonce introuvable' }, cors, 404)
      : json(listing, cors);
  }
  if (method === 'PATCH') {
    const result = await updateListing(db, id, request, userId);
    return result instanceof Response ? result : json(result, cors);
  }
  return json({ error: 'Route inconnue' }, cors, 404);
}

/**
 * Aiguillage des routes. La clé de routage combine méthode et forme du chemin.
 * Les segments sont validés par le transport avant d'arriver ici (§75).
 */
/**
 * Les quartiers PRÉSENTS dans l'inventaire, avec le nombre d'annonces.
 *
 * ON NE PROPOSE PAS LA TABLE ENTIÈRE. Elle compte une soixantaine d'entrées ;
 * l'inventaire n'en couvre qu'une partie, et proposer « Bon Voyage » quand
 * aucune annonce n'y est ferait cocher un filtre qui vide la liste sans
 * expliquer pourquoi. Le compte, lui, dit d'un coup d'œil où il y a quelque
 * chose à voir.
 *
 * SUR LE MÊME PÉRIMÈTRE QUE LA LISTE — actives, non louées, dans les
 * critères — sans quoi les nombres annoncés ne correspondraient pas à ce qu'on
 * obtient en cochant.
 */
async function listDistricts(db: Client): Promise<{ districts: DistrictCount[] }> {
  const result = await db.execute(`
    SELECT district, COUNT(*) AS n FROM listings
    WHERE district IS NOT NULL
      AND lifecycle != 'inactive' AND rented = 0 AND matches_criteria = 1
    GROUP BY district ORDER BY n DESC
  `);
  /**
   * TOUTE LA TABLE, et non les seuls quartiers qui ont des annonces : un
   * quartier sans offre du moment doit pouvoir être visé, pour la liste comme
   * pour les alertes. Le nombre, zéro compris, dit ce qu'il donnera aujourd'hui.
   */
  const counts = new Map(
    result.rows.map((row) => [String(row['district']), Number(row['n'] ?? 0)]),
  );
  const known = NICE_DISTRICTS.map((district) => ({
    slug: district.slug,
    label: district.label,
    count: counts.get(district.slug) ?? 0,
  }));
  // Un quartier en base mais absent de la table (graphie d'avant) reste visible.
  const others = [...counts.keys()]
    .filter((slug) => !NICE_DISTRICTS.some((district) => district.slug === slug))
    .map((slug) => ({ slug, label: districtLabel(slug), count: counts.get(slug) ?? 0 }));
  return {
    districts: [...known, ...others].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  };
}

interface DistrictCount {
  readonly slug: string;
  readonly label: string;
  readonly count: number;
}

/** Bornes de l'histogramme : celles du curseur de budget de l'interface. */
export const PRICE_HISTOGRAM_BOUNDS = { min: 200, max: 2500, step: 50 } as const;

export interface PriceHistogram {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly buckets: readonly {
    readonly from: number;
    readonly to: number;
    readonly count: number;
  }[];
}

/**
 * Range des loyers en tranches régulières.
 *
 * Les extrêmes sont repliés dans la première et la dernière tranche : au curseur,
 * une borne atteinte vaut « pas de limite », ces annonces y sont donc bien.
 */
export function buildPriceHistogram(
  rows: readonly { readonly price: number; readonly count: number }[],
  bounds: {
    readonly min: number;
    readonly max: number;
    readonly step: number;
  } = PRICE_HISTOGRAM_BOUNDS,
): PriceHistogram {
  const { min, max, step } = bounds;
  const size = Math.max(1, Math.ceil((max - min) / step));
  const counts = new Array<number>(size).fill(0);
  for (const { price, count } of rows) {
    if (!Number.isFinite(price) || !(count > 0)) continue;
    const index = Math.min(size - 1, Math.max(0, Math.floor((price - min) / step)));
    counts[index] = (counts[index] ?? 0) + count;
  }
  return {
    min,
    max,
    step,
    buckets: counts.map((count, index) => ({
      from: min + index * step,
      to: Math.min(max, min + (index + 1) * step),
      count,
    })),
  };
}

/**
 * Loyers de l'offre en ligne, INDÉPENDAMMENT DU BUDGET choisi : l'histogramme
 * sert justement à voir ce qu'élargir la fourchette ferait gagner. Même
 * périmètre que le catalogue — logements, dans la commune.
 */
async function getPriceHistogram(db: Client): Promise<PriceHistogram> {
  const result = await db.execute({
    sql: `
      SELECT price, COUNT(*) AS n FROM listings
      WHERE price IS NOT NULL AND price > 0
        AND lifecycle != 'inactive' AND rented = 0
        AND property_type NOT IN ('parking', 'commercial')
        AND city IN (${MVP_CRITERIA.cities.map(() => '?').join(',')})
      GROUP BY price
    `,
    args: [...MVP_CRITERIA.cities],
  });
  return buildPriceHistogram(
    result.rows.map((row) => ({ price: Number(row['price']), count: Number(row['n'] ?? 0) })),
  );
}

/** Lectures du marché, sans paramètre ni lecteur : une table suffit à les router. */
const MARKET_READS: ReadonlyMap<string, (db: Client) => Promise<unknown>> = new Map<
  string,
  (db: Client) => Promise<unknown>
>([
  ['districts', listDistricts],
  ['price-histogram', getPriceHistogram],
  ['sources', listSources],
]);

export async function route(
  db: Client,
  request: Request,
  url: URL,
  segments: readonly string[],
  cors: Record<string, string>,
  /**
   * QUI demande. Le serveur local n'a qu'un utilisateur — c'est votre machine,
   * il n'y a personne d'autre — et prend donc le défaut. Le Worker, lui,
   * transmet l'identifiant lu dans le cookie de session : c'est là que le
   * multi-compte prend son sens.
   */
  userId: string | null = CURRENT_USER,
): Promise<Response> {
  const method = request.method;
  const resource = segments[1];

  /**
   * LE VERROU DE LA CONSULTATION LIBRE, en un seul endroit.
   *
   * `null` veut dire « personne n'est connecté ». On sert alors le catalogue —
   * les annonces, les quartiers, les sources, les agences — et rien d'autre :
   * ni lecture personnelle (statistiques, alertes, réglages), ni la moindre
   * écriture. Consulter est libre ; agir appartient à quelqu'un.
   *
   * UN SEUL POINT DE CONTRÔLE PLUTÔT QUE CINQUANTE. Éparpiller la vérification
   * dans chaque gestionnaire aurait fait dépendre la sécurité de ce que
   * personne n'oublie ; ici, ce qui n'est pas nommé est refusé, et la liste
   * tient en trois lignes qu'on relit.
   */
  if (userId === null) {
    if (method !== 'GET' || !ANONYMOUS_READS.has(resource ?? '')) {
      return json({ error: 'Connexion requise' }, cors, 401);
    }
  }
  // À partir d'ici, une identité qui ne possède rien tient lieu de visiteur :
  // les jointures externes rendent naturellement zéro favori et zéro score.
  const identity = userId ?? ANONYMOUS_USER;
  // Le chemin n'est pas décodé par le transport : un id d'annonce contient un
  // « : » (`source:référence`), encodé `%3A` par certains appels du client.
  // On décode ici une fois pour toutes, sinon la fiche ne correspond plus.
  const id = segments[2] !== undefined ? decodeURIComponent(segments[2]) : undefined;

  // Les pièces du dossier tiennent à un espace de fichiers, que ce module n'a
  // pas : le Worker les traite AVANT d'arriver ici. Un transport qui monterait
  // ces routes sans cet espace doit le dire, pas rendre une liste vide qui
  // laisserait croire qu'il n'y a rien à joindre.
  if (resource === 'documents') {
    return jsonError(501, "Ce transport n'héberge pas les pièces du dossier.");
  }
  if (resource === 'config') {
    return handleConfigRoute(db, method, request, cors, identity);
  }
  if (resource === 'settings') {
    return handleSettingsRoute(db, method, id, request, cors, identity);
  }
  if (resource === 'push') {
    return handlePushRoute(db, method, id, request, cors, identity);
  }
  if (resource === 'agencies' && method === 'GET') {
    return json(
      id === undefined ? await listAgencies(db) : await getAgency(db, id, identity),
      cors,
    );
  }
  if (resource === 'alerts' && method === 'GET') {
    return json(await listAlerts(db, identity), cors);
  }
  const marketRead = method === 'GET' ? MARKET_READS.get(resource ?? '') : undefined;
  if (marketRead !== undefined) return json(await marketRead(db), cors);
  if (resource === 'stats' && method === 'GET') return json(await getStats(db, identity), cors);
  if (resource === 'listings') {
    return handleListingsRoute(db, method, id, segments[3], url, request, cors, identity);
  }
  return json({ error: 'Route inconnue' }, cors, 404);
}
