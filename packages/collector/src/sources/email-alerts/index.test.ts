/**
 * Une source d'alertes e-mail qui ne lit rien doit le dire : sans IMAP, ou
 * quand la connexion échoue, le passage porte un avertissement. Aucun réseau.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import type * as EmailImport from '../../core/email-import.js';

const fetchAlertEmails = vi.hoisted(() => vi.fn());
// `parseBookmark` reste le vrai : c'est lui qui relit le repère, et le doubler
// masquerait ce qu'on veut vérifier.
vi.mock('../../core/email-import.js', async () => {
  const actual = await vi.importActual<typeof EmailImport>('../../core/email-import.js');
  return { ...actual, fetchAlertEmails };
});

import { NOT_CONFIGURED_WARNING, emailAlertsScraper } from './index.js';

const contexte = (memo: string | null = null): ScrapeContext =>
  ({
    mode: 'live',
    fetch: () => Promise.reject(new Error('aucune requête attendue')),
    isKnown: () => false,
    memo,
    log: () => undefined,
    shouldStop: () => false,
  }) as unknown as ScrapeContext;

/** Une lecture qui n'a rien trouvé, avec le repère qu'elle rend. */
const lecture = (bookmark: unknown = null): unknown => ({
  emails: [],
  bookmark,
  fullRead: bookmark === null,
});

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
        return Promise.resolve(lecture());
      },
    );
    const result = await emailAlertsScraper.run(contexte());
    expect(result.warnings).toEqual(['IMAP : connexion refusée ou impossible']);
  });

  it('reste sans avertissement quand la boîte est lue normalement', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue(lecture());
    const result = await emailAlertsScraper.run(contexte());
    expect(result.warnings).toEqual([]);
  });

  it('transmet le repère du passage précédent et rend celui du suivant', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    const precedent = { uidValidity: '1', lastUid: 7000, senders: 'seloger' };
    fetchAlertEmails.mockResolvedValue(
      lecture({ uidValidity: '1', lastUid: 7145, senders: 'seloger' }),
    );

    const result = await emailAlertsScraper.run(contexte(JSON.stringify(precedent)));

    expect(fetchAlertEmails).toHaveBeenCalledWith(expect.objectContaining({ bookmark: precedent }));
    expect(JSON.parse(result.memo ?? 'null')).toEqual({
      uidValidity: '1',
      lastUid: 7145,
      senders: 'seloger',
    });
  });

  it('ne rend AUCUN repère quand la lecture n’a rien pu conclure', async () => {
    // Sans repère rendu, le cœur garde le précédent : la fenêtre sera relue,
    // jamais sautée.
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue(lecture(null));
    const result = await emailAlertsScraper.run(
      contexte('{"uidValidity":"1","lastUid":7000,"senders":"x"}'),
    );
    expect(result.memo).toBeUndefined();
  });

  it('un message de service sans annonce ne fait pas passer la source pour cassée', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue({
      emails: [{ body: '<p>Bienvenue sur SeLoger !</p>', recipients: [] }],
      bookmark: null,
      fullRead: false,
    });
    const result = await emailAlertsScraper.run(contexte());
    // `empty` = « rien à voir, source saine » : le cœur ne la marque pas dégradée.
    expect(result.stopReason).toBe('empty');
    expect(result.listings).toEqual([]);
  });
});
