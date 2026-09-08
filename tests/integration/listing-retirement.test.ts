/**
 * Une fiche ne survit pas à ses occurrences (§32).
 *
 * LE CYCLE DE VIE D'UNE FICHE SE DÉDUIT DE CELUI DE SES OCCURRENCES, et
 * `mergeGroup` le fait bien : toutes inactives, la fiche l'est aussi. Mais le
 * regroupement ne travaille que sur le corpus VIVANT. Une fiche dont la
 * dernière occurrence vient de s'éteindre n'est donc plus jamais revisitée :
 * elle garde le cycle de vie qu'on lui a donné la dernière fois qu'elle avait
 * encore une occurrence active, et plus rien ne la retire.
 *
 * Relevé le 2026-09-07 : soixante-quatorze fiches dans ce cas, dont onze
 * passaient les critères et s'affichaient. Parmi elles, les deux canaux BEP
 * d'un même studio à 650 € — deux lignes pour un logement qui n'était plus à
 * louer depuis six jours.
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

function makeScoredListing(id: string, occurrenceIds: readonly string[]): ScoredListing {
  return scoreListing(
    makeAggregated({
      id,
      occurrences: occurrenceIds.map((one) => makeOccurrence({ id: one, sourceId: 'orpi' })),
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

/** Le cycle de vie d'une fiche, tel qu'il est rangé. */
async function lifecycleOf(db: Database, id: string): Promise<string | null> {
  const found = await db.execute({
    sql: 'SELECT lifecycle FROM listings WHERE id = ?',
    args: [id],
  });
  const value = found.rows[0]?.['lifecycle'];
  return typeof value === 'string' ? value : null;
}

describe('retrait des fiches dont plus aucune occurrence ne vit (§32)', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('retire la fiche quand sa dernière occurrence s’éteint', async () => {
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
    await repository.saveListings([makeScoredListing('orpi:1', ['orpi:1'])]);
    expect(await lifecycleOf(db, 'orpi:1')).toBe('active');

    // La source ne la publie plus : l'expiration éteint l'occurrence.
    await db.execute("UPDATE occurrences SET lifecycle = 'inactive' WHERE id = 'orpi:1'");

    expect(await repository.retireDepartedListings()).toBe(1);
    expect(await lifecycleOf(db, 'orpi:1')).toBe('inactive');
  });

  it('ÉPARGNE une fiche dont une seule occurrence vit encore', async () => {
    // Le cas exact des deux canaux d'une même agence : l'un se tait, l'autre
    // publie toujours. La fiche reste vivante — c'est le logement qui compte,
    // pas le canal.
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' }),
      makeOccurrence({ id: 'orpi:2', sourceId: 'orpi' }),
    ]);
    await repository.saveListings([makeScoredListing('orpi:1', ['orpi:1', 'orpi:2'])]);
    await db.execute("UPDATE occurrences SET lifecycle = 'inactive' WHERE id = 'orpi:1'");

    expect(await repository.retireDepartedListings()).toBe(0);
    expect(await lifecycleOf(db, 'orpi:1')).toBe('active');
  });

  it('ne repasse pas sur une fiche déjà retirée', async () => {
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
    await repository.saveListings([makeScoredListing('orpi:1', ['orpi:1'])]);
    await db.execute("UPDATE occurrences SET lifecycle = 'inactive' WHERE id = 'orpi:1'");

    expect(await repository.retireDepartedListings()).toBe(1);
    // Le second passage ne doit rien réécrire : sans quoi chaque collecte
    // paierait une écriture par fiche morte, indéfiniment (§30).
    expect(await repository.retireDepartedListings()).toBe(0);
  });

  it('retire aussi ce qui n’est que « peut-être » inactif', async () => {
    // `possiblyInactive` est l'état de la fiche vue une fois de moins. Il ne
    // doit pas la mettre à l'abri : ce sont ses occurrences qui décident.
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
    await repository.saveListings([makeScoredListing('orpi:1', ['orpi:1'])]);
    await db.execute("UPDATE listings SET lifecycle = 'possiblyInactive' WHERE id = 'orpi:1'");
    await db.execute("UPDATE occurrences SET lifecycle = 'inactive' WHERE id = 'orpi:1'");

    expect(await repository.retireDepartedListings()).toBe(1);
    expect(await lifecycleOf(db, 'orpi:1')).toBe('inactive');
  });
});
