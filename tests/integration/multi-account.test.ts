/**
 * Ce qu'un compte voit de l'autre : RIEN (§26).
 *
 * Les annonces sont communes — ce sont des offres publiques. Tout le reste est
 * personnel : ce qu'on a vu, archivé, mis en favori, suivi, et surtout les
 * messages qu'on a envoyés.
 *
 * CES TESTS EXISTENT PARCE QUE LA SÉPARATION A FUI. Le journal de contact d'une
 * fiche se lisait sans filtre de compte : la fiche montrait les démarches de
 * TOUS les comptes — qui avait écrit, quand, et le texte du message. La colonne
 * `user_id` existait depuis le passage au multi-compte ; l'écriture ne la
 * remplissait pas et la lecture ne la regardait pas. Avec un seul utilisateur,
 * rien ne pouvait le révéler.
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
} from '@rentfinder/collector';
// Chemin direct vers la source : le paquet expose bien `./server/routes`, mais
// vers `dist`. Les tests d'intégration travaillent sur les sources.
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type ScoredListing } from '@rentfinder/shared';
import { makeAggregated, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const BASE = 'https://exemple.invalid';

function scored(id: string): ScoredListing {
  return scoreListing(
    makeAggregated({ id, occurrences: [makeOccurrence({ id, sourceId: 'orpi' })] }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

/** Appelle l'API comme le ferait le Worker, pour le compte indiqué. */
async function call(
  db: Database,
  userId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE}${path}`);
  const request = new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const response = await route(db, request, url, segments, {}, userId);
  const text = await response.text();
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
}

describe('cloisonnement entre comptes (§26)', () => {
  let db: Database;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    await repository.upsertOccurrences([makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })]);
    await repository.saveListings([scored('orpi:1')]);
    await db.batch(
      [
        { sql: "INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))", args: [] },
        { sql: "INSERT INTO users (id, created_at) VALUES ('bob', datetime('now'))", args: [] },
      ],
      'write',
    );
  });

  it('ne montre pas à l’un les DÉMARCHES de l’autre', async () => {
    await call(db, 'alice', 'POST', '/api/listings/orpi:1/contact', {
      channel: 'email',
      message: 'Bonjour, je suis intéressée par ce studio.',
      sourceId: 'orpi',
    });

    const chezAlice = (await call(db, 'alice', 'GET', '/api/listings/orpi:1')) as {
      contactAttempts?: unknown[];
    };
    const chezBob = (await call(db, 'bob', 'GET', '/api/listings/orpi:1')) as {
      contactAttempts?: unknown[];
    };

    expect(chezAlice.contactAttempts).toHaveLength(1);
    expect(chezBob.contactAttempts ?? []).toHaveLength(0);
    // Et surtout : le texte du message ne doit apparaître nulle part chez Bob.
    expect(JSON.stringify(chezBob)).not.toContain('intéressée');
  });

  it('compte les relances sur SES propres messages', async () => {
    // Le compte d'à côté ayant écrit deux fois, on annonçait une troisième
    // relance à qui n'avait rien envoyé.
    for (const message of ['premier', 'second']) {
      await call(db, 'alice', 'POST', '/api/listings/orpi:1/contact', {
        channel: 'email',
        message,
        sourceId: 'orpi',
      });
    }
    await call(db, 'bob', 'POST', '/api/listings/orpi:1/contact', {
      channel: 'email',
      message: 'le tout premier de Bob',
      sourceId: 'orpi',
    });

    const rangs = await db.execute({
      sql: 'SELECT follow_up_index FROM contact_attempts WHERE user_id = ?',
      args: ['bob'],
    });
    expect(rangs.rows).toHaveLength(1);
    expect(Number(rangs.rows[0]?.['follow_up_index'])).toBe(0);
  });

  it('ne compte dans les STATISTIQUES que ce que le compte a fait', async () => {
    await call(db, 'alice', 'POST', '/api/listings/orpi:1/contact', {
      channel: 'email',
      message: 'Bonjour',
      sourceId: 'orpi',
    });
    await call(db, 'alice', 'PATCH', '/api/listings/orpi:1', { archived: true });

    const chezAlice = (await call(db, 'alice', 'GET', '/api/stats')) as {
      contacts: { total: number };
      listings: { archived: number };
    };
    const chezBob = (await call(db, 'bob', 'GET', '/api/stats')) as {
      contacts: { total: number };
      listings: { archived: number };
    };

    expect(chezAlice.contacts.total).toBe(1);
    expect(chezBob.contacts.total).toBe(0);
    expect(Number(chezAlice.listings.archived ?? 0)).toBe(1);
    expect(Number(chezBob.listings.archived ?? 0)).toBe(0);
  });

  it('garde l’INVENTAIRE commun : une annonce est à tout le monde', async () => {
    // Ce qui est personnel, c'est la décision ; l'annonce, elle, est publique.
    const chezBob = (await call(db, 'bob', 'GET', '/api/listings')) as { listings: unknown[] };
    expect(chezBob.listings.length).toBeGreaterThan(0);
  });
});
