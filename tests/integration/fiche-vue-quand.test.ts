/**
 * « Vue pour la dernière fois » doit dire vrai (§32).
 *
 * La fiche n'est réécrite que si son contenu change ; sa date d'observation ne
 * bougeait donc qu'avec lui. Une annonce republiée à l'identique pendant trois
 * semaines gardait la date de son dernier changement, alors que ses
 * occurrences, elles, étaient confirmées à chaque passage.
 *
 * Relevé le 2026-09-18 sur un studio du Port : la fiche annonçait 6 h 55,
 * quand ses deux sources l'avaient confirmée à 12 h 41 le jour même. C'est
 * précisément la phrase « vue pour la dernière fois le … » qui décide si l'on
 * se déplace.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  scoreListing,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

function fiche(lastSeenAt: string): ScoredListing {
  return scoreListing(
    makeAggregated({
      id: 'orpi:1',
      lastSeenAt,
      occurrences: [makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })],
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

async function vueLe(db: Database): Promise<string | null> {
  const found = await db.execute({
    sql: 'SELECT last_seen_at FROM listings WHERE id = ?',
    args: ['orpi:1'],
  });
  const value = found.rows[0]?.['last_seen_at'];
  return typeof value === 'string' ? value : null;
}

const HIER = '2026-09-17T06:55:00.000Z';
const AUJOURDHUI = '2026-09-18T12:41:00.000Z';

describe('la date d’observation d’une fiche inchangée', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
  });

  it('AVANCE quand la source la republie à l’identique', async () => {
    await repository.saveListings([fiche(HIER)]);
    expect(await vueLe(db)).toBe(HIER);

    const rapport = await repository.saveListings([fiche(AUJOURDHUI)]);
    // Rien n'a changé : la fiche n'est pas réécrite, seule sa date avance.
    expect(rapport.unchanged).toBe(1);
    expect(rapport.updated).toBe(0);
    expect(await vueLe(db)).toBe(AUJOURDHUI);
  });

  it('ne recule JAMAIS : un passage plus ancien ne rajeunit pas une fiche', async () => {
    // Deux sources d'une même fiche ne sont pas lues au même instant, et la
    // plus lente ne doit pas effacer ce que la plus rapide a confirmé.
    await repository.saveListings([fiche(AUJOURDHUI)]);
    await repository.saveListings([fiche(HIER)]);
    expect(await vueLe(db)).toBe(AUJOURDHUI);
  });
});
