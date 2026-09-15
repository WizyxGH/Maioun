import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Client from './api/client.js';

const remote = { at: null as number | null };
const saved: number[] = [];
vi.mock('./api/client.js', async (original) => ({
  ...(await original<typeof Client>()),
  fetchAlertsSeenAt: () => Promise.resolve(remote.at),
  saveAlertsSeenAt: (at: number) => {
    saved.push(at);
    return Promise.resolve();
  },
}));

const { useAlertsSeen } = await import('./use-alerts-seen.js');

describe('useAlertsSeen', () => {
  beforeEach(() => {
    localStorage.clear();
    saved.length = 0;
    remote.at = null;
  });

  it('adopte la visite plus récente faite sur un autre appareil', async () => {
    localStorage.setItem('maioun.alertsSeenAt', '1000');
    remote.at = 5000;
    const { result } = renderHook(() => useAlertsSeen({ enabled: true }));
    await waitFor(() => expect(result.current.seenAt).toBe(5000));
    expect(localStorage.getItem('maioun.alertsSeenAt')).toBe('5000');
  });

  it('garde la visite locale si le compte est en retard, et range la nouvelle dans le compte', async () => {
    localStorage.setItem('maioun.alertsSeenAt', '9000');
    remote.at = 5000;
    const { result } = renderHook(() => useAlertsSeen({ enabled: true }));
    await waitFor(() => expect(result.current.seenAt).toBe(9000));
    act(() => result.current.markSeen(12000));
    expect(result.current.seenAt).toBe(12000);
    expect(saved).toEqual([12000]);
  });

  it('relit le compte et recharge au retour sur l’application', async () => {
    const onReturn = vi.fn();
    const { result } = renderHook(() => useAlertsSeen({ enabled: true, onReturn }));
    remote.at = Date.now() + 60_000;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.seenAt).toBe(remote.at));
    expect(onReturn).toHaveBeenCalled();
  });
});
