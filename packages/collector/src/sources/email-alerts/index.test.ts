/**
 * Une source d'alertes e-mail qui ne lit rien doit le dire : sans IMAP, ou
 * quand la connexion échoue, le passage porte un avertissement. Aucun réseau.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';

const fetchAlertEmails = vi.hoisted(() => vi.fn());
vi.mock('../../core/email-import.js', () => ({ fetchAlertEmails }));

import { NOT_CONFIGURED_WARNING, emailAlertsScraper } from './index.js';

const contexte = (): ScrapeContext =>
  ({
    mode: 'live',
    fetch: () => Promise.reject(new Error('aucune requête attendue')),
    isKnown: () => false,
    log: () => undefined,
    shouldStop: () => false,
  }) as unknown as ScrapeContext;

afterEach(() => {
  vi.unstubAllEnvs();
  fetchAlertEmails.mockReset();
});

describe('emailAlertsScraper', () => {
  it('avertit quand IMAP n’est pas configuré', async () => {
    vi.stubEnv('IMAP_USER', '');
    vi.stubEnv('IMAP_APP_PASSWORD', '');
    const result = await emailAlertsScraper.run(contexte());
    expect(result.listings).toEqual([]);
    expect(result.warnings).toEqual([NOT_CONFIGURED_WARNING]);
    expect(fetchAlertEmails).not.toHaveBeenCalled();
  });

  it('remonte un échec de connexion IMAP en avertissement', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockImplementation(
      (options: { log: (event: string, fields?: Record<string, unknown>) => void }) => {
        options.log('email.connect_failed', { error: 'Invalid credentials' });
        return Promise.resolve([]);
      },
    );
    const result = await emailAlertsScraper.run(contexte());
    expect(result.warnings).toEqual(['IMAP : connexion refusée ou impossible']);
  });

  it('reste sans avertissement quand la boîte est lue normalement', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue([]);
    const result = await emailAlertsScraper.run(contexte());
    expect(result.warnings).toEqual([]);
  });
});
