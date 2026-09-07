import { describe, expect, it } from 'vitest';
import { traitConditions } from './trait-filters.js';

/**
 * CES CONDITIONS SONT LE FILTRE, désormais : le scoring ne juge plus les
 * préférences. Ce qui se passe ici décide de ce qu'on affiche ET de ce qu'on
 * signale — les deux requêtes s'en servent, et c'est pourquoi elles vivent au
 * même endroit.
 */
describe('traitConditions', () => {
  it('ne filtre rien sans préférence', () => {
    expect(traitConditions({})).toEqual({ sql: [], args: [] });
    expect(traitConditions({ landlordFilter: 'all', furnishedFilter: 'all' }).sql).toEqual([]);
  });

  /**
   * UN TRAIT INCONNU N'ÉCARTE JAMAIS RIEN (§17). La plupart des annonces ne
   * disent rien de leur ameublement ni de leur bailleur ; les traiter comme des
   * « non » viderait la liste sur une information que les sources ne donnent
   * pas. D'où les `COALESCE` — c'est eux qu'on relit pour s'en assurer.
   */
  it('laisse passer l’inconnu, partout', () => {
    expect(traitConditions({ excludeFlatShare: true }).sql).toEqual([
      'COALESCE(flat_share, 0) = 0',
    ]);
    expect(traitConditions({ excludeStudent: true }).sql).toEqual([
      'COALESCE(student_only, 0) = 0',
    ]);
    expect(traitConditions({ furnishedFilter: 'furnished' }).sql).toEqual([
      'COALESCE(furnished, 1) = 1',
    ]);
    expect(traitConditions({ furnishedFilter: 'unfurnished' }).sql).toEqual([
      'COALESCE(furnished, 0) = 0',
    ]);
  });

  /**
   * « Particuliers seuls » garde les inconnus — beaucoup d'annonces de
   * particuliers ne se déclarent pas. « Agences uniquement » demande au
   * contraire une agence AVÉRÉE : c'est le sens de la demande.
   */
  it('traite les deux sens du filtre bailleur différemment, et c’est voulu', () => {
    expect(traitConditions({ landlordFilter: 'private' }).sql).toEqual([
      "COALESCE(landlord_kind, '') != 'agency'",
    ]);
    expect(traitConditions({ landlordFilter: 'agency' }).sql).toEqual(["landlord_kind = 'agency'"]);
  });

  it('porte le plafond de trajet en argument, et garde les trajets inconnus', () => {
    const { sql, args } = traitConditions({ maxCommuteMinutes: 45 });
    expect(sql).toEqual(['(commute_minutes IS NULL OR commute_minutes <= ?)']);
    expect(args).toEqual([45]);
  });

  it('borne la disponibilité à la FIN de la journée demandée', () => {
    // Sans cela, une annonce disponible le jour même mais horodatée dans
    // l’après-midi serait rejetée, quand la même rangée à minuit passerait.
    const { sql, args } = traitConditions({ availableBy: '2026-10-01' });
    expect(sql).toEqual(['(available_at IS NULL OR available_at <= ?)']);
    expect(args).toEqual(['2026-10-01T23:59:59.999Z']);
  });

  it('garde les disponibilités INCONNUES (§17)', () => {
    // Deux annonces sur trois ne publient aucune date : les écarter viderait la
    // liste des deux tiers dès la première date saisie.
    expect(traitConditions({ availableBy: '2026-10-01' }).sql[0]).toContain('available_at IS NULL');
  });

  it('ignore une date vide', () => {
    expect(traitConditions({ availableBy: '' }).sql).toEqual([]);
  });

  it('n’accepte QUE les quartiers nommés, contrairement aux autres filtres', () => {
    // Seul filtre qui écarte les inconnus : nommer des quartiers est une liste
    // blanche, pas une exclusion. « Je veux Riquier » ne veut pas dire
    // « Riquier et tout ce dont je ne sais rien ».
    const { sql, args } = traitConditions({ districts: ['riquier', 'port'] });
    expect(sql).toEqual(['district IN (?,?)']);
    expect(args).toEqual(['riquier', 'port']);
    expect(sql[0]).not.toContain('IS NULL');
  });

  it('ignore une liste de quartiers VIDE', () => {
    expect(traitConditions({ districts: [] }).sql).toEqual([]);
  });

  it('cumule les préférences dans l’ordre, arguments compris', () => {
    const { sql, args } = traitConditions({
      excludeFlatShare: true,
      excludeStudent: true,
      landlordFilter: 'agency',
      furnishedFilter: 'furnished',
      maxCommuteMinutes: 30,
      availableBy: '2026-10-01',
    });
    expect(sql).toHaveLength(6);
    expect(args).toEqual([30, '2026-10-01T23:59:59.999Z']);
  });
});
