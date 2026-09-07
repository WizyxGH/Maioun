import { describe, expect, it, vi } from 'vitest';
import { composeAlertEmail, sendEmailAlert } from './email-alerts.js';
import { silentLogger } from '../core/logger.js';
import type { NotifiableListing } from '../db/repository.js';

const listing = (over: Partial<NotifiableListing> = {}): NotifiableListing => ({
  id: 'orpi:1',
  title: 'Studio meublé',
  price: 690,
  area: 32,
  rooms: 1,
  city: 'nice',
  postalCode: '06000',
  address: null,
  district: 'Libération',
  availableAt: null,
  actionPriority: 80,
  url: 'https://exemple.invalid/1',
  photoUrls: [],
  sourceId: 'orpi',
  phone: null,
  ...over,
});

const SITE = 'https://exemple.invalid/app/';

describe('composition de l’alerte e-mail', () => {
  it('réunit les annonces en UN message, pas un par annonce', () => {
    // Huit e-mails en dix minutes, c'est du courrier indésirable — et c'est
    // ainsi qu'on perd le canal sans que rien ne le dise.
    const listings = [listing({ id: 'a' }), listing({ id: 'b' }), listing({ id: 'c' })];
    const { subject, text } = composeAlertEmail({
      listings,
      siteUrl: SITE,
      heading: 'Nouvelles annonces',
    });
    expect(subject).toBe('Nouvelles annonces : 3 annonces');
    expect(text).toContain('https://exemple.invalid/app/listing/a');
    expect(text).toContain('https://exemple.invalid/app/listing/c');
  });

  it('nomme l’annonce quand il n’y en a qu’une', () => {
    const { subject } = composeAlertEmail({
      listings: [listing({ title: 'Deux pièces Cimiez' })],
      siteUrl: SITE,
      heading: 'Nouvelles annonces',
    });
    expect(subject).toBe('Nouvelles annonces : Deux pièces Cimiez');
  });

  it('détaille les huit premières et compte le reste', () => {
    const listings = Array.from({ length: 11 }, (_, index) => listing({ id: `l${index}` }));
    const { text } = composeAlertEmail({ listings, siteUrl: SITE, heading: 'Nouvelles annonces' });
    expect(text).toContain('/listing/l7');
    expect(text).not.toContain('/listing/l8');
    expect(text).toContain('… et 3 autres annonces.');
  });

  it('n’invente pas les champs absents (§17)', () => {
    // Une surface inconnue ne vaut pas « 0 m² » : elle ne s'écrit pas.
    const { text } = composeAlertEmail({
      listings: [listing({ area: null, rooms: null, phone: null, district: null, city: null })],
      siteUrl: SITE,
      heading: 'Nouvelles annonces',
    });
    expect(text).toContain('690 €');
    expect(text).not.toContain('m²');
    expect(text).not.toContain('📍');
    expect(text).not.toContain('☎');
  });

  it('dit toujours où couper les alertes', () => {
    // Sans porte de sortie, le réflexe est « signaler comme indésirable » — et
    // cela coûte le canal entier, pour tous les messages suivants.
    const { text } = composeAlertEmail({
      listings: [listing()],
      siteUrl: SITE,
      heading: 'Nouvelles annonces',
    });
    expect(text).toContain('Paramètres → Notifications');
  });
});

describe('envoi de l’alerte e-mail', () => {
  const deps = {
    to: 'moi@exemple.invalid',
    listings: [listing()],
    siteUrl: SITE,
    logger: silentLogger,
    heading: 'Nouvelles annonces',
  };

  it('ne prétend rien avoir envoyé quand le canal n’est pas configuré', async () => {
    const report = await sendEmailAlert({ ...deps, mailer: {} });
    expect(report.unconfigured).toBe(true);
    expect(report.notifiedIds).toEqual([]);
  });

  it('NE MARQUE RIEN quand l’envoi échoue', async () => {
    // Rendre les identifiants sur un échec ferait taire ces annonces à jamais,
    // sans que personne ne les ait reçues.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const report = await sendEmailAlert({
      ...deps,
      mailer: { EMAIL_API_KEY: 'clé', EMAIL_FROM: 'Moi <moi@exemple.invalid>' },
    });
    expect(report.notifiedIds).toEqual([]);
    expect(report.unconfigured).toBe(false);
    vi.restoreAllMocks();
  });

  it('rend les identifiants portés quand le message est parti', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const report = await sendEmailAlert({
      ...deps,
      mailer: { EMAIL_API_KEY: 'clé', EMAIL_FROM: 'Moi <moi@exemple.invalid>' },
    });
    expect(report.notifiedIds).toEqual(['orpi:1']);
    vi.restoreAllMocks();
  });
});
