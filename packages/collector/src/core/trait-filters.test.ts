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

  it('cumule les préférences dans l’ordre, arguments compris', () => {
    const { sql, args } = traitConditions({
      excludeFlatShare: true,
      excludeStudent: true,
      landlordFilter: 'agency',
      furnishedFilter: 'furnished',
      maxCommuteMinutes: 30,
    });
    expect(sql).toHaveLength(5);
    expect(args).toEqual([30]);
  });
});
