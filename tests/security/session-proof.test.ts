/**
 * La preuve signée PAR LA PAGE doit vérifier CÔTÉ API. Les deux côtés
 * composent le même message chacun de leur côté : un espace ou une casse de
 * différence, et plus personne ne resterait connecté — sans qu'aucun test
 * d'un seul côté ne le voie. On signe donc avec le vrai code de la page.
 */

import { describe, expect, it } from 'vitest';
import { provenKey } from '../../packages/worker/src/session-proof.js';
import { signProof } from '../../frontend/src/api/session-key.js';

async function appareil(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
}

function requete(method: string, url: string, headers: Record<string, string>): Request {
  return new Request(url, { method, headers });
}

describe('preuve de la page, vérifiée par l’API', () => {
  const URL_API = 'https://api.invalid/api/listings?sort=recent&limit=50';

  it('vérifie, et rend la même empreinte pour la même clé', async () => {
    const pair = await appareil();
    const now = Date.now();
    const a = await provenKey(
      requete('GET', URL_API, await signProof(pair, 'get', URL_API, String(now))),
      now,
    );
    const b = await provenKey(
      requete('POST', URL_API, await signProof(pair, 'POST', URL_API, String(now))),
      now,
    );
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(b).toBe(a);
  });

  it('refuse la preuve d’une autre méthode ou d’une autre requête', async () => {
    const pair = await appareil();
    const now = Date.now();
    const headers = await signProof(pair, 'GET', URL_API, String(now));
    expect(await provenKey(requete('DELETE', URL_API, headers), now)).toBeNull();
    expect(
      await provenKey(requete('GET', 'https://api.invalid/api/listings?sort=price', headers), now),
    ).toBeNull();
  });

  it('refuse une clé publique substituée à celle qui a signé', async () => {
    const now = Date.now();
    const headers = await signProof(await appareil(), 'GET', URL_API, String(now));
    const autre = await signProof(await appareil(), 'GET', URL_API, String(now));
    const melange = { ...headers, 'X-Session-Key': autre['X-Session-Key']! };
    expect(await provenKey(requete('GET', URL_API, melange), now)).toBeNull();
  });
});
