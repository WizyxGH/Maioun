/**
 * L'écart entre le site local et le site en ligne a laissé passer deux bugs le
 * 2026-09-25 : deux écrans de connexion enchaînés, et un profil qui faisait
 * tomber son écran. Ni l'un ni l'autre n'était visible en local, où l'on est
 * TOUJOURS connecté.
 */

import { describe, expect, it } from 'vitest';
import { CURRENT_USER } from '@maioun/shared';
import { identiteLocale, motIdentite } from './serve-options.js';

describe('identiteLocale', () => {
  it('sert le propriétaire de la machine par défaut', () => {
    expect(identiteLocale({})).toBe(CURRENT_USER);
  });

  it('passe visiteur sur demande', () => {
    expect(identiteLocale({ MAIOUN_LOCAL_ANONYME: '1' })).toBeNull();
  });

  // Une valeur qui n'est pas « 1 » n'est pas un oui : on ne coupe pas
  // l'identité de quelqu'un sur un `0` ou un `false` mal lus.
  it.each([['0'], ['false'], [''], ['oui']])('garde le compte pour « %s »', (valeur) => {
    expect(identiteLocale({ MAIOUN_LOCAL_ANONYME: valeur })).toBe(CURRENT_USER);
  });
});

describe('motIdentite', () => {
  // Servir un visiteur sans le dire ferait croire à une régression : favoris
  // vides, critères oubliés, écran de connexion sur les Paramètres.
  it('annonce le mode visiteur', () => {
    expect(motIdentite({ MAIOUN_LOCAL_ANONYME: '1' })).toMatch(/VISITEUR/);
  });

  it('rappelle comment y passer, sinon', () => {
    expect(motIdentite({})).toMatch(/MAIOUN_LOCAL_ANONYME=1/);
  });
});
