import { describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client/web';
import { verifyPassword } from './auth.js';
import { hashToken } from './password-reset.js';
import { changeEmail, confirmEmail, confirmLink, createAccount, deleteAccount } from './signup.js';

type Row = Record<string, unknown>;

/**
 * Une base réduite aux tables que ce module touche.
 *
 * L'UNICITÉ EST SIMULÉE, et il le faut : c'est l'index unique qui tranche
 * vraiment, et le double doit refuser ce que la vraie base refuserait, sans
 * quoi les tests valideraient un comportement qui n'existe pas.
 */
function fakeDb(
  users: Row[] = [],
): Client & { users: Row[]; verifications: Row[]; wiped: string[] } {
  const verifications: Row[] = [];
  const wiped: string[] = [];

  const run = (sql: string, args: unknown[]): Row[] => {
    if (sql.includes('FROM users WHERE login = ? OR lower(email) = ?')) {
      return users
        .filter(
          (user) =>
            user['login'] === args[0] || String(user['email'] ?? '').toLowerCase() === args[1],
        )
        .map((user) => ({
          login: user['login'],
          email: String(user['email'] ?? '').toLowerCase(),
        }));
    }
    if (sql.includes('INSERT INTO users')) {
      const login = args[1];
      const email = String(args[5] ?? '').toLowerCase();
      const clash = users.some(
        (user) => user['login'] === login || String(user['email'] ?? '').toLowerCase() === email,
      );
      if (clash) throw new Error('UNIQUE constraint failed');
      users.push({
        id: args[0],
        login,
        password_hash: args[2],
        display_name: args[3],
        created_at: args[4],
        email: args[5],
        email_verified: 0,
      });
      return [];
    }
    if (sql.includes('SELECT password_hash FROM users WHERE id = ?')) {
      return users.filter((user) => user['id'] === args[0]);
    }
    if (sql.includes('FROM users WHERE lower(email) = ? AND id != ?')) {
      return users.filter(
        (user) => String(user['email'] ?? '').toLowerCase() === args[0] && user['id'] !== args[1],
      );
    }
    if (sql.includes('UPDATE users SET email = ?, email_verified = 0')) {
      const clash = users.some(
        (user) => String(user['email'] ?? '').toLowerCase() === args[0] && user['id'] !== args[1],
      );
      if (clash) throw new Error('UNIQUE constraint failed');
      const found = users.find((user) => user['id'] === args[1]);
      if (found !== undefined) {
        found['email'] = args[0];
        found['email_verified'] = 0;
      }
      return [];
    }
    if (sql.includes('INSERT INTO email_verifications')) {
      verifications.push({
        token_hash: args[0],
        user_id: args[1],
        created_at: args[2],
        expires_at: args[3],
        used_at: null,
      });
      return [];
    }
    if (sql.includes('SELECT user_id, expires_at, used_at FROM email_verifications')) {
      return verifications.filter((row) => row['token_hash'] === args[0]);
    }
    if (sql.includes('UPDATE users SET email_verified')) {
      const found = users.find((user) => user['id'] === args[0]);
      if (found !== undefined) found['email_verified'] = 1;
      return [];
    }
    if (sql.includes('UPDATE email_verifications SET used_at')) {
      const found = verifications.find((row) => row['token_hash'] === args[1]);
      if (found !== undefined) found['used_at'] = args[0];
      return [];
    }
    if (sql.startsWith('DELETE FROM')) {
      wiped.push(/DELETE FROM (\w+)/.exec(sql)?.[1] ?? '?');
      return [];
    }
    throw new Error(`SQL non prévu par le double : ${sql}`);
  };

  const client = {
    users,
    verifications,
    wiped,
    execute: (statement: { sql: string; args: unknown[] }) =>
      Promise.resolve({ rows: run(statement.sql, statement.args) }),
    batch: (statements: { sql: string; args: unknown[] }[]) => {
      for (const statement of statements) run(statement.sql, statement.args);
      return Promise.resolve([]);
    },
  };
  return client as unknown as Client & { users: Row[]; verifications: Row[]; wiped: string[] };
}

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const GOOD = { login: 'florian', email: 'Florian@example.com', password: 'unmotdepasse' }; // secret-scan-ignore

describe('createAccount', () => {
  it('crée le compte, l’adresse en minuscules et NON confirmée', async () => {
    const db = fakeDb();
    const created = await createAccount(db, GOOD, NOW);
    expect(created.ok).toBe(true);

    const user = db.users[0];
    expect(user?.['login']).toBe('florian');
    expect(user?.['email']).toBe('florian@example.com');
    // Une adresse SAISIE n'est pas une adresse PROUVÉE.
    expect(user?.['email_verified']).toBe(0);
  });

  it('stocke une EMPREINTE, jamais le mot de passe', async () => {
    const db = fakeDb();
    await createAccount(db, GOOD, NOW);
    const stored = String(db.users[0]?.['password_hash']);
    expect(stored).not.toContain('unmotdepasse');
    expect(await verifyPassword('unmotdepasse', stored)).toBe(true);
  });

  it('ouvre une confirmation dont seule l’empreinte est gardée', async () => {
    const db = fakeDb();
    const created = await createAccount(db, GOOD, NOW);
    if (!created.ok) throw new Error('inattendu');
    expect(db.verifications).toHaveLength(1);
    expect(db.verifications[0]?.['token_hash']).toBe(await hashToken(created.account.token));
    // Le jeton en clair n'existe que dans le lien.
    expect(db.verifications[0]?.['token_hash']).not.toBe(created.account.token);
  });

  it('refuse un identifiant mal formé ou réservé', async () => {
    const db = fakeDb();
    expect(await createAccount(db, { ...GOOD, login: 'ab' }, NOW)).toMatchObject({
      problem: 'login-shape',
    });
    expect(await createAccount(db, { ...GOOD, login: '1florian' }, NOW)).toMatchObject({
      problem: 'login-shape',
    });
    expect(await createAccount(db, { ...GOOD, login: 'jean dupont' }, NOW)).toMatchObject({
      problem: 'login-shape',
    });
    expect(await createAccount(db, { ...GOOD, login: 'admin' }, NOW)).toMatchObject({
      problem: 'login-reserved',
    });
  });

  it('refuse une adresse jetable ou impossible', async () => {
    const db = fakeDb();
    const jetable = { ...GOOD, email: 'x@yopmail.com' }; // secret-scan-ignore
    expect(await createAccount(db, jetable, NOW)).toMatchObject({ problem: 'disposable' });
    expect(await createAccount(db, { ...GOOD, email: 'pasdarobase' }, NOW)).toMatchObject({
      problem: 'shape',
    });
  });

  it('refuse un mot de passe trop court', async () => {
    expect(await createAccount(fakeDb(), { ...GOOD, password: 'court' }, NOW)).toMatchObject({
      problem: 'weak-password',
    });
  });

  it('refuse un identifiant ou une adresse déjà pris, SANS dire lequel existe', async () => {
    const db = fakeDb();
    await createAccount(db, GOOD, NOW);
    expect(await createAccount(db, { ...GOOD, email: 'autre@example.com' }, NOW)).toMatchObject({
      problem: 'login-taken',
    });
    // Casse différente : c'est la même boîte, donc le même compte.
    expect(await createAccount(db, { ...GOOD, login: 'autre' }, NOW)).toMatchObject({
      problem: 'email-taken',
    });
    expect(db.users).toHaveLength(1);
  });
});

describe('confirmEmail', () => {
  it('marque l’adresse prouvée, une seule fois', async () => {
    const db = fakeDb();
    const created = await createAccount(db, GOOD, NOW);
    if (!created.ok) throw new Error('inattendu');

    expect(await confirmEmail(db, created.account.token, NOW + 1000)).toBe('ok');
    expect(db.users[0]?.['email_verified']).toBe(1);
    // Un lien qui reste valable rouvrirait le compte à qui remet la main sur
    // l'e-mail.
    expect(await confirmEmail(db, created.account.token, NOW + 2000)).toBe('invalid');
  });

  it('refuse un jeton expiré ou inconnu, sans dire lequel des deux', async () => {
    const db = fakeDb();
    const created = await createAccount(db, GOOD, NOW);
    if (!created.ok) throw new Error('inattendu');

    const troisJours = NOW + 3 * 24 * 3_600_000;
    expect(await confirmEmail(db, created.account.token, troisJours)).toBe('invalid');
    expect(await confirmEmail(db, 'jeton-invente', NOW)).toBe('invalid');
  });
});

describe('deleteAccount', () => {
  it('efface TOUTES les tables qui portent du personnel', async () => {
    // Les clés étrangères ne suffisent pas : `ON DELETE CASCADE` suppose un
    // PRAGMA qui n'est pas garanti d'une connexion à l'autre.
    const db = fakeDb();
    await deleteAccount(db, 'qui-que-ce-soit');
    expect(db.wiped).toEqual([
      'listing_user_state',
      'app_settings',
      'contact_attempts',
      'push_subscriptions',
      'password_resets',
      'email_verifications',
      'users',
    ]);
  });
});

describe('confirmLink', () => {
  it('compose un lien utilisable, quel que soit le slash final du site', () => {
    expect(confirmLink('https://exemple.invalid/app/', 'jet on')).toBe(
      'https://exemple.invalid/app/confirm/jet%20on',
    );
    expect(confirmLink('https://exemple.invalid/app', 'abc')).toBe(
      'https://exemple.invalid/app/confirm/abc',
    );
  });
});

/**
 * L'ADRESSE NE SE POSAIT QU'À L'INSCRIPTION. Un compte dont l'adresse était
 * fautive ou abandonnée y restait pour toujours : plus de « mot de passe
 * oublié », plus d'alertes, et aucun écran pour le corriger.
 */
describe('changeEmail', () => {
  const account = async (): Promise<ReturnType<typeof fakeDb>> => {
    const db = fakeDb();
    await createAccount(db, GOOD, NOW);
    return db;
  };

  it('écrit la nouvelle adresse et la remet À PROUVER', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);
    // On part d'une adresse déjà confirmée : c'est le cas qui compte.
    if (db.users[0] !== undefined) db.users[0]['email_verified'] = 1;

    const changed = await changeEmail(
      db,
      id,
      { email: 'Nouvelle@example.com', password: 'unmotdepasse' }, // secret-scan-ignore
      NOW,
    );

    expect(changed.ok).toBe(true);
    expect(db.users[0]?.['email']).toBe('nouvelle@example.com');
    // Une adresse SAISIE n'est pas une adresse PROUVÉE, même sur un compte
    // dont la précédente l'était.
    expect(db.users[0]?.['email_verified']).toBe(0);
  });

  it('exige le mot de passe : sinon une session ouverte suffirait à prendre le compte', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);

    const changed = await changeEmail(
      db,
      id,
      { email: 'voleur@example.com', password: 'pas-le-bon' }, // secret-scan-ignore
      NOW,
    );

    expect(changed).toEqual({ ok: false, problem: 'wrong-password' });
    // Rien n'a bougé : ni l'adresse, ni son statut.
    expect(db.users[0]?.['email']).toBe('florian@example.com');
  });

  it('ouvre une confirmation dont seule l’empreinte est gardée', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);
    db.verifications.length = 0;

    const changed = await changeEmail(
      db,
      id,
      { email: 'nouvelle@example.com', password: 'unmotdepasse' }, // secret-scan-ignore
      NOW,
    );
    if (!changed.ok) throw new Error('le changement aurait dû aboutir');

    expect(db.verifications).toHaveLength(1);
    expect(db.verifications[0]?.['token_hash']).toBe(await hashToken(changed.token));
    expect(db.verifications[0]?.['token_hash']).not.toBe(changed.token);
  });

  it('confirme la nouvelle adresse par le lien reçu', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);

    const changed = await changeEmail(
      db,
      id,
      { email: 'nouvelle@example.com', password: 'unmotdepasse' }, // secret-scan-ignore
      NOW,
    );
    if (!changed.ok) throw new Error('le changement aurait dû aboutir');

    expect(await confirmEmail(db, changed.token, NOW)).toBe('ok');
    expect(db.users[0]?.['email_verified']).toBe(1);
  });

  it('refuse une adresse déjà prise par un autre compte', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);
    db.users.push({ id: 'autre', login: 'autre', email: 'occupee@example.com' });

    const changed = await changeEmail(
      db,
      id,
      { email: 'Occupee@example.com', password: 'unmotdepasse' }, // secret-scan-ignore
      NOW,
    );

    expect(changed).toEqual({ ok: false, problem: 'email-taken' });
  });

  it('refuse une adresse jetable ou malformée, sans rien écrire', async () => {
    const db = await account();
    const id = String(db.users[0]?.['id']);

    const malformee = await changeEmail(
      db,
      id,
      { email: 'pas-une-adresse', password: 'unmotdepasse' }, // secret-scan-ignore
      NOW,
    );

    expect(malformee).toEqual({ ok: false, problem: 'shape' });
    expect(db.users[0]?.['email']).toBe('florian@example.com');
  });
});
