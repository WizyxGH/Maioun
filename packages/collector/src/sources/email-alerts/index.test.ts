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

  it('nomme les portails inconnus plutôt que de jeter leurs annonces en silence', async () => {
    /**
     * Un digest d'un expéditeur suivi peut pointer vers un hôte que la table
     * des portails ignore. Ces annonces disparaissaient sans compteur ni
     * journal : personne ne pouvait savoir qu'il y avait un trou, ni où.
     */
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    const journal: { event: string; fields?: Record<string, unknown> }[] = [];
    const annonce = (href: string): string =>
      `<table><tbody><tr><td><a href="${href}">Appartement • 2 pièces • 41 m² — Nice (06000) 780 €</a></td></tr></tbody></table>`;
    fetchAlertEmails.mockResolvedValue({
      emails: [
        { body: annonce('https://www.exemple-portail.invalid/a'), recipients: [] },
        { body: annonce('https://www.exemple-portail.invalid/b'), recipients: [] },
      ],
      bookmark: null,
      fullRead: false,
    });

    const context = {
      ...contexte(),
      log: (event: string, fields?: Record<string, unknown>) => journal.push({ event, fields }),
    } as unknown as ScrapeContext;
    const result = await emailAlertsScraper.run(context);

    expect(result.warnings).toEqual([
      'Liens d’annonce sans portail reconnu : www.exemple-portail.invalid (2)',
    ]);
    expect(journal.find((l) => l.event === 'email.unknown_portal')?.fields).toEqual({
      hosts: { 'www.exemple-portail.invalid': 2 },
    });
    expect(journal.find((l) => l.event === 'email.parsed')?.fields).toMatchObject({
      unknownLinks: 2,
    });
  });

  /**
   * L'AGENCE NOMMÉE PAR LE MESSAGE VOYAGE DANS LE REPÈRE, et c'est par là que
   * le cœur saura quel catalogue relire en priorité. Sur vingt et un jours de
   * boîte, vingt-trois messages sur deux cent soixante-quatre nomment leur
   * agence : le silence est donc le cas ORDINAIRE, et il doit rester silencieux.
   */
  const digest = (bloc: string): string =>
    `<table><tbody><tr><td>${bloc}<a href="https://www.seloger.com/annonce/262DQEQC5SVU">` +
    'Appartement • 2 pièces • 41 m² — Nice (06000) 780 €</a></td></tr></tbody></table>';

  it('garde dans son repère l’agence que le message nomme', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue({
      emails: [
        {
          body: digest(
            '<p><b>Immobilière GTI</b> vous propose une nouvelle annonce en partenariat avec SeLoger</p>',
          ),
          recipients: [],
        },
      ],
      bookmark: { uidValidity: '1', lastUid: 9, senders: 'seloger' },
      fullRead: false,
    });

    const memo = JSON.parse((await emailAlertsScraper.run(contexte())).memo ?? 'null') as {
      agencies?: { name: string }[];
    };
    expect(memo.agencies?.map((one) => one.name)).toEqual(['Immobilière GTI']);
  });

  it('n’invente aucune agence quand le message n’en nomme pas', async () => {
    vi.stubEnv('IMAP_USER', 'boite@exemple.invalid');
    vi.stubEnv('IMAP_APP_PASSWORD', 'secret');
    vi.stubEnv('ALERT_ADDRESS_TEMPLATE', '');
    fetchAlertEmails.mockResolvedValue({
      emails: [
        { body: digest('<p>1 nouvelle annonce pourrait vous intéresser</p>'), recipients: [] },
      ],
      bookmark: { uidValidity: '1', lastUid: 9, senders: 'seloger' },
      fullRead: false,
    });

    const result = await emailAlertsScraper.run(contexte());
    expect(result.listings).toHaveLength(1);
    expect(JSON.parse(result.memo ?? 'null')).toEqual({
      uidValidity: '1',
      lastUid: 9,
      senders: 'seloger',
    });
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
