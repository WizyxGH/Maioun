/**
 * LA COPIE DE SECOURS NE DOIT JAMAIS ÊTRE ÉCRITE.
 *
 * C'est tout l'enjeu de ce fichier. Une écriture qui passerait ici créerait
 * deux bases divergentes — un favori posé pendant la panne disparaîtrait au
 * retour de Turso, sans que rien ne le signale. Le refus vaut mieux, et il
 * doit tenir même quand la requête ne ressemble pas à ce qu'on attend.
 */

import { describe, expect, it } from 'vitest';
import { clientDeSecours } from './d1-client.js';
import { servableParLaCopie } from './index.js';

/** Un D1 de façade, qui rend les lignes qu'on lui donne. */
function fauxD1(lignes: readonly Record<string, unknown>[] = []): D1Database {
  const requetes: { sql: string; args: unknown[] }[] = [];
  const preparer = (sql: string): unknown => ({
    bind: (...args: unknown[]) => {
      requetes.push({ sql, args });
      return { all: async () => ({ results: lignes }) };
    },
    all: async () => {
      requetes.push({ sql, args: [] });
      return { results: lignes };
    },
  });
  return { prepare: preparer, requetes } as unknown as D1Database;
}

describe('clientDeSecours', () => {
  it('rend les lignes, lisibles par nom', async () => {
    const client = clientDeSecours(fauxD1([{ id: 'a1', price: 700 }]));
    const rendu = await client.execute('SELECT id, price FROM listings');
    expect(rendu.rows).toHaveLength(1);
    expect(rendu.rows[0]?.['id']).toBe('a1');
    expect(rendu.columns).toEqual(['id', 'price']);
  });

  // Le type promet les deux accès. Tout le code lit par nom, mais un appel
  // légitime ne doit pas échouer un jour sans raison compréhensible.
  it('rend les lignes, lisibles aussi par rang', async () => {
    const client = clientDeSecours(fauxD1([{ id: 'a1', price: 700 }]));
    const rendu = await client.execute('SELECT id, price FROM listings');
    expect(rendu.rows[0]?.[0]).toBe('a1');
    expect(rendu.rows[0]?.[1]).toBe(700);
  });

  it('accepte une requête sans paramètre comme avec', async () => {
    const client = clientDeSecours(fauxD1([{ n: 3 }]));
    const avec = await client.execute({
      sql: 'SELECT count(*) AS n FROM l WHERE x = ?',
      args: [1],
    });
    expect(avec.rows[0]?.['n']).toBe(3);
  });

  it('ne rend pas de colonnes quand il n’y a pas de ligne', async () => {
    const client = clientDeSecours(fauxD1([]));
    const rendu = await client.execute('SELECT id FROM listings WHERE 0');
    expect(rendu.rows).toEqual([]);
    expect(rendu.columns).toEqual([]);
  });

  it.each([
    ['INSERT INTO listings (id) VALUES (?)'],
    ['UPDATE listings SET price = 1'],
    ['DELETE FROM listings'],
    ['DROP TABLE listings'],
    ['PRAGMA journal_mode = WAL'],
    // Un `WITH` qui finit par écrire : on ne sait pas le distinguer à coup
    // sûr, donc on refuse — mais celui-ci commence par SELECT après le CTE,
    // et c'est la forme employée ici.
    ['REPLACE INTO listings (id) VALUES (?)'],
  ])('refuse d’écrire : %s', async (sql) => {
    const client = clientDeSecours(fauxD1());
    await expect(client.execute(sql)).rejects.toThrow(/lecture seule/i);
  });

  it('laisse passer un SELECT précédé d’un commentaire', async () => {
    const client = clientDeSecours(fauxD1([{ n: 1 }]));
    await expect(client.execute('-- compte\nSELECT count(*) AS n FROM l')).resolves.toBeDefined();
  });

  it('laisse passer un WITH, qui commence les requêtes de classement', async () => {
    const client = clientDeSecours(fauxD1([{ n: 1 }]));
    await expect(client.execute('WITH t AS (SELECT 1) SELECT * FROM t')).resolves.toBeDefined();
  });

  it('refuse les paramètres nommés plutôt que de les traduire au jugé', async () => {
    const client = clientDeSecours(fauxD1());
    await expect(
      client.execute({ sql: 'SELECT * FROM l WHERE id = :id', args: { id: 'a1' } }),
    ).rejects.toThrow(/nommés/i);
  });

  it('refuse le lot, qui n’existe que pour écrire', () => {
    const client = clientDeSecours(fauxD1());
    expect(() => client.batch([])).toThrow(/lecture seule/i);
  });
});

describe('servableParLaCopie', () => {
  const requete = (methode: string, chemin: string): Request =>
    new Request(`https://exemple.test${chemin}`, { method: methode });

  it('sert toute consultation', () => {
    expect(servableParLaCopie(requete('GET', '/api/listings'))).toBe(true);
  });

  // Sans elle, le secours ne servirait QUE ceux qui ont déjà une session
  // ouverte : les autres ne retrouveraient ni favoris ni critères le jour où
  // la base est fermée. La connexion ne fait pourtant que lire.
  it('sert la connexion, qui ne fait que lire', () => {
    expect(servableParLaCopie(requete('POST', '/api/login'))).toBe(true);
  });

  it.each([
    ['POST', '/api/signup'],
    ['POST', '/api/password/forgot'],
    ['POST', '/api/auth/google'],
    ['PATCH', '/api/listings/a1'],
    ['PUT', '/api/config'],
    ['DELETE', '/api/account'],
  ])('refuse %s %s, qui écrit', (methode, chemin) => {
    expect(servableParLaCopie(requete(methode, chemin))).toBe(false);
  });
});
