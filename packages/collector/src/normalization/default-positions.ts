/**
 * Les positions par défaut d'une source, retirées avant le regroupement.
 *
 * UN POINT POSÉ SUR HUIT LOGEMENTS DIFFÉRENTS N'EN DÉSIGNE AUCUN. Un portail
 * qui ne connaît que le quartier géocode quand même, et publie le même point
 * pour tout ce qu'il ne sait pas placer : Rentola met vingt-trois logements au
 * « 37 avenue Jean Médecin » — de 450 € pour 23 m² à 780 € pour 34 m² —, à la
 * même position au millionième (relevé du 2026-10-05). Affichés tels quels,
 * ils formaient une punaise de vingt-trois annonces sur la carte, et un temps
 * de trajet faux sur chaque fiche.
 *
 * ON RETIRE L'ADRESSE AVEC LA POSITION : gardée seule, le géocodeur la
 * replacerait au même endroit.
 *
 * LE SEUIL EST HAUT EXPRÈS. Une vraie résidence pose légitimement plusieurs
 * logements au même point : trois studios Studapart rue Châteauneuf, des
 * immeubles de French Riviera Studios. Mesuré sur les 2 157 occurrences
 * localisées du même relevé, hors Rentola, aucun point n'en porte plus de sept.
 */

import type { NormalizedListing } from '@maioun/shared';

/** À partir de ce nombre de logements distincts, le point est un défaut. */
export const DEFAULT_POSITION_MIN_LISTINGS = 8;

/** La position au millionième — l'égalité qu'une saisie humaine ne produit pas. */
function cle(listing: NormalizedListing): string | null {
  if (listing.latitude === null || listing.longitude === null) return null;
  return `${listing.sourceId}|${listing.latitude.toFixed(5)}|${listing.longitude.toFixed(5)}`;
}

/** Deux occurrences de même loyer et de même surface sont un seul logement. */
function logement(listing: NormalizedListing): string {
  return `${listing.price ?? '?'}|${listing.area ?? '?'}`;
}

/** Les points qu'une même source pose sur trop de logements différents. */
export function defaultPositions(corpus: readonly NormalizedListing[]): ReadonlySet<string> {
  const logements = new Map<string, Set<string>>();
  for (const listing of corpus) {
    const point = cle(listing);
    if (point === null) continue;
    const vus = logements.get(point) ?? new Set<string>();
    vus.add(logement(listing));
    logements.set(point, vus);
  }
  return new Set(
    [...logements]
      .filter(([, vus]) => vus.size >= DEFAULT_POSITION_MIN_LISTINGS)
      .map(([point]) => point),
  );
}

/** Le corpus, sans les positions par défaut ni les adresses qui les accompagnent. */
export function withoutDefaultPositions(corpus: readonly NormalizedListing[]): NormalizedListing[] {
  const defauts = defaultPositions(corpus);
  if (defauts.size === 0) return [...corpus];
  return corpus.map((listing) => {
    const point = cle(listing);
    return point !== null && defauts.has(point)
      ? { ...listing, latitude: null, longitude: null, address: null }
      : listing;
  });
}
