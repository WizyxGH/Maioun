/**
 * Géocodage d'adresses via la Base Adresse Nationale (§20, §6).
 *
 * `api-adresse.data.gouv.fr` est l'API **officielle et gratuite** de l'État
 * français, explicitement prévue pour l'automatisation (aucune clé, quota
 * généreux). On la préfère donc à tout scraping (§6).
 *
 * Économie (§30) : chaque adresse géocodée est mise en cache — une adresse ne
 * déménage pas. Les échecs sont aussi mémorisés pour ne pas réessayer en
 * boucle. Un seul appel réseau par adresse nouvelle, jamais davantage.
 */

import type { Coordinates } from './geo.js';

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

/** Entrée de cache : coordonnées, ou `null`/`null` si la BAN a échoué. */
export interface GeocodeEntry {
  readonly lat: number | null;
  readonly lon: number | null;
  readonly geocodedAt: string;
}

export interface GeocodeCacheStore {
  get(query: string): Promise<GeocodeEntry | null>;
  set(query: string, entry: GeocodeEntry): Promise<void>;
}

export interface GeocoderOptions {
  readonly cache: GeocodeCacheStore;
  readonly nowMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent: string;
  /** Score de confiance minimal BAN (0-1) pour accepter un résultat. */
  readonly minScore?: number;
}

export interface Geocoder {
  /**
   * Géocode une adresse, ou `null` si introuvable/vide. Cache d'abord.
   * `city` écarte une rue homonyme d'une autre commune.
   */
  geocode(query: string, city?: string | null): Promise<Coordinates | null>;
}

/** Cache en mémoire, pour les tests. */
export function createMemoryGeocodeCache(): GeocodeCacheStore {
  const entries = new Map<string, GeocodeEntry>();
  return {
    async get(query) {
      return entries.get(query) ?? null;
    },
    async set(query, entry) {
      entries.set(query, entry);
    },
  };
}

/**
 * Normalise une requête pour la clé de cache (espaces, casse).
 *
 * « v2 » : les résultats mémorisés avant le 2026-09-15 acceptaient le centre d'un
 * code postal pour une adresse — ils sont ignorés, et chaque adresse est replacée.
 */
export function geocodeCacheKey(query: string): string {
  return `v2 ${query.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Ce que la BAN a situé : un numéro ou une rue. Une commune, un lieu-dit ou un
 * code postal ne placent pas un logement — relevé du 2026-09-15 : cinq annonces
 * de l'avenue Sainte-Marguerite (06200), publiées avec « 06000 », posées au
 * centre du 06000, près du port.
 */
const PLACED_TYPES = new Set(['housenumber', 'street']);

interface BanFeature {
  readonly geometry?: { readonly coordinates?: readonly [number, number] };
  readonly properties?: { readonly score?: number; readonly type?: string; readonly city?: string };
}

/** « Saint-Laurent-du-Var » et « saint laurent du var » désignent la même commune. */
const cityKey = (city: string): string =>
  city
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[-\s]+/g, ' ')
    .trim()
    .toLowerCase();
const sameCity = (a: string, b: string): boolean => cityKey(a) === cityKey(b);

/** Le premier résultat qui situe vraiment l'adresse, dans la commune attendue. */
function placedFeature(
  features: readonly BanFeature[],
  minScore: number,
  city: string | null,
): BanFeature | null {
  return (
    features.find((feature) => {
      const props = feature.properties ?? {};
      return (
        (props.score ?? 0) >= minScore &&
        PLACED_TYPES.has(props.type ?? '') &&
        (city === null || props.city === undefined || sameCity(props.city, city)) &&
        feature.geometry?.coordinates !== undefined
      );
    }) ?? null
  );
}

export function createGeocoder(options: GeocoderOptions): Geocoder {
  const fetchImpl = options.fetchImpl ?? fetch;
  const minScore = options.minScore ?? 0.5;

  return {
    async geocode(rawQuery: string, city: string | null = null): Promise<Coordinates | null> {
      const query = rawQuery.trim();
      if (query.length < 4) return null;

      const key = geocodeCacheKey(query);
      const cached = await options.cache.get(key);
      if (cached !== null) {
        // Résultat connu (succès ou échec mémorisé) : aucun appel réseau.
        return cached.lat !== null && cached.lon !== null
          ? { latitude: cached.lat, longitude: cached.lon }
          : null;
      }

      let coords: Coordinates | null = null;
      try {
        // Plusieurs réponses : la première peut être une commune, la suivante la rue.
        const url = `${BAN_ENDPOINT}?q=${encodeURIComponent(query)}&limit=5`;
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': options.userAgent, Accept: 'application/json' },
        });
        if (response.ok) {
          const data = (await response.json()) as { features?: readonly BanFeature[] };
          const position = placedFeature(data.features ?? [], minScore, city)?.geometry
            ?.coordinates;
          // BAN renvoie [longitude, latitude] (ordre GeoJSON).
          if (position !== undefined) coords = { latitude: position[1], longitude: position[0] };
        }
      } catch {
        // Panne réseau : on ne met PAS en cache un échec transitoire, pour
        // pouvoir réessayer au prochain run.
        return null;
      }

      const nowIso = new Date(options.nowMs).toISOString();
      await options.cache.set(key, {
        lat: coords?.latitude ?? null,
        lon: coords?.longitude ?? null,
        geocodedAt: nowIso,
      });
      return coords;
    },
  };
}
