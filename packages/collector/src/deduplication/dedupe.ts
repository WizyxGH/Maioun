/**
 * Regroupement des occurrences en logements uniques (§13).
 *
 * Comparer chaque annonce à toutes les autres coûterait O(n²) — inacceptable
 * dès quelques milliers d'annonces (§56). On génère donc d'abord des paires
 * candidates par « blocage » : deux annonces ne sont comparées que si elles
 * partagent au moins une clé grossière (téléphone, référence, ou ville +
 * tranche de surface). Les paires retenues sont ensuite évaluées finement par
 * `similarity`, et fusionnées via une structure union-find.
 */

import { ONE_SHOT_SOURCES, type NormalizedListing } from '@maioun/shared';
import {
  identifiers,
  photoKeys,
  sameSourceConflict,
  similarity,
  type SimilarityResult,
} from './similarity.js';

/** Groupe d'occurrences désignant le même logement. */
export interface DuplicateGroup {
  readonly occurrences: readonly NormalizedListing[];
  /** Paires jugées ambiguës, conservées pour inspection manuelle (§14). */
  readonly ambiguousPairs: readonly AmbiguousPair[];
}

export interface AmbiguousPair {
  readonly leftId: string;
  readonly rightId: string;
  readonly result: SimilarityResult;
}

/** Union-find avec compression de chemin. */
class UnionFind {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = this.parent.get(id) ?? id;
    while (root !== this.parent.get(root)) {
      root = this.parent.get(root) ?? root;
    }
    // Compression : les prochains appels seront immédiats.
    let current = id;
    while (current !== root) {
      const next = this.parent.get(current) ?? root;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

/**
 * Clés de blocage d'une annonce.
 *
 * Une annonce en possède plusieurs : il suffit qu'une seule soit partagée pour
 * que la comparaison fine ait lieu. C'est volontairement généreux — rater une
 * paire candidate produit un doublon visible, ce qu'on cherche à éviter.
 */
export function blockingKeys(listing: NormalizedListing): string[] {
  const keys: string[] = [];

  if (listing.contact.phone !== null) keys.push(`phone:${listing.contact.phone}`);
  if (listing.contact.email !== null) keys.push(`email:${listing.contact.email}`);

  // Référence publiée ET identifiant de source : le blocage doit être au moins
  // aussi large que le signal « même référence », sinon la paire qu'il
  // rapprocherait n'est jamais comparée.
  for (const key of identifiers(listing).all) keys.push(`ref:${key}`);

  const city = listing.city ?? listing.postalCode ?? 'ville-inconnue';

  // Tranche de surface de 5 m². On indexe aussi la tranche voisine pour que
  // deux annonces de part et d'autre d'une frontière restent comparables.
  if (listing.area !== null) {
    const bucket = Math.round(listing.area / 5);
    keys.push(`area:${city}:${bucket}`);
    keys.push(`area:${city}:${bucket - 1}`);
  }

  // Tranche de loyer de 50 €, avec le même chevauchement.
  if (listing.price !== null) {
    const bucket = Math.round(listing.price / 50);
    keys.push(`price:${city}:${bucket}`);
    keys.push(`price:${city}:${bucket - 1}`);
  }

  // Clé SANS ville, croisant loyer ET surface.
  //
  // Indispensable : toutes les clés ci-dessus sont préfixées par la commune, si
  // bien qu'une annonce dont la ville est inconnue — les e-mails d'alerte n'en
  // portent pas toujours — n'était JAMAIS comparée à la même annonce publiée
  // par l'agence avec sa ville. Elle ressortait en doublon visible.
  //
  // Croiser les deux tranches garde le seau étroit (un loyer À 50 € près ET une
  // surface à 5 m² près) : on ne rouvre pas la comparaison à tout le stock. Et
  // la comparaison fine tranche ensuite — elle refuse deux villes connues et
  // différentes, donc cette clé ne peut pas provoquer de fusion abusive (§14).
  if (listing.price !== null && listing.area !== null) {
    const priceBucket = Math.round(listing.price / 50);
    const areaBucket = Math.round(listing.area / 5);
    for (const p of [priceBucket, priceBucket - 1]) {
      for (const a of [areaBucket, areaBucket - 1]) {
        keys.push(`pa:${p}:${a}`);
      }
    }
  }

  // CHAQUE PHOTO EST UNE CLÉ. Sans elle, la comparaison fine n'avait jamais
  // lieu : une annonce d'agrégateur sans ville et au loyer hors charges ne
  // tombe dans aucun seau commun avec l'annonce d'origine, alors même qu'elles
  // servent le même fichier image. Les seaux restent minuscules — une photo
  // est portée par une poignée d'annonces au plus.
  for (const key of photoKeys(listing)) keys.push(`photo:${key}`);

  return keys;
}

/**
 * Nombre d'annonces D'UNE MÊME SOURCE qu'il faut voir porter une photo pour la
 * tenir pour un cliché de catalogue.
 *
 * DEUX NE SUFFIT PAS : c'est le compte d'une annonce republiée sous une
 * seconde référence, et l'écarter reviendrait à perdre le seul indice qui les
 * rapproche. Les vrais fonds de catalogue sont bien plus visibles — mesurés le
 * 2026-09-16, ils reviennent de cinq à dix-neuf fois, toujours à l'intérieur
 * d'une seule source, et aucune paire inter-sources n'en dépend.
 */
const CATALOG_REPEATS = 3;

/**
 * Les photos qui n'identifient personne : celles qu'une source pose sur
 * plusieurs de ses biens — façade, hall, plan de quartier, cliché tamponné.
 *
 * SEULES COMPTENT LES SOURCES QUI PUBLIENT CHAQUE BIEN UNE FOIS. Un portail
 * d'alertes renvoie la même annonce à chaque envoi, et un agrégateur la
 * reprend de plusieurs flux : leurs répétitions ne disent rien d'un fonds de
 * catalogue. Sept alertes réunies se sont dispersées tant que cette nuance
 * manquait.
 */
function catalogPhotos(
  listings: readonly NormalizedListing[],
  relaysListings: (sourceId: string) => boolean,
): Set<string> {
  const perSource = new Map<string, Map<string, number>>();
  for (const listing of listings) {
    if (relaysListings(listing.sourceId) || ONE_SHOT_SOURCES.includes(listing.sourceId)) continue;
    for (const key of photoKeys(listing)) {
      const counts = perSource.get(key) ?? new Map<string, number>();
      counts.set(listing.sourceId, (counts.get(listing.sourceId) ?? 0) + 1);
      perSource.set(key, counts);
    }
  }

  const catalog = new Set<string>();
  for (const [key, counts] of perSource) {
    for (const count of counts.values()) {
      if (count >= CATALOG_REPEATS) catalog.add(key);
    }
  }
  return catalog;
}

export interface DedupeOptions {
  /**
   * Si `true`, les paires ambiguës sont fusionnées.
   * Par défaut `false` : mieux vaut un doublon affiché qu'une fusion erronée,
   * qui ferait disparaître un logement réel de la liste (§14).
   */
  readonly mergeAmbiguous?: boolean;
  /**
   * Dit si une source RELAIE des annonces publiées ailleurs plutôt que d'en
   * publier (`SourceDescriptor.relaysListings`). Le pipeline le branche sur le
   * registre ; sans lui, on retient l'hypothèse prudente — aucune source ne
   * relaie —, celle qui fusionne le moins.
   */
  readonly relaysListings?: (sourceId: string) => boolean;
  /**
   * L'opérateur d'une source, quand plusieurs sources sont deux canaux d'une
   * même maison (`SourceDescriptor.operator`). Sans lui, l'hypothèse prudente :
   * chaque source est indépendante, et l'on fusionne moins.
   */
  readonly operatorOf?: (sourceId: string) => string | null;
}

export interface DedupeResult {
  readonly groups: readonly DuplicateGroup[];
  /** Nombre de comparaisons fines réellement effectuées — suivi du coût (§56). */
  readonly comparisonCount: number;
}

/** Une paire jugée assez proche pour fusionner, en attente d'union. */
interface MergeLink {
  readonly leftId: string;
  readonly rightId: string;
  readonly score: number;
}

/** État mutable partagé par les comparaisons de paires d'un run de dédoublonnage. */
interface CompareContext {
  readonly byId: ReadonlyMap<string, NormalizedListing>;
  readonly comparedPairs: Set<string>;
  readonly links: MergeLink[];
  readonly ambiguous: AmbiguousPair[];
  readonly mergeAmbiguous: boolean;
  readonly relaysListings: (sourceId: string) => boolean;
  readonly operatorOf: (sourceId: string) => string | null;
  readonly photoIdentifies: (key: string) => boolean | null;
}

/**
 * Compare une paire d'occurrences d'un même bucket et consigne le verdict.
 * @returns `1` si une comparaison fine a eu lieu, `0` sinon (paire déjà vue ou
 *          identifiant introuvable).
 */
function comparePair(leftId: string, rightId: string, ctx: CompareContext): number {
  const pairKey = leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;
  if (ctx.comparedPairs.has(pairKey)) return 0;
  ctx.comparedPairs.add(pairKey);

  const left = ctx.byId.get(leftId);
  const right = ctx.byId.get(rightId);
  if (left === undefined || right === undefined) return 0;

  const result = similarity(left, right, ctx.relaysListings, ctx.operatorOf, ctx.photoIdentifies);
  if (result.verdict === 'duplicate' || (ctx.mergeAmbiguous && result.verdict === 'ambiguous')) {
    ctx.links.push({ leftId, rightId, score: result.score });
  } else if (result.verdict === 'ambiguous') {
    ctx.ambiguous.push({ leftId, rightId, result });
  }
  return 1;
}

/** Compare toutes les paires d'un bucket. @returns le nombre de comparaisons. */
function comparePairsInBucket(bucket: readonly string[], ctx: CompareContext): number {
  let count = 0;
  for (let i = 0; i < bucket.length; i += 1) {
    for (let j = i + 1; j < bucket.length; j += 1) {
      const leftId = bucket[i];
      const rightId = bucket[j];
      if (leftId !== undefined && rightId !== undefined) {
        count += comparePair(leftId, rightId, ctx);
      }
    }
  }
  return count;
}

/**
 * Réunit les paires retenues, les plus sûres d'abord.
 *
 * LA TRANSITIVITÉ SE SURVEILLE AU NIVEAU DU GROUPE. Deux paires justes
 * chacune — A ~ X, X ~ B — peuvent réunir A et B, deux biens qu'aucune
 * comparaison directe n'aurait rapprochés. Une union est donc refusée si elle
 * mettait dans un même groupe deux occurrences d'une même source que
 * `sameSourceConflict` sépare. Les liens forts passent en premier : c'est le
 * plus faible qui cède.
 */
function joinGroups(ctx: CompareContext, unionFind: UnionFind): void {
  const members = new Map<string, NormalizedListing[]>();
  for (const [id, listing] of ctx.byId) members.set(id, [listing]);

  for (const link of [...ctx.links].sort((x, y) => y.score - x.score)) {
    const rootA = unionFind.find(link.leftId);
    const rootB = unionFind.find(link.rightId);
    if (rootA === rootB) continue;
    const left = members.get(rootA) ?? [];
    const right = members.get(rootB) ?? [];
    const conflict = left.some((x) =>
      right.some((y) => sameSourceConflict(x, y, ctx.relaysListings) !== null),
    );
    if (conflict) continue;
    unionFind.union(link.leftId, link.rightId);
    members.set(unionFind.find(link.leftId), [...left, ...right]);
  }
}

/** Regroupe un lot d'occurrences en logements uniques. */
export function dedupe(
  listings: readonly NormalizedListing[],
  options: DedupeOptions = {},
): DedupeResult {
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const unionFind = new UnionFind();
  for (const listing of listings) unionFind.add(listing.id);

  // Index inversé : clé de blocage → identifiants partageant cette clé.
  const buckets = new Map<string, string[]>();
  for (const listing of listings) {
    for (const key of blockingKeys(listing)) {
      const bucket = buckets.get(key);
      if (bucket === undefined) buckets.set(key, [listing.id]);
      else bucket.push(listing.id);
    }
  }

  const relaysListings = options.relaysListings ?? ((): boolean => false);
  const catalog = catalogPhotos(listings, relaysListings);
  const ctx: CompareContext = {
    byId,
    comparedPairs: new Set<string>(),
    links: [],
    ambiguous: [],
    mergeAmbiguous: options.mergeAmbiguous ?? false,
    relaysListings,
    operatorOf: options.operatorOf ?? ((): string | null => null),
    photoIdentifies: (key) => !catalog.has(key),
  };
  let comparisonCount = 0;
  for (const bucket of buckets.values()) {
    // Un bucket dégénéré (toutes les annonces d'une ville sans surface ni prix)
    // ferait exploser le coût : on l'ignore plutôt que de ralentir la collecte.
    if (bucket.length >= 2 && bucket.length <= 200) {
      comparisonCount += comparePairsInBucket(bucket, ctx);
    }
  }
  joinGroups(ctx, unionFind);

  const ambiguousByRoot = new Map<string, AmbiguousPair[]>();
  for (const pair of ctx.ambiguous) {
    const root = unionFind.find(pair.leftId);
    ambiguousByRoot.set(root, [...(ambiguousByRoot.get(root) ?? []), pair]);
  }

  // Matérialisation des groupes.
  const grouped = new Map<string, NormalizedListing[]>();
  for (const listing of listings) {
    const root = unionFind.find(listing.id);
    const members = grouped.get(root) ?? [];
    members.push(listing);
    grouped.set(root, members);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, occurrences] of grouped) {
    groups.push({
      occurrences,
      ambiguousPairs: ambiguousByRoot.get(root) ?? [],
    });
  }

  return { groups, comparisonCount };
}
