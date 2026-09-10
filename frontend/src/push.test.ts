/**
 * La réparation de l'abonnement push.
 *
 * Constaté le 2026-09-10 : après le déménagement du site, le navigateur avait
 * supprimé son service worker et l'abonnement avec. La collecte a retiré
 * l'unique appareil (`410 Gone`), et l'écran affichait toujours « activé ».
 * Ces scénarios vérifient qu'on recrée ce qui a été demandé — et RIEN d'autre.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subscribePush = vi.fn(() => Promise.resolve());
vi.mock('./api/client.js', () => ({ subscribePush, unsubscribePush: vi.fn() }));

/** Un abonnement tel que le rend le navigateur. */
const abonnement = {
  endpoint: 'https://push.example.invalid/abc',
  toJSON: () => ({ keys: { p256dh: 'cle', auth: 'jeton' } }),
};

/** Simule le navigateur : un service worker, avec ou sans abonnement. */
function navigateur(existant: typeof abonnement | null, permission: NotificationPermission) {
  const subscribe = vi.fn(() => Promise.resolve(abonnement));
  const registration = {
    pushManager: { getSubscription: () => Promise.resolve(existant), subscribe },
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      // Aucun worker à la NOUVELLE adresse : c'est le cas du déménagement.
      getRegistration: () => Promise.resolve(existant === null ? undefined : registration),
      register: () => Promise.resolve(registration),
      ready: Promise.resolve(registration),
    },
  });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('Notification', { permission });
  return { subscribe };
}

/** Le module lit la clé VAPID à son chargement : on le recharge à chaque cas. */
async function chargerPush() {
  // Une clé de FORME valide — 65 octets en base64url —, sans quoi le décodage
  // lève avant même d'atteindre ce qu'on veut éprouver.
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'B' + 'A'.repeat(86));
  vi.resetModules();
  return import('./push.js');
}

beforeEach(() => subscribePush.mockClear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('restorePush', () => {
  it('RECRÉE l’abonnement perdu quand l’autorisation est déjà accordée', async () => {
    const { subscribe } = navigateur(null, 'granted');
    const { restorePush } = await chargerPush();

    expect(await restorePush(true)).toBe(true);
    expect(subscribe).toHaveBeenCalledOnce();
    // Et il est redéposé côté serveur : sans cela la collecte ne le connaît pas.
    expect(subscribePush).toHaveBeenCalledWith({
      endpoint: abonnement.endpoint,
      p256dh: 'cle',
      auth: 'jeton',
    });
  });

  it('ne recrée RIEN pour quelqu’un qui n’avait pas activé les alertes', async () => {
    // L'autorisation accordée ne vaut pas demande : on ne remet en place que ce
    // qui avait été voulu.
    const { subscribe } = navigateur(null, 'granted');
    const { restorePush } = await chargerPush();

    expect(await restorePush(false)).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('ne demande JAMAIS l’autorisation', async () => {
    // « Par défaut », l'autorisation n'est pas donnée : recréer l'abonnement
    // ouvrirait une fenêtre, et ce n'est pas à la réparation de le faire.
    const { subscribe } = navigateur(null, 'default');
    const { restorePush } = await chargerPush();

    expect(await restorePush(true)).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('redépose simplement un abonnement encore présent', async () => {
    const { subscribe } = navigateur(abonnement, 'granted');
    const { restorePush } = await chargerPush();

    expect(await restorePush(true)).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
    expect(subscribePush).toHaveBeenCalledOnce();
  });
});
