import { describe, expect, it } from 'vitest';
import { awaitsContact, type TrackingStatus } from './listing.js';

/**
 * LA RÈGLE DE « À CONTACTER MAINTENANT », à un seul endroit.
 *
 * La page de recherche ne la connaissait pas : elle ne regardait que l'urgence
 * et rangeait donc sous ce titre des annonces déjà contactées, pendant que
 * l'écran d'accueil, lui, les écartait. Deux écrans, deux réponses, pour la
 * même question.
 */
describe('awaitsContact', () => {
  it('garde ce qui n’a pas encore reçu de geste', () => {
    expect(awaitsContact('new')).toBe(true);
    // Dit par l'utilisateur lui-même : c'est le cas le plus « à contacter » qui soit.
    expect(awaitsContact('toContact')).toBe(true);
  });

  it('écarte tout ce qui raconte un geste déjà posé', () => {
    for (const done of ['contacted', 'replied', 'visitOffered', 'visitScheduled', 'visited']) {
      expect(awaitsContact(done as TrackingStatus)).toBe(false);
    }
  });

  it('écarte aussi les fins de course', () => {
    // Refusée, louée, écartée : plus rien à faire, et surtout pas appeler.
    for (const over of ['rejected', 'rented', 'ignored']) {
      expect(awaitsContact(over as TrackingStatus)).toBe(false);
    }
  });

  it('couvre TOUS les états, sans en oublier un au passage', () => {
    // Un état ajouté sans qu'on tranche ici retomberait silencieusement dans
    // « déjà contacté », et disparaîtrait de la section sans que rien ne le dise.
    const all: readonly TrackingStatus[] = [
      'new',
      'toContact',
      'contacted',
      'replied',
      'visitOffered',
      'visitScheduled',
      'visited',
      'rejected',
      'rented',
      'ignored',
    ];
    expect(all.filter((status) => awaitsContact(status))).toEqual(['new', 'toContact']);
  });
});
