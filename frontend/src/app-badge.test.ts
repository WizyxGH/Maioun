/**
 * La pastille de l'icône : elle ne doit jamais faire tomber l'écran.
 *
 * L'API n'existe pas partout, et là où elle existe elle LÈVE dans certains
 * contextes — onglet non installé, fenêtre privée — au lieu de rendre `false`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { showAppBadge } from './app-badge.js';

const nav = navigator as unknown as Record<string, unknown>;

afterEach(() => {
  delete nav['setAppBadge'];
  delete nav['clearAppBadge'];
});

describe('showAppBadge', () => {
  it('pose le compte quand il y a du neuf', () => {
    const set = vi.fn(async () => undefined);
    nav['setAppBadge'] = set;
    showAppBadge(7);
    expect(set).toHaveBeenCalledWith(7);
  });

  /** Une pastille qui annonce « 0 » est une pastille de trop. */
  it('efface la pastille à zéro plutôt que d’afficher « 0 »', () => {
    const set = vi.fn(async () => undefined);
    const clear = vi.fn(async () => undefined);
    nav['setAppBadge'] = set;
    nav['clearAppBadge'] = clear;
    showAppBadge(0);
    expect(clear).toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('ne fait rien, sans lever, quand l’API n’existe pas', () => {
    expect(() => {
      showAppBadge(3);
    }).not.toThrow();
  });

  /** Chrome Android lève hors application installée : ce n'est pas une panne. */
  it('avale le refus du navigateur', () => {
    nav['setAppBadge'] = () => {
      throw new Error('Not allowed');
    };
    expect(() => {
      showAppBadge(3);
    }).not.toThrow();
  });

  it('avale aussi un rejet asynchrone', async () => {
    nav['setAppBadge'] = async () => {
      await Promise.reject(new Error('refusé'));
    };
    expect(() => {
      showAppBadge(2);
    }).not.toThrow();
    // Laisse la micro-tâche se résoudre : un rejet non capturé ferait tomber le test.
    await Promise.resolve();
  });
});
