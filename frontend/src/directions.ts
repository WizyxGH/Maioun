/**
 * Le lien « voir le trajet » (§20, §26).
 *
 * La fiche annonce « 57 min (13,24 km à vol d'oiseau) » sans dire par où l'on
 * passe : deux logements à cinquante minutes ne se valent pas selon qu'on y va
 * d'un trait ou avec deux changements.
 *
 * L'ORIGINE NE VIENT PAS DE L'ANNONCE, et ne le peut pas : `ReferenceDistance`
 * ne porte volontairement ni adresse ni coordonnées du point de référence,
 * lesquelles, couplées à celles du logement, permettraient de trilatérer le
 * domicile (§26). On la reprend des RÉGLAGES, déjà sur l'appareil, en
 * rapprochant les deux par le libellé.
 *
 * La destination est celle de `mapsQueryOf`, qui refuse déjà de pointer une
 * ville seule : un itinéraire vers « 06000 Nice » déposerait au centre-ville.
 */

import type { ReferenceTravelMode, StoredReferencePoint } from '@maioun/shared';

/**
 * Ce que Google Maps attend, pour chacun de nos modes.
 *
 * `train` retombe sur `transit` : Maps ne distingue pas le rail du reste des
 * transports en commun, et son itinéraire proposera le train de lui-même quand
 * c'est le plus rapide.
 */
const TRAVEL_MODE: Readonly<Record<ReferenceTravelMode, string>> = {
  walking: 'walking',
  cycling: 'bicycling',
  transit: 'transit',
  train: 'transit',
  driving: 'driving',
};

/**
 * Le lien d'itinéraire, ou `null` quand une extrémité manque — ce qui arrive
 * dès que l'annonce n'est pas située plus précisément que sa commune.
 */
export function directionsUrl(
  destination: string,
  point: StoredReferencePoint | undefined,
  mode: ReferenceTravelMode,
): string | null {
  const origin = point?.address.trim() ?? '';
  if (destination.trim() === '' || origin === '') return null;

  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: TRAVEL_MODE[mode],
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
