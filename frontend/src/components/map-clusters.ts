/**
 * Regroupement des marqueurs de la carte par cases de pixels.
 *
 * UNE PASTILLE PAR ANNONCE NE PASSE PLUS L'ÉCHELLE : avec trois mille annonces
 * actives, le navigateur repeint trois mille pastilles à chaque image d'un
 * déplacement, et la carte tombe à une dizaine d'images par seconde. Ce qui se
 * superpose à l'écran se regroupe donc en un seul amas, cliquable : rien n'est
 * retiré, seul l'affichage est allégé.
 *
 * Le découpage se fait en PIXELS et non en degrés : deux annonces voisines se
 * chevauchent à un zoom large et se séparent en zoomant, ce qui est exactement
 * le comportement attendu. Un découpage en degrés donnerait des amas qui
 * survivent au zoom au bord de la Méditerranée et se dissolvent au nord.
 */

/** Un amas : ses annonces, et le point qui les représente (leur barycentre). */
export interface MapCluster<T> {
  readonly latitude: number;
  readonly longitude: number;
  readonly items: readonly T[];
}

/** Coordonnées vers pixels, au zoom courant — `map.project` de Leaflet. */
export type PixelProjection = (latitude: number, longitude: number) => readonly [number, number];

/**
 * Regroupe les éléments dont les pixels tombent dans la même case de `cellPx`.
 *
 * L'ordre des amas suit celui de la première annonce rencontrée : deux appels
 * sur la même entrée rendent la même chose, ce qui rend le résultat testable
 * et évite des marqueurs qui changent de place sans raison.
 */
export function clusterByPixelGrid<T>(
  items: Iterable<T>,
  positionOf: (item: T) => readonly [number, number],
  project: PixelProjection,
  cellPx: number,
): MapCluster<T>[] {
  const cells = new Map<string, { items: T[]; latitudes: number; longitudes: number }>();
  for (const item of items) {
    const [latitude, longitude] = positionOf(item);
    const [x, y] = project(latitude, longitude);
    const key = `${Math.floor(x / cellPx)}:${Math.floor(y / cellPx)}`;
    const cell = cells.get(key);
    if (cell === undefined) {
      cells.set(key, { items: [item], latitudes: latitude, longitudes: longitude });
    } else {
      cell.items.push(item);
      cell.latitudes += latitude;
      cell.longitudes += longitude;
    }
  }
  return [...cells.values()].map((cell) => ({
    latitude: cell.latitudes / cell.items.length,
    longitude: cell.longitudes / cell.items.length,
    items: cell.items,
  }));
}
