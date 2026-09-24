/**
 * Le captcha décide qui passe : ses cas limites valent d'être fixés.
 */

import { describe, expect, it, vi } from 'vitest';
import { captchaConfigured, verifyCaptcha } from './turnstile.js';

const reponse = (corps: unknown): Response =>
  new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } });

describe('captchaConfigured', () => {
  it('n’est en service qu’avec un secret', () => {
    expect(captchaConfigured({ TURNSTILE_SECRET: 'x' })).toBe(true);
    expect(captchaConfigured({ TURNSTILE_SECRET: '' })).toBe(false);
    expect(captchaConfigured({})).toBe(false);
  });
});

describe('verifyCaptcha', () => {
  it('laisse passer quand il n’est pas configuré, et le dit', async () => {
    const appel = vi.fn();
    const verdict = await verifyCaptcha({}, 'peu importe', null, appel as unknown as typeof fetch);
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBe('non configuré');
    // Rien n'est demandé à Cloudflare : il n'y a pas de secret à présenter.
    expect(appel).not.toHaveBeenCalled();
  });

  it('refuse un jeton absent quand il EST configuré', async () => {
    const verdict = await verifyCaptcha({ TURNSTILE_SECRET: 's' }, undefined, null);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('jeton absent');
  });

  it('accepte ce que Cloudflare confirme', async () => {
    const appel = vi.fn().mockResolvedValue(reponse({ success: true }));
    const verdict = await verifyCaptcha(
      { TURNSTILE_SECRET: 's' },
      'jeton',
      '203.0.113.7',
      appel as unknown as typeof fetch,
    );
    expect(verdict.ok).toBe(true);
    const corps = (appel.mock.calls[0]?.[1] as { body: FormData }).body;
    expect(corps.get('secret')).toBe('s');
    expect(corps.get('response')).toBe('jeton');
    expect(corps.get('remoteip')).toBe('203.0.113.7');
  });

  it('refuse ce que Cloudflare refuse, en gardant ses codes pour le journal', async () => {
    const appel = vi
      .fn()
      .mockResolvedValue(reponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    const verdict = await verifyCaptcha(
      { TURNSTILE_SECRET: 's' },
      'rejoué',
      null,
      appel as unknown as typeof fetch,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('timeout-or-duplicate');
  });

  /**
   * UNE PANNE DE CLOUDFLARE NE DOIT PAS FERMER LA PORTE : le captcha protège
   * d'un abus, il ne garde pas un coffre. Refuser toute connexion parce qu'un
   * service tiers ne répond plus serait une panne de plus, la nôtre.
   */
  it('laisse passer si le service est injoignable', async () => {
    const appel = vi.fn().mockRejectedValue(new Error('réseau'));
    const verdict = await verifyCaptcha(
      { TURNSTILE_SECRET: 's' },
      'jeton',
      null,
      appel as unknown as typeof fetch,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain('vérification impossible');
  });
});
