import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isConstrained, useConstrainedNetwork, type ConnectionLike } from './network-quality.js';

describe('isConstrained', () => {
  it('répond non sans information', () => {
    expect(isConstrained(null)).toBe(false);
    expect(isConstrained({})).toBe(false);
  });

  it('respecte l’économie de données demandée', () => {
    expect(isConstrained({ saveData: true, effectiveType: '4g' })).toBe(true);
  });

  it('classe la 3G et en deçà comme lentes', () => {
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(isConstrained({ effectiveType })).toBe(true);
    }
    expect(isConstrained({ effectiveType: '4g', saveData: false })).toBe(false);
  });
});

/** Une connexion factice dont on peut changer le débit et prévenir les abonnés. */
function fakeConnection(initial: string): ConnectionLike & { set: (type: string) => void } {
  const listeners = new Set<() => void>();
  const connection = {
    effectiveType: initial,
    addEventListener: (_: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_: 'change', listener: () => void) => listeners.delete(listener),
    set: (type: string) => {
      connection.effectiveType = type;
      for (const listener of listeners) listener();
    },
  };
  return connection;
}

describe('useConstrainedNetwork', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('répond non quand le navigateur ne dit rien', () => {
    const { result } = renderHook(() => useConstrainedNetwork());
    expect(result.current).toBe(false);
  });

  it('suit un passage du wifi à la 3G', () => {
    const connection = fakeConnection('4g');
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
    const { result } = renderHook(() => useConstrainedNetwork());
    expect(result.current).toBe(false);
    act(() => connection.set('3g'));
    expect(result.current).toBe(true);
  });
});
