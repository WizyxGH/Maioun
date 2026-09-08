/**
 * LES FILTRES ET LES ALERTES DOIVENT DIRE LA MÊME CHOSE (§75).
 *
 * Deux chemins mènent aux mêmes préférences, et ils ne se ressemblent pas :
 *
 *   - la LISTE lit les critères enregistrés DIRECTEMENT depuis la base, dans
 *     `liveFilters`, et les passe à `traitConditions` ;
 *   - les ALERTES passent par la configuration du collecteur, donc par
 *     `withStoredCriteria` → `validateFilters`, qui recopie champ par champ.
 *
 * C'est cette recopie qui a lâché : `availableBy` et `districts` y ont été
 * oubliés. La liste filtrait donc correctement par quartier, et les
 * notifications signalaient des annonces dans des quartiers explicitement
 * exclus — un filtre qui a l'air de fonctionner et ne fonctionne qu'à moitié.
 *
 * Ce test ne vérifie pas un cas, il vérifie une PARITÉ : tout ce que
 * `traitConditions` sait filtrer doit survivre à la validation. Le prochain
 * filtre ajouté sera couvert sans qu'on y pense.
 */

import { describe, expect, it } from 'vitest';
import { withStoredCriteria } from '../config.js';
import { traitConditions, type TraitFilters } from './trait-filters.js';
import { MVP_CRITERIA } from '@maioun/shared';

/** Un jeu de critères où CHAQUE préférence de lecture est réglée. */
const TOUT_REGLE = {
  cities: ['nice'],
  maxPrice: 700,
  minPrice: 250,
  minArea: 20,
  maxCommuteMinutes: 45,
  excludeFlatShare: true,
  excludeStudent: true,
  landlordFilter: 'agency',
  furnishedFilter: 'furnished',
  availableBy: '2026-10-01',
  districts: ['riquier', 'gambetta'],
} as const;

const CONFIG = {
  criteria: MVP_CRITERIA,
  referencePricePerSqm: 20,
} as unknown as Parameters<typeof withStoredCriteria>[0];

describe('parité entre les filtres de la liste et ceux des alertes', () => {
  it('conserve TOUTES les préférences de lecture à travers la validation', () => {
    const config = withStoredCriteria(CONFIG, JSON.stringify(TOUT_REGLE));
    const criteria = config.criteria as TraitFilters;

    // Le test de vérité : les conditions SQL produites de part et d'autre.
    // Si un champ se perd en route, il manque une condition — et l'alerte
    // signale ce que la liste masque.
    const attendu = traitConditions(TOUT_REGLE);
    const obtenu = traitConditions(criteria);

    expect(obtenu.sql).toEqual(attendu.sql);
    expect(obtenu.args).toEqual(attendu.args);
  });

  it('n’accepte pas n’importe quel quartier', () => {
    // Un slug inventé produirait un filtre qui ne rend jamais rien, sans que
    // l'écran ait le moyen de le dire.
    const config = withStoredCriteria(
      CONFIG,
      JSON.stringify({ ...TOUT_REGLE, districts: ['riquier', 'atlantide'] }),
    );
    expect((config.criteria as TraitFilters).districts).toEqual(['riquier']);
  });

  it('n’accepte pas une date qui n’en est pas une', () => {
    const config = withStoredCriteria(
      CONFIG,
      JSON.stringify({ ...TOUT_REGLE, availableBy: 'demain' }),
    );
    expect((config.criteria as TraitFilters).availableBy).toBeUndefined();
  });
});
