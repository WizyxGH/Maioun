/**
 * Où la collecte écrit.
 *
 * Ce choix ne se voit nulle part à l'exécution : on lit « 42 annonces
 * collectées » que les données soient parties vers la base du site ou vers un
 * fichier que plus aucun écran ne sait ouvrir. D'où des tests sur la RÈGLE
 * elle-même.
 */

import { describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { avecReprise, databaseTarget } from './client.js';

describe('databaseTarget', () => {
  it('vise Turso dès que son adresse est fournie', () => {
    const target = databaseTarget({
      TURSO_DATABASE_URL: 'libsql://example-base.turso.io',
    } as never);
    expect(target).toEqual({ kind: 'turso', url: 'libsql://example-base.turso.io' });
  });

  it('signale le repli LOCAL', () => {
    // C'est tout l'objet de ce type : sans lui, une collecte sans Turso
    // annonçait « 42 annonces collectées » et les rangeait dans un fichier
    // dont rien ne disait qu'il n'était pas la base du site. Ce fichier se
    // lit désormais — `pnpm serve:local` le sert au site — mais il faut
    // toujours savoir lequel des deux on vise.
    expect(databaseTarget({} as never).kind).toBe('local');
    // Variable présente mais vide : le même piège, en plus sournois.
    expect(databaseTarget({ TURSO_DATABASE_URL: '' } as never).kind).toBe('local');
  });

  it('respecte DATABASE_URL pour viser un autre fichier', () => {
    const target = databaseTarget({ DATABASE_URL: 'file:./data/essai.db' } as never);
    expect(target).toEqual({ kind: 'local', url: 'file:./data/essai.db' });
  });

  it('isole les tests en mémoire, même si Turso est configuré (§52)', () => {
    // Le filet le plus important du lot : un test qui viserait la base de
    // production l'écraserait sans prévenir.
    const target = databaseTarget({
      VITEST: 'true',
      TURSO_DATABASE_URL: 'libsql://example-production.turso.io',
    } as never);
    expect(target).toEqual({ kind: 'memory', url: ':memory:' });
  });

  /**
   * TRAVAILLER ENTIÈREMENT HORS DE TURSO.
   *
   * Le 24 septembre 2026, le quota de lectures épuisé, la base distante a tout
   * refusé — et rien ne permettait de se rabattre sur un fichier local :
   * `TURSO_DATABASE_URL` l'emportait toujours, et `.env` la rechargeait à
   * chaque commande. Il fallait commenter une ligne du `.env`, ce qu'on oublie
   * ensuite de remettre.
   */
  describe('MAIOUN_LOCAL', () => {
    it('l’emporte sur Turso, même configuré', () => {
      const target = databaseTarget({
        MAIOUN_LOCAL: '1',
        TURSO_DATABASE_URL: 'libsql://example-production.turso.io',
        TURSO_AUTH_TOKEN: 'jeton',
      } as never);
      expect(target.kind).toBe('local');
      expect(target.url).not.toContain('turso.io');
    });

    it('respecte DATABASE_URL quand il désigne un autre fichier', () => {
      const target = databaseTarget({
        MAIOUN_LOCAL: '1',
        TURSO_DATABASE_URL: 'libsql://example-production.turso.io',
        DATABASE_URL: 'file:./data/essai.db',
      } as never);
      expect(target).toEqual({ kind: 'local', url: 'file:./data/essai.db' });
    });

    // UN INTERRUPTEUR NE S'ALLUME PAS À MOITIÉ : toute autre valeur laisse le
    // comportement inchangé, plutôt que de dérouter une collecte sur un « 0 »
    // pris pour un oui.
    it('ne s’allume que sur « 1 »', () => {
      for (const valeur of ['0', 'true', 'oui', '']) {
        const target = databaseTarget({
          MAIOUN_LOCAL: valeur,
          TURSO_DATABASE_URL: 'libsql://example-production.turso.io',
        } as never);
        expect(target.kind).toBe('turso');
      }
    });
  });
});

/**
 * La connexion fermée pendant le dédoublonnage faisait tomber la lecture des
 * baisses de loyer à chaque passage : une lecture coupée est retentée, une
 * écriture jamais.
 */
describe('avecReprise', () => {
  /** Un client dont le premier appel est coupé en route. */
  function coupeUneFois(): { client: Client; appels: () => number } {
    let appels = 0;
    const repond = (): Promise<unknown> => {
      appels += 1;
      return appels === 1
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve({ rows: [] });
    };
    const client = { execute: repond, batch: repond, closed: false } as unknown as Client;
    return { client, appels: () => appels };
  }

  it('retente une lecture coupée, une fois', async () => {
    const { client, appels } = coupeUneFois();
    await expect(avecReprise(client).execute({ sql: 'SELECT 1', args: [] })).resolves.toEqual({
      rows: [],
    });
    expect(appels()).toBe(2);
  });

  it('retente un lot déclaré en lecture', async () => {
    const { client, appels } = coupeUneFois();
    await avecReprise(client).batch(['SELECT 1'], 'read');
    expect(appels()).toBe(2);
  });

  it('ne rejoue jamais une écriture : elle a peut-être été appliquée', async () => {
    const { client, appels } = coupeUneFois();
    await expect(avecReprise(client).execute('INSERT INTO t VALUES (1)')).rejects.toThrow(
      'fetch failed',
    );
    await expect(avecReprise(coupeUneFois().client).batch(['SELECT 1'], 'write')).rejects.toThrow(
      'fetch failed',
    );
    expect(appels()).toBe(1);
  });

  it('laisse passer une erreur SQL : la rejouer donnerait la même', async () => {
    let appels = 0;
    const client = {
      execute: () => {
        appels += 1;
        return Promise.reject(new Error('SQLITE_ERROR: no such column'));
      },
    } as unknown as Client;
    await expect(avecReprise(client).execute('SELECT x')).rejects.toThrow('no such column');
    expect(appels).toBe(1);
  });

  it('laisse le reste du client intact', () => {
    const { client } = coupeUneFois();
    expect(avecReprise(client).closed).toBe(false);
  });
});
