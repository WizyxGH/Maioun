/**
 * CE QUE LA LOI PLAFONNE, et ce qu'on refuse de conclure sans preuve.
 *
 * Deux montants publiés par les annonces, comparables à une règle écrite. La
 * difficulté n'est pas le calcul : c'est de rendre `null` partout où un
 * élément manque, plutôt que de mettre en cause une agence sur une supposition.
 */

import { describe, expect, it } from 'vitest';
import {
  amountOverCap,
  INVENTORY_FEE_CAP_PER_SQM,
  legalDepositCap,
  legalTenantFeeCap,
  TENANT_FEE_CAP_PER_SQM_TIGHT,
} from './rental-caps.js';

describe('le plafond des honoraires', () => {
  it('additionne les deux postes plafonnés du décret', () => {
    // 15 m² : visite/dossier/bail + état des lieux.
    expect(legalTenantFeeCap(15)).toBeCloseTo(
      15 * (TENANT_FEE_CAP_PER_SQM_TIGHT + INVENTORY_FEE_CAP_PER_SQM),
      5,
    );
  });

  /**
   * NICE EST EN ZONE TENDUE, PAS TRÈS TENDUE — la zone très tendue est la zone
   * A bis, parisienne. Deux euros du m² de marge à tort feraient passer pour
   * légale une trentaine d'euros de trop sur un studio.
   */
  it('applique le barème de la zone tendue, et non celui de Paris', () => {
    expect(TENANT_FEE_CAP_PER_SQM_TIGHT).toBeLessThan(12);
  });

  it('ne rend aucun plafond sans surface', () => {
    expect(legalTenantFeeCap(null)).toBeNull();
    expect(legalTenantFeeCap(0)).toBeNull();
  });

  /** Le cas vérifié dans le corpus : chambre de 15 m², « (hono 720) ». */
  it('mesure l’écart du cas relevé le 2026-09-22', () => {
    const cap = legalTenantFeeCap(15);
    expect(amountOverCap(720, cap)).toBeGreaterThan(500);
  });
});

describe('le plafond du dépôt de garantie', () => {
  const vide = { price: 700, charges: null, chargesIncluded: false };

  it('vaut un mois hors charges pour un logement vide', () => {
    expect(legalDepositCap(vide, false)).toBe(700);
  });

  it('vaut deux mois pour un meublé', () => {
    expect(legalDepositCap(vide, true)).toBe(1400);
  });

  /**
   * MEUBLÉ INCONNU : PAS DE PLAFOND. Un mois par défaut ferait dépasser tous
   * les meublés en règle ; deux mois laisserait passer les vides abusifs.
   */
  it('ne conclut rien quand on ignore si le bien est meublé', () => {
    expect(legalDepositCap(vide, null)).toBeNull();
  });

  /** Le plafond porte sur le loyer HORS CHARGES : sans lui, pas de plafond. */
  it('ne conclut rien quand le loyer hors charges ne se déduit pas', () => {
    expect(legalDepositCap({ price: 700, charges: null, chargesIncluded: true }, false)).toBeNull();
  });

  it('retire les charges quand elles sont connues', () => {
    expect(legalDepositCap({ price: 700, charges: 50, chargesIncluded: true }, false)).toBe(650);
  });
});

describe('l’écart au plafond', () => {
  it('ne signale rien tant que le plafond est respecté', () => {
    expect(amountOverCap(196, 196.35)).toBeNull();
  });

  /** Les plafonds indexés tombent sur des centimes ; les annonces arrondissent. */
  it('tolère un arrondi, pas un dépassement', () => {
    expect(amountOverCap(197, 196.35)).toBeNull();
    expect(amountOverCap(250, 196.35)).toBeCloseTo(53.65, 2);
  });

  /**
   * LES CAS RELEVÉS LE 2026-09-22, qui ont fixé la tolérance : deux dépôts
   * dépassaient de 5 € et 10 € sur des plafonds de 1 978 € et 3 290 €, deux
   * autres de 100 € et 300 €. Une marge fixe les confondait tous.
   */
  it('absorbe un écart de 0,3 % et garde un écart de 5 %', () => {
    expect(amountOverCap(1983, 1978)).toBeNull();
    expect(amountOverCap(3300, 3290)).toBeNull();
    expect(amountOverCap(2290, 2190)).toBeCloseTo(100, 2);
    expect(amountOverCap(2548, 2248)).toBeCloseTo(300, 2);
  });

  it('ne conclut rien sans montant ni sans plafond', () => {
    expect(amountOverCap(null, 196)).toBeNull();
    expect(amountOverCap(720, null)).toBeNull();
  });
});
