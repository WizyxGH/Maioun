/**
 * Les mentions légales d'une fiche Apimo : charges, dépôt, honoraires.
 *
 * LE PIÈGE EST DANS L'ADDITION. Apimo publie « Honoraires locataire » et
 * « État des lieux charge locataire » sur deux lignes, et l'on croyait devoir
 * les ajouter. La première contient déjà la seconde.
 */

import { describe, expect, it } from 'vitest';
import { apimoMoney, type ApimoCriteria } from './criteria.js';

const mentions = (pairs: readonly (readonly [string, string])[]): ApimoCriteria => ({
  pairs,
  services: [],
  badges: [],
});

describe('apimoMoney', () => {
  /**
   * Relevé du 2026-09-23, Acropolis'immo, studio de 21,09 m² : la description
   * détaille « constitution de dossier 210,09 € + 63,27 (edl) », et le champ
   * affiche 274 € — leur somme, à l'arrondi près. Nous stockions 337,27 €,
   * soit trois euros du mètre carré de trop, et la fiche faisait passer pour
   * hors-la-loi une agence qui facture exactement au plafond.
   */
  it('n’ajoute pas l’état des lieux aux honoraires, qui le comprennent déjà', () => {
    const money = apimoMoney(
      mentions([
        ['Honoraires locataire', '274 €'],
        ['État des lieux charge locataire', '63,27 €'],
        ['Dépôt de garantie', '1 100 €'],
        ['Provision sur charges récupérables', '55 € / Mois'],
      ]),
    );
    expect(money.feesText).toBe('274 €');
    expect(money.depositText).toBe('1 100 €');
    expect(money.chargesText).toBe('55 € / Mois');
  });

  it('rend les honoraires seuls quand l’état des lieux n’est pas publié', () => {
    expect(apimoMoney(mentions([['Honoraires locataire', '247 €']])).feesText).toBe('247 €');
  });

  /** Un champ absent reste absent : pas de zéro inventé (§17). */
  it('ne rend rien quand la fiche ne publie aucun honoraire', () => {
    expect(apimoMoney(mentions([['Dépôt de garantie', '1 000 €']])).feesText).toBeUndefined();
  });
});
