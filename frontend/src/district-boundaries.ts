/**
 * Les contours de quartiers posés sur la carte.
 *
 * CE MODULE NE S'IMPORTE QU'À LA DEMANDE. Les contours font un morceau de
 * 22 ko, 6 ko une fois compressés ; ils n'ont rien à faire dans le premier
 * affichage, que GitHub Pages sert sans brotli et ne garde en cache que dix
 * minutes. La carte les appelle une fois montée, et la feuille de style les
 * suit dans le même morceau.
 *
 * LA DONNÉE N'EST PAS DE NOUS, et sa licence l'exige : l'attribution IGN/INSEE
 * s'affiche sur la carte, à côté de celles d'OpenStreetMap et d'Esri.
 */

import { districtLabel } from '@maioun/shared';
import './district-boundaries.css';
import type { DistrictBoundaries } from './district-boundaries.generated.js';

export type { DistrictBoundaries, DistrictBoundary } from './district-boundaries.generated.js';

/** Classe posée sur chaque contour ; la feuille de style fait le reste. */
export const BOUNDARY_CLASS = 'maioun-quartier';

/** Classe du contour mis en évidence. */
export const BOUNDARY_ACTIVE_CLASS = 'maioun-quartier-actif';

/** Exigée par la Licence Ouverte 2.0 sous laquelle les contours sont publiés. */
export const BOUNDARY_ATTRIBUTION =
  'Quartiers : <a href="https://geoservices.ign.fr/contoursiris">Contours…IRIS®</a> &copy; IGN / INSEE';

/** Un quartier qui a un contour : de quoi remplir une liste déroulante. */
export interface DistrictOption {
  readonly slug: string;
  readonly label: string;
}

/**
 * Les contours, chargés une seule fois.
 *
 * Le `import()` est ce qui les tient hors du paquet initial : Vite en fait un
 * morceau à part, demandé au moment de cet appel.
 */
export async function loadDistrictBoundaries(): Promise<DistrictBoundaries> {
  const module = await import('./district-boundaries.generated.js');
  return module.DISTRICT_BOUNDARIES;
}

/**
 * Les quartiers dessinés, par ordre alphabétique de nom affiché.
 *
 * Le libellé vient de `districtLabel`, jamais du fichier de contours : celui-ci
 * ne porte que des slugs, pour que les deux ne puissent pas diverger.
 */
export function boundaryOptions(boundaries: DistrictBoundaries): readonly DistrictOption[] {
  return boundaries.features
    .map((feature) => ({
      slug: feature.properties.slug,
      label: districtLabel(feature.properties.slug),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/**
 * Le point est-il dans cet anneau ? Lancer de rayon, la méthode usuelle.
 *
 * On compte les fois où une demi-droite partant du point traverse le contour :
 * un nombre impair veut dire « dedans ». Les coordonnées sont en GeoJSON,
 * donc `[longitude, latitude]`.
 */
function dansAnneau(lon: number, lat: number, anneau: readonly (readonly number[])[]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const xi = anneau[i]?.[0] ?? 0;
    const yi = anneau[i]?.[1] ?? 0;
    const xj = anneau[j]?.[0] ?? 0;
    const yj = anneau[j]?.[1] ?? 0;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/** Dans le polygone, c'est-à-dire dans son contour et dans aucun de ses trous. */
function dansPolygone(
  lon: number,
  lat: number,
  polygone: readonly (readonly (readonly number[])[])[],
): boolean {
  const [exterieur, ...trous] = polygone;
  if (exterieur === undefined || !dansAnneau(lon, lat, exterieur)) return false;
  return !trous.some((trou) => dansAnneau(lon, lat, trou));
}

/**
 * LE QUARTIER D'UN POINT, quand les contours le disent sans ambiguïté.
 *
 * Mille annonces actives n'ont aucun quartier, et cinq cent soixante et une
 * d'entre elles portent pourtant des coordonnées : la source n'écrit pas le
 * quartier, mais elle dit où est le bien. Le rattacher n'invente rien — c'est
 * le découpage de l'INSEE appliqué à un point connu.
 *
 * `null` DÈS QUE DEUX CONTOURS SE DISPUTENT LE POINT. Huit quartiers partagent
 * la zone d'un voisin, faute d'en avoir une à eux : là où ils se superposent,
 * choisir reviendrait à tirer au sort. Mieux vaut pas de quartier qu'un
 * mauvais — c'est la même règle que partout ailleurs ici.
 */
export function districtAt(
  boundaries: DistrictBoundaries,
  latitude: number,
  longitude: number,
): string | null {
  const trouves = boundaries.features.filter((feature) =>
    feature.geometry.coordinates.some((polygone) => dansPolygone(longitude, latitude, polygone)),
  );
  return trouves.length === 1 ? (trouves[0]?.properties.slug ?? null) : null;
}
