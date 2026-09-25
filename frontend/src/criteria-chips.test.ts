/**
 * LES CRITÈRES FILTRENT, DONC ILS COMPTENT.
 *
 * Relevé du compte le 2026-09-16 : 87 quartiers, deux exclusions, un plafond de
 * trajet — et « 3 » sur la pastille, parce qu'on ne comptait que les filtres du
 * navigateur.
 */

import { describe, expect, it } from 'vitest';
import { NICE_DISTRICTS } from '@maioun/shared';
import { clearedCriteria, criteriaChips } from './criteria-chips.js';
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
      '250 – 700 €',
      '≥ 20 m²',
      'Trajet ≤ 60 min',
      'Sans colocations',
      'Sans logements étudiants',
    ]);
  });

  /**
   * LE BUDGET EST REVENU ICI. Il appartenait aux filtres rapides, qui
   * s'ouvraient sur les critères — 250–700 €, ≥ 20 m², écrits en dur pour tout
   * le monde. Ces valeurs ont quitté le code ; le serveur, lui, applique
   * toujours le budget enregistré d'un compte. Sans puce, ce filtre-là
   * redevenait invisible.
   */
  it('porte le budget et la surface du compte, que le serveur applique', () => {
    const budget = criteriaChips(CRITERIA).find((chip) => chip.label === '250 – 700 €');
    expect(budget?.patch).toEqual({ minPrice: undefined, maxPrice: undefined });
    const surface = criteriaChips(CRITERIA).find((chip) => chip.label === '≥ 20 m²');
    expect(surface?.patch).toEqual({ minArea: undefined, maxArea: undefined });
  });

  it('dit la borne réellement posée, et elle seule', () => {
    expect(labels({ ...CRITERIA, minPrice: undefined })).toContain('≤ 700 €');
    expect(labels({ ...CRITERIA, maxPrice: undefined })).toContain('≥ 250 €');
    expect(labels({ ...CRITERIA, minArea: undefined, maxArea: 60 })).toContain('≤ 60 m²');
  });

  // Un compte qui n'a posé ni budget ni surface n'en voit pas la puce.
  it('n’invente ni budget ni surface', () => {
    const sans = { ...CRITERIA, minPrice: undefined, maxPrice: undefined, minArea: undefined };
    for (const label of labels(sans)) expect(label).not.toMatch(/€|m²/);
  });

  it('ne dit rien des quartiers quand ils sont tous retenus', () => {
    const all = NICE_DISTRICTS.map((district) => district.slug);
    expect(labels({ ...CRITERIA, districts: all })).not.toContain(`${all.length} quartiers`);
    expect(labels({ ...CRITERIA, districts: [] })).not.toContain('0 quartier');
  });

  it('n’invente aucun filtre tant que les critères ne sont pas là', () => {
    expect(criteriaChips(null)).toEqual([]);
  });

  it('promet de retirer CHACUNE, sans exception', () => {
    // Les quartiers et le plafond de trajet s'affichaient sans croix, avec un
    // renvoi au panneau : rien à l'écran ne disait pourquoi ces deux-là
    // seulement. Leurs raisons de fond ont été traitées ailleurs — retour
    // arrière après effacement, « aucun plafond » enregistrable.
    for (const chip of criteriaChips(CRITERIA)) {
      expect(chip.patch, chip.label).not.toBeNull();
      expect(Object.keys(chip.patch).length, chip.label).toBeGreaterThan(0);
    }
  });

  it('lève les quartiers en rendant toute la commune', () => {
    const districts = criteriaChips(CRITERIA).find((chip) => chip.label === '87 quartiers');
    // Liste vide = toute la commune, côté liste comme côté alertes. L'exclusion
    // des quartiers inconnus part avec : seule, elle ne désigne plus rien.
    expect(districts?.patch).toEqual({ districts: [], includeUnknownDistrict: true });
  });

  it('lève le plafond de trajet en retirant le critère, jamais en le mettant à zéro', () => {
    const commute = criteriaChips(CRITERIA).find((chip) => chip.label === 'Trajet ≤ 60 min');
    expect(commute?.patch).toEqual({ maxCommuteMinutes: undefined });
    expect(commute?.patch.maxCommuteMinutes).not.toBe(0);
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
      '250 – 700 €',
      '≥ 20 m²',
      'Trajet ≤ 60 min',
      'Sans colocations',
      'Sans logements étudiants',
      'Dispo. avant le 01/10/2026',
      'Particuliers',
      'Non meublé',
    ]);
  });
});

/**
 * « EFFACER TOUT » EFFACE LES CRITÈRES AUSSI, et il ne doit pas en oublier.
 *
 * Le lien ne touchait qu'à l'affichage, avec une phrase dessous pour l'avouer.
 * Demande de l'utilisateur : ni la phrase, ni l'exception. Reste à garantir
 * qu'il lève EXACTEMENT ce que la barre montre — une puce qui survit à
 * « Effacer tout » serait un filtre qu'on croit levé et qui filtre encore.
 */
describe('clearedCriteria', () => {
  it('ne laisse plus une seule puce debout', () => {
    expect(criteriaChips(clearedCriteria(CRITERIA))).toEqual([]);
  });

  it('lève chacun des critères nommés, un par un', () => {
    const cleared = clearedCriteria({
      ...CRITERIA,
      landlordFilter: 'private',
      furnishedFilter: 'furnished',
      availableBy: '2026-10-01',
      includeUnknownDistrict: false,
    });
    expect(cleared.districts).toEqual([]);
    expect(cleared.includeUnknownDistrict).toBe(true);
    expect(cleared.maxCommuteMinutes).toBeUndefined();
    expect(cleared.excludeFlatShare).toBe(false);
    expect(cleared.excludeStudent).toBe(false);
    expect(cleared.availableBy).toBe('');
    expect(cleared.landlordFilter).toBe('all');
    expect(cleared.furnishedFilter).toBe('all');
  });

  it('garde le périmètre — la commune, et elle seule', () => {
    // La commune n'est pas un filtre : sans elle il ne reste rien à chercher.
    // Le budget, lui, porte désormais une puce — et une puce qui survivrait à
    // « Effacer tout » serait l'exception qu'on a retirée aux quartiers.
    const cleared = clearedCriteria(CRITERIA);
    expect(cleared.cities).toEqual(['nice']);
    expect(cleared.maxPrice).toBeUndefined();
    expect(cleared.minPrice).toBeUndefined();
    expect(cleared.minArea).toBeUndefined();
  });

  it('ne met jamais le plafond de trajet à zéro', () => {
    // Zéro minute n'écarte pas, il vide : aucune annonce localisée ne passe.
    expect(clearedCriteria(CRITERIA).maxCommuteMinutes).not.toBe(0);
  });
});
