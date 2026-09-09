/**
 * Ce qui compte ici : ne jamais confondre « je ne veux aucune distance » avec
 * « je n'arrive pas à relire ce qui a été réglé ».
 *
 * Le premier autorise un rescoring à effacer les temps de trajet ; le second
 * doit l'interrompre. Les confondre effacerait les distances de tout
 * l'inventaire sur une simple lecture ratée.
 */

import { describe, expect, it } from 'vitest';
import { referencePointsDeclared, resolveReferencePoints } from './reference-points.js';
import type { GeocodeCacheStore, GeocodeEntry } from './geocode.js';
import type { Logger } from './logger.js';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

/**
 * Un cache qui répond à tout : le géocodeur ne touche donc jamais au réseau.
 * L'adresse est renvoyée telle quelle par les coordonnées, ce qui permet de
 * vérifier LAQUELLE a été géocodée.
 */
function answeringCache(): GeocodeCacheStore {
  const entries = new Map<string, GeocodeEntry>();
  return {
    get: (query) =>
      Promise.resolve(
        entries.get(query) ?? {
          lat: 43.7 + query.length / 1000,
          lon: 7.26,
          geocodedAt: '2026-09-04T00:00:00.000Z',
        },
      ),
    set: (query, entry) => {
      entries.set(query, entry);
      return Promise.resolve();
    },
  };
}

const resolve = (stored?: string | null): ReturnType<typeof resolveReferencePoints> =>
  resolveReferencePoints({
    cache: answeringCache(),
    nowMs: Date.parse('2026-09-04T10:00:00.000Z'),
    logger: silentLogger,
    ...(stored === undefined ? {} : { stored }),
  });

describe('resolveReferencePoints', () => {
  it('géocode les adresses réglées depuis l’écran', async () => {
    const stored = JSON.stringify([
      { label: 'Bureau', address: 'avenue Jean Médecin, Nice', mode: 'walking' },
    ]);

    const points = await resolve(stored);

    expect(points).toHaveLength(1);
    expect(points[0]?.label).toBe('Bureau');
    expect(points[0]?.mode).toBe('walking');
  });

  it('ne rend aucun point quand rien n’a été réglé', async () => {
    expect(await resolve(null)).toEqual([]);
    expect(await resolve()).toEqual([]);
  });

  it('respecte une liste VIDÉE depuis l’écran', async () => {
    // C’est une décision, pas une absence de réglage.
    expect(await resolve('[]')).toEqual([]);
  });

  it('ne rend aucun point sur une valeur illisible', async () => {
    // Rien à géocoder : c’est `referencePointsDeclared` qui dira à l’appelant
    // que ce vide est un incident et non un choix.
    expect(await resolve('{ pas du json')).toEqual([]);
  });
});

describe('referencePointsDeclared', () => {
  it('dit « rien de déclaré » quand rien n’a été réglé', () => {
    expect(referencePointsDeclared(null)).toBe(false);
    expect(referencePointsDeclared(undefined)).toBe(false);
    expect(referencePointsDeclared('   ')).toBe(false);
  });

  it('dit « rien de déclaré » sur une liste vidée depuis l’écran', () => {
    // Sans cela, un rescoring s’interromprait en croyant à un géocodage raté.
    expect(referencePointsDeclared('[]')).toBe(false);
  });

  it('COMPTE une valeur illisible comme déclarée', () => {
    // Quelqu’un a réglé quelque chose qu’on ne sait plus relire. Interrompre un
    // rescoring vaut mieux qu’effacer les distances de tout l’inventaire.
    expect(referencePointsDeclared('{ pas du json')).toBe(true);
    expect(referencePointsDeclared('"du texte"')).toBe(true);
  });

  it('dit « déclaré » quand des points existent', () => {
    const stored = JSON.stringify([{ label: 'Bureau', address: 'Nice', mode: 'walking' }]);
    expect(referencePointsDeclared(stored)).toBe(true);
  });
});
