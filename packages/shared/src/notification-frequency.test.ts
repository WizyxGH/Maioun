import { describe, expect, it } from 'vitest';
import {
  canNotifyNow,
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
} from './notification-preferences.js';

const MAINTENANT = Date.parse('2026-09-07T12:00:00.000Z');
const ilYA = (heures: number): string => new Date(MAINTENANT - heures * 3_600_000).toISOString();

describe('canNotifyNow', () => {
  it('ne retient jamais rien au rythme le plus rapide', () => {
    expect(canNotifyNow('each-run', ilYA(0.01), MAINTENANT)).toBe(true);
  });

  it('sonne au PREMIER envoi, quel que soit le rythme', () => {
    // Faire attendre vingt-quatre heures un compte qui vient de régler ses
    // alertes lui ferait croire qu'elles ne marchent pas.
    expect(canNotifyNow('daily', null, MAINTENANT)).toBe(true);
    expect(canNotifyNow('hourly', null, MAINTENANT)).toBe(true);
  });

  it('retient tant que la fenêtre n’est pas écoulée', () => {
    expect(canNotifyNow('hourly', ilYA(0.5), MAINTENANT)).toBe(false);
    expect(canNotifyNow('hourly', ilYA(1.01), MAINTENANT)).toBe(true);
    expect(canNotifyNow('daily', ilYA(23), MAINTENANT)).toBe(false);
    expect(canNotifyNow('daily', ilYA(24.01), MAINTENANT)).toBe(true);
  });

  it('sonne plutôt que de se taire sur un horodatage abîmé (§69)', () => {
    // Une date illisible ne doit pas faire taire les alertes indéfiniment.
    expect(canNotifyNow('daily', 'pas une date', MAINTENANT)).toBe(true);
  });
});

describe('parseNotificationPreferences — rythme', () => {
  it('vaut « dès que possible » par défaut', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.frequency).toBe('each-run');
    expect(parseNotificationPreferences(null).frequency).toBe('each-run');
  });

  it('relit un rythme enregistré', () => {
    expect(parseNotificationPreferences({ frequency: 'daily' }).frequency).toBe('daily');
  });

  it('ignore une valeur qui n’est pas un rythme', () => {
    // Une préférence écrite par une version plus ancienne, ou bricolée : on
    // retombe sur le défaut plutôt que de refuser l'ensemble (§69).
    expect(parseNotificationPreferences({ frequency: 'toutes-les-lunes' }).frequency).toBe(
      'each-run',
    );
    expect(parseNotificationPreferences({ frequency: 42 }).frequency).toBe('each-run');
  });

  it('ne perd pas les autres préférences en chemin', () => {
    const lu = parseNotificationPreferences({ frequency: 'hourly', newListings: false });
    expect(lu.newListings).toBe(false);
    expect(lu.favoriteGone).toBe(true);
  });
});
