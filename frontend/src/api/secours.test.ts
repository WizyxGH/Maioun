// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * « CE QUE VOUS VOYEZ EST UNE COPIE » — et le bandeau doit PARTIR tout seul.
 *
 * Un bandeau de panne qui reste après le retour de la base est pire que pas de
 * bandeau : on finit par ne plus le lire, et il ne prévient plus de rien le
 * jour suivant.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  messageDeSecours,
  noterSecours,
  secoursActuel,
  surChangementDeSecours,
} from './secours.js';

beforeEach(() => {
  noterSecours(null);
});

describe('état du secours', () => {
  it('part de rien', () => {
    expect(secoursActuel()).toBeNull();
  });

  it('retient ce que la réponse a marqué', () => {
    noterSecours('2026-09-21T03:22:00.000Z');
    expect(secoursActuel()).toBe('2026-09-21T03:22:00.000Z');
  });

  it('oublie dès qu’une réponse ne porte plus la marque', () => {
    noterSecours('copie');
    noterSecours(null);
    expect(secoursActuel()).toBeNull();
  });

  it('traite une marque vide comme une absence', () => {
    noterSecours('');
    expect(secoursActuel()).toBeNull();
  });

  it('prévient les abonnés, et seulement quand ça change', () => {
    const prevenu = vi.fn();
    const arreter = surChangementDeSecours(prevenu);
    noterSecours('copie');
    noterSecours('copie');
    expect(prevenu).toHaveBeenCalledTimes(1);
    noterSecours(null);
    expect(prevenu).toHaveBeenCalledTimes(2);
    arreter();
    noterSecours('copie');
    expect(prevenu).toHaveBeenCalledTimes(2);
  });
});

describe('messageDeSecours', () => {
  it('dit la date des annonces quand elle est connue', () => {
    const rendu = messageDeSecours('2026-09-21T03:22:00.000Z');
    expect(rendu).toContain('21 septembre');
    expect(rendu).toContain('copie de secours');
    // Ce qui compte autant que la date : on ne peut RIEN enregistrer.
    expect(rendu).toContain('Rien ne peut être enregistré');
  });

  // Mieux vaut signaler la copie sans son âge que ne rien signaler : le Worker
  // rend `copie` quand il n'a pas pu lire la date.
  it('signale la copie même sans date', () => {
    const rendu = messageDeSecours('copie');
    expect(rendu).toContain('copie de secours');
    expect(rendu).not.toContain('Invalid');
  });

  it('ne rend pas une date illisible', () => {
    expect(messageDeSecours('n’importe quoi')).not.toContain('Invalid');
  });
});
