/**
 * Le jeton dit si la requête partira SIGNÉE — c'est ce qui permet de lancer la
 * liste sans attendre la réponse d'identité, donc d'économiser un aller-retour
 * complet à chaque ouverture à froid.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSessionToken } from './session-token.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('hasSessionToken', () => {
  it('reconnaît un jeton posé', () => {
    localStorage.setItem('maioun.session', 'jeton-exemple');
    expect(hasSessionToken()).toBe(true);
  });

  it('rend faux sans jeton', () => {
    expect(hasSessionToken()).toBe(false);
  });

  it('rend faux quand le navigateur refuse son stockage', () => {
    // Navigation privée stricte : on fait sans, et l'on attend alors la
    // réponse d'identité comme avant.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    expect(hasSessionToken()).toBe(false);
  });
});
