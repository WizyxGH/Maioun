/**
 * LE SONDAGE NE PART PAS SANS COMPTE (relevé du 2026-09-18).
 *
 * L'utilisateur voyait des bandeaux pour des annonces hors de ses critères.
 * Cause : le sondage ne vérifiait jamais qu'une session existe. Sans elle, le
 * serveur ne peut appliquer les critères de personne et rend le CATALOGUE —
 * tout ce qui n'est ni parking ni local commercial dans les communes du
 * projet —, sans budget, sans surface, sans exclusion de colocation. Or
 * l'accord « je veux être prévenu » vit dans le navigateur et survit à
 * l'expiration de la session.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const appels = { listings: 0 };

vi.mock('./api/client.js', () => ({
  fetchListings: () => {
    appels.listings += 1;
    return Promise.resolve({ listings: [], total: 0, limit: 0, offset: 0 });
  },
  isDemoMode: () => false,
}));

const { useNewListingAlerts } = await import('./use-new-listing-alerts.js');

afterEach(() => {
  appels.listings = 0;
  localStorage.clear();
});

/** Ces scénarios portent sur la MINUTERIE, pas sur les filtres : on montre tout. */
const TOUT = (): boolean => true;

describe('le sondage des nouvelles annonces', () => {
  it('NE PART PAS tant qu’aucun compte n’est connu', () => {
    localStorage.setItem('maioun.notificationsOptIn', 'true');
    renderHook(() =>
      useNewListingAlerts({ enabled: false, visible: TOUT, onFresh: vi.fn(), onOpen: vi.fn() }),
    );
    expect(appels.listings).toBe(0);
  });

  it('part une fois le compte connu', () => {
    localStorage.setItem('maioun.notificationsOptIn', 'true');
    renderHook(() =>
      useNewListingAlerts({ enabled: true, visible: TOUT, onFresh: vi.fn(), onOpen: vi.fn() }),
    );
    expect(appels.listings).toBe(1);
  });

  it('se tait aussi quand les alertes n’ont pas été acceptées', () => {
    renderHook(() =>
      useNewListingAlerts({ enabled: true, visible: TOUT, onFresh: vi.fn(), onOpen: vi.fn() }),
    );
    expect(appels.listings).toBe(0);
  });
});
