/**
 * UNE AGENCE, UNE LIGNE — même quand les sources l'écrivent différemment.
 *
 * Relevé le 2026-09-25 sur la base locale : trente-quatre agences
 * apparaissaient DEUX FOIS dans l'écran des agences, soit soixante-huit lignes
 * pour trente-quatre agences — et chacune avec la moitié de ses annonces.
 * Seule la casse différait : « SAINT ROCH IMMOBILIER » d'un côté, « Saint Roch
 * Immobilier » de l'autre.
 *
 * Le regroupement se faisait sur le nom EXACT, un choix assumé pour ne pas
 * inventer de rapprochement (§17). Il tient pour deux orthographes ; il ne
 * tient pas pour deux casses, où il n'y a rien à inventer.
 *
 * ET LE CLIC DOIT SUIVRE : replier la liste sans replier la fiche montrerait
 * une agence de dix annonces qui n'en ouvre que six.
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
} from '@maioun/collector';
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeContact, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const BASE = 'https://exemple.invalid';

function scored(id: string, agencyName: string): ScoredListing {
  return scoreListing(
    makeAggregated({
      id,
      contact: makeContact({ agencyName }),
      occurrences: [makeOccurrence({ id, sourceId: 'orpi', contact: makeContact({ agencyName }) })],
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

async function call(db: Database, path: string): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE}${path}`);
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const response = await route(db, new Request(url), url, segments, {}, 'moi');
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

describe('agences écrites de deux façons', () => {
  let db: Database;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    // Deux annonces, la même agence — et deux casses, comme les sources le font.
    const fiches = [
      scored('orpi:1', 'SAINT ROCH IMMOBILIER'),
      scored('orpi:2', 'Saint Roch Immobilier'),
      scored('orpi:3', 'Saint Roch Immobilier'),
    ];
    await repository.upsertOccurrences(fiches.flatMap((fiche) => fiche.occurrences));
    await repository.saveListings(fiches);
  });

  it('n’en fait qu’une seule ligne', async () => {
    const rendu = (await call(db, '/api/agencies')) as {
      agencies: { name: string; listings: number }[];
    };
    expect(rendu.agencies).toHaveLength(1);
    expect(rendu.agencies[0]?.listings).toBe(3);
  });

  // La plus fréquente, et à égalité celle qui n'est pas tout en capitales :
  // c'est presque toujours celle de l'agence elle-même.
  it('garde l’écriture la plus courante', async () => {
    const rendu = (await call(db, '/api/agencies')) as { agencies: { name: string }[] };
    expect(rendu.agencies[0]?.name).toBe('Saint Roch Immobilier');
  });

  // LE CLIC DOIT SUIVRE : la fiche d'une agence repliée doit rendre TOUTES ses
  // annonces, y compris celles de l'autre casse.
  it('ouvre toutes ses annonces, quelle que soit la casse demandée', async () => {
    for (const nom of ['Saint Roch Immobilier', 'SAINT ROCH IMMOBILIER']) {
      const rendu = (await call(db, `/api/agencies/${encodeURIComponent(nom)}`)) as {
        listings: unknown[];
      };
      expect(rendu.listings, nom).toHaveLength(3);
    }
  });
});
