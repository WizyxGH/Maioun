import { describe, expect, it } from 'vitest';
import type { ListingView } from './types.js';
import {
  alertBadgeLabel,
  ALERT_BADGE_CAP,
  diffForNotification,
  isUnreadAlert,
  markAlertRead,
  notificationContentFor,
  readReadAlerts,
  unreadAlertCount,
  type SeenState,
} from './notifications.js';

/** Fabrique une annonce minimale pour les tests de notification. */
function listing(over: {
  id: string;
  matchesCriteria?: boolean;
  price?: number;
  area?: number;
  city?: string;
}): ListingView {
  const field = <T>(value: T) => ({ value, source: 'test', conflicts: [] });
  return {
    id: over.id,
    price: field(over.price ?? 640),
    area: field(over.area ?? 28),
    rooms: field(2),
    propertyType: field('apartment'),
    city: field(over.city ?? 'nice'),
    matchesCriteria: over.matchesCriteria ?? true,
  } as unknown as ListingView;
}

const seed = (ids: string[]): SeenState => ({ initialized: true, ids: new Set(ids) });

/**
 * LES CRITÈRES NE SONT PAS LES FILTRES. Le serveur applique les premiers ; les
 * seconds disent ce qu'on veut voir MAINTENANT — une source décochée, une puce
 * posée, un mot tapé. Signaler ce qu'un filtre cache, c'est sonner pour ce
 * qu'on a demandé à ne pas voir.
 */
describe('diffForNotification face aux filtres de l’écran', () => {
  it('ne signale pas une annonce que la liste ne montrerait pas', () => {
    const result = diffForNotification(
      [listing({ id: 'a' }), listing({ id: 'b' })],
      seed(['a']),
      (one) => one.id !== 'b',
    );
    expect(result.fresh).toHaveLength(0);
  });

  it('signale celles que la liste montrerait', () => {
    const result = diffForNotification(
      [listing({ id: 'a' }), listing({ id: 'b' })],
      seed(['a']),
      () => true,
    );
    expect(result.fresh.map((one) => one.id)).toEqual(['b']);
  });

  /**
   * LE FILTRE TAIT LE BANDEAU, IL N'EFFACE PAS LE SOUVENIR : sans cela, lever
   * un filtre ferait sonner d'un coup tout ce qu'il masquait depuis des jours.
   */
  it('retient quand même ce qu’un filtre a caché', () => {
    const result = diffForNotification(
      [listing({ id: 'a' }), listing({ id: 'b' })],
      seed(['a']),
      (one) => one.id !== 'b',
    );
    expect([...result.nextSeen].sort()).toEqual(['a', 'b']);
  });

  it('montre tout quand aucun prédicat n’est donné', () => {
    const result = diffForNotification([listing({ id: 'b' })], seed(['a']));
    expect(result.fresh.map((one) => one.id)).toEqual(['b']);
  });
});

describe('diffForNotification', () => {
  it('au premier sondage, amorce la mémoire sans rien signaler', () => {
    const state: SeenState = { initialized: false, ids: new Set() };
    const result = diffForNotification([listing({ id: 'a' }), listing({ id: 'b' })], state);

    expect(result.fresh).toHaveLength(0);
    expect([...result.nextSeen].sort()).toEqual(['a', 'b']);
  });

  it('ne signale que les annonces inconnues jusqu’ici', () => {
    const result = diffForNotification(
      [listing({ id: 'a' }), listing({ id: 'b' }), listing({ id: 'c' })],
      seed(['a', 'b']),
    );

    expect(result.fresh.map((l) => l.id)).toEqual(['c']);
    expect([...result.nextSeen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignore les annonces hors critères', () => {
    const result = diffForNotification(
      [listing({ id: 'in' }), listing({ id: 'out', matchesCriteria: false })],
      seed([]),
    );

    expect(result.fresh.map((l) => l.id)).toEqual(['in']);
    // L'annonce hors critères n'entre pas non plus dans la mémoire.
    expect([...result.nextSeen]).toEqual(['in']);
  });

  it('ne renotifie pas une annonce déjà signalée au sondage suivant', () => {
    const first = diffForNotification([listing({ id: 'a' })], seed([]));
    expect(first.fresh.map((l) => l.id)).toEqual(['a']);

    const second = diffForNotification([listing({ id: 'a' })], seed([...first.nextSeen]));
    expect(second.fresh).toHaveLength(0);
  });
});

describe('notificationContentFor', () => {
  it('résume l’annonce en un titre localisé et un corps chiffré', () => {
    const { title, body } = notificationContentFor(
      listing({ id: 'a', city: 'nice', price: 690, area: 25 }),
    );
    expect(title).toContain('Nouvelle annonce');
    expect(title).toContain('Nice');
    expect(body).toContain('690');
    expect(body).toContain('25');
  });
});

describe('alerte lue en ouvrant l’annonce', () => {
  const SEEN_AT = Date.parse('2026-09-14T08:00:00Z');
  const signalee = (id: string): ListingView => ({
    ...listing({ id }),
    notifiedAt: '2026-09-14T09:00:00Z',
  });

  it('une annonce ouverte n’est plus « non lue », même signalée après la visite', () => {
    localStorage.clear();
    const ouverte = signalee('a');
    expect(isUnreadAlert(ouverte, SEEN_AT)).toBe(true);
    const read = markAlertRead('a');
    expect(isUnreadAlert(ouverte, SEEN_AT, read)).toBe(false);
    expect(unreadAlertCount([ouverte, signalee('b')], SEEN_AT, read)).toBe(1);
  });

  it('s’en souvient d’une session à l’autre', () => {
    localStorage.clear();
    markAlertRead('a');
    expect(readReadAlerts().has('a')).toBe(true);
  });
});

describe('alertes lues sur un autre appareil', () => {
  it('une annonce consultée — état du compte — ne compte plus comme non lue', async () => {
    const { isUnreadAlert } = await import('./notifications.js');
    const { MOCK_LISTINGS } = await import('./api/mock-data.js');
    const signalée = { ...MOCK_LISTINGS[0]!, notifiedAt: '2026-09-15T12:00:00.000Z' };
    const avant = Date.parse('2026-09-15T11:00:00.000Z');
    expect(isUnreadAlert({ ...signalée, viewed: false }, avant)).toBe(true);
    expect(isUnreadAlert({ ...signalée, viewed: true }, avant)).toBe(false);
  });
});

// LA PASTILLE S'ARRÊTAIT À « 9+ » : un arrivage de dix annonces et un de cent
// se lisaient pareil. Mesuré à 320 px, « 99+ » tient dans le bouton.
describe('pastille de la cloche', () => {
  it('écrit le nombre tel quel jusqu’au plafond', () => {
    expect(alertBadgeLabel(1)).toBe('1');
    expect(alertBadgeLabel(12)).toBe('12');
    expect(alertBadgeLabel(ALERT_BADGE_CAP)).toBe('99');
  });

  it('au-delà, elle plafonne — trois caractères, pas plus', () => {
    expect(alertBadgeLabel(ALERT_BADGE_CAP + 1)).toBe('99+');
    expect(alertBadgeLabel(1240)).toBe('99+');
    expect(alertBadgeLabel(1240)).toHaveLength(3);
  });
});
