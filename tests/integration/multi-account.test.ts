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

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRepository,
  migrate,
  openDatabase,
  scoreListing,
  silentLogger,
  splitStatements,
  type Database,
} from '@maioun/collector';
// Chemin direct vers la source : le paquet expose bien `./server/routes`, mais
// vers `dist`. Les tests d'intégration travaillent sur les sources.
import { route } from '../../packages/collector/src/server/routes.js';
import { MVP_CRITERIA, type ScoredListing } from '@maioun/shared';
import { makeAggregated, makeContact, makeOccurrence } from '../helpers/factories.js';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');
const BASE = 'https://exemple.invalid';

function scored(id: string): ScoredListing {
  return scoreListing(
    makeAggregated({ id, occurrences: [makeOccurrence({ id, sourceId: 'orpi' })] }),
    { criteria: MVP_CRITERIA, nowMs: Date.now(), referencePricePerSqm: 20, referencePoints: [] },
  );
}

/** Appelle l'API comme le ferait le Worker, pour le compte indiqué (`null` : visiteur). */
async function call(
  db: Database,
  userId: string | null,
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

  it('donne à chacun SES trajets et le détail du score selon SES critères', async () => {
    const repository = createRepository(db);
    const pour = (maxPrice: number, label: string): ScoredListing =>
      scoreListing(
        makeAggregated({
          id: 'orpi:1',
          occurrences: [makeOccurrence({ id: 'orpi:1', sourceId: 'orpi' })],
        }),
        {
          criteria: { ...MVP_CRITERIA, maxPrice },
          nowMs: Date.now(),
          referencePricePerSqm: 20,
          referencePoints: [{ label, latitude: 43.7, longitude: 7.26, mode: 'walking' }],
          resolvedCoordinates: { latitude: 43.705, longitude: 7.265 },
        },
      );
    await repository.saveUserScores('alice', [pour(1000, 'Travail')]);
    await repository.saveUserScores('bob', [pour(700, 'Fac')]);

    type Vue = {
      distances: { label: string }[];
      scores: { match: { reasons: { label: string }[] } };
    };
    const chez = async (userId: string): Promise<Vue> =>
      (await call(db, userId, 'GET', '/api/listings/orpi:1')) as unknown as Vue;
    const budget = (vue: Vue): string =>
      vue.scores.match.reasons.map((reason) => reason.label).join(' | ');

    const alice = await chez('alice');
    const bob = await chez('bob');
    expect(alice.distances.map((d) => d.label)).toEqual(['Travail']);
    expect(bob.distances.map((d) => d.label)).toEqual(['Fac']);
    expect(budget(alice)).toContain('1000 €');
    expect(budget(bob)).toContain('700 €');
    expect(budget(bob)).not.toContain('1000 €');

    // Un visiteur sans compte : ni trajet, ni critères de quiconque.
    const anonyme = (await call(
      db,
      'anonyme-sans-score',
      'GET',
      '/api/listings/orpi:1',
    )) as unknown as Vue;
    expect(anonyme.distances).toEqual([]);
    expect(anonyme.scores.match.reasons).toEqual([]);
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

  it('ne signale pas une annonce fermée aux candidatures, et la rend si elle rouvre', async () => {
    const repository = createRepository(db);
    const statut = (value: string): Promise<unknown> =>
      db.execute({
        sql: "UPDATE listings SET payload = json_set(payload, '$.applicationStatus', ?)",
        args: [value],
      });

    await statut('full');
    expect(await repository.pendingNotifications('alice', 0)).toHaveLength(0);
    const liste = (await call(db, 'alice', 'GET', '/api/listings')) as { listings: unknown[] };
    expect(liste.listings).toHaveLength(0);

    await statut('open');
    expect(await repository.pendingNotifications('alice', 0)).toHaveLength(1);
  });

  it('signale une seule fois que les candidatures ont rouvert, et à qui l’avait reçue', async () => {
    const repository = createRepository(db);
    const statut = (value: string): Promise<unknown> =>
      db.execute({
        sql: "UPDATE listings SET payload = json_set(payload, '$.applicationStatus', ?)",
        args: [value],
      });
    const rouvertes = async (userId: string): Promise<string[]> =>
      (await repository.reopenedApplications(userId)).map((listing) => listing.id);

    // Alice l'a reçue ; Bob jamais.
    await repository.markNotified('alice', ['orpi:1']);
    await statut('full');
    await repository.noteClosedApplications('alice');
    await repository.noteClosedApplications('bob');
    // Toujours complète : rien à dire.
    expect(await rouvertes('alice')).toEqual([]);

    await statut('open');
    expect(await rouvertes('alice')).toEqual(['orpi:1']);
    // Bob la recevra comme une nouvelle annonce, pas comme une réouverture.
    expect(await rouvertes('bob')).toEqual([]);
    expect(await repository.pendingNotifications('bob', 0)).toHaveLength(1);

    await repository.markReopenNotified('alice', ['orpi:1']);
    expect(await rouvertes('alice')).toEqual([]);
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

/**
 * LES MARQUES D'UN COMPTE NE SE LISENT PAS CHEZ LES AUTRES.
 *
 * Les requêtes plaçaient `listings.*` avant les colonnes du lecteur, et libsql
 * rend la première de deux colonnes homonymes. Vu, favori, archivage, suivi et
 * pertinence se lisaient donc sur la fiche commune — que chaque PATCH écrivait
 * aussi : ce qu'Alice marquait, Bob et les visiteurs le voyaient.
 */
describe('état personnel : chacun le sien, sur chaque écran', () => {
  let db: Database;
  const ID = 'orpi:1';
  const AGENCY = 'Agence Fictive';

  /** Ce que la liste, la fiche, l'agence et les alertes montrent de l'annonce. */
  async function vues(userId: string | null): Promise<Record<string, Record<string, unknown>>> {
    const find = (list: unknown): Record<string, unknown> =>
      ((list as Record<string, unknown>[] | undefined) ?? []).find((one) => one['id'] === ID) ?? {};
    const out: Record<string, Record<string, unknown>> = {
      liste: find(
        (await call(db, userId, 'GET', '/api/listings?all=true&archived=true'))['listings'],
      ),
      fiche: await call(db, userId, 'GET', `/api/listings/${encodeURIComponent(ID)}`),
      agence: find(
        (await call(db, userId, 'GET', `/api/agencies/${encodeURIComponent(AGENCY)}`))['listings'],
      ),
    };
    if (userId !== null) {
      out['alertes'] = find((await call(db, userId, 'GET', '/api/alerts'))['listings']);
    }
    return out;
  }

  const personnel = (vue: Record<string, unknown>): Record<string, unknown> => ({
    viewed: vue['viewed'],
    favorite: vue['favorite'],
    archived: vue['archived'],
    tracking: vue['tracking'],
  });
  const NEUF = { viewed: false, favorite: false, archived: false, tracking: 'new' };

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    const repository = createRepository(db);
    const occurrence = makeOccurrence({ id: ID, sourceId: 'orpi', contact: makeContact() });
    await repository.upsertOccurrences([occurrence]);
    await repository.saveListings([
      scoreListing(makeAggregated({ id: ID, occurrences: [occurrence] }), {
        criteria: MVP_CRITERIA,
        nowMs: Date.now(),
        referencePricePerSqm: 20,
        referencePoints: [],
      }),
    ]);
    await db.batch(
      [
        { sql: "INSERT INTO users (id, created_at) VALUES ('alice', datetime('now'))", args: [] },
        { sql: "INSERT INTO users (id, created_at) VALUES ('bob', datetime('now'))", args: [] },
      ],
      'write',
    );
    for (const userId of ['alice', 'bob', 'moi']) {
      await repository.saveUserScores(userId, [scored(ID)]);
      // Signalée à tous : chacun la retrouve dans son historique d'alertes.
      await repository.markNotified(userId, [ID]);
    }
  });

  it('ne montre ni à Bob ni à un visiteur ce qu’Alice a marqué', async () => {
    await call(db, 'alice', 'PATCH', `/api/listings/${ID}`, {
      viewed: true,
      favorite: true,
      archived: true,
      tracking: 'visitScheduled',
    });

    for (const [ecran, vue] of Object.entries(await vues('alice'))) {
      expect(personnel(vue), `alice ${ecran}`).toEqual({
        viewed: true,
        favorite: true,
        archived: true,
        tracking: 'visitScheduled',
      });
    }
    for (const reader of ['bob', null]) {
      const ecrans = await vues(reader);
      expect(Object.keys(ecrans).length).toBeGreaterThanOrEqual(3);
      for (const [ecran, vue] of Object.entries(ecrans)) {
        expect(personnel(vue), `${reader ?? 'visiteur'} ${ecran}`).toEqual(NEUF);
      }
    }
  });

  it('ne montre pas à l’autre le suivi posé par une prise de contact', async () => {
    await call(db, 'alice', 'POST', `/api/listings/${ID}/contact`, { channel: 'email' });
    expect((await vues('alice'))['fiche']?.['tracking']).toBe('contacted');
    for (const vue of Object.values(await vues('bob'))) expect(vue['tracking']).toBe('new');
  });

  it('n’écrit plus rien de personnel sur la fiche commune', async () => {
    const avant = await db.execute({
      sql: 'SELECT viewed, favorite, archived, tracking, updated_at FROM listings WHERE id = ?',
      args: [ID],
    });
    await call(db, 'alice', 'PATCH', `/api/listings/${ID}`, {
      favorite: true,
      tracking: 'toContact',
    });
    await call(db, 'alice', 'POST', `/api/listings/${ID}/contact`, { channel: 'email' });
    const apres = await db.execute({
      sql: 'SELECT viewed, favorite, archived, tracking, updated_at FROM listings WHERE id = ?',
      args: [ID],
    });
    expect(apres.rows[0]).toEqual(avant.rows[0]);
  });

  it('répond 404 à un PATCH sur une annonce inconnue, sans rien écrire', async () => {
    const url = new URL(`${BASE}/api/listings/orpi:inconnue`);
    const response = await route(
      db,
      new Request(url, { method: 'PATCH', body: JSON.stringify({ favorite: true }) }),
      url,
      url.pathname.split('/').filter((part) => part !== ''),
      {},
      'alice',
    );
    expect(response.status).toBe(404);
    const rows = await db.execute(
      "SELECT COUNT(*) AS n FROM listing_user_state WHERE listing_id = 'orpi:inconnue'",
    );
    expect(Number(rows.rows[0]?.['n'])).toBe(0);
  });

  it('dit au visiteur « dans le catalogue », pas « dans les critères » d’un autre', async () => {
    // Hors des critères du compte principal, l'annonce reste au catalogue.
    await db.execute('UPDATE listings SET matches_criteria = 0, action_priority = 90');
    await db.execute("UPDATE listing_user_score SET matches_criteria = 0 WHERE user_id = 'bob'");
    for (const vue of Object.values(await vues(null))) {
      expect(vue['matchesCriteria']).toBe(true);
      expect(vue['actionPriority']).toBe(0);
    }
    for (const vue of Object.values(await vues('bob'))) expect(vue['matchesCriteria']).toBe(false);
    for (const vue of Object.values(await vues('alice'))) expect(vue['matchesCriteria']).toBe(true);
  });

  it('garde au compte principal ce que marquent ses outils (contact BEP, favori)', async () => {
    const repository = createRepository(db);
    await repository.markContacted('moi', [ID]);
    await repository.setListingFavorite(ID, true);

    for (const vue of Object.values(await vues('moi'))) {
      expect(personnel(vue)).toEqual({ ...NEUF, favorite: true, tracking: 'contacted' });
    }
    for (const vue of Object.values(await vues('bob'))) expect(personnel(vue)).toEqual(NEUF);
  });

  it('garde à chaque compte sa décision quand deux fiches fusionnent', async () => {
    const repository = createRepository(db);
    const autre = makeOccurrence({ id: 'orpi:2', sourceId: 'orpi', contact: makeContact() });
    const premiere = makeOccurrence({ id: ID, sourceId: 'orpi', contact: makeContact() });
    await repository.upsertOccurrences([autre]);
    await repository.saveListings([
      scoreListing(makeAggregated({ id: 'orpi:2', occurrences: [autre] }), {
        criteria: MVP_CRITERIA,
        nowMs: Date.now(),
        referencePricePerSqm: 20,
        referencePoints: [],
      }),
    ]);
    // Le compte principal met en favori la fiche qui va être absorbée.
    await repository.setListingFavorite('orpi:2', true);
    await call(db, 'bob', 'PATCH', '/api/listings/orpi:2', { tracking: 'visited' });

    await repository.saveListings([
      scoreListing(makeAggregated({ id: ID, occurrences: [premiere, autre] }), {
        criteria: MVP_CRITERIA,
        nowMs: Date.now(),
        referencePricePerSqm: 20,
        referencePoints: [],
      }),
    ]);

    const restantes = await db.execute('SELECT id FROM listings');
    expect(restantes.rows.map((row) => row['id'])).toEqual([ID]);
    for (const vue of Object.values(await vues('moi'))) {
      expect(personnel(vue)).toEqual({ ...NEUF, favorite: true });
    }
    for (const vue of Object.values(await vues('bob'))) {
      expect(personnel(vue)).toEqual({ ...NEUF, tracking: 'visited' });
    }
    for (const vue of Object.values(await vues('alice'))) expect(personnel(vue)).toEqual(NEUF);
  });

  it('rend au compte principal l’état resté sur la fiche, sans rien faire reculer', async () => {
    // L'état d'avant : écrit sur `listings`, en partie seulement dans `moi`.
    await db.execute({
      sql: `UPDATE listings SET viewed = 1, favorite = 1, tracking = 'contacted',
              notified_at = '2026-09-01T08:00:00.000Z' WHERE id = ?`,
      args: [ID],
    });
    await db.execute({
      sql: `UPDATE listing_user_state SET tracking = 'visited', notified_at = NULL
             WHERE user_id = 'moi' AND listing_id = ?`,
      args: [ID],
    });
    const sql = await readFile(
      resolve(MIGRATIONS, '0041_personal_state_from_listings.sql'),
      'utf8',
    );
    for (const statement of splitStatements(sql)) await db.execute(statement);

    const fiche = (await vues('moi'))['fiche'] ?? {};
    expect(personnel(fiche)).toEqual({
      ...NEUF,
      viewed: true,
      favorite: true,
      tracking: 'visited',
    });
    expect(fiche['notifiedAt']).toBe('2026-09-01T08:00:00.000Z');
    for (const vue of Object.values(await vues('bob'))) expect(personnel(vue)).toEqual(NEUF);
  });

  it('change l’empreinte de la liste quand le lecteur change son propre état', async () => {
    const path = '/api/listings?all=true&archived=true';
    const empreinte = async (userId: string): Promise<string> => {
      const url = new URL(`${BASE}${path}`);
      const response = await route(
        db,
        new Request(url),
        url,
        url.pathname.split('/').filter((part) => part !== ''),
        {},
        userId,
      );
      return response.headers.get('ETag') ?? '';
    };
    const alice = await empreinte('alice');
    const bob = await empreinte('bob');
    await new Promise((done) => setTimeout(done, 5));
    await call(db, 'alice', 'PATCH', `/api/listings/${ID}`, { viewed: true });
    expect(await empreinte('alice')).not.toBe(alice);
    // L'état d'Alice n'entre pas dans l'empreinte de Bob.
    expect(await empreinte('bob')).toBe(bob);
  });
});
