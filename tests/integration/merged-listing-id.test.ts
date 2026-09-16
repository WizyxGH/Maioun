/**
 * L'identifiant d'une fiche ABSORBÉE mène toujours quelque part.
 *
 * Quand deux annonces n'en font plus qu'une, le groupe survivant garde
 * l'identifiant de l'occurrence la plus anciennement connue et l'autre ligne
 * est supprimée. Tout ce qui désignait l'ancienne — une liste affichée depuis
 * une heure, un lien collé, une notification — répondait « annonce
 * introuvable », alors que le logement est toujours là sous un autre nom. Et
 * la carte restait dans la liste : le bandeau annonçait « 1 à vérifier » pour
 * une fiche que plus rien n'ouvrait (signalé le 2026-09-16).
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
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeOccurrence } from '../helpers/factories.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '../../database/migrations');
const BASE = 'https://exemple.invalid';
const USER = 'moi';

/** L'occurrence la plus ancienne : c'est son identifiant qui nomme le groupe. */
const ANCIENNE = 'orpi:vue-en-premier';
/** Trouvée plus tard, elle a d'abord vécu comme une fiche à part entière. */
const ABSORBEE = 'bienici:le-meme-bien';

function scored(id: string, occurrenceIds: readonly string[]): ScoredListing {
  return scoreListing(
    makeAggregated({
      id,
      occurrences: occurrenceIds.map((occurrenceId) =>
        makeOccurrence({
          id: occurrenceId,
          sourceId: occurrenceId.split(':')[0] ?? 'orpi',
        }),
      ),
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

async function call(db: Database, path: string, init?: RequestInit): Promise<Response> {
  const url = new URL(`${BASE}${path}`);
  const segments = url.pathname.split('/').filter((part) => part !== '');
  return route(db, new Request(url, init), url, segments, {}, USER);
}

describe('un identifiant de groupe disparu après une fusion', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    // Le compte principal naît avec la base : on ne fait que s'en assurer.
    await db.execute(
      "INSERT OR IGNORE INTO users (id, created_at) VALUES ('moi', datetime('now'))",
    );

    // Premier passage : deux fiches distinctes, deux identifiants.
    await repository.upsertOccurrences([
      makeOccurrence({ id: ANCIENNE, sourceId: 'orpi' }),
      makeOccurrence({ id: ABSORBEE, sourceId: 'bienici' }),
    ]);
    const separees = [scored(ANCIENNE, [ANCIENNE]), scored(ABSORBEE, [ABSORBEE])];
    await repository.saveListings(separees);
    await repository.saveUserScores(USER, separees);

    // On avait consulté celle qui va disparaître : son identifiant circule.
    const vue = await call(db, `/api/listings/${ABSORBEE}`);
    expect(vue.status).toBe(200);

    // Second passage : le dédoublonnage les réunit sous le plus ancien.
    const fusionnee = [scored(ANCIENNE, [ANCIENNE, ABSORBEE])];
    await repository.saveListings(fusionnee);
    await repository.saveUserScores(USER, fusionnee);
  });

  it('la ligne absorbée est bien partie de la base', async () => {
    const reste = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM listings WHERE id = ?',
      args: [ABSORBEE],
    });
    expect(Number(reste.rows[0]?.['n'])).toBe(0);
  });

  it('la fiche ouverte par l’ancien identifiant sert celle qui l’a absorbée', async () => {
    const response = await call(db, `/api/listings/${ABSORBEE}`);
    expect(response.status).toBe(200);
    const fiche = JSON.parse(await response.text()) as { id: string };
    // L'identifiant rendu est celui du survivant : l'écran corrige son adresse.
    expect(fiche.id).toBe(ANCIENNE);
  });

  it('une décision posée sur l’ancien identifiant se range sur le survivant', async () => {
    const response = await call(db, `/api/listings/${ABSORBEE}`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite: true }),
    });
    expect(response.status).toBe(200);
    const rows = await db.execute({
      sql: 'SELECT listing_id FROM listing_user_state WHERE user_id = ? AND favorite = 1',
      args: [USER],
    });
    expect(rows.rows.map((row) => String(row['listing_id']))).toEqual([ANCIENNE]);
  });

  it('un identifiant qui n’a jamais existé reste introuvable', async () => {
    const response = await call(db, '/api/listings/orpi:jamais-vue');
    expect(response.status).toBe(404);
  });

  it('la liste ne montre que des fiches que le détail sait ouvrir', async () => {
    const response = await call(db, '/api/listings?limit=500');
    const body = JSON.parse(await response.text()) as { listings: { id: string }[] };
    expect(body.listings.map((one) => one.id)).toEqual([ANCIENNE]);
    for (const one of body.listings) {
      expect((await call(db, `/api/listings/${one.id}`)).status).toBe(200);
    }
  });
});
