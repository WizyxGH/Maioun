/**
 * À QUI ÉCRIT-ON, ET QUELLE PAGE LUI MONTRE-T-ON.
 *
 * Une fiche fusionnée porte plusieurs occurrences — le même studio publié par
 * deux agences — et le contact retenu n'est pas forcément celui de la première.
 * Relevé le 2026-09-08 sur un favori : le bien d'une agence portait l'adresse
 * d'une autre, qui le publie aussi. Joindre le lien de la première occurrence
 * revenait à envoyer un concurrent à son destinataire.
 */

import { describe, expect, it } from 'vitest';
import { occurrenceMatching } from './repository.js';

const PREMIERE = { sourceUrl: 'https://www.premiere-agence.invalid/location/studio/358-x' };
const SECONDE = { sourceUrl: 'https://seconde-agence.invalid/fr/propriete/location+x+850900' };

describe('occurrenceMatching', () => {
  it('retient la page de l’agence à qui l’on écrit', () => {
    expect(occurrenceMatching([PREMIERE, SECONDE], 'contact@seconde-agence.invalid')).toBe(
      SECONDE.sourceUrl,
    );
  });

  it('ignore l’ordre des occurrences', () => {
    expect(occurrenceMatching([SECONDE, PREMIERE], 'contact@premiere-agence.invalid')).toBe(
      PREMIERE.sourceUrl,
    );
  });

  it('rapproche un sous-domaine de son domaine', () => {
    // Le site est en `www`, l'adresse au domaine nu : c'est la même maison.
    expect(occurrenceMatching([PREMIERE], 'location@premiere-agence.invalid')).toBe(
      PREMIERE.sourceUrl,
    );
  });

  it('garde la première occurrence quand aucun domaine ne correspond', () => {
    // Une agence qui écrit depuis une boîte grand public : cela arrive, et le
    // lien de la première occurrence reste préférable à rien.
    expect(occurrenceMatching([PREMIERE, SECONDE], 'agence@messagerie.invalid')).toBe(
      PREMIERE.sourceUrl,
    );
  });

  it('ne rend rien plutôt que d’inventer une page (§17)', () => {
    expect(occurrenceMatching([], 'x@y.invalid')).toBeNull();
    expect(occurrenceMatching(undefined, 'x@y.invalid')).toBeNull();
    expect(occurrenceMatching([{ sourceUrl: 'pas une url' }], 'x@y.invalid')).toBe('pas une url');
  });
});
