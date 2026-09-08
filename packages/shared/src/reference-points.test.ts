import { describe, expect, it } from 'vitest';
import { convertEstimatedDuration, parseReferencePoints } from './reference-points.js';

describe('parseReferencePoints', () => {
  it('garde un point complet', () => {
    expect(
      parseReferencePoints([{ label: 'Travail', address: '12 rue X, Nice', mode: 'transit' }]),
    ).toEqual([{ label: 'Travail', address: '12 rue X, Nice', mode: 'transit' }]);
  });

  it('distingue « rien de réglé » de « tout retiré »', () => {
    // `null` fait retomber sur `.env` ; `[]` est le choix de n'afficher aucune
    // distance. Les confondre rallumerait un repère qu'on vient d'effacer.
    expect(parseReferencePoints(null)).toBeNull();
    expect(parseReferencePoints(undefined)).toBeNull();
    expect(parseReferencePoints('travail')).toBeNull();
    expect(parseReferencePoints([])).toEqual([]);
  });

  it('écarte un point sans adresse : il ne produirait jamais de distance', () => {
    expect(parseReferencePoints([{ label: 'Travail', address: '   ', mode: 'transit' }])).toEqual(
      [],
    );
    expect(parseReferencePoints([{ label: '', address: 'Nice', mode: 'transit' }])).toEqual([]);
  });

  it('retombe sur les transports quand le mode est inconnu', () => {
    expect(
      parseReferencePoints([{ label: 'Travail', address: 'Nice', mode: 'téléportation' }]),
    ).toEqual([{ label: 'Travail', address: 'Nice', mode: 'transit' }]);
  });

  it('rogne les espaces et ignore les entrées qui ne sont pas des objets', () => {
    expect(parseReferencePoints([' ', null, { label: ' Gare ', address: ' Nice ' }])).toEqual([
      { label: 'Gare', address: 'Nice', mode: 'transit' },
    ]);
  });
});

/**
 * TRENTE MINUTES À PIED ET TRENTE EN VOITURE ne désignent pas la même ville :
 * le mode fait partie du critère. La collecte n'ayant calculé qu'une durée, le
 * filtre convertit — et cette conversion doit être exacte, sinon elle inventerait
 * un trajet (§17).
 */
describe('convertEstimatedDuration', () => {
  it('ne touche à rien quand le mode ne change pas', () => {
    expect(convertEstimatedDuration(42, 'transit', 'transit')).toBe(42);
  });

  it('applique le rapport des vitesses, et rien d’autre', () => {
    // transit 18 km/h → walking 4,5 km/h : quatre fois plus long.
    expect(convertEstimatedDuration(15, 'transit', 'walking')).toBe(60);
    expect(convertEstimatedDuration(60, 'walking', 'transit')).toBe(15);
  });

  it('reste réversible aux arrondis près', () => {
    const aller = convertEstimatedDuration(30, 'transit', 'cycling');
    expect(convertEstimatedDuration(aller, 'cycling', 'transit')).toBe(30);
  });

  it('range le train à part des transports urbains', () => {
    // 45 km/h contre 18 : un TER met deux fois et demie moins de temps.
    expect(convertEstimatedDuration(50, 'transit', 'train')).toBe(20);
  });
});
