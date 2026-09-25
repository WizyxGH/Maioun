/**
 * LES CRITÈRES APPLIQUÉS À LA LECTURE, et d'où ils viennent.
 *
 * Deux sources, une seule interprétation : les critères ENREGISTRÉS d'un compte
 * et ceux qu'un visiteur porte dans l'adresse d'un lien partagé. Un lien filtre
 * donc exactement comme les mêmes critères posés dans un compte — c'est le
 * point de ce module, et la raison pour laquelle une seule fonction les lit.
 *
 * SORTI DE `routes.ts` parce que ce n'est pas du routage : c'est la traduction
 * d'un réglage en filtre, elle se teste sans requête, et elle a sa propre
 * histoire de régressions (voir `core/filter-parity.test.ts`).
 */

import type { Client } from '@libsql/client';
import { districtBySlug, MVP_CRITERIA, SEARCH_CRITERIA_SETTING } from '@maioun/shared';

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
  /** Surface plafond, en m². Absente = aucun plafond. */
  readonly maxArea?: number;
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
 * Ce qu'on rend tant que personne n'a rien réglé : LE PÉRIMÈTRE, ET RIEN DE PLUS.
 *
 * On rendait le budget et la surface d'UNE personne — 250–700 €, ≥ 20 m² —
 * écrits en dur dans le code partagé. Chaque compte nouveau les héritait, sans
 * les avoir demandés et sans que rien ne le dise : trois quarts du catalogue
 * retranchés d'entrée (169 annonces sur 2 285 au relevé du 2026-09-25).
 *
 * La commune reste, parce qu'elle n'est pas un filtre : c'est le périmètre de
 * l'outil, et sans elle il ne resterait rien à chercher.
 */
export const DEFAULT_FILTERS = { cities: [...MVP_CRITERIA.cities] };

/**
 * Budget et surface tels que CET utilisateur les a réglés, appliqués en direct
 * à la liste : resserrer son budget doit se voir tout de suite, sans attendre
 * la collecte suivante. Les exclusions (colocation, étudiant, bailleur,
 * ameublement, quartier, disponibilité) suivent le même chemin depuis qu'elles
 * ont quitté le score : voir `core/trait-filters`.
 */
export async function liveFilters(db: Client, userId: string): Promise<LiveFilters | undefined> {
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
/**
 * Un plafond de trajet, ou rien.
 *
 * ZÉRO N'EST PAS UN PLAFOND : aucune annonce localisée ne le franchit, et le
 * garder viderait la liste au lieu de la filtrer.
 */
function strictementPositif(value: unknown): number | undefined {
  return finite(value) && value > 0 ? value : undefined;
}

export function parseLiveFilters(value: unknown, defauts = false): LiveFilters | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const parsed = value as Partial<Record<keyof LiveFilters, unknown>>;
  if (!defauts && (!finite(parsed.maxPrice) || !finite(parsed.minArea))) return undefined;
  /** La valeur lue, ou celle du projet quand on comble. */
  const nombre = (lu: unknown, defaut: number | undefined): number | undefined =>
    finite(lu) ? lu : defauts ? defaut : undefined;
  /** Un plafond que l'appelant n'a pas posé N'EXISTE PAS : il ne se comble pas. */
  const plafond = (lu: unknown): number | undefined => (finite(lu) ? lu : undefined);
  const maxPrice = nombre(parsed.maxPrice, MVP_CRITERIA.maxPrice) ?? MVP_CRITERIA.maxPrice;
  const maxArea = plafond(parsed.maxArea);
  const minPrice = finite(parsed.minPrice) ? parsed.minPrice : plancherDuProjet(defauts, maxPrice);
  // LE PLAFOND DE TRAJET NE SE COMBLE PAS, contrairement au loyer et à la
  // surface. Son absence est un CHOIX que l'interface sait poser — vider le
  // champ, ou retirer sa puce —, et le remplacer par celui du projet rendait ce
  // choix sans effet : la liste continuait d'écarter au-delà de 60 minutes.
  // Zéro n'en est pas un non plus : aucune annonce localisée ne le franchit.
  // Même règle que pour les alertes, dans `config.ts`.
  const maxCommuteMinutes = strictementPositif(parsed.maxCommuteMinutes);
  return {
    maxPrice,
    minArea: nombre(parsed.minArea, MVP_CRITERIA.minArea) ?? MVP_CRITERIA.minArea,
    ...(maxArea !== undefined ? { maxArea } : {}),
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
