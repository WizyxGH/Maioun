/**
 * ON NE SIGNALE PAS CE QUE LA LISTE N'AFFICHE PAS.
 *
 * Colocation, bail étudiant, bailleur, ameublement, quartier et disponibilité
 * ne sont plus figés dans le score : ils se cochent et se décochent, et c'est
 * `traitConditions` qui les applique — à la LISTE comme aux ALERTES.
 *
 * DEUX CANAUX L'AVAIENT OUBLIÉ. « Proche de vos critères » n'appliquait aucune
 * préférence : il proposait donc des colocations et des locations étudiantes
 * que l'écran masque — relevé du 2026-09-16, 52 annonces signalables contre 10
 * une fois les exclusions posées. « Candidatures rouvertes » avait le même
 * trou, sur les annonces signalées avant que l'on coche la case.
 *
 * LES FAVORIS, EUX, N'EN RELÈVENT PAS, et ce test le fixe aussi : un favori a
 * été mis de côté à la main, et le taire reviendrait à corriger quelqu'un sur
 * son propre choix.
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
const USER = 'alice';

/** Les critères du compte : ceux du projet, colocations et étudiants exclus. */
const CRITERIA = { cities: ['nice'], maxPrice: 700, minArea: 20 };
const EXCLUSIONS = { excludeFlatShare: true, excludeStudent: true } as const;

/**
 * Une annonce scorée. Le prix décide de sa place : au-dessus du plafond elle
 * sort des critères, et c'est là que « proche de vos critères » la ramasse.
 */
function scored(
  id: string,
  options: { readonly price: number; readonly title?: string; readonly flatShare?: boolean },
): ScoredListing {
  const occurrence = makeOccurrence({ id, sourceId: 'orpi' });
  return scoreListing(
    makeAggregated({
      id,
      price: options.price,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.flatShare === undefined ? {} : { flatShare: options.flatShare }),
      occurrences: [occurrence],
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

const ids = (listings: readonly { readonly id: string }[]): string[] =>
  listings.map((listing) => listing.id).sort();

describe('les alertes appliquent les mêmes exclusions que la liste', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    await db.execute({
      sql: 'INSERT INTO users (id, created_at) VALUES (?, ?)',
      args: [USER, new Date().toISOString()],
    });
  });

  /** Enregistre les fiches et leur score POUR CE COMPTE. */
  async function enregistre(listings: readonly ScoredListing[]): Promise<void> {
    await repository.upsertOccurrences(listings.flatMap((listing) => [...listing.occurrences]));
    await repository.saveListings(listings);
    await repository.saveUserScores(USER, listings);
  }

  describe('« proche de vos critères »', () => {
    beforeEach(async () => {
      // Juste au-dessus du plafond : les trois sont « proches ».
      await enregistre([
        scored('orpi:1', { price: 730 }),
        scored('orpi:2', { price: 730, flatShare: true }),
        scored('orpi:3', { price: 730, title: 'Location meublée étudiante 9 mois' }),
      ]);
    });

    it('écarte la colocation et la location étudiante', async () => {
      // Sans préférences, les trois partaient : c'est ce que faisait la collecte.
      expect(ids(await repository.nearMatches(USER, CRITERIA))).toEqual([
        'orpi:1',
        'orpi:2',
        'orpi:3',
      ]);
      expect(ids(await repository.nearMatches(USER, CRITERIA, EXCLUSIONS))).toEqual(['orpi:1']);
    });

    it('applique aussi les quartiers, avec la même règle que la liste', async () => {
      // Quartier inconnu : gardé par défaut, écarté si l'on refuse les inconnus.
      const quartiers = { districts: ['riquier'] } as const;
      expect(ids(await repository.nearMatches(USER, CRITERIA, quartiers))).toHaveLength(3);
      expect(
        ids(
          await repository.nearMatches(USER, CRITERIA, {
            ...quartiers,
            includeUnknownDistrict: false,
          }),
        ),
      ).toEqual([]);
    });
  });

  describe('« candidatures rouvertes »', () => {
    beforeEach(async () => {
      // Dans les critères, cette fois : c'est la condition du canal.
      await enregistre([
        scored('orpi:1', { price: 650 }),
        scored('orpi:2', { price: 650, flatShare: true }),
      ]);
      // Signalées, puis fermées, puis rouvertes : le trajet complet du canal.
      await repository.markNotified(USER, ['orpi:1', 'orpi:2']);
      await db.execute(
        "UPDATE listings SET payload = json_set(payload, '$.applicationStatus', 'full')",
      );
      await repository.noteClosedApplications(USER);
      await db.execute(
        "UPDATE listings SET payload = json_set(payload, '$.applicationStatus', 'open')",
      );
    });

    it('ne resignale pas une colocation exclue depuis', async () => {
      expect(ids(await repository.reopenedApplications(USER))).toEqual(['orpi:1', 'orpi:2']);
      expect(ids(await repository.reopenedApplications(USER, EXCLUSIONS))).toEqual(['orpi:1']);
    });
  });

  describe('les favoris ne sont pas filtrés', () => {
    it('signale la disparition d’un favori, colocation comprise', async () => {
      await enregistre([scored('orpi:2', { price: 650, flatShare: true })]);
      await db.execute({
        sql: `INSERT INTO listing_user_state (listing_id, user_id, favorite, updated_at)
              VALUES (?,?,1,?)`,
        args: ['orpi:2', USER, new Date().toISOString()],
      });
      await db.execute("UPDATE listings SET lifecycle = 'inactive'");

      expect(ids(await repository.goneFavorites(USER))).toEqual(['orpi:2']);
    });
  });
});
