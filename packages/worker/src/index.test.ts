/**
 * L'AIGUILLAGE DU WORKER, qui n'avait aucun test.
 *
 * Les fonctions appelées sont couvertes une à une — chiffrement, changement
 * d'adresse, jetons. Ce qui ne l'était pas, c'est ce qui décide QUI atteint
 * QUOI : la reconnaissance des chemins, le mur de session, la méthode HTTP
 * acceptée. Or c'est là que se jouent les fautes qui comptent — une route
 * ajoutée avant le contrôle de session ouvre la base à tout le monde, sans
 * qu'aucun test de fonction ne s'en aperçoive.
 *
 * LA BASE EST SIMULÉE, et le double refuse ce qu'il ne connaît pas : une
 * requête SQL inattendue lève, plutôt que de rendre un résultat vide qui
 * laisserait croire au test que tout va bien.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const executed: { sql: string; args: unknown[] }[] = [];
let rows: Record<string, unknown>[] = [];

vi.mock('@libsql/client/web', () => ({
  createClient: () => ({
    execute: (statement: { sql: string; args?: unknown[] }) => {
      executed.push({ sql: statement.sql, args: statement.args ?? [] });
      return Promise.resolve({ rows });
    },
    batch: (statements: { sql: string; args?: unknown[] }[]) => {
      for (const one of statements) executed.push({ sql: one.sql, args: one.args ?? [] });
      return Promise.resolve([]);
    },
  }),
}));

/**
 * Le paquet du collecteur s expose vers `dist` : irrésoluble ici, et sans
 * intérêt pour ce qu on teste. On le remplace, ce qui a l avantage de couper
 * tout appel réseau au fournisseur d e-mails.
 */
vi.mock('@maioun/collector/server/routes', () => ({
  /**
   * LE DOUBLE REPRODUIT LE SEUL COMPORTEMENT QUI COMPTE ICI : sans session,
   * `route` refuse tout ce qui n'est pas le catalogue. Le Worker lui délègue
   * désormais les visiteurs anonymes — un double qui répondrait 200 à tout
   * ferait passer pour ouvertes des routes qui ne le sont pas.
   *
   * Le catalogue lui-même est vérifié sur le vrai module, dans
   * `collector/src/server/routes.test.ts`.
   */
  route: (
    _db: unknown,
    _request: unknown,
    _url: unknown,
    segments: readonly string[],
    _cors: unknown,
    userId: string | null,
  ) => {
    const open = ['listings', 'districts', 'sources', 'agencies'].includes(segments[1] ?? '');
    if (userId === null && !open) return new Response('{}', { status: 401 });
    return new Response('{}', { status: 404 });
  },
}));

/**
 * LA VERIFICATION DU JETON EST TESTEE POUR DE VRAI AILLEURS, avec de vraies
 * cles RSA (google-auth.test.ts). Ici on teste ce que la ROUTE fait de son
 * verdict : rattacher, creer, ou refuser.
 */
let identiteGoogle: { sub: string; email: string; name: string | null } | null = null;
vi.mock('./google-auth.js', () => ({
  verifyGoogleToken: () => Promise.resolve(identiteGoogle),
  resetGoogleKeyCache: () => undefined,
}));

const envoyes: { to: string; subject: string }[] = [];
vi.mock('@maioun/collector/notify/mailer', () => ({
  mailerConfigured: () => true,
  sendEmail: () => Promise.resolve(true),
  sendEmailResult: (_env: unknown, message: { to: string; subject: string }) => {
    envoyes.push(message);
    return Promise.resolve('sent');
  },
}));

const { default: worker } = await import('./index.js');
const { issueSession, sessionCookie } = await import('./auth.js');

/**
 * UN TÉMOIN RECONNAISSABLE : on vérifie qu il ne se retrouve NULLE PART dans ce
 * qui part en base. Une valeur banale passerait inaperçue au milieu du chiffré.
 */
const MOT_DE_PASSE_TEMOIN = 'temoin-a-ne-jamais-retrouver'; // secret-scan-ignore

const ORIGIN = 'https://site.invalid';
const SECRET = 'valeur-de-test-sans-portee'; // secret-scan-ignore

const ENV = {
  TURSO_DATABASE_URL: 'libsql://exemple.invalid',
  TURSO_AUTH_TOKEN: 'jeton',
  SESSION_SECRET: SECRET,
  ALLOWED_ORIGIN: ORIGIN,
  CREDENTIALS_KEY: 'cle-de-plateforme-pour-les-tests',
} as unknown as Parameters<typeof worker.fetch>[1];

async function call(
  method: string,
  path: string,
  options: { readonly session?: string; readonly body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Origin: ORIGIN };
  if (options.session !== undefined) {
    headers['Cookie'] = sessionCookie(await issueSession(options.session, SECRET, Date.now()));
  }
  // Un GET ne porte pas de corps : le lui donner lève avant même d atteindre
  // le Worker, et le test échouerait pour une raison qui ne le regarde pas.
  const withBody = options.body !== undefined && method !== 'GET' && method !== 'HEAD';
  if (withBody) headers['Content-Type'] = 'application/json';
  return await worker.fetch(
    new Request(`https://api.invalid${path}`, {
      method,
      headers,
      ...(withBody ? { body: JSON.stringify(options.body) } : {}),
    }),
    ENV,
  );
}

beforeEach(() => {
  executed.length = 0;
  rows = [];
});

/**
 * LE MUR DE SESSION EST LA PREMIÈRE CHOSE À VÉRIFIER. Une route ajoutée du
 * mauvais côté livrerait les accès d'un compte à qui les demande.
 */
describe('mur de session', () => {
  const protegees = [
    ['GET', '/api/credentials/bep-abonnes'],
    ['PUT', '/api/credentials/bep-abonnes'],
    ['DELETE', '/api/credentials/bep-abonnes'],
    ['GET', '/api/account/email'],
    ['POST', '/api/account/email'],
    ['POST', '/api/account/email/resend'],
  ] as const;

  for (const [method, path] of protegees) {
    it(`refuse ${method} ${path} sans session`, async () => {
      const response = await call(method, path, { body: {} });
      expect(response.status).toBe(401);
      // Et surtout : rien n'a été lu ni écrit en base.
      expect(executed).toHaveLength(0);
    });
  }
});

describe('« qui suis-je ? »', () => {
  it('renouvelle la session à chaque ouverture : les 30 jours repartent', async () => {
    const response = await call('GET', '/api/me', { session: 'moi' });
    expect(await response.json()).toEqual({ user: 'moi' });
    expect(response.headers.get('Set-Cookie')).toMatch(/^session=moi\.\d+\..+Max-Age=2592000/);
  });

  it('ne remet AUCUN jeton lisible à une page qui ne prouve pas de clé', async () => {
    const response = await call('GET', '/api/me', { session: 'moi' });
    expect(response.headers.get('X-Session-Token')).toBeNull();
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('X-Session-Token');
  });
});

/**
 * LE JETON DE PAGE EST LIÉ À L'APPAREIL. Ces tests jouent le rôle du voleur :
 * un jeton copié, une preuve rejouée, un jeton lié glissé dans un cookie.
 */
describe('jeton lié à la clé d’appareil', () => {
  const API = 'https://api.invalid';

  async function appareil(): Promise<CryptoKeyPair> {
    return (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
  }

  const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  async function preuve(
    pair: CryptoKeyPair,
    method: string,
    path: string,
    time = Date.now(),
  ): Promise<Record<string, string>> {
    const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.privateKey,
      new TextEncoder().encode(`${method} ${path} ${time}`),
    );
    return {
      'X-Session-Key': b64url(new TextEncoder().encode(JSON.stringify({ kty, crv, x, y }))),
      'X-Session-Time': String(time),
      'X-Session-Proof': b64url(new Uint8Array(signature)),
    };
  }

  async function me(headers: Record<string, string>): Promise<Response> {
    return worker.fetch(
      new Request(`${API}/api/me`, { headers: { Origin: ORIGIN, ...headers } }),
      ENV,
    );
  }

  /** Une page connectée par cookie reçoit son jeton lié en prouvant sa clé. */
  async function jetonLie(pair: CryptoKeyPair): Promise<string> {
    const cookie = sessionCookie(await issueSession('moi', SECRET, Date.now()));
    const response = await me({ Cookie: cookie, ...(await preuve(pair, 'GET', '/api/me')) });
    const token = response.headers.get('X-Session-Token');
    expect(token).not.toBeNull();
    return token!;
  }

  it('ouvre la session avec le jeton ET la preuve de la clé, sans cookie (Brave)', async () => {
    const pair = await appareil();
    const token = await jetonLie(pair);
    const response = await me({
      Authorization: `Bearer ${token}`,
      ...(await preuve(pair, 'GET', '/api/me')),
    });
    expect(await response.json()).toEqual({ user: 'moi' });
  });

  it('refuse le jeton volé, copié sans la clé', async () => {
    const token = await jetonLie(await appareil());
    expect(await (await me({ Authorization: `Bearer ${token}` })).json()).toEqual({ user: null });
  });

  it('refuse le jeton volé présenté avec la clé du voleur', async () => {
    const token = await jetonLie(await appareil());
    const voleur = await appareil();
    const response = await me({
      Authorization: `Bearer ${token}`,
      ...(await preuve(voleur, 'GET', '/api/me')),
    });
    expect(await response.json()).toEqual({ user: null });
  });

  it('refuse une preuve rejouée sur un autre chemin', async () => {
    const pair = await appareil();
    const token = await jetonLie(pair);
    const response = await me({
      Authorization: `Bearer ${token}`,
      ...(await preuve(pair, 'GET', '/api/documents')),
    });
    expect(await response.json()).toEqual({ user: null });
  });

  it('refuse une preuve périmée', async () => {
    const pair = await appareil();
    const token = await jetonLie(pair);
    const response = await me({
      Authorization: `Bearer ${token}`,
      ...(await preuve(pair, 'GET', '/api/me', Date.now() - 10 * 60_000)),
    });
    expect(await response.json()).toEqual({ user: null });
  });

  it('refuse un jeton lié glissé dans un cookie, qui échapperait à la preuve', async () => {
    const token = await jetonLie(await appareil());
    expect(await (await me({ Cookie: `session=${token}` })).json()).toEqual({ user: null });
  });

  it('ne pose aucun cookie à un visiteur', async () => {
    const response = await call('GET', '/api/me');
    expect(await response.json()).toEqual({ user: null });
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('accès aux sources payantes', () => {
  it('refuse une source qui n’est pas dans la liste fermée', async () => {
    // Sans cette liste, n'importe quel identifiant écrirait une ligne — y
    // compris pour une source qui n'existe pas.
    const response = await call('GET', '/api/credentials/source-inventee', { session: 'moi' });
    expect(response.status).toBe(404);
    expect(executed).toHaveLength(0);
  });

  it('ne rend jamais le secret, seulement l’identifiant', async () => {
    rows = [{ login: 'abonne42' }];
    const response = await call('GET', '/api/credentials/bep-abonnes', { session: 'moi' });
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual({ configured: true, login: 'abonne42', available: true });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('dit « non configuré » plutôt que d’inventer', async () => {
    rows = [];
    const body = (await (
      await call('GET', '/api/credentials/bep-abonnes', { session: 'moi' })
    ).json()) as Record<string, unknown>;
    expect(body['configured']).toBe(false);
    expect(body['login']).toBeNull();
  });

  /**
   * SANS CLÉ, ON REFUSE D'ÉCRIRE. Ranger un secret qu'on ne saurait pas
   * rechiffrer reviendrait à le poser en clair.
   */
  it('refuse d’enregistrer quand l’installation n’a pas de clé', async () => {
    const sansCle = { ...ENV, CREDENTIALS_KEY: '' } as typeof ENV;
    const response = await worker.fetch(
      new Request('https://api.invalid/api/credentials/bep-abonnes', {
        method: 'PUT',
        headers: {
          Origin: ORIGIN,
          'Content-Type': 'application/json',
          Cookie: sessionCookie(await issueSession('moi', SECRET, Date.now())),
        },
        body: JSON.stringify({ login: 'abonne42', password: 'motdepasse' }),
      }),
      sansCle,
    );
    expect(response.status).toBe(501);
    expect(executed).toHaveLength(0);
  });

  it('exige identifiant ET mot de passe', async () => {
    const response = await call('PUT', '/api/credentials/bep-abonnes', {
      session: 'moi',
      body: { login: 'abonne42', password: '' },
    });
    expect(response.status).toBe(400);
    expect(executed).toHaveLength(0);
  });

  it('écrit un secret CHIFFRÉ, jamais la valeur en clair', async () => {
    const response = await call('PUT', '/api/credentials/bep-abonnes', {
      session: 'moi',
      body: { login: 'abonne42', password: MOT_DE_PASSE_TEMOIN },
    });
    expect(response.status).toBe(200);

    const ecriture = executed.find((one) => one.sql.includes('INSERT INTO source_credentials'));
    expect(ecriture).toBeDefined();
    const args = ecriture?.args ?? [];
    expect(args).toContain('abonne42');
    expect(JSON.stringify(args)).not.toContain(MOT_DE_PASSE_TEMOIN);
  });

  it('retire l’accès sur demande', async () => {
    const response = await call('DELETE', '/api/credentials/bep-abonnes', { session: 'moi' });
    expect(response.status).toBe(200);
    expect(executed.some((one) => one.sql.includes('DELETE FROM source_credentials'))).toBe(true);
  });
});

describe('adresse du compte', () => {
  it('rend l’adresse et son état de confirmation', async () => {
    rows = [{ email: 'moi@exemple.invalid', email_verified: 1 }];
    const body = (await (
      await call('GET', '/api/account/email', { session: 'moi' })
    ).json()) as Record<string, unknown>;
    expect(body).toEqual({ email: 'moi@exemple.invalid', verified: true });
  });

  it('ne prétend pas confirmée une adresse qui ne l’est pas', async () => {
    rows = [{ email: 'moi@exemple.invalid', email_verified: 0 }];
    const body = (await (
      await call('GET', '/api/account/email', { session: 'moi' })
    ).json()) as Record<string, unknown>;
    expect(body['verified']).toBe(false);
  });

  /**
   * RENVOYER LE LIEN N'OUVRE RIEN : rien n'est modifié, et le message ne peut
   * partir que vers l'adresse DÉJÀ en base. Sur un compte déjà confirmé, il
   * n'a rien à faire — et surtout pas à créer un nouveau jeton.
   */
  it('ne recrée pas de jeton pour une adresse déjà confirmée', async () => {
    rows = [{ email: 'moi@exemple.invalid', email_verified: 1 }];
    const body = (await (
      await call('POST', '/api/account/email/resend', { session: 'moi' })
    ).json()) as Record<string, unknown>;

    expect(body['alreadyVerified']).toBe(true);
    expect(executed.some((one) => one.sql.includes('INSERT INTO email_verifications'))).toBe(false);
  });

  it('refuse de renvoyer quand aucune adresse n’est enregistrée', async () => {
    rows = [{ email: null, email_verified: 0 }];
    const response = await call('POST', '/api/account/email/resend', { session: 'moi' });
    expect(response.status).toBe(400);
  });
});

/**
 * ENTRER AVEC GOOGLE. La vérification cryptographique du jeton est éprouvée
 * ailleurs, avec de vraies clés RSA ; ici on vérifie ce que la route FAIT de
 * son verdict — et surtout qu'elle ne fabrique pas un second compte à
 * quelqu'un qui en a déjà un.
 */
describe('connexion Google', () => {
  const IDENTITE = { sub: 'sub-google-1', email: 'quelquun@example.invalid', name: 'Quelqu’un' };
  const sql = (): string => executed.map((one) => one.sql).join(' | ');

  beforeEach(() => {
    identiteGoogle = { ...IDENTITE };
  });

  const ENV_GOOGLE = {
    ...ENV,
    GOOGLE_CLIENT_ID: 'exemple.apps.googleusercontent.com',
  } as unknown as Parameters<typeof worker.fetch>[1];

  const appeler = async (credential = 'jeton'): Promise<Response> =>
    await worker.fetch(
      new Request('https://api.invalid/api/auth/google', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      }),
      ENV_GOOGLE,
    );

  it('ouvre la session d’un compte déjà rattaché, sans rien réécrire', async () => {
    rows = [{ id: 'utilisateur-1', google_sub: 'sub-google-1' }];
    const response = await appeler();

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('session=');
    expect(sql()).not.toContain('INSERT INTO users');
    expect(sql()).not.toContain('UPDATE users SET google_sub');
  });

  /**
   * LE CAS QUI COMPTE. Sans ce rattachement, quelqu'un inscrit par mot de passe
   * qui cliquerait un jour « continuer avec Google » se retrouverait dans un
   * compte NEUF : favoris, dossier et historique envolés, sans un mot
   * d'explication.
   */
  it('rattache le compte existant qui porte la même adresse, au lieu d’en créer un', async () => {
    rows = [{ id: 'utilisateur-1', google_sub: null }];
    const response = await appeler();

    expect(response.status).toBe(200);
    expect(sql()).toContain('UPDATE users SET google_sub');
    expect(sql()).not.toContain('INSERT INTO users');
    // L'adresse est attestée par Google : un compte qui attendait encore son
    // courriel de confirmation n'a plus rien à prouver.
    expect(sql()).toContain('email_verified = 1');
  });

  it('crée un compte quand personne ne correspond, avec l’adresse déjà vérifiée', async () => {
    rows = [];
    const response = await appeler();

    expect(response.status).toBe(200);
    const creation = executed.find((one) => one.sql.includes('INSERT INTO users'));
    expect(creation).toBeDefined();
    // Le mot de passe reste NUL : une empreinte inventée pour remplir la
    // colonne serait un mot de passe que personne ne connaît, et que la
    // vérification accepterait peut-être.
    expect(creation?.sql).toContain('password_hash');
    expect(creation?.sql).toContain('NULL, NULL');
    // Et l'adresse de transfert des alertes est tirée à la création (§6).
    expect(creation?.sql).toContain('randomblob(9)');
  });

  it('refuse un jeton que la vérification rejette, sans toucher aux comptes', async () => {
    identiteGoogle = null;
    const response = await appeler();

    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(sql()).not.toContain('INSERT INTO users');
    expect(sql()).not.toContain('UPDATE users');
  });

  it('refuse une requête sans jeton', async () => {
    const response = await worker.fetch(
      new Request('https://api.invalid/api/auth/google', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      ENV_GOOGLE,
    );
    expect(response.status).toBe(400);
  });

  it('le dit franchement quand la connexion Google n’est pas configurée (§17)', async () => {
    // Sans identifiant d'application, un `aud` ne se compare à rien : mieux
    // vaut refuser que d'ouvrir une session sans savoir pour qui.
    const response = await worker.fetch(
      new Request('https://api.invalid/api/auth/google', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'jeton' }),
      }),
      ENV,
    );
    expect(response.status).toBe(501);
    expect(sql()).not.toContain('INSERT INTO users');
  });
});
