/**
 * CE QUE « PROCHE » VEUT DIRE, CRITÈRE PAR CRITÈRE.
 *
 * Une seule marge de 5 % couvrait le loyer et la surface ; le trajet, les
 * pièces et la date n'avaient aucun voisinage, et l'alerte ne savait donc pas
 * dire lequel dépassait. Ce fichier fixe les deux : la marge de chacun, et la
 * phrase qui la rend lisible.
 */

import { describe, expect, it } from 'vitest';
import {
  describeOvershoot,
  nearMatchBounds,
  NEAR_MATCH_MARGIN,
  NEAR_MATCH_MARGINS,
  NEAR_MATCH_NEVER_RELAXED,
} from './criteria.js';

/** Les critères du projet, tels que la collecte les lit. */
const CRITERIA = {
  maxPrice: 700,
  minArea: 20,
  maxCommuteMinutes: 60,
} as const;

const ANNONCE = {
  price: null,
  area: null,
  rooms: null,
  commuteMinutes: null,
  availableAt: null,
};

describe('les bornes élargies', () => {
  it('élargit le loyer de 5 % : 700 € accepte jusqu’à 735 €', () => {
    expect(nearMatchBounds(CRITERIA).maxPrice).toBe(735);
  });

  it('abaisse la surface de 5 %, et d’un m² au moins', () => {
    expect(nearMatchBounds(CRITERIA).minArea).toBe(19);
    // 5 % de 12 m² ne feraient que 0,6 m² : sous le mètre, la marge ne
    // rattraperait que des arrondis d'affichage.
    expect(nearMatchBounds({ maxPrice: 700, minArea: 12 }).minArea).toBe(11);
    expect(nearMatchBounds({ maxPrice: 700, minArea: 60 }).minArea).toBe(57);
  });

  it('allonge le trajet de 5 minutes, jamais de plus d’un dixième', () => {
    expect(nearMatchBounds(CRITERIA).maxCommuteMinutes).toBe(65);
    // Sur 20 minutes demandées, 5 de plus seraient un quart de trajet en plus.
    expect(nearMatchBounds({ ...CRITERIA, maxCommuteMinutes: 20 }).maxCommuteMinutes).toBe(22);
    // Un plafond à zéro reste à zéro : rien à relâcher.
    expect(nearMatchBounds({ ...CRITERIA, maxCommuteMinutes: 0 }).maxCommuteMinutes).toBe(0);
  });

  it('accepte une pièce de moins, mais jamais moins d’une pièce', () => {
    expect(nearMatchBounds({ ...CRITERIA, minRooms: 3 }).minRooms).toBe(2);
    expect(nearMatchBounds({ ...CRITERIA, minRooms: 1 }).minRooms).toBe(1);
    expect(nearMatchBounds({ ...CRITERIA, maxRooms: 3 }).maxRooms).toBe(4);
  });

  it('repousse la date d’emménagement d’une semaine, changement de mois compris', () => {
    expect(nearMatchBounds({ ...CRITERIA, availableBy: '2026-09-28' }).availableBy).toBe(
      '2026-10-05',
    );
  });

  it('n’invente pas un critère absent', () => {
    const bounds = nearMatchBounds({ maxPrice: 700, minArea: 20 });
    expect(bounds.maxCommuteMinutes).toBeUndefined();
    expect(bounds.minRooms).toBeUndefined();
    expect(bounds.availableBy).toBeUndefined();
    // Une date vide n'est pas une date : le critère reste absent.
    expect(nearMatchBounds({ ...CRITERIA, availableBy: '' }).availableBy).toBeUndefined();
  });
});

describe('la phrase qui nomme l’écart', () => {
  it('dit le loyer et le budget', () => {
    expect(describeOvershoot({ ...ANNONCE, price: 735 }, CRITERIA)).toBe(
      '735 € pour un budget de 700 €',
    );
  });

  it('dit la surface dans le bon sens — en dessous, pas au-dessus', () => {
    expect(describeOvershoot({ ...ANNONCE, area: 19.8 }, CRITERIA)).toBe(
      '19,8 m² pour 20 m² demandés',
    );
  });

  it('dit le trajet en minutes', () => {
    expect(
      describeOvershoot({ ...ANNONCE, commuteMinutes: 52 }, { ...CRITERIA, maxCommuteMinutes: 45 }),
    ).toBe('52 min de trajet pour 45');
  });

  it('dit les pièces au singulier comme au pluriel', () => {
    expect(describeOvershoot({ ...ANNONCE, rooms: 1 }, { ...CRITERIA, minRooms: 2 })).toBe(
      '1 pièce pour 2 pièces demandées',
    );
    expect(describeOvershoot({ ...ANNONCE, rooms: 4 }, { ...CRITERIA, maxRooms: 3 })).toBe(
      '4 pièces pour 3 pièces au plus',
    );
  });

  it('dit la date d’emménagement', () => {
    expect(
      describeOvershoot(
        { ...ANNONCE, availableAt: '2026-10-08T00:00:00.000Z' },
        { ...CRITERIA, availableBy: '2026-10-01' },
      ),
    ).toBe('libre le 08/10/2026 pour le 01/10/2026 demandé');
  });

  it('nomme CHAQUE écart, et se tait quand tout est respecté', () => {
    expect(
      describeOvershoot({ ...ANNONCE, price: 720, area: 19, commuteMinutes: 64 }, CRITERIA),
    ).toBe('720 € pour un budget de 700 € · 19 m² pour 20 m² demandés · 64 min de trajet pour 60');
    expect(
      describeOvershoot({ ...ANNONCE, price: 650, area: 25, commuteMinutes: 40 }, CRITERIA),
    ).toBe('');
  });

  it('ne compare pas un critère que personne n’a posé', () => {
    // Sans plafond de trajet, un trajet de deux heures ne dépasse rien.
    expect(
      describeOvershoot({ ...ANNONCE, commuteMinutes: 120 }, { maxPrice: 700, minArea: 20 }),
    ).toBe('');
  });
});

describe('les critères qui ne se relâchent jamais', () => {
  it('nomme et justifie chacun d’eux', () => {
    // Un critère binaire n'a pas de voisinage : il n'existe pas de
    // demi-colocation, ni de balcon à moitié là.
    for (const critere of [
      'cities',
      'minPrice',
      'propertyTypes',
      'excludeFlatShare',
      'excludeStudent',
      'landlordFilter',
      'furnishedFilter',
      'furnished',
      'districts',
      'includeUnknownDistrict',
      'energyClasses',
      'requiresBalcony',
      'requiresParking',
    ] as const) {
      expect(NEAR_MATCH_NEVER_RELAXED[critere].length).toBeGreaterThan(10);
    }
  });

  it('ne partage aucun critère avec la table des marges', () => {
    const relaches = Object.keys(NEAR_MATCH_MARGINS);
    const fermes = Object.keys(NEAR_MATCH_NEVER_RELAXED);
    expect(relaches.filter((cle) => fermes.includes(cle))).toEqual([]);
  });
});

describe('la marge du loyer affichée par le site', () => {
  it('est LUE dans la table, pas recopiée', () => {
    expect(NEAR_MATCH_MARGIN).toBe(NEAR_MATCH_MARGINS.maxPrice.percent);
  });
});
