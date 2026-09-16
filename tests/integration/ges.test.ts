/**
 * Le GES parcourt le même chemin que le DPE : aucune colonne, il voyage dans la
 * charge utile de l'occurrence puis dans celle de la fiche — et dans la version
 * allégée que la liste recopie.
 *
 * L'EMPREINTE EST LE POINT DÉLICAT. Une fiche déjà en base n'est réécrite que si
 * son empreinte change : sans le GES dedans, l'étiquette serait lue, fusionnée,
 * et jamais rangée. C'est le défaut qui avait coûté les charges de 131
 * occurrences.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  mergeGroup,
  migrate,
  normalizeListing,
  openDatabase,
  scoreListing,
  silentLogger,
  type Database,
  type Repository,
} from '@maioun/collector';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

const scorer = (occurrences: Parameters<typeof mergeGroup>[0]): ReturnType<typeof scoreListing> =>
  scoreListing(mergeGroup(occurrences), {
    criteria: MVP_CRITERIA,
    nowMs: Date.parse('2026-09-16T10:00:00.000Z'),
    referencePricePerSqm: 20,
    referencePoints: [],
  });

describe('étiquette climat (GES)', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('se lit dans l’attribut structuré de la source, sans toucher au DPE', () => {
    const listing = normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://orpi.example.invalid/annonce/1',
        priceText: '950 € par mois',
        areaText: '34 m²',
        cityText: 'Nice',
        extra: { dpe: 'D', ges: 'B' },
      },
      { sourceId: 'orpi', nowMs: Date.parse('2026-09-16T10:00:00.000Z') },
    );
    expect(listing?.dpe).toBe('D');
    expect(listing?.ges).toBe('B');
  });

  it('reste vide quand la source ne dit rien — jamais recopié du DPE', () => {
    const listing = normalizeListing(
      {
        sourceRef: '2',
        sourceUrl: 'https://orpi.example.invalid/annonce/2',
        priceText: '950 € par mois',
        cityText: 'Nice',
        extra: { dpe: 'D' },
      },
      { sourceId: 'orpi', nowMs: Date.parse('2026-09-16T10:00:00.000Z') },
    );
    expect(listing?.dpe).toBe('D');
    expect(listing?.ges).toBeNull();
  });

  it('survit à l’écriture puis à la relecture de l’occurrence', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', dpe: 'D', ges: 'B' }),
      makeOccurrence({ id: 'pap:1', sourceId: 'pap' }),
    ]);
    const relues = (await repository.allActiveOccurrences()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(relues.find((o) => o.id === 'orpi:1')).toMatchObject({ dpe: 'D', ges: 'B' });
    // Une ligne écrite avant l'ajout du champ vaut `null`, pas `undefined`.
    expect(relues.find((o) => o.id === 'pap:1')?.ges).toBeNull();
  });

  it('figure dans la charge utile de la fiche ET dans celle de la liste', async () => {
    const occurrence = makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', dpe: 'D', ges: 'B' });
    await repository.upsertOccurrences([occurrence]);
    await repository.saveListings([scorer([occurrence])]);

    const row = await db.execute({
      sql: 'SELECT payload, list_payload FROM listings WHERE id = ?',
      args: ['orpi:1'],
    });
    const payload = JSON.parse(String(row.rows[0]?.['payload'])) as Record<string, unknown>;
    expect(payload['ges']).toMatchObject({ value: 'B' });
    const light = JSON.parse(String(row.rows[0]?.['list_payload'])) as Record<string, unknown>;
    expect(light['ges']).toMatchObject({ value: 'B' });
  });

  it('une fiche qui gagne un GES est RÉÉCRITE — sinon l’étiquette n’arrive jamais', async () => {
    const sans = makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', dpe: 'D' });
    await repository.upsertOccurrences([sans]);
    await repository.saveListings([scorer([sans])]);

    const avec = { ...sans, ges: 'B' };
    await repository.upsertOccurrences([avec]);
    await repository.saveListings([scorer([avec])]);

    const row = await db.execute({
      sql: 'SELECT payload FROM listings WHERE id = ?',
      args: ['orpi:1'],
    });
    const payload = JSON.parse(String(row.rows[0]?.['payload'])) as Record<string, unknown>;
    expect(payload['ges']).toMatchObject({ value: 'B' });
  });
});
