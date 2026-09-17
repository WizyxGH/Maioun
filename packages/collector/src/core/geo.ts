/**
 * Calculs géographiques élémentaires.
 *
 * Le MVP se contente de la distance à vol d'oiseau (§20 : « une méthode de
 * calcul simple suffit »). Aucune API externe n'est appelée : c'est gratuit,
 * hors ligne, déterministe, et suffisant pour classer des annonces dans une
 * ville de la taille de Nice.
 */

import { estimateTravelMinutes, type ReferenceTravelMode } from '@maioun/shared';

/** Rayon moyen de la Terre en kilomètres. */
const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Distance orthodromique entre deux points, en kilomètres. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Les vitesses sont DANS LE PAQUET PARTAGÉ : l’interface convertit désormais
 * les durées d’un mode à l’autre pour le filtre de trajet, et elle ne peut pas
 * importer le collecteur.
 */
export type TravelMode = ReferenceTravelMode;

/**
 * Estime une durée de trajet, en minutes.
 *
 * LE CALCUL LUI AUSSI EST PARTAGÉ : les transports en commun n'ont plus une
 * vitesse unique — bus en deçà de quelques kilomètres, TER au-delà — et
 * l'interface doit pouvoir dire la même chose que la collecte.
 */
export function estimateDurationMinutes(distanceKm: number, mode: TravelMode): number {
  return estimateTravelMinutes(distanceKm, mode);
}
