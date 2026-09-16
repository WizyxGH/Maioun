/**
 * LES CRITÈRES FILTRENT, DONC ILS COMPTENT.
 *
 * Relevé du compte le 2026-09-16 : 87 quartiers, deux exclusions, un plafond de
 * trajet — et « 3 » sur la pastille, parce qu'on ne comptait que les filtres du
 * navigateur.
 */

import { describe, expect, it } from 'vitest';
import { NICE_DISTRICTS } from '@maioun/shared';
import { criteriaChips } from './criteria-chips.js';
import type { FilterConfig } from './types.js';

/** Les critères réels du compte, budget et surface compris. */
const CRITERIA: FilterConfig = {
  cities: ['nice'],
  minPrice: 250,
  maxPrice: 700,
  minArea: 20,
  maxCommuteMinutes: 60,
  excludeFlatShare: true,
  excludeStudent: true,
  landlordFilter: 'all',
  furnishedFilter: 'all',
  districts: NICE_DISTRICTS.slice(0, 87).map((district) => district.slug),
};

const labels = (criteria: FilterConfig | null): readonly string[] =>
  criteriaChips(criteria).map((chip) => chip.label);

describe('criteriaChips', () => {
  it('montre tout ce qui écarte des annonces', () => {
    expect(labels(CRITERIA)).toEqual([
      '87 quartiers',
      'Trajet ≤ 60 min',
      'Sans colocations',
      'Sans logements étudiants',
    ]);
  });

  it('laisse le budget et la surface aux filtres rapides, qui font foi', () => {
    // Sans cela, « 250 – 700 € » et « ≥ 20 m² » compteraient deux fois : une
    // fois comme filtre rapide, une fois comme critère.
    for (const label of labels(CRITERIA)) {
      expect(label).not.toMatch(/€|m²/);
    }
  });

  it('ne dit rien des quartiers quand ils sont tous retenus', () => {
    const all = NICE_DISTRICTS.map((district) => district.slug);
    expect(labels({ ...CRITERIA, districts: all })).not.toContain(`${all.length} quartiers`);
    expect(labels({ ...CRITERIA, districts: [] })).not.toContain('0 quartier');
  });

  it('n’invente aucun filtre tant que les critères ne sont pas là', () => {
    expect(criteriaChips(null)).toEqual([]);
  });

  it('ne promet pas de retirer ce qui reviendrait, et dit où le régler', () => {
    // 87 quartiers cochés un à un ne se retrouvent pas ; un plafond de trajet
    // absent est recomblé par le serveur. Ces deux puces se voient sans croix.
    const stubborn = criteriaChips(CRITERIA).filter((chip) => chip.patch === null);
    expect(stubborn.map((chip) => chip.label)).toEqual(['87 quartiers', 'Trajet ≤ 60 min']);
    for (const chip of stubborn) expect(chip.hint).toBe('à régler dans Filtres');
  });

  it('lève une exclusion en écrivant le critère', () => {
    const coloc = criteriaChips(CRITERIA).find((chip) => chip.label === 'Sans colocations');
    expect(coloc?.patch).toEqual({ excludeFlatShare: false });
    const student = criteriaChips(CRITERIA).find(
      (chip) => chip.label === 'Sans logements étudiants',
    );
    expect(student?.patch).toEqual({ excludeStudent: false });
  });

  it('compte aussi le bailleur, le meublé, la date et les quartiers inconnus', () => {
    expect(
      labels({
        ...CRITERIA,
        landlordFilter: 'private',
        furnishedFilter: 'unfurnished',
        availableBy: '2026-10-01',
        includeUnknownDistrict: false,
      }),
    ).toEqual([
      '87 quartiers',
      'Quartier connu exigé',
      'Trajet ≤ 60 min',
      'Sans colocations',
      'Sans logements étudiants',
      'Dispo. avant le 01/10/2026',
      'Particuliers',
      'Non meublé',
    ]);
  });
});
