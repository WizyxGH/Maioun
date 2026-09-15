import { describe, expect, it } from 'vitest';
import type { ListingView } from './types.js';
import {
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
