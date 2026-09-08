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
} from '@maioun/collector';
// Chemin direct vers la source : le paquet expose bien `./server/routes`, mais
// vers `dist`. Les tests d'intégration travaillent sur les sources.
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
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
    // La PERTINENCE se range par compte, comme le fait la collecte : sans
    // cela, la liste de chacun serait vide — et c'est le bon comportement,
    // puisque personne n'a encore évalué ces annonces pour eux.
    for (const userId of ['alice', 'bob']) {
      await repository.saveUserScores(userId, [scored('orpi:1')]);
    }
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

  it('filtre la liste sur les critères DE CHACUN', async () => {
    /**
     * LE CŒUR DU MULTI-COMPTE. « Correspond aux critères » vivait sur la
     * fiche, calculé une fois pour un seul utilisateur : la liste du second
     * était filtrée sur le budget du premier. Le score est désormais rangé par
     * compte, et c'est lui que la requête lit.
     */
    await db.execute({
      sql: 'UPDATE listing_user_score SET matches_criteria = 0 WHERE user_id = ?',
      args: ['bob'],
    });

    const chezAlice = (await call(db, 'alice', 'GET', '/api/listings')) as { listings: unknown[] };
    const chezBob = (await call(db, 'bob', 'GET', '/api/listings')) as { listings: unknown[] };

    expect(chezAlice.listings.length).toBeGreaterThan(0);
    expect(chezBob.listings).toHaveLength(0);
  });

  it('ne signale à l’un que ce qui correspond à SES critères', async () => {
    const repository = createRepository(db);
    // Hors des critères de Bob, dans ceux d'Alice.
    await db.execute({
      sql: 'UPDATE listing_user_score SET matches_criteria = 0 WHERE user_id = ?',
      args: ['bob'],
    });

    expect(await repository.pendingNotifications('alice', 0)).toHaveLength(1);
    expect(await repository.pendingNotifications('bob', 0)).toHaveLength(0);
  });

  it('ne tait pas à l’un ce que l’autre a DÉJÀ reçu', async () => {
    // « Signalée » était une colonne de la fiche : dès que le premier compte
    // recevait une annonce, le second ne la recevait jamais.
    const repository = createRepository(db);
    await repository.markNotified('alice', ['orpi:1']);

    expect(await repository.pendingNotifications('alice', 0)).toHaveLength(0);
    expect(await repository.pendingNotifications('bob', 0)).toHaveLength(1);
  });

  it('garde l’INVENTAIRE commun : une annonce est à tout le monde', async () => {
    // Ce qui est personnel, c'est la décision ; l'annonce, elle, est publique.
    const chezBob = (await call(db, 'bob', 'GET', '/api/listings')) as { listings: unknown[] };
    expect(chezBob.listings.length).toBeGreaterThan(0);
  });

  it('ne compte comme PERTINENTES que celles qui le sont pour ce compte', async () => {
    /**
     * La page Statistiques lisait `listings.matches_criteria` : « 42 annonces
     * pertinentes » était le décompte du compte que sert la collecte, servi à
     * tout le monde. C'est le défaut le plus discret de la série — un nombre
     * faux reste un nombre, et rien dans la page ne dit à qui il appartient.
     *
     * Ce qui décrit le MARCHÉ, lui, reste commun : `active` compte les annonces
     * en ligne, et ne bouge pas d'un compte à l'autre.
     */
    await db.execute({
      sql: 'UPDATE listing_user_score SET matches_criteria = 0 WHERE user_id = ?',
      args: ['bob'],
    });

    const chezAlice = (await call(db, 'alice', 'GET', '/api/stats')) as {
      listings: { matching: number; active: number };
    };
    const chezBob = (await call(db, 'bob', 'GET', '/api/stats')) as {
      listings: { matching: number; active: number };
    };

    expect(chezAlice.listings.matching).toBe(1);
    expect(chezBob.listings.matching).toBe(0);
    expect(chezBob.listings.active).toBe(chezAlice.listings.active);
  });

  it('garde à chaque compte SON historique d’inventaire', async () => {
    // `daily_stats` avait le jour pour clé primaire : une seule courbe, celle
    // du compte que sert la collecte, affichée à tous (migration 0029).
    const repository = createRepository(db);
    await db.execute({
      sql: 'UPDATE listing_user_score SET matches_criteria = 0 WHERE user_id = ?',
      args: ['bob'],
    });
    await repository.recordDailyStat();

    const chezAlice = await repository.dailyStats('alice');
    const chezBob = await repository.dailyStats('bob');

    expect(chezAlice.at(-1)?.matching).toBe(1);
    expect(chezBob.at(-1)?.matching).toBe(0);
    // L'inventaire total, lui, est le même pour les deux.
    expect(chezBob.at(-1)?.total).toBe(chezAlice.at(-1)?.total);
  });

  /**
   * LE TRANSFERT D'ALERTES EST PROPRE À CHAQUE COMPTE (§6). Chacun a son
   * jeton ; ce que l'un fait suivre ne doit pas se lire comme une preuve que
   * le transfert de l'autre marche.
   */
  it('n’attribue les alertes transférées qu’au compte qui les a fait suivre', async () => {
    const repository = createRepository(db);
    await db.batch(
      [
        { sql: "UPDATE users SET alert_token = 'jetonalice' WHERE id = 'alice'", args: [] },
        { sql: "UPDATE users SET alert_token = 'jetonbob' WHERE id = 'bob'", args: [] },
      ],
      'write',
    );

    await repository.recordAlertReception(new Map([['jetonalice', 3]]));

    const rows = await db.execute(
      'SELECT id, alert_last_received_at, alert_received_count FROM users ORDER BY id',
    );
    const alice = rows.rows.find((row) => row['id'] === 'alice');
    const bob = rows.rows.find((row) => row['id'] === 'bob');

    expect(alice?.['alert_received_count']).toBe(3);
    expect(alice?.['alert_last_received_at']).not.toBeNull();
    // Bob n'a rien transféré : son écran doit continuer à dire « aucune ».
    expect(bob?.['alert_received_count']).toBe(0);
    expect(bob?.['alert_last_received_at']).toBeNull();
  });

  it('cumule les passages successifs plutôt que de les écraser', async () => {
    const repository = createRepository(db);
    await db.execute("UPDATE users SET alert_token = 'jetonalice' WHERE id = 'alice'");

    await repository.recordAlertReception(new Map([['jetonalice', 2]]));
    await repository.recordAlertReception(new Map([['jetonalice', 5]]));

    const row = await db.execute("SELECT alert_received_count c FROM users WHERE id = 'alice'");
    expect(row.rows[0]?.['c']).toBe(7);
  });

  it('ignore un jeton qui n’est à personne', async () => {
    const repository = createRepository(db);
    // La boîte reçoit tout ce qu'on lui envoie : un jeton inventé ne doit
    // toucher aucune ligne, et surtout pas en créer une.
    await repository.recordAlertReception(new Map([['jetoninvente', 9]]));

    const row = await db.execute(
      'SELECT COUNT(*) n FROM users WHERE alert_last_received_at IS NOT NULL',
    );
    expect(Number(row.rows[0]?.['n'])).toBe(0);
  });
});
