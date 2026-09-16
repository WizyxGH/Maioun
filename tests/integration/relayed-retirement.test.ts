/**
 * UNE ALERTE E-MAIL NE SURVIT PLUS À L'ANNONCE QU'ELLE RELAIE.
 *
 * Un digest de portail n'annonce chaque bien qu'une fois : rien, dans les
 * passages suivants, ne dit qu'il est parti. Seule l'ancienneté le retirait —
 * quatre jours de doute, dix pour l'extinction — alors que la durée de vie
 * médiane d'une annonce est de 1,4 jour.
 *
 * MAIS LE PORTAIL EST PARFOIS UNE SOURCE À PART ENTIÈRE, qui relit son
 * inventaire et sait quand l'annonce disparaît. La référence du digest porte
 * l'identifiant du portail — « bienici:apimo-87354095 » —, donc de quoi
 * reconnaître la même annonce à coup sûr, sans comparer ni prix ni photo.
 *
 * LE RAPPROCHEMENT ORDINAIRE NE PEUT PAS LE FAIRE : il ne travaille que sur les
 * occurrences vivantes, et celle du portail vient justement de s'éteindre.
 * Relevé le 2026-09-16 : trois alertes Bien'ici s'affichaient « en ligne »
 * alors que la source Bien'ici avait retiré exactement la même annonce.
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

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../database/migrations');

/** Les sources déclarées au registre, telles que le pipeline les passe. */
const SOURCES = ['bienici', 'orpi', 'email-alerts'];

async function lifecycleOf(db: Database, id: string): Promise<string | null> {
  const found = await db.execute({
    sql: 'SELECT lifecycle FROM occurrences WHERE id = ?',
    args: [id],
  });
  const value = found.rows[0]?.['lifecycle'];
  return typeof value === 'string' ? value : null;
}

describe('extinction d’une annonce relayée par sa source d’origine', () => {
  let db: Database;
  let repository: Repository;

  beforeEach(async () => {
    db = openDatabase({ url: ':memory:' });
    await migrate(db, MIGRATIONS, silentLogger);
    repository = createRepository(db);
    await repository.upsertOccurrences([
      // L'annonce chez le portail, et la même annonce vue par l'alerte e-mail.
      makeOccurrence({ id: 'bienici:apimo-87354095', sourceId: 'bienici' }),
      makeOccurrence({
        id: 'email-alerts:bienici:apimo-87354095',
        sourceId: 'email-alerts',
        sourceRef: 'bienici:apimo-87354095',
      }),
    ]);
  });

  it('éteint l’alerte quand le portail a retiré la sienne', async () => {
    await db.execute("UPDATE occurrences SET lifecycle='inactive' WHERE source_id='bienici'");

    expect(await repository.retireRelayedByOrigin('email-alerts', SOURCES)).toBe(1);
    expect(await lifecycleOf(db, 'email-alerts:bienici:apimo-87354095')).toBe('inactive');
  });

  it('n’y touche pas tant que le portail la publie encore', async () => {
    expect(await repository.retireRelayedByOrigin('email-alerts', SOURCES)).toBe(0);
    expect(await lifecycleOf(db, 'email-alerts:bienici:apimo-87354095')).toBe('active');
  });

  it('un simple doute chez le portail ne retire rien (§17)', async () => {
    // « Peut-être retirée » veut dire « pas revue » ; l'alerte, elle, ne se
    // relit jamais. On n'éteint que sur une extinction constatée.
    await db.execute(
      "UPDATE occurrences SET lifecycle='possiblyInactive' WHERE source_id='bienici'",
    );
    expect(await repository.retireRelayedByOrigin('email-alerts', SOURCES)).toBe(0);
  });

  it('ne croit pas un préfixe qui ne désigne aucune source déclarée', async () => {
    // « seloger:… » n'est un identifiant de portail que si `seloger` est une
    // source : sinon le préfixe ne prouve rien et l'annonce reste.
    await repository.upsertOccurrences([
      makeOccurrence({
        id: 'email-alerts:seloger:26DDVKPCKJ1S',
        sourceId: 'email-alerts',
        sourceRef: 'seloger:26DDVKPCKJ1S',
      }),
    ]);
    await db.execute("UPDATE occurrences SET lifecycle='inactive' WHERE source_id='bienici'");

    await repository.retireRelayedByOrigin('email-alerts', SOURCES);
    expect(await lifecycleOf(db, 'email-alerts:seloger:26DDVKPCKJ1S')).toBe('active');
  });

  it('ne repasse pas sur ce qui est déjà éteint', async () => {
    await db.execute("UPDATE occurrences SET lifecycle='inactive' WHERE source_id='bienici'");
    expect(await repository.retireRelayedByOrigin('email-alerts', SOURCES)).toBe(1);
    // Sans quoi chaque collecte paierait une écriture par annonce morte (§30).
    expect(await repository.retireRelayedByOrigin('email-alerts', SOURCES)).toBe(0);
  });

  it('une référence sans préfixe de portail ne déclenche rien', async () => {
    await repository.upsertOccurrences([
      makeOccurrence({
        id: 'email-alerts:sans-prefixe',
        sourceId: 'email-alerts',
        sourceRef: 'sans-prefixe',
      }),
    ]);
    await db.execute("UPDATE occurrences SET lifecycle='inactive' WHERE source_id='bienici'");
    await repository.retireRelayedByOrigin('email-alerts', SOURCES);
    expect(await lifecycleOf(db, 'email-alerts:sans-prefixe')).toBe('active');
  });
});
