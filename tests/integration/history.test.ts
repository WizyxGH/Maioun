/**
 * Collecte de l'historique (§31).
 *
 * Vérifie qu'une ligne d'historique est écrite à la première observation
 * (baseline) puis UNIQUEMENT quand loyer / surface / disponibilité changent —
 * pas à chaque run (§30).
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
// Chemin direct vers la source : le paquet expose `./server/routes`, mais vers
// `dist`. Les tests d'intégration travaillent sur les sources.
import { route } from '../../packages/collector/src/server/routes.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

/** Appelle l'API comme le ferait le Worker, pour le compte indiqué. */
async function call(
  db: Database,
  userId: string,
  method: string,
  path: string,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://exemple.invalid${path}`);
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const response = await route(db, new Request(url, { method }), url, segments, {}, userId);
  const text = await response.text();
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
}

async function history(db: Database): Promise<Array<Record<string, unknown>>> {
  const result = await db.execute('SELECT * FROM listing_history ORDER BY recorded_at, change');
  return result.rows as Array<Record<string, unknown>>;
}

describe('collecte de l’historique (§31)', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
  });

  it('écrit une baseline à la première observation', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 690 }),
    ]);
    const rows = await history(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['change']).toBe('baseline');
    expect(Number(rows[0]?.['price'])).toBe(690);
  });

  it('n’écrit rien de plus quand l’annonce est identique (§30)', async () => {
    const occ = makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 690 });
    await repository.upsertOccurrences([occ]);
    await repository.upsertOccurrences([occ]);
    expect(await history(db)).toHaveLength(1);
  });

  it('enregistre une baisse de loyer', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 690 }),
    ]);
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 650 }),
    ]);
    const rows = await history(db);
    expect(rows).toHaveLength(2);
    const change = rows.find((r) => r['change'] === 'price-drop');
    expect(change).toBeDefined();
    expect(Number(change?.['price'])).toBe(650);
  });

  it('marque « multiple » quand loyer ET surface changent', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 690, area: 34 }),
    ]);
    await repository.upsertOccurrences([
      makeOccurrence({ id: 'orpi:1', sourceId: 'orpi', price: 650, area: 36 }),
    ]);
    const rows = await history(db);
    expect(rows.some((r) => r['change'] === 'multiple')).toBe(true);
  });

  /**
   * DURÉE DE VIE DES ANNONCES (§31, §17).
   *
   * Le SQL est court mais il porte tout le sens : une annonce éteinte a vécu
   * de sa découverte à sa DERNIÈRE observation ; une annonce encore en ligne a
   * vécu AU MOINS jusqu'à la sienne, et n'a pas fini. La traiter en morte
   * ferait entrer les vivantes dans la mesure comme des mortes précoces, et
   * effondrerait la médiane.
   */
  it('mesure la durée de vie sans compter les vivantes comme des mortes', async () => {
    const jours = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

    await db.batch(
      [
        // Éteinte : découverte il y a 30 jours, vue pour la dernière fois il y
        // a 20 — elle a donc vécu 10 jours.
        {
          sql: `INSERT INTO listings (id, first_seen_at, last_seen_at, lifecycle, rented, payload, content_hash, updated_at)
                VALUES ('morte', ?, ?, 'inactive', 0, '{}', 'h1', datetime('now'))`,
          args: [jours(30), jours(20)],
        },
        // Vivante depuis 30 jours : elle ne doit PAS compter pour 0 jour, ni
        // faire descendre la courbe.
        {
          sql: `INSERT INTO listings (id, first_seen_at, last_seen_at, lifecycle, rented, payload, content_hash, updated_at)
                VALUES ('vivante', ?, ?, 'active', 0, '{}', 'h2', datetime('now'))`,
          args: [jours(30), jours(1)],
        },
      ],
      'write',
    );

    const stats = (await call(db, 'moi', 'GET', '/api/stats')) as {
      survival: { medianDays: number | null; completed: number; censored: number };
    };

    expect(stats.survival.completed).toBe(1);
    expect(stats.survival.censored).toBe(1);
    // L'unique extinction survient à 10 jours, sur deux annonces observées
    // jusque-là : la survie tombe à 0,5 et la médiane vaut 10 jours. Si la
    // vivante était comptée comme éteinte à 1 jour, on lirait 1.
    expect(stats.survival.medianDays).toBeCloseTo(10, 0);
  });

  /**
   * Le stock déjà en ligne n'est pas une naissance : ni les premières 24 h
   * d'une source, ni un lot livré d'un coup, ni une source à annonce unique,
   * dont la fin est posée par un minuteur. Et la durée s'arrête à la dernière
   * observation de l'OCCURRENCE — celle de la fiche n'est pas rafraîchie.
   */
  it('ne mesure que les annonces vues paraître', async () => {
    const jours = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
    const fiche = (id: string, first: string, last: string) => ({
      sql: `INSERT INTO listings (id, first_seen_at, last_seen_at, lifecycle, rented, payload, content_hash, updated_at)
            VALUES (?, ?, ?, 'inactive', 0, '{}', ?, datetime('now'))`,
      args: [id, first, last, `h-${id}`],
    });
    const occurrence = (
      source: string,
      ref: string,
      group: string,
      first: string,
      last: string,
    ) => ({
      sql: `INSERT INTO occurrences (id, source_id, source_ref, source_url, group_id, first_seen_at, last_seen_at, scraped_at, content_hash)
            VALUES (?, ?, ?, 'https://x.invalid', ?, ?, ?, ?, ?)`,
      args: [`${source}:${ref}`, source, ref, group, first, last, last, `o-${source}-${ref}`],
    });

    const lot = jours(8);
    await db.batch(
      [
        // Premier passage de la source : du stock.
        fiche('stock', jours(20), jours(19.5)),
        occurrence('orpi', 'stock', 'stock', jours(20), jours(19.5)),
        // Seize d'un coup, plus tard : un rattrapage.
        ...Array.from({ length: 16 }, (_, i) => [
          fiche(`lot${i}`, lot, jours(7.9)),
          occurrence('orpi', `lot${i}`, `lot${i}`, lot, jours(7.9)),
        ]).flat(),
        // Annonce unique : sa fin vient d'un minuteur.
        fiche('alerte', jours(10), jours(10)),
        occurrence('email-alerts', 'a', 'alerte', jours(10), jours(10)),
        // La seule vraie naissance : vue 5 jours, alors que la fiche, jamais
        // réécrite, garde une dernière observation vieille de 9 jours.
        fiche('neuve', jours(10), jours(9)),
        occurrence('orpi', 'neuve', 'neuve', jours(10), jours(5)),
      ],
      'write',
    );

    const stats = (await call(db, 'moi', 'GET', '/api/stats')) as {
      survival: { medianDays: number | null; completed: number; censored: number };
    };

    expect(stats.survival.completed).toBe(1);
    expect(stats.survival.censored).toBe(0);
    expect(stats.survival.medianDays).toBeCloseTo(5, 0);
  });
});
