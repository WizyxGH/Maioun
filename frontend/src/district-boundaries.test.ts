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
import { boundaryOptions, loadDistrictBoundaries } from './district-boundaries.js';

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

  /**
   * Un contour est une limite PUBLIÉE, jamais une limite reconstituée : on
   * préfère un quartier sans contour à un contour approximatif. La carte n'en
   * couvre donc qu'une partie, et c'est voulu.
   */
  it('laisse sans contour les quartiers dont la limite n’est pas publiée', () => {
    expect(DISTRICT_BOUNDARIES.features.length).toBeLessThan(NICE_DISTRICTS.length);
    const couverts = new Set(DISTRICT_BOUNDARIES.features.map((f) => f.properties.slug));
    // « Cimiez » est trois IRIS : lui donner celui qui porte le nom nu
    // dessinerait un tiers du quartier sous le nom du tout.
    expect(couverts.has('cimiez')).toBe(false);
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
