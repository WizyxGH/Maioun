import { describe, expect, it } from 'vitest';
import { instructionsInsert, litteralSql, ordonnerTables } from './dump-sql.js';

describe('ordonnerTables', () => {
  it('place la table référencée avant celle qui la référence', () => {
    const rendu = ordonnerTables([
      {
        name: 'listing_user_state',
        sql: 'CREATE TABLE listing_user_state (id TEXT REFERENCES listings(id))',
      },
      { name: 'listings', sql: 'CREATE TABLE listings (id TEXT PRIMARY KEY)' },
    ]).map((table) => table.name);
    expect(rendu).toEqual(['listings', 'listing_user_state']);
  });

  it('rend toutes les tables, même sans lien entre elles', () => {
    const rendu = ordonnerTables([
      { name: 'a', sql: 'CREATE TABLE a (x)' },
      { name: 'b', sql: 'CREATE TABLE b (x)' },
    ]).map((table) => table.name);
    expect(rendu).toEqual(['a', 'b']);
  });

  it('ne boucle pas sur un cycle de références', () => {
    const rendu = ordonnerTables([
      { name: 'a', sql: 'CREATE TABLE a (x REFERENCES b(x))' },
      { name: 'b', sql: 'CREATE TABLE b (x REFERENCES a(x))' },
    ]).map((table) => table.name);
    expect(rendu).toHaveLength(2);
    expect(new Set(rendu)).toEqual(new Set(['a', 'b']));
  });

  it('ignore une référence vers une table absente du lot, sans la perdre', () => {
    const rendu = ordonnerTables([
      { name: 'a', sql: 'CREATE TABLE a (x REFERENCES ailleurs(x))' },
    ]).map((table) => table.name);
    expect(rendu).toEqual(['a']);
  });
});

describe('litteralSql', () => {
  it('rend NULL pour une valeur absente', () => {
    expect(litteralSql(null)).toBe('NULL');
    expect(litteralSql(undefined)).toBe('NULL');
  });

  it('laisse les nombres tels quels', () => {
    expect(litteralSql(42)).toBe('42');
    expect(litteralSql(-1.5)).toBe('-1.5');
    expect(litteralSql(9007199254740993n)).toBe('9007199254740993');
  });

  it('double les apostrophes', () => {
    expect(litteralSql("L'Ariane")).toBe("'L''Ariane'");
  });

  // Une chaîne coupée à l'insu de tous serait la pire des pertes : silencieuse,
  // et découverte seulement le jour où l'on restaure.
  it('passe par l’hexadécimal quand un zéro binaire traîne', () => {
    expect(litteralSql('a\u0000b')).toBe("CAST(X'610062' AS TEXT)");
  });

  it('écrit les octets en hexadécimal', () => {
    expect(litteralSql(new Uint8Array([0xde, 0xad]))).toBe("X'dead'");
  });
});

describe('instructionsInsert', () => {
  it('nomme les colonnes, pour survivre à une colonne ajoutée ailleurs', () => {
    const [instruction] = instructionsInsert('listings', ['id', 'prix'], [['a1', 700]]);
    expect(instruction).toBe('INSERT INTO "listings" ("id", "prix") VALUES\n  (\'a1\', 700);');
  });

  it('ne rend rien pour une table vide', () => {
    expect(instructionsInsert('vide', ['id'], [])).toEqual([]);
  });

  it('coupe en plusieurs instructions au-delà du paquet', () => {
    const lignes = Array.from({ length: 10 }, (_, index) => [index, 'x'.repeat(50)]);
    const rendu = instructionsInsert('t', ['n', 'texte'], lignes, 120);
    expect(rendu.length).toBeGreaterThan(1);
    // Aucune ligne ne s'est perdue dans le découpage.
    const tuples = rendu
      .join('\n')
      .split('\n')
      .filter((ligne) => ligne.startsWith('  ('));
    expect(tuples).toHaveLength(10);
  });
});
