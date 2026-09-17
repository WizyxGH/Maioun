/**
 * Le regroupement allège l'affichage SANS PERDRE D'ANNONCE : ce que ces tests
 * vérifient d'abord, c'est que la somme des amas rend bien l'entrée.
 */

import { describe, expect, it } from 'vitest';
import { clusterByPixelGrid } from './map-clusters.js';

/** Projection factice : un degré vaut cent pixels, ce qui rend les cas lisibles. */
const project = (latitude: number, longitude: number) => [longitude * 100, latitude * 100] as const;

const position = (point: { lat: number; lon: number }) => [point.lat, point.lon] as const;

describe('clusterByPixelGrid', () => {
  it('regroupe ce qui se superpose et sépare ce qui est loin', () => {
    const points = [
      { lat: 43.7, lon: 7.25 },
      { lat: 43.701, lon: 7.2505 },
      { lat: 44.5, lon: 7.25 },
    ];
    const clusters = clusterByPixelGrid(points, position, project, 64);
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.items).toHaveLength(2);
    expect(clusters[1]?.items).toHaveLength(1);
  });

  it('place l’amas au barycentre de ses annonces', () => {
    const clusters = clusterByPixelGrid(
      [
        { lat: 43.7, lon: 7.2 },
        { lat: 43.8, lon: 7.4 },
      ],
      position,
      project,
      1000,
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.latitude).toBeCloseTo(43.75, 6);
    expect(clusters[0]?.longitude).toBeCloseTo(7.3, 6);
  });

  it('ne perd ni ne duplique aucune annonce', () => {
    const points = Array.from({ length: 500 }, (_, index) => ({
      lat: 43.6 + (index % 25) * 0.01,
      lon: 7.2 + Math.floor(index / 25) * 0.01,
      id: index,
    }));
    const clusters = clusterByPixelGrid(points, position, project, 64);
    const ids = clusters.flatMap((cluster) => cluster.items.map((point) => point.id));
    expect(new Set(ids).size).toBe(500);
    expect(clusters.length).toBeLessThan(500);
  });

  it('un point seul garde sa position exacte', () => {
    const clusters = clusterByPixelGrid([{ lat: 43.7009, lon: 7.2683 }], position, project, 64);
    expect(clusters[0]?.latitude).toBe(43.7009);
    expect(clusters[0]?.longitude).toBe(7.2683);
  });

  it('sépare deux points de part et d’autre d’une bordure de case', () => {
    // 0 px et 64 px : deux cases voisines, donc deux amas.
    const clusters = clusterByPixelGrid(
      [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 0.64 },
      ],
      position,
      project,
      64,
    );
    expect(clusters).toHaveLength(2);
  });

  it('tient les coordonnées négatives, sans case commune autour de zéro', () => {
    const clusters = clusterByPixelGrid(
      [
        { lat: 0, lon: -0.01 },
        { lat: 0, lon: 0.01 },
      ],
      position,
      project,
      64,
    );
    expect(clusters).toHaveLength(2);
  });
});
