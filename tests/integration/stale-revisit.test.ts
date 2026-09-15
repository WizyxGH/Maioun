/**
 * Relecture des fiches anciennes, par roulement.
 *
 * Un adaptateur qui ne relit jamais une annonce connue fige ses champs dans
 * l'état du parseur au jour de la collecte. Deux fiches par source et par
 * passage, les plus anciennes d'abord, repassent donc par le parseur du jour —
 * et une relecture sans changement doit dater la fiche, sinon les mêmes
 * reviendraient à chaque passage.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const DAY = 24 * 60 * 60 * 1000;
const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString();

describe('relecture des fiches anciennes', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  const occurrence = (ref: string, scrapedMsAgo: number) =>
    makeOccurrence({
      id: `hektor-test:${ref}`,
      sourceId: 'hektor-test',
      sourceRef: ref,
      imageUrls: ['https://hektor-test.example.invalid/1.jpg'],
      scrapedAt: iso(scrapedMsAgo),
      lastSeenAt: iso(scrapedMsAgo),
      firstSeenAt: iso(scrapedMsAgo),
    });

  it('rend « inconnues » les deux plus anciennes au-delà de deux semaines', async () => {
    await repository.upsertOccurrences([
      occurrence('recente', 1 * DAY),
      occurrence('vieille-1', 30 * DAY),
      occurrence('vieille-2', 20 * DAY),
      occurrence('vieille-3', 16 * DAY),
    ]);
    const known = await repository.knownRefs('hektor-test');
    expect([...known].sort()).toEqual(['recente', 'vieille-3']);
  });

  it('une relecture inchangée date la fiche, qui sort du roulement', async () => {
    const old = occurrence('vieille', 30 * DAY);
    await repository.upsertOccurrences([old]);
    expect((await repository.knownRefs('hektor-test')).has('vieille')).toBe(false);

    const now = new Date().toISOString();
    await repository.upsertOccurrences([{ ...old, scrapedAt: now, lastSeenAt: now }]);
    expect((await repository.knownRefs('hektor-test')).has('vieille')).toBe(true);
  });
});
