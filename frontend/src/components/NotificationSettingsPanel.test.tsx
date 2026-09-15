/**
 * L'écran des alertes retient ce qu'on y règle.
 *
 * Signalé : « les réglages des notifications ne sont pas sauvegardés ». Les
 * défauts affichés avant la réponse de la base pouvaient être réécrits
 * par-dessus les réglages stockés, deux écritures parallèles arriver dans le
 * désordre, et un appareil non abonné montrait tout éteint.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@maioun/shared';
import { NotificationSettingsPanel } from './NotificationSettingsPanel.js';
import { fetchNotificationPreferences, saveNotificationPreferences } from '../api/client.js';
import { disablePush, pushEnabled, pushSupported, restorePush } from '../push.js';
import { readOptIn } from '../notifications.js';

vi.mock('../api/client.js', () => ({
  fetchNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
}));
vi.mock('../push.js', () => ({
  disablePush: vi.fn(),
  enablePush: vi.fn(),
  pushEnabled: vi.fn(),
  pushSupported: vi.fn(),
  restorePush: vi.fn(),
}));
vi.mock('../notifications.js', () => ({
  readOptIn: vi.fn(),
  writeOptIn: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

/** Ce que la base contient : l'e-mail coché, contrairement aux défauts. */
const STORED: NotificationPreferences = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  email: true,
  frequency: 'daily',
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const toggle = (name: string): HTMLElement => screen.getByRole('switch', { name });

beforeEach(() => {
  vi.mocked(fetchNotificationPreferences).mockReset().mockResolvedValue(STORED);
  vi.mocked(saveNotificationPreferences).mockReset().mockResolvedValue(undefined);
  vi.mocked(readOptIn).mockReset().mockReturnValue(true);
  vi.mocked(pushSupported).mockReset().mockReturnValue(false);
  vi.mocked(pushEnabled).mockReset().mockResolvedValue(false);
  vi.mocked(restorePush).mockReset().mockResolvedValue(true);
  vi.mocked(disablePush).mockReset().mockResolvedValue(undefined);
});

describe('NotificationSettingsPanel', () => {
  it('n’écrit rien avant d’avoir lu les réglages du compte', async () => {
    const load = deferred<NotificationPreferences>();
    vi.mocked(fetchNotificationPreferences).mockReturnValue(load.promise);
    render(<NotificationSettingsPanel onBack={vi.fn()} />);

    await userEvent.click(toggle('Proche de vos critères'));
    load.resolve(STORED);

    await waitFor(() =>
      expect(toggle('Doubler par e-mail')).toHaveAttribute('aria-checked', 'true'),
    );
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it('n’écrase pas la base quand la lecture échoue', async () => {
    vi.mocked(fetchNotificationPreferences).mockRejectedValue(new Error('réseau'));
    render(<NotificationSettingsPanel onBack={vi.fn()} />);

    expect(await screen.findByText(/n’ont pas pu être lus/)).toBeInTheDocument();
    await userEvent.click(toggle('Favori qui disparaît'));
    expect(saveNotificationPreferences).not.toHaveBeenCalled();
  });

  it('garde le réglage stocké en partant de ce qui a été relu', async () => {
    render(<NotificationSettingsPanel onBack={vi.fn()} />);
    await waitFor(() => expect(toggle('Proche de vos critères')).toBeEnabled());

    await userEvent.click(toggle('Proche de vos critères'));

    expect(saveNotificationPreferences).toHaveBeenCalledWith({ ...STORED, nearMatches: true });
  });

  it('enchaîne les écritures, la dernière portant tous les gestes', async () => {
    const first = deferred<undefined>();
    vi.mocked(saveNotificationPreferences).mockReturnValueOnce(first.promise);
    render(<NotificationSettingsPanel onBack={vi.fn()} />);
    await waitFor(() => expect(toggle('Proche de vos critères')).toBeEnabled());

    await userEvent.click(toggle('Proche de vos critères'));
    await userEvent.click(toggle('Favori qui disparaît'));
    // La seconde attend la première : parallèles, l'ordre d'arrivée décidait.
    expect(saveNotificationPreferences).toHaveBeenCalledTimes(1);

    first.resolve(undefined);
    await waitFor(() => expect(saveNotificationPreferences).toHaveBeenCalledTimes(2));
    expect(saveNotificationPreferences).toHaveBeenLastCalledWith({
      ...STORED,
      nearMatches: true,
      favoriteGone: false,
    });
  });

  it('montre les réglages du compte sur un appareil non abonné', async () => {
    vi.mocked(readOptIn).mockReturnValue(false);
    render(<NotificationSettingsPanel onBack={vi.fn()} />);

    await waitFor(() =>
      expect(toggle('Doubler par e-mail')).toHaveAttribute('aria-checked', 'true'),
    );
    expect(toggle('Doubler par e-mail')).toBeDisabled();
  });

  it('un abonnement relu en retard ne rallume pas ce qu’on vient d’éteindre', async () => {
    vi.mocked(pushSupported).mockReturnValue(true);
    const restored = deferred<boolean>();
    vi.mocked(restorePush).mockReturnValue(restored.promise);
    render(<NotificationSettingsPanel onBack={vi.fn()} />);
    await waitFor(() => expect(toggle('Nouvelles annonces')).toBeEnabled());

    await userEvent.click(toggle('Nouvelles annonces'));
    await waitFor(() => expect(disablePush).toHaveBeenCalled());
    // `act` applique le rendu provoqué par la réponse avant de regarder.
    await act(async () => {
      restored.resolve(true);
      await restored.promise;
    });

    expect(toggle('Nouvelles annonces')).toHaveAttribute('aria-checked', 'false');
  });
});
