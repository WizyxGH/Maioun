// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

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
      'Trajet ≤ 60 min',
      'Sans colocations',
      'Sans logements étudiants',
    ]);
  });

  /**
   * LE BUDGET, LA SURFACE ET LA COMMUNE N'ONT PAS DE PUCE — et la croix qu'ils
   * ont portée un temps est la raison de ce test.
   *
   * Elle ne faisait rien. Le retrait s'écrivait bien en base, mais la clé
   * absente était RECOMBLÉE par les valeurs du projet à la lecture suivante :
   * la puce disparaissait de la barre, et la liste continuait d'écarter à
   * 700 €. Rien en aval ne sait dire « aucun budget » — la collecte construit
   * ses requêtes avec, le score s'y mesure, les alertes s'en servent.
   */
  it('ne met pas de puce sur le périmètre : commune, budget, surface', () => {
    for (const label of labels(CRITERIA)) expect(label).not.toMatch(/€|m²|[Nn]ice/);
  });

  it('les laisse donc intacts après « Effacer tout »', () => {
    const efface = clearedCriteria(CRITERIA);
    expect(efface.maxPrice).toBe(700);
    expect(efface.minPrice).toBe(250);
    expect(efface.minArea).toBe(20);
    expect(efface.cities).toEqual(['nice']);
    // Ce qui part, en revanche, part vraiment.
    expect(efface.districts).toEqual([]);
    expect(efface.excludeFlatShare).toBe(false);
    expect(efface.maxCommuteMinutes).toBeUndefined();
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

  /**
   * TOUT CE QUI ÉCARTE A SA PUCE, et se retire d'un clic. Un critère qui filtre
   * sans se montrer est exactement ce que cette barre existe pour empêcher.
   */
  it('montre le dernier étage quand il est exclu', () => {
    expect(labels({ ...CRITERIA, excludeTopFloor: true })).toContain('Sans dernier étage');
    const puce = criteriaChips({ ...CRITERIA, excludeTopFloor: true }).find(
      (chip) => chip.label === 'Sans dernier étage',
    );
    expect(puce?.patch).toEqual({ excludeTopFloor: false });
  });

  it('n’en dit rien quand il n’est pas exclu', () => {
    expect(labels(CRITERIA)).not.toContain('Sans dernier étage');
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

  it('ne met jamais le plafond de trajet à zéro', () => {
    // Zéro minute n'écarte pas, il vide : aucune annonce localisée ne passe.
    expect(clearedCriteria(CRITERIA).maxCommuteMinutes).not.toBe(0);
  });
});
