/**
 * Le droit se DÉDUIT : ces tests vérifient surtout qu'il se REFERME tout seul.
 */

import { describe, expect, it } from 'vitest';
import { hasPaidPlan, planLabel } from './subscription.js';

const NOW = Date.parse('2026-09-09T10:00:00.000Z');
const plus = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe('hasPaidPlan', () => {
  it('ouvre un abonnement actif dont la période court encore', () => {
    expect(hasPaidPlan({ status: 'active', until: plus(20) }, NOW)).toBe(true);
  });

  it('ouvre un essai : un essai est un accès consenti', () => {
    expect(hasPaidPlan({ status: 'trialing', until: plus(7) }, NOW)).toBe(true);
  });

  it('referme quand la période payée est écoulée, même si l’état dit « active »', () => {
    // LE CAS QUI JUSTIFIE TOUT LE MODÈLE : un webhook manqué, une base restée
    // en arrière, et l'état ne bouge plus. La date, elle, avance sans nous.
    expect(hasPaidPlan({ status: 'active', until: plus(-1) }, NOW)).toBe(false);
  });

  it('referme sur un paiement en échec', () => {
    expect(hasPaidPlan({ status: 'past_due', until: plus(10) }, NOW)).toBe(false);
  });

  it('referme un abonnement résilié', () => {
    expect(hasPaidPlan({ status: 'canceled', until: plus(10) }, NOW)).toBe(false);
  });

  it('referme quand on n’a jamais rien su', () => {
    expect(hasPaidPlan({ status: null, until: null }, NOW)).toBe(false);
    expect(hasPaidPlan({ status: 'active', until: null }, NOW)).toBe(false);
    expect(hasPaidPlan({ status: 'active', until: 'demain' }, NOW)).toBe(false);
  });
});

describe('planLabel', () => {
  it('dit « payant » même si l’installation n’encaisse plus', () => {
    // Les clés retirées ne retirent pas un droit déjà payé.
    expect(planLabel({ status: 'active', until: plus(5) }, NOW, false)).toBe('paid');
  });

  it('distingue « a payé un jour » de « n’a jamais payé »', () => {
    expect(planLabel({ status: 'canceled', until: plus(-5) }, NOW, true)).toBe('expired');
    expect(planLabel({ status: null, until: null }, NOW, true)).toBe('free');
  });

  it('avoue qu’aucun paiement n’est branché', () => {
    expect(planLabel({ status: null, until: null }, NOW, false)).toBe('unconfigured');
  });
});
