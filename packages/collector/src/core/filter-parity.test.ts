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
import { parseLiveFilters } from '../server/routes.js';
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
  // La valeur NON par défaut : c'est elle qui doit survivre au trajet, le
  // défaut étant l'absence.
  includeUnknownDistrict: false,
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

/**
 * UNE CLÉ MANQUANTE NE DOIT PAS ÉTEINDRE LE FILTRAGE DE LA LISTE.
 *
 * Les deux chemins ne traitaient pas l'absence de la même façon : les alertes
 * comblent chaque trou avec les défauts du projet, la liste rendait
 * `undefined` dès que le loyer ou la surface manquait — et `undefined` veut
 * dire « aucun filtre », quartiers et exclusions compris. Une ligne de
 * réglages incomplète affichait donc les colocations que les alertes, elles,
 * continuaient d'écarter.
 */
describe('parité quand des clés manquent', () => {
  /** Des préférences réglées, sans le loyer ni la surface. */
  const SANS_MONTANTS = { excludeFlatShare: true, districts: ['riquier'] };

  it('applique les mêmes conditions que les alertes', () => {
    const alertes = traitConditions(
      withStoredCriteria(CONFIG, JSON.stringify(SANS_MONTANTS)).criteria as TraitFilters,
    );
    const liste = parseLiveFilters(SANS_MONTANTS, true);
    expect(liste).toBeDefined();
    expect(traitConditions(liste as TraitFilters).sql).toEqual(alertes.sql);
    expect(traitConditions(liste as TraitFilters).args).toEqual(alertes.args);
  });

  it('retombe sur le loyer et la surface du projet', () => {
    expect(parseLiveFilters(SANS_MONTANTS, true)).toMatchObject({
      maxPrice: MVP_CRITERIA.maxPrice,
      minArea: MVP_CRITERIA.minArea,
    });
  });

  it('mais un lien partagé, lui, reste refusé', () => {
    // Il vient d'une adresse : un montant illisible y signale un lien abîmé,
    // pas une préférence absente.
    expect(parseLiveFilters(SANS_MONTANTS)).toBeUndefined();
    expect(parseLiveFilters({ maxPrice: 'beaucoup', minArea: 20 })).toBeUndefined();
  });
});

/**
 * « AUCUN PLAFOND DE TRAJET » EST UN CHOIX, ET IL NE TENAIT PAS.
 *
 * Les deux lectures comblaient l'absence par le plafond du projet — soixante
 * minutes. Conséquence : retirer le plafond, en vidant le champ ou en retirant
 * sa puce, ne changeait rien. La puce disparaissait, la liste continuait
 * d'écarter au-delà d'une heure, et le plafond réapparaissait au rechargement.
 * Un réglage qui revient tout seul est pire qu'un réglage absent : on croit
 * l'avoir raté.
 *
 * Zéro n'est pas un plafond non plus, et il était accepté : aucune annonce
 * localisée ne passe sous zéro minute (liste tombée à 26 sur 67).
 */
describe('un plafond de trajet retiré n’est pas recomblé', () => {
  /** Tout est réglé, SAUF le plafond : `JSON.stringify` retire la clé. */
  const SANS_PLAFOND = { ...TOUT_REGLE, maxCommuteMinutes: undefined };

  /** Les critères tels que les ALERTES les liront. */
  const pourLesAlertes = (stored: object): TraitFilters =>
    withStoredCriteria(CONFIG, JSON.stringify(stored)).criteria as TraitFilters;

  it('les alertes ne le remplacent pas par celui du projet', () => {
    const criteria = pourLesAlertes(SANS_PLAFOND);
    expect(criteria.maxCommuteMinutes).toBeUndefined();
    // La preuve est dans le SQL : plus de condition sur la durée de trajet.
    expect(traitConditions(criteria).sql.join(' ')).not.toContain('commute_minutes');
  });

  it('la liste non plus, même quand elle comble les clés absentes', () => {
    const liste = parseLiveFilters(SANS_PLAFOND, true);
    expect(liste).toBeDefined();
    expect(liste?.maxCommuteMinutes).toBeUndefined();
    expect(traitConditions(liste as TraitFilters).sql.join(' ')).not.toContain('commute_minutes');
  });

  it('les deux lectures restent d’accord entre elles', () => {
    expect(traitConditions(parseLiveFilters(SANS_PLAFOND, true) as TraitFilters).sql).toEqual(
      traitConditions(pourLesAlertes(SANS_PLAFOND)).sql,
    );
  });

  it('refuse zéro des deux côtés : il ne filtre pas, il vide', () => {
    const zero = { ...TOUT_REGLE, maxCommuteMinutes: 0 };
    expect(pourLesAlertes(zero).maxCommuteMinutes).toBeUndefined();
    expect(parseLiveFilters(zero, true)?.maxCommuteMinutes).toBeUndefined();
  });

  it('mais garde un plafond réellement posé', () => {
    expect(pourLesAlertes(TOUT_REGLE).maxCommuteMinutes).toBe(45);
    expect(parseLiveFilters(TOUT_REGLE, true)?.maxCommuteMinutes).toBe(45);
  });
});
