/**
 * CE QUI COMPTE ICI : les deux modules qui se connectent au bulletin abonné
 * tapent sur LES MÊMES adresses. Chacun portait sa copie ; une adresse
 * corrigée d'un seul côté aurait laissé l'autre frapper une page morte, sur un
 * abonnement payé dont l'accès peut être retiré.
 */

import { describe, expect, it, vi } from 'vitest';
import { sendBepRequest } from '../../contact/bep-request.js';
import { bepAbonnesScraper } from './index.js';
import { BEP_INDEX_URL, BEP_LOGIN_URL, collectCookies, cookieHeader } from './session.js';

const CREDENTIALS = { user: 'abonne', password: 'motdepasse' }; // secret-scan-ignore

/** Une réponse qui pose des cookies, comme le fait le bulletin. */
const reponse = (body: string, cookies: readonly string[] = []): Response =>
  new Response(body, {
    headers: [
      ['content-type', 'text/html'],
      ...cookies.map((one) => ['set-cookie', one] as [string, string]),
    ],
  });

describe('collectCookies', () => {
  it('ne garde que la paire, sans les attributs', () => {
    const pot = new Map<string, string>();
    collectCookies(reponse('', ['PHPSESSID=abc; path=/; HttpOnly']).headers, pot);
    expect(cookieHeader(pot)).toBe('PHPSESSID=abc');
  });

  it('remplace un cookie réémis au lieu de l’ajouter', () => {
    // Le site renvoie son cookie de session à chaque réponse : concaténer
    // aurait envoyé les deux valeurs, dont une périmée.
    const pot = new Map<string, string>();
    collectCookies(reponse('', ['PHPSESSID=ancien']).headers, pot);
    collectCookies(reponse('', ['PHPSESSID=nouveau', 'lang=fr']).headers, pot);
    expect(cookieHeader(pot)).toBe('PHPSESSID=nouveau; lang=fr');
  });

  it('écarte ce qui n’est pas une paire', () => {
    const pot = new Map<string, string>();
    collectCookies(reponse('', ['pas-une-paire; path=/']).headers, pot);
    expect(cookieHeader(pot)).toBe('');
  });
});

describe('les deux accès au bulletin visent les mêmes pages', () => {
  it('la demande d’informations n’en connaît pas d’autres', async () => {
    const vues: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      vues.push(String(url));
      return reponse('connecté');
    });
    await sendBepRequest('641119', {
      credentials: CREDENTIALS,
      userAgent: 'MaiounBot/0.1 (+https://exemple.invalid)',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(new Set(vues)).toEqual(new Set([BEP_INDEX_URL, BEP_LOGIN_URL]));
  });

  it('la collecte non plus', async () => {
    const vues: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      vues.push(String(url));
      return reponse('connecté');
    });
    vi.stubGlobal('fetch', fetchImpl);
    try {
      await bepAbonnesScraper.run({
        credentials: CREDENTIALS,
        log: () => {},
      } as never);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(new Set(vues)).toEqual(new Set([BEP_INDEX_URL, BEP_LOGIN_URL]));
  });
});
