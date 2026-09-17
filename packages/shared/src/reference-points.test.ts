import { describe, expect, it } from 'vitest';
import {
  convertEstimatedDuration,
  estimateTravelMinutes,
  parseReferencePoints,
  REFERENCE_TRAVEL_MODES,
} from './reference-points.js';

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

  it('relit un point enregistré « en train » comme un point en transports', () => {
    // Il ne disparaît pas et ne change pas de sens : le train EST un transport
    // en commun. Il y gagne le vrai calcul d'itinéraire, réservé à `transit`.
    expect(parseReferencePoints([{ label: 'Travail', address: 'Nice', mode: 'train' }])).toEqual([
      { label: 'Travail', address: 'Nice', mode: 'transit' },
    ]);
  });
});

describe('les modes proposés', () => {
  it('n’offrent plus « en train » : c’est un transport en commun', () => {
    expect(REFERENCE_TRAVEL_MODES).toEqual(['walking', 'cycling', 'transit', 'driving']);
  });
});

/**
 * LA RAISON QUI JUSTIFIAIT UN MODE « TRAIN » RESTE VRAIE, mais elle porte sur le
 * calcul : compter une commune du littoral à 18 km/h la faisait paraître plus
 * loin qu'un quartier voisin. Elle vit maintenant dans l'estimation, qui retient
 * pour un trajet le plus court du bus et du TER.
 */
describe('estimateTravelMinutes', () => {
  it('garde la vitesse du bus sur les courtes distances', () => {
    // 3 km : prendre le train coûterait plus en accès qu'il ne ferait gagner.
    expect(estimateTravelMinutes(3, 'transit')).toBe(13);
  });

  it('ne pénalise plus une commune desservie par le TER', () => {
    // 15 km : 65 min si l'on comptait tout en bus, 43 par le rail.
    expect(estimateTravelMinutes(15, 'transit')).toBe(43);
    expect(estimateTravelMinutes(15, 'transit')).toBeLessThan(60);
  });

  it('traite « en train » exactement comme les transports en commun', () => {
    expect(estimateTravelMinutes(15, 'train')).toBe(estimateTravelMinutes(15, 'transit'));
  });

  it('laisse les autres modes à leur vitesse unique', () => {
    // 4,5 km/h avec 1,3 de détour : 3 km se marchent en 52 min.
    expect(estimateTravelMinutes(3, 'walking')).toBe(52);
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

  it('passe par la distance, et rien d’autre', () => {
    // transit 18 km/h → walking 4,5 km/h : quatre fois plus long.
    expect(convertEstimatedDuration(15, 'transit', 'walking')).toBe(60);
    expect(convertEstimatedDuration(60, 'walking', 'transit')).toBe(15);
  });

  it('reste réversible aux arrondis près', () => {
    const aller = convertEstimatedDuration(30, 'transit', 'cycling');
    expect(convertEstimatedDuration(aller, 'cycling', 'transit')).toBe(30);
  });

  it('se renverse aussi sur la branche ferrée des transports', () => {
    // 43 min en transports, c'est le TER : 15 km, soit 3 h 15 à pied.
    const aPied = convertEstimatedDuration(43, 'transit', 'walking');
    expect(convertEstimatedDuration(aPied, 'walking', 'transit')).toBe(43);
  });

  it('ne distingue plus le train des transports en commun', () => {
    expect(convertEstimatedDuration(50, 'transit', 'train')).toBe(50);
    expect(convertEstimatedDuration(50, 'train', 'walking')).toBe(
      convertEstimatedDuration(50, 'transit', 'walking'),
    );
  });
});
