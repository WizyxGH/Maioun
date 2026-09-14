/**
 * Dépôt de garantie, honoraires et « charges comprises » : ils voyagent dans la
 * charge utile, sans colonne, et doivent survivre à l'écriture puis à la relecture.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  mergeGroup,
  migrate,
  openDatabase,
  scoreListing,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

describe('dépôt de garantie et honoraires en base', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('relit l’occurrence telle qu’écrite, et une ancienne ligne sans eux vaut null', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({
        id: 'paruvendu:1',
        sourceId: 'paruvendu',
        chargesIncluded: true,
        deposit: 660,
        tenantFees: 220,
      }),
      makeOccurrence({ id: 'pap:1', sourceId: 'pap' }),
    ]);
    const [pap, paruvendu] = (await repository.allActiveOccurrences()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(paruvendu).toMatchObject({ chargesIncluded: true, deposit: 660, tenantFees: 220 });
    expect(pap).toMatchObject({ deposit: null, tenantFees: null });
  });

  it('les expose dans la charge utile de la fiche', async () => {
    const occurrence = makeOccurrence({
      id: 'paruvendu:1',
      sourceId: 'paruvendu',
      chargesIncluded: true,
      charges: 30,
      deposit: 660,
      tenantFees: 220,
    });
    const listing = scoreListing(mergeGroup([occurrence]), {
      criteria: MVP_CRITERIA,
      nowMs: Date.now(),
      referencePricePerSqm: 20,
      referencePoints: [],
    });
    await repository.upsertOccurrences([occurrence]);
    await repository.saveListings([listing]);
    const row = await db.execute({
      sql: 'SELECT payload FROM listings WHERE id = ?',
      args: ['paruvendu:1'],
    });
    const payload = JSON.parse(String(row.rows[0]?.['payload'])) as Record<string, unknown>;
    expect(payload['chargesIncluded']).toBe(true);
    expect(payload['deposit']).toMatchObject({ value: 660 });
    expect(payload['tenantFees']).toMatchObject({ value: 220 });
  });
});
