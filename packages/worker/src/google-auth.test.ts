/**
 * Ce module ouvre une session au nom de quelqu'un : ses tests sont donc des
 * tests de sécurité, pas de comportement.
 *
 * ON SIGNE POUR DE VRAI. Les jetons de ces scénarios sont forgés avec une VRAIE
 * paire de clés RSA, et la vérification passe par WebCrypto. Un double qui
 * répondrait « signature correcte » ne prouverait rien du tout — c'est
 * précisément ce qu'on veut mettre à l'épreuve.
 *
 * Aucun accès réseau : la liste des clés de Google est injectée (§59).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { resetGoogleKeyCache, verifyGoogleToken } from './google-auth.js';

const CLIENT_ID = '1234567890-exemple.apps.googleusercontent.com';
const NOW = Date.parse('2026-09-09T10:00:00.000Z');

/**
 * `btoa` ne parle que le latin-1 : une chaîne est donc encodée en UTF-8
 * d'abord, comme le fait un vrai jeton — sans quoi le moindre nom accentué
 * ferait échouer la fabrication du jeton plutôt que sa vérification.
 */
function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface Signer {
  readonly kid: string;
  readonly jwk: Record<string, unknown>;
  sign(payload: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

/** Une paire de clés RSA et de quoi signer avec — comme le ferait Google. */
async function makeSigner(kid: string): Promise<Signer> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Record<
    string,
    unknown
  >;
  return {
    kid,
    jwk: { kty: 'RSA', n: exported['n'], e: exported['e'], alg: 'RS256', use: 'sig', kid },
    async sign(payload, header) {
      const head = base64Url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT', ...header }));
      const body = base64Url(JSON.stringify(payload));
      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        pair.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${base64Url(new Uint8Array(signature))}`;
    },
  };
}

/** Un `fetch` qui sert la liste de clés donnée, et compte les appels. */
function keyServer(keys: readonly Record<string, unknown>[]): {
  fetch: typeof fetch;
  calls: () => number;
} {
  let calls = 0;
  const impl = ((): Promise<Response> => {
    calls += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { 'cache-control': 'public, max-age=3600' },
      }),
    );
  }) as unknown as typeof fetch;
  return { fetch: impl, calls: () => calls };
}

const claims = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '104729273618273618273',
  email: 'quelquun@example.invalid',
  email_verified: true,
  name: 'Quelqu’un',
  iat: Math.floor(NOW / 1000) - 30,
  exp: Math.floor(NOW / 1000) + 3600,
  ...extra,
});

let google: Signer;
let intrus: Signer;

beforeEach(async () => {
  resetGoogleKeyCache();
  google ??= await makeSigner('cle-google-1');
  intrus ??= await makeSigner('cle-intrus');
});

describe('verifyGoogleToken — ce qu’on accepte', () => {
  it('reconnaît un jeton correctement signé et en retient le strict nécessaire', async () => {
    const server = keyServer([google.jwk]);
    const identity = await verifyGoogleToken(
      await google.sign(claims()),
      CLIENT_ID,
      NOW,
      server.fetch,
    );

    expect(identity).toEqual({
      sub: '104729273618273618273',
      email: 'quelquun@example.invalid',
      name: 'Quelqu’un',
    });
  });

  it('normalise l’adresse, que Google rend parfois en capitales', async () => {
    const server = keyServer([google.jwk]);
    const identity = await verifyGoogleToken(
      await google.sign(claims({ email: '  QuelquUn@Example.Invalid ' })),
      CLIENT_ID,
      NOW,
      server.fetch,
    );
    expect(identity?.email).toBe('quelquun@example.invalid');
  });

  it('accepte l’autre forme d’émetteur, sans le préfixe https', async () => {
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims({ iss: 'accounts.google.com' }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).not.toBeNull();
  });

  it('tolère une horloge qui avance de quelques secondes', async () => {
    const server = keyServer([google.jwk]);
    // Jeton « émis dans dix secondes » : une dérive d'horloge, pas une fraude.
    const token = await google.sign(claims({ iat: Math.floor(NOW / 1000) + 10 }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).not.toBeNull();
  });
});

describe('verifyGoogleToken — ce qu’on refuse', () => {
  it('REFUSE un jeton signé par quelqu’un d’autre', async () => {
    // Le cœur du sujet : sans vérification de signature, tout le reste est
    // décoratif — la charge utile est en clair dans le jeton.
    const server = keyServer([google.jwk]);
    const forge = await intrus.sign(claims(), { kid: 'cle-google-1' });
    expect(await verifyGoogleToken(forge, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  /**
   * LA VÉRIFICATION QU'ON OUBLIE, et la plus traître : ce jeton est
   * parfaitement signé par Google. Il a simplement été émis pour une AUTRE
   * application. Sans ce contrôle, n'importe quel site tiers utilisant Google
   * pourrait rejouer les jetons de ses propres visiteurs pour entrer ici.
   */
  it('REFUSE un jeton authentique émis pour une autre application', async () => {
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims({ aud: 'un-autre-site.apps.googleusercontent.com' }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE quand nous n’avons pas d’identifiant d’application', async () => {
    // Un `aud` qu'on ne compare à rien ne protège rien : mieux vaut refuser
    // toute connexion que d'en ouvrir une sans savoir pour qui (§17).
    const server = keyServer([google.jwk]);
    expect(await verifyGoogleToken(await google.sign(claims()), '', NOW, server.fetch)).toBeNull();
  });

  it('REFUSE un émetteur qui n’est pas Google', async () => {
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims({ iss: 'https://accounts.google.com.example.invalid' }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE un jeton périmé', async () => {
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims({ exp: Math.floor(NOW / 1000) - 120 }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE une adresse que Google ne dit pas vérifiée', async () => {
    // C'est sur elle qu'on rattache un compte existant : la croire sur parole
    // livrerait ce compte à qui déclare l'adresse.
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims({ email_verified: false }));
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE un jeton sans signature (« alg: none »)', async () => {
    // La faille classique des JWT : accepter l'algorithme que le jeton
    // s'attribue lui-même.
    const server = keyServer([google.jwk]);
    const head = base64Url(JSON.stringify({ alg: 'none', kid: 'cle-google-1', typ: 'JWT' }));
    const body = base64Url(JSON.stringify(claims()));
    expect(await verifyGoogleToken(`${head}.${body}.`, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE un jeton qui demande un algorithme à clé partagée', async () => {
    // `HS256` inviterait à vérifier avec une clé PUBLIQUE prise pour un secret.
    const server = keyServer([google.jwk]);
    const token = await google.sign(claims(), { alg: 'HS256' });
    expect(await verifyGoogleToken(token, CLIENT_ID, NOW, server.fetch)).toBeNull();
  });

  it('REFUSE ce qui n’a pas la forme d’un jeton', async () => {
    const server = keyServer([google.jwk]);
    for (const bad of ['', 'pas-un-jeton', 'a.b', 'a.b.c.d', '@@@.@@@.@@@']) {
      expect(await verifyGoogleToken(bad, CLIENT_ID, NOW, server.fetch), bad).toBeNull();
    }
  });

  it('ne s’effondre pas si les clés de Google sont injoignables', async () => {
    const failing = (() =>
      Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch;
    expect(
      await verifyGoogleToken(await google.sign(claims()), CLIENT_ID, NOW, failing),
    ).toBeNull();
  });
});

describe('verifyGoogleToken — les clés de Google', () => {
  it('les garde d’un jeton à l’autre plutôt que de les redemander', async () => {
    const server = keyServer([google.jwk]);
    await verifyGoogleToken(await google.sign(claims()), CLIENT_ID, NOW, server.fetch);
    await verifyGoogleToken(await google.sign(claims()), CLIENT_ID, NOW, server.fetch);
    expect(server.calls()).toBe(1);
  });

  /**
   * Google fait tourner ses clés. Sans ce rattrapage, chaque rotation couperait
   * les connexions jusqu'à l'expiration du cache — jusqu'à une heure de panne
   * pour un événement parfaitement normal.
   */
  it('redemande la liste quand une clé inconnue se présente', async () => {
    const server = keyServer([]);
    await verifyGoogleToken(await google.sign(claims()), CLIENT_ID, NOW, server.fetch);
    expect(server.calls()).toBe(2);
  });
});
