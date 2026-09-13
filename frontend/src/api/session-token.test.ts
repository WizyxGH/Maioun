import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, clearSessionToken } from './session-token.js';

const sent: RequestInit[] = [];

function respond(headers: Record<string, string> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) => {
      sent.push(init);
      return Promise.resolve(new Response('{}', { status: 200, headers }));
    }),
  );
}

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch — la session tient sans cookie tiers', () => {
  it('garde le jeton que l’API remet, et le renvoie ensuite', async () => {
    respond({ 'X-Session-Token': 'moi.123.sig' });
    await apiFetch('https://api.invalid/api/me');
    await apiFetch('https://api.invalid/api/listings');

    expect(new Headers(sent[0]?.headers).get('Authorization')).toBeNull();
    expect(new Headers(sent[1]?.headers).get('Authorization')).toBe('Bearer moi.123.sig');
  });

  it('envoie toujours le cookie aussi', async () => {
    respond();
    await apiFetch('https://api.invalid/api/me');
    expect(sent[0]?.credentials).toBe('include');
  });

  it('remplace le jeton quand l’API le renouvelle', async () => {
    localStorage.setItem('maioun.session', 'ancien');
    respond({ 'X-Session-Token': 'neuf' });
    await apiFetch('https://api.invalid/api/me');
    expect(localStorage.getItem('maioun.session')).toBe('neuf');
  });

  it('n’envoie plus rien après la déconnexion', async () => {
    localStorage.setItem('maioun.session', 'moi.123.sig');
    await clearSessionToken();
    respond();
    await apiFetch('https://api.invalid/api/listings');
    expect(new Headers(sent[0]?.headers).get('Authorization')).toBeNull();
  });
});
