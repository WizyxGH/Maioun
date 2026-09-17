/**
 * CE QU'UNE SOURCE PERD ENTRE DEUX PASSAGES, ET CE QUI N'EN EST PAS.
 *
 * La mesure sert à décider quelles sources passent en tête du cycle. Elle ne
 * vaut donc que si elle distingue une annonce réellement partie en quelques
 * heures de deux artefacts qui lui ressemblent trait pour trait :
 *
 *   - la source en panne, dont les annonces semblent s'évaporer alors que c'est
 *     la collecte qui n'a rien lu ;
 *   - la page qui tourne, où des dizaines de références apparaissent puis
 *     repartent ENSEMBLE — relevé du 2026-09-17, 197 des 254 annonces vues une
 *     seule fois arrivaient par lots de trois ou plus, `citya` et `rentumo` en
 *     tête, deux catalogues nationaux qui défilent.
 *
 * Sans ces deux gardes, la part mesurée désignerait les sources les plus
 * bancales, et c'est à elles qu'on donnerait les places du cycle.
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

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

/** Seuil de retrait du projet : trois passages sans revoir l'annonce. */
const CONFIRMED_AFTER = 3;
const WINDOW_DAYS = 14;

interface Seed {
  readonly sourceId: string;
  readonly ref: string;
  /** Instant de découverte ; les annonces d'un même lot le partagent. */
  readonly seenAt: string;
  /** Dernière observation. Égale à `seenAt` pour une annonce jamais revue. */
  readonly lastSeenAt?: string;
  readonly missingRuns: number;
}

async function seed(db: Database, rows: readonly Seed[]): Promise<void> {
  for (const row of rows) {
    await db.execute({
      sql: `INSERT INTO occurrences (
              id, source_id, source_ref, source_url, first_seen_at, last_seen_at,
              scraped_at, lifecycle, content_hash, missing_runs
            ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [
        `${row.sourceId}:${row.ref}`,
        row.sourceId,
        row.ref,
        `https://example.invalid/${row.ref}`,
        row.seenAt,
        row.lastSeenAt ?? row.seenAt,
        row.seenAt,
        row.missingRuns >= CONFIRMED_AFTER ? 'inactive' : 'active',
        `hash-${row.ref}`,
        row.missingRuns,
      ],
    });
  }
}

/** Un instant daté de `hours` heures avant maintenant. */
const hoursAgo = (hours: number): string => new Date(Date.now() - hours * 3_600_000).toISOString();

describe('vanishRates — les annonces perdues entre deux passages', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('compte une annonce découverte puis jamais revue', async () => {
    await seed(db, [
      { sourceId: 'rapide', ref: 'a', seenAt: hoursAgo(50), missingRuns: 3 },
      {
        sourceId: 'rapide',
        ref: 'b',
        seenAt: hoursAgo(40),
        lastSeenAt: hoursAgo(20),
        missingRuns: 3,
      },
    ]);
    const rates = await repository.vanishRates(WINDOW_DAYS, CONFIRMED_AFTER);
    expect(rates.get('rapide')).toEqual({ retired: 2, vanished: 1 });
  });

  it('N’ACCUSE PAS UNE SOURCE QUI N’A PAS CONCLU', async () => {
    // `missing_runs` ne monte qu'aux passages jugés concluants : une liste en
    // échec ne compte personne pour absent. Tant que le seuil de retrait n'est
    // pas atteint, on ne sait pas si l'annonce est partie ou si c'est nous qui
    // n'avons pas regardé.
    await seed(db, [
      { sourceId: 'muette', ref: 'a', seenAt: hoursAgo(50), missingRuns: 1 },
      { sourceId: 'muette', ref: 'b', seenAt: hoursAgo(50), missingRuns: 2 },
    ]);
    const rates = await repository.vanishRates(WINDOW_DAYS, CONFIRMED_AFTER);
    expect(rates.has('muette')).toBe(false);
  });

  it('NE PREND PAS UNE PAGE QUI TOURNE POUR UN MARCHÉ QUI S’EMBALLE', async () => {
    // Trois références apparues au même instant chez la même source, jamais
    // revues : c'est la pagination d'un catalogue national, pas trois logements
    // partis en une heure.
    const lot = hoursAgo(60);
    await seed(db, [
      { sourceId: 'catalogue', ref: 'a', seenAt: lot, missingRuns: 3 },
      { sourceId: 'catalogue', ref: 'b', seenAt: lot, missingRuns: 3 },
      { sourceId: 'catalogue', ref: 'c', seenAt: lot, missingRuns: 3 },
    ]);
    const rates = await repository.vanishRates(WINDOW_DAYS, CONFIRMED_AFTER);
    expect(rates.get('catalogue')).toEqual({ retired: 3, vanished: 0 });
  });

  it('garde les annonces isolées arrivées au même moment qu’une autre', async () => {
    // Deux au même instant restent crédibles : une agence peut mettre deux
    // biens en ligne d'un coup. La garde vise les lots, pas les doublons.
    const ensemble = hoursAgo(60);
    await seed(db, [
      { sourceId: 'agence', ref: 'a', seenAt: ensemble, missingRuns: 3 },
      { sourceId: 'agence', ref: 'b', seenAt: ensemble, missingRuns: 3 },
    ]);
    const rates = await repository.vanishRates(WINDOW_DAYS, CONFIRMED_AFTER);
    expect(rates.get('agence')).toEqual({ retired: 2, vanished: 2 });
  });

  it('oublie ce qui sort de la fenêtre d’observation', async () => {
    // Un site qui a changé de rythme ne doit pas traîner sa réputation.
    await seed(db, [{ sourceId: 'ancienne', ref: 'a', seenAt: hoursAgo(24 * 30), missingRuns: 3 }]);
    const rates = await repository.vanishRates(WINDOW_DAYS, CONFIRMED_AFTER);
    expect(rates.has('ancienne')).toBe(false);
  });
});
