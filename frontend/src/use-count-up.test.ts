/**
 * Le compteur monte, mais il ne ment jamais : il finit exactement sur la
 * valeur, et il ne bouge pas du tout pour qui a demandé moins d'animations.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCountUp } from './use-count-up.js';

/** Règle la préférence système d'animation pour la durée d'un test. */
function reglerMouvement(reduit: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduit && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useCountUp', () => {
  it('part de zéro puis atteint EXACTEMENT la valeur', async () => {
    reglerMouvement(false);
    const { result } = renderHook(() => useCountUp(48));
    expect(result.current).toBe(0);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(result.current).toBe(48);
  });

  it('affiche la valeur SANS ANIMATION quand le système la refuse', () => {
    reglerMouvement(true);
    const { result } = renderHook(() => useCountUp(48));
    // Aucune image intermédiaire : la valeur est là dès le premier rendu.
    expect(result.current).toBe(48);
  });

  it('repart de l’affichage courant, pas de zéro, quand la valeur change', async () => {
    reglerMouvement(false);
    const { result, rerender } = renderHook(({ valeur }) => useCountUp(valeur), {
      initialProps: { valeur: 48 },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(result.current).toBe(48);

    rerender({ valeur: 49 });
    // Un rafraîchissement qui ajoute une annonce ne redéroule pas tout.
    expect(result.current).toBeGreaterThan(40);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(result.current).toBe(49);
  });
});

describe('un compteur NOMMÉ ne se déroule qu’une fois', () => {
  it('ne rejoue pas l’animation au retour sur l’écran', async () => {
    reglerMouvement(false);
    const premier = renderHook(() => useCountUp(48, 'accueil:favoris'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(premier.result.current).toBe(48);
    premier.unmount();

    // Rien n'a rechargé : la valeur est là d'emblée, sans défilement.
    const retour = renderHook(() => useCountUp(48, 'accueil:favoris'));
    expect(retour.result.current).toBe(48);
  });

  it('s’anime encore pour un compteur d’un autre nom', () => {
    reglerMouvement(false);
    const { result } = renderHook(() => useCountUp(48, 'accueil:jamais-vu'));
    expect(result.current).toBe(0);
  });

  it('SANS NOM, il s’anime à chaque montage', () => {
    reglerMouvement(false);
    expect(renderHook(() => useCountUp(48)).result.current).toBe(0);
    expect(renderHook(() => useCountUp(48)).result.current).toBe(0);
  });
});
