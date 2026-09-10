/**
 * La relecture des préférences est le seul point de rencontre entre l'écran
 * qui les écrit et la collecte qui les applique. Une valeur perdue ici l'est
 * pour les deux — c'est ce qui est arrivé à l'e-mail.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  parseNotificationPreferences,
} from './notification-preferences.js';

describe('parseNotificationPreferences', () => {
  it('RELIT le choix de l’e-mail au lieu de l’écraser', () => {
    // La régression : `email` était forcé à `false` à la relecture. La case
    // cochée était enregistrée, relue éteinte par l'écran comme par la
    // collecte, et aucun message ne partait jamais.
    expect(parseNotificationPreferences({ email: true }).email).toBe(true);
    expect(parseNotificationPreferences({ email: false }).email).toBe(false);
  });

  it('relit TOUTES les cases telles qu’enregistrées', () => {
    // La valeur réellement stockée pour le compte principal le 2026-09-10.
    const stocke = {
      newListings: true,
      nearMatches: false,
      applicationReminders: true,
      favoriteGone: true,
      email: true,
      frequency: 'each-run',
    };
    expect(parseNotificationPreferences(stocke)).toEqual(stocke);
  });

  it('garde l’e-mail éteint par défaut', () => {
    // C'est un canal qu'on choisit, pas un doublon qu'on subit.
    expect(DEFAULT_NOTIFICATION_PREFERENCES.email).toBe(false);
    expect(parseNotificationPreferences(null).email).toBe(false);
    expect(parseNotificationPreferences({}).email).toBe(false);
  });

  it('ignore une valeur qui n’est pas un booléen', () => {
    expect(parseNotificationPreferences({ email: 'oui' }).email).toBe(false);
  });
});
