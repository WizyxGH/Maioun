// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * Les contours de quartiers : ce qu'ils promettent, et ce qu'ils ne promettent
 * pas.
 *
 * LE POINT DÉLICAT N'EST PAS LE DESSIN, C'EST LE RAPPROCHEMENT. Le fichier
 * vient des IRIS de l'INSEE, dont le découpage n'est pas le nôtre : un contour
 * posé sur le mauvais quartier serait invisible à la relecture et faux sur
 * l'écran. On vérifie donc que chaque contour désigne un quartier que nous
 * connaissons, et qu'aucun quartier n'en reçoit deux.
 */

import { describe, expect, it } from 'vitest';
import { districtBySlug, NICE_DISTRICTS } from '@maioun/shared';
import { DISTRICT_BOUNDARIES } from './district-boundaries.generated.js';
import {
  boundaryOptions,
  districtAt,
  loadDistrictBoundaries,
  type DistrictBoundaries,
  type DistrictBoundary,
} from './district-boundaries.js';

describe('contours de quartiers', () => {
  it('ne désigne que des quartiers de la table partagée', () => {
    for (const feature of DISTRICT_BOUNDARIES.features) {
      expect(districtBySlug(feature.properties.slug), feature.properties.slug).toBeDefined();
    }
  });

  it('donne au plus un contour par quartier', () => {
    const slugs = DISTRICT_BOUNDARIES.features.map((feature) => feature.properties.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('réunit les IRIS lorsque la table de nommage l’autorise', () => {
    expect(DISTRICT_BOUNDARIES.features.length).toBeLessThan(NICE_DISTRICTS.length);
    const couverts = new Set(DISTRICT_BOUNDARIES.features.map((f) => f.properties.slug));
    // Cimiez est composé de plusieurs IRIS, réunis par le générateur à partir
    // de la table de nommage des quartiers.
    expect(couverts.has('cimiez')).toBe(true);
    expect(couverts.has('mont-boron')).toBe(true);
  });

  it('ferme chaque anneau et garde de quoi dessiner', () => {
    for (const feature of DISTRICT_BOUNDARIES.features) {
      expect(feature.geometry.coordinates.length).toBeGreaterThan(0);
      for (const polygone of feature.geometry.coordinates) {
        for (const anneau of polygone) {
          expect(anneau.length).toBeGreaterThanOrEqual(4);
          expect(anneau[0]).toEqual(anneau[anneau.length - 1]);
        }
      }
    }
  });

  /** Nice tient entre ces bornes : un contour ailleurs serait une inversion
   * latitude/longitude, l'erreur classique du GeoJSON. */
  it('place tous les sommets sur Nice, longitude en premier', () => {
    for (const feature of DISTRICT_BOUNDARIES.features) {
      for (const polygone of feature.geometry.coordinates) {
        for (const anneau of polygone) {
          for (const [longitude, latitude] of anneau) {
            expect(longitude).toBeGreaterThan(7.1);
            expect(longitude).toBeLessThan(7.35);
            expect(latitude).toBeGreaterThan(43.6);
            expect(latitude).toBeLessThan(43.82);
          }
        }
      }
    }
  });

  it('nomme les quartiers par la table partagée, dans l’ordre alphabétique', () => {
    const options = boundaryOptions(DISTRICT_BOUNDARIES);
    expect(options.length).toBe(DISTRICT_BOUNDARIES.features.length);
    expect(options.map((option) => option.label)).toEqual(
      [...options.map((option) => option.label)].sort((a, b) => a.localeCompare(b, 'fr')),
    );
    const port = options.find((option) => option.slug === 'port');
    // Le fichier ne porte que des slugs : le libellé vient de `districtLabel`.
    expect(port?.label).toBe('Le Port');
  });

  it('charge les contours à la demande', async () => {
    await expect(loadDistrictBoundaries()).resolves.toBe(DISTRICT_BOUNDARIES);
  });
});

describe('districtAt', () => {
  /** Un carré simple, et un second qui le recouvre à moitié. */
  const carre = (slug: string, x0: number, x1: number): DistrictBoundary => ({
    type: 'Feature',
    properties: { slug },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [x0, 0],
            [x1, 0],
            [x1, 10],
            [x0, 10],
            [x0, 0],
          ],
        ],
      ],
    },
  });

  const collection = (features: readonly DistrictBoundary[]): DistrictBoundaries => ({
    type: 'FeatureCollection',
    features: [...features],
  });

  it('rattache un point au seul quartier qui le contient', () => {
    const boundaries = collection([carre('gambetta', 0, 5), carre('riquier', 10, 15)]);
    expect(districtAt(boundaries, 5, 2)).toBe('gambetta');
    expect(districtAt(boundaries, 5, 12)).toBe('riquier');
  });

  it('ne rattache rien hors de tout contour', () => {
    expect(districtAt(collection([carre('gambetta', 0, 5)]), 5, 40)).toBeNull();
  });

  /**
   * HUIT QUARTIERS PARTAGENT LA ZONE D'UN VOISIN, faute d'en avoir une à eux.
   * Là où deux contours se superposent, choisir reviendrait à tirer au sort.
   */
  it('ne tranche pas entre deux contours qui se superposent', () => {
    const boundaries = collection([carre('cimiez', 0, 10), carre('valrose', 5, 15)]);
    expect(districtAt(boundaries, 5, 7)).toBeNull();
    // Hors du recouvrement, chacun reste chez soi.
    expect(districtAt(boundaries, 5, 2)).toBe('cimiez');
    expect(districtAt(boundaries, 5, 12)).toBe('valrose');
  });
});
