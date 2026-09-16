/**
 * « PROCHE DE VOS CRITÈRES » : DE COMBIEN, POUR CHAQUE CRITÈRE.
 *
 * Le canal n'avait qu'une marge — 5 % — appliquée au loyer et à la surface.
 * Tout le reste était binaire par accident : un trajet de 61 minutes n'était
 * jamais « presque » 60, un nombre de pièces n'entrait dans aucun calcul, et
 * l'alerte ne pouvait pas dire LEQUEL des critères avait bougé.
 *
 * Ce fichier vérifie les deux moitiés du réglage : ce qui se relâche, de
 * combien, et ce qui ne se relâche jamais — une colocation exclue reste exclue
 * même « de peu », il n'existe pas de demi-colocation.
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

/** Les critères tels que le canal les reçoit, sans les réexporter. */
type Criteres = Parameters<Repository['nearMatches']>[1];

/** Les critères du projet : 700 €, 20 m², 60 min, plancher à 250 €. */
const CRITERIA: Criteres = {
  cities: ['nice'],
  maxPrice: 700,
  minArea: 20,
  minPrice: 250,
  maxCommuteMinutes: 60,
};

function scored(
  id: string,
  options: {
    readonly price: number;
    readonly area?: number;
    readonly rooms?: number;
    readonly title?: string;
    readonly flatShare?: boolean;
  },
): ScoredListing {
  return scoreListing(
    makeAggregated({
      id,
      price: options.price,
      area: options.area ?? 25,
      rooms: options.rooms ?? 1,
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.flatShare === undefined ? {} : { flatShare: options.flatShare }),
      occurrences: [makeOccurrence({ id, sourceId: 'orpi' })],
    }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

const ids = (listings: readonly { readonly id: string }[]): string[] =>
  listings.map((listing) => listing.id).sort();

describe('ce que « proche » veut dire, critère par critère', () => {
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

  async function enregistre(listings: readonly ScoredListing[]): Promise<void> {
    await repository.upsertOccurrences(listings.flatMap((listing) => [...listing.occurrences]));
    await repository.saveListings(listings);
    await repository.saveUserScores(USER, listings);
  }

  /**
   * Range une annonce HORS CRITÈRES pour ce compte.
   *
   * C'est la porte d'entrée du canal : il ne regarde que ce que le score a déjà
   * écarté. Le trajet et les pièces ne sont pas jugés par le score au même
   * titre que le loyer — le premier dépend des points de repère du compte, les
   * seconds n'y entrent pas encore —, d'où ce coup de pouce dans les tests qui
   * les concernent.
   */
  async function horsCriteres(id: string): Promise<void> {
    await db.execute({ sql: 'UPDATE listings SET matches_criteria = 0 WHERE id = ?', args: [id] });
    await db.execute({
      sql: 'UPDATE listing_user_score SET matches_criteria = 0 WHERE listing_id = ? AND user_id = ?',
      args: [id, USER],
    });
  }

  /** Le trajet est propre au compte : il vit sur le score, pas sur la fiche. */
  async function trajet(id: string, minutes: number): Promise<void> {
    await db.execute({
      sql: 'UPDATE listing_user_score SET commute_minutes = ? WHERE listing_id = ? AND user_id = ?',
      args: [minutes, id, USER],
    });
    await db.execute({
      sql: 'UPDATE listings SET commute_minutes = ? WHERE id = ?',
      args: [minutes, id],
    });
    await horsCriteres(id);
  }

  describe('le loyer : 5 % de plus', () => {
    it('signale 735 €, pas 736 €, et dit lequel dépasse', async () => {
      await enregistre([scored('orpi:735', { price: 735 }), scored('orpi:736', { price: 736 })]);
      const near = await repository.nearMatches(USER, CRITERIA);

      expect(ids(near)).toEqual(['orpi:735']);
      expect(near[0]?.overshoot).toBe('735 € pour un budget de 700 €');
    });
  });

  describe('la surface : 5 % de moins, un m² au moins', () => {
    it('signale 19 m², pas 18,9 m²', async () => {
      await enregistre([
        scored('orpi:19', { price: 650, area: 19 }),
        scored('orpi:18', { price: 650, area: 18.9 }),
      ]);
      const near = await repository.nearMatches(USER, CRITERIA);

      expect(ids(near)).toEqual(['orpi:19']);
      expect(near[0]?.overshoot).toBe('19 m² pour 20 m² demandés');
    });
  });

  describe('le trajet : 5 minutes de plus', () => {
    it('signale 65 min, pas 66, et nomme les minutes', async () => {
      await enregistre([
        scored('orpi:65', { price: 650 }),
        scored('orpi:66', { price: 650 }),
        scored('orpi:59', { price: 650 }),
      ]);
      await trajet('orpi:65', 65);
      await trajet('orpi:66', 66);
      // Dans les critères sur toute la ligne : proche de rien, donc muet.
      await trajet('orpi:59', 59);

      const near = await repository.nearMatches(USER, CRITERIA, {
        maxCommuteMinutes: CRITERIA.maxCommuteMinutes ?? 60,
      });

      expect(ids(near)).toEqual(['orpi:65']);
      expect(near[0]?.overshoot).toBe('65 min de trajet pour 60');
    });

    it('ne se relâche pas au-delà d’un dixième du plafond demandé', async () => {
      // 20 minutes demandées : 5 de plus seraient un quart de trajet en plus.
      await enregistre([scored('orpi:23', { price: 650 }), scored('orpi:22', { price: 650 })]);
      await trajet('orpi:23', 23);
      await trajet('orpi:22', 22);

      const near = await repository.nearMatches(
        USER,
        { ...CRITERIA, maxCommuteMinutes: 20 },
        { maxCommuteMinutes: 20 },
      );

      expect(ids(near)).toEqual(['orpi:22']);
    });
  });

  describe('les pièces : une de moins, jamais zéro', () => {
    it('signale le T2 quand on demande un T3, pas le studio', async () => {
      await enregistre([
        scored('orpi:t2', { price: 650, rooms: 2 }),
        scored('orpi:t1', { price: 650, rooms: 1 }),
      ]);
      await horsCriteres('orpi:t2');
      await horsCriteres('orpi:t1');
      const near = await repository.nearMatches(USER, { ...CRITERIA, minRooms: 3 });

      expect(ids(near)).toEqual(['orpi:t2']);
      expect(near[0]?.overshoot).toBe('2 pièces pour 3 pièces demandées');
    });
  });

  describe('plusieurs écarts à la fois', () => {
    it('les nomme tous, dans la même phrase', async () => {
      await enregistre([scored('orpi:1', { price: 720, area: 19 })]);
      await trajet('orpi:1', 63);

      const near = await repository.nearMatches(USER, CRITERIA, { maxCommuteMinutes: 60 });

      expect(near[0]?.overshoot).toBe(
        '720 € pour un budget de 700 € · 19 m² pour 20 m² demandés · 63 min de trajet pour 60',
      );
    });
  });

  describe('ce qui ne se relâche jamais', () => {
    it('ne signale pas une colocation, même à un euro du budget', async () => {
      await enregistre([
        scored('orpi:colocation', { price: 701, flatShare: true }),
        scored('orpi:seul', { price: 701 }),
      ]);
      const near = await repository.nearMatches(USER, CRITERIA, { excludeFlatShare: true });

      expect(ids(near)).toEqual(['orpi:seul']);
    });

    it('ne signale pas une location étudiante proche du budget', async () => {
      await enregistre([
        scored('orpi:etudiant', { price: 710, title: 'Studio meublé étudiant, bail 9 mois' }),
        scored('orpi:seul', { price: 710 }),
      ]);
      const near = await repository.nearMatches(USER, CRITERIA, { excludeStudent: true });

      expect(ids(near)).toEqual(['orpi:seul']);
    });

    it('garde le plancher de loyer : une cave de 19 m² à 150 € n’est pas une occasion', async () => {
      // Presque assez grande, et c'est tout : le plancher écarte les parkings,
      // box et caves étiquetés « appartement ». Sans lui, l'élargissement de la
      // surface les laissait entrer par la fenêtre.
      await enregistre([
        scored('orpi:cave', { price: 150, area: 19 }),
        scored('orpi:studio', { price: 650, area: 19 }),
      ]);
      const near = await repository.nearMatches(USER, CRITERIA);

      expect(ids(near)).toEqual(['orpi:studio']);
    });

    it('ne franchit pas la commune', async () => {
      await enregistre([scored('orpi:1', { price: 720 })]);
      expect(await repository.nearMatches(USER, { ...CRITERIA, cities: ['cannes'] })).toEqual([]);
    });
  });
});
