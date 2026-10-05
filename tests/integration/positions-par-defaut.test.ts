/**
 * UN POINT POSÉ SUR HUIT LOGEMENTS N'EN SITUE AUCUN — et le regroupement le
 * retire bel et bien.
 *
 * L'unité est vérifiée dans `default-positions.test.ts`. Ici on vérifie ce
 * qu'un garde-fou isolé ne garantit pas : qu'il est BRANCHÉ. Les vingt-trois
 * annonces Rentola au « 37 avenue Jean Médecin » n'en sortiront de la carte
 * qu'à cette condition.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Scraper } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import {
  budgetFor,
  createRegistry,
  createRepository,
  createTestClock,
  migrate,
  openDatabase,
  runPipeline,
  scheduleFor,
  silentLogger,
} from '@maioun/collector';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '../../database/migrations');
const NOW = Date.parse('2026-10-05T12:00:00.000Z');

/** Un portail qui place tout ce qu'il ne sait pas situer au même point. */
const portail = (n: number): Scraper => ({
  descriptor: {
    id: 'portail-test',
    name: 'Portail test',
    domain: 'portail.example.invalid',
    kind: 'aggregator',
    method: 'html',
    priority: 3,
    schedule: scheduleFor('aggregator'),
    budget: budgetFor('aggregator'),
    enabled: true,
    allowedPaths: [],
    notes: '',
  },
  run: () =>
    Promise.resolve({
      sourceId: 'portail-test',
      listings: Array.from({ length: n }, (_, rang) => ({
        sourceRef: `p-${rang}`,
        sourceUrl: `https://portail.example.invalid/annonce/${rang}`,
        title: `Studio ${rang}`,
        priceText: `${500 + rang * 15} €`,
        areaText: `${20 + rang} m²`,
        cityText: 'Nice',
        postalCodeText: '06000',
        addressText: '37 Avenue Fictive',
        latitude: 43.7030602,
        longitude: 7.2662467,
      })),
      requestCount: 1,
      pagesFetched: 1,
      stopReason: 'completed' as const,
      warnings: [],
    }),
});

async function positionsApres(n: number): Promise<{ lat: number | null; adr: string | null }[]> {
  const db = openDatabase({ url: ':memory:' });
  await migrate(db, MIGRATIONS, silentLogger);
  const repository = createRepository(db);
  await runPipeline({
    registry: createRegistry([portail(n)]),
    repository,
    config: {
      criteria: MVP_CRITERIA,
      maxSourcesPerRun: 6,
      referencePricePerSqm: 20,
      missingRunsBeforePossiblyInactive: 2,
      missingRunsBeforeInactive: 6,
    },
    referencePoints: [],
    userAgent: 'MaiounBot/0.1 (test)',
    mode: 'live',
    clock: createTestClock({ startMs: NOW, random: 0 }),
    logger: silentLogger,
  });
  const { rows } = await db.execute(
    "SELECT latitude AS lat, json_extract(payload, '$.address.value') AS adr FROM listings",
  );
  return rows.map((row) => ({
    lat: row['lat'] as number | null,
    adr: row['adr'] as string | null,
  }));
}

describe('les positions par défaut d’une source, au regroupement', () => {
  it('sortent de la carte et de l’adresse affichée', async () => {
    const fiches = await positionsApres(8);
    expect(fiches).toHaveLength(8);
    expect(fiches.every((fiche) => fiche.lat === null && fiche.adr === null)).toBe(true);
  });

  it('restent quand une résidence ne pose que quelques logements au même point', async () => {
    const fiches = await positionsApres(3);
    expect(fiches.every((fiche) => fiche.lat === 43.7030602)).toBe(true);
  });
});
