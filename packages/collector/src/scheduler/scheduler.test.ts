/**
 * Tests du scheduler adaptatif (§7, §29).
 */

import { describe, expect, it } from 'vitest';
import type { SourceDescriptor, SourceRuntimeState } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../core/budgets.js';
import { decideForSource, effectiveInterval, planRun } from './scheduler.js';

const NOW = Date.parse('2026-08-14T12:00:00.000Z');

function descriptor(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return {
    id: 'test',
    name: 'Test',
    domain: 'example.invalid',
    kind: 'portal',
    method: 'html',
    priority: 1,
    schedule: scheduleFor('portal'),
    budget: budgetFor('portal'),
    enabled: true,
    manualOnly: false,
    allowedPaths: [],
    notes: '',
    ...overrides,
  };
}

function state(overrides: Partial<SourceRuntimeState> = {}): SourceRuntimeState {
  return {
    sourceId: 'test',
    health: 'healthy',
    lastRunAt: null,
    lastSuccessAt: null,
    last429At: null,
    lastBlockedAt: null,
    cooldownUntil: null,
    consecutiveErrors: 0,
    lastNewListingCount: 0,
    averageNewListingCount: 0,
    ...overrides,
  };
}

/** Instant situé `minutes` avant NOW. */
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

describe('effectiveInterval', () => {
  it('part de l’intervalle de base', () => {
    // Une source jamais exécutée n'a pas encore de moyenne exploitable.
    expect(effectiveInterval(descriptor(), state())).toBe(20);
  });

  it('resserre l’intervalle pour une source productive', () => {
    const interval = effectiveInterval(descriptor(), state({ averageNewListingCount: 8 }));
    expect(interval).toBe(10);
    expect(interval).toBeGreaterThanOrEqual(descriptor().schedule.minIntervalMinutes);
  });

  it('espace l’intervalle pour une source qui ne produit plus rien', () => {
    const interval = effectiveInterval(
      descriptor(),
      state({ averageNewListingCount: 0, lastSuccessAt: minutesAgo(120) }),
    );
    expect(interval).toBe(40);
  });

  it('espace exponentiellement en cas d’erreurs consécutives', () => {
    const one = effectiveInterval(descriptor(), state({ consecutiveErrors: 1 }));
    const three = effectiveInterval(descriptor(), state({ consecutiveErrors: 3 }));
    expect(three).toBeGreaterThan(one);
  });

  it('ne dépasse jamais le plafond de la source', () => {
    const interval = effectiveInterval(descriptor(), state({ consecutiveErrors: 20 }));
    expect(interval).toBe(descriptor().schedule.maxIntervalMinutes);
  });

  it('respecte les fréquences plus lentes des agences locales (§7)', () => {
    const local = descriptor({ kind: 'localAgency', schedule: scheduleFor('localAgency') });
    expect(effectiveInterval(local, state())).toBe(120);
  });
});

describe('decideForSource', () => {
  it('exécute une source jamais lancée', () => {
    const decision = decideForSource(descriptor(), state(), NOW);
    expect(decision.shouldRun).toBe(true);
    expect(decision.reason).toBe('jamais exécutée');
  });

  it('n’exécute pas une source désactivée', () => {
    const decision = decideForSource(descriptor({ enabled: false }), state(), NOW);
    expect(decision.shouldRun).toBe(false);
  });

  it('n’exécute jamais une source bloquée (§10)', () => {
    // Une source qui refuse l'accès automatisé sort définitivement du roulement.
    const decision = decideForSource(descriptor(), state({ health: 'blocked' }), NOW);
    expect(decision.shouldRun).toBe(false);
    expect(decision.reason).toMatch(/bloquée/);
  });

  it('respecte le cooldown après un 429', () => {
    const decision = decideForSource(
      descriptor(),
      state({ health: 'cooldown', cooldownUntil: new Date(NOW + 600_000).toISOString() }),
      NOW,
    );
    expect(decision.shouldRun).toBe(false);
    expect(decision.reason).toMatch(/cooldown/);
  });

  it('reprend l’exécution une fois le cooldown expiré', () => {
    const decision = decideForSource(
      descriptor(),
      state({
        health: 'cooldown',
        cooldownUntil: new Date(NOW - 1_000).toISOString(),
        lastRunAt: minutesAgo(120),
      }),
      NOW,
    );
    expect(decision.shouldRun).toBe(true);
  });

  it('attend que l’intervalle soit écoulé', () => {
    const decision = decideForSource(descriptor(), state({ lastRunAt: minutesAgo(5) }), NOW);
    expect(decision.shouldRun).toBe(false);
    expect(decision.reason).toMatch(/prochaine exécution dans/);
  });

  it('exécute une fois l’intervalle dépassé', () => {
    const decision = decideForSource(descriptor(), state({ lastRunAt: minutesAgo(30) }), NOW);
    expect(decision.shouldRun).toBe(true);
  });
});

describe('planRun', () => {
  it('trie par priorité et borne le nombre de sources par run (§29)', () => {
    const entries = [
      { descriptor: descriptor({ id: 'c', priority: 3 }), state: state({ sourceId: 'c' }) },
      { descriptor: descriptor({ id: 'a', priority: 1 }), state: state({ sourceId: 'a' }) },
      { descriptor: descriptor({ id: 'b', priority: 2 }), state: state({ sourceId: 'b' }) },
    ];

    const plan = planRun(entries, NOW, { maxSourcesPerRun: 2 });
    expect(plan.selected.map((decision) => decision.sourceId)).toEqual(['a', 'b']);
    expect(plan.skipped.some((decision) => decision.sourceId === 'c')).toBe(true);
  });

  it('reporte les sources excédentaires avec une raison explicite', () => {
    const entries = Array.from({ length: 5 }, (_unused, index) => ({
      descriptor: descriptor({ id: `s${index}`, priority: 1 }),
      state: state({ sourceId: `s${index}` }),
    }));

    const plan = planRun(entries, NOW, { maxSourcesPerRun: 2 });
    expect(plan.selected).toHaveLength(2);
    expect(plan.skipped.filter((d) => d.reason.includes('quota de sources'))).toHaveLength(3);
  });

  it('départage les sources de même priorité par ancienneté d’exécution', () => {
    // Garantit qu'une source n'est jamais indéfiniment évincée.
    const entries = [
      {
        descriptor: descriptor({ id: 'recent', priority: 1 }),
        state: state({ sourceId: 'recent', lastRunAt: minutesAgo(30) }),
      },
      {
        descriptor: descriptor({ id: 'ancien', priority: 1 }),
        state: state({ sourceId: 'ancien', lastRunAt: minutesAgo(300) }),
      },
    ];

    const plan = planRun(entries, NOW, { maxSourcesPerRun: 1 });
    expect(plan.selected[0]?.sourceId).toBe('ancien');
  });

  it('n’exécute aucune source quand aucune n’est due', () => {
    const entries = [
      {
        descriptor: descriptor({ id: 'a' }),
        state: state({ sourceId: 'a', lastRunAt: minutesAgo(1) }),
      },
    ];
    expect(planRun(entries, NOW, { maxSourcesPerRun: 6 }).selected).toHaveLength(0);
  });
});

/**
 * LA FAMINE, ET POURQUOI ELLE NE SE VOYAIT PAS.
 *
 * Le tri classait par priorité, et ne départageait par ancienneté qu'à priorité
 * ÉGALE. Avec six places par tick, cinq sources de priorité 1 et dix-neuf de
 * priorité 2, celles de priorité 3 et 4 ne passaient jamais — et rien ne le
 * signalait : une source jamais élue ne produit ni erreur, ni avertissement,
 * ni ligne d'état. Relevé du 2026-09-09 : deux sources sans exécution depuis
 * huit jours, une autre jamais exécutée de sa vie.
 */
describe('planRun — aucune source ne doit mourir de faim', () => {
  /** Une source qui a dépassé `n` fois son intervalle (20 min pour un portail). */
  const overdue = (id: string, priority: number, intervals: number) => ({
    descriptor: descriptor({ id, priority }),
    state: state({
      sourceId: id,
      lastRunAt: new Date(NOW - intervals * 40 * 60_000).toISOString(),
      // Un intervalle effectif de 40 min : le portail dort (aucune nouveauté),
      // donc son intervalle de base est doublé.
      lastSuccessAt: new Date(NOW - intervals * 40 * 60_000).toISOString(),
      averageNewListingCount: 0,
    }),
  });

  it('fait passer une source affamée devant les prioritaires', () => {
    const entries = [
      // Deux sources de priorité 1 tout juste dues : le cas de tous les ticks.
      overdue('prio1-a', 1, 1),
      overdue('prio1-b', 1, 1),
      // Une source de priorité 3 laissée huit jours : elle passait jamais.
      overdue('affamee', 3, 288),
    ];

    const plan = planRun(entries, NOW, { maxSourcesPerRun: 1 });
    expect(plan.selected.map((d) => d.sourceId)).toEqual(['affamee']);
  });

  it('classe les affamées de la plus délaissée à la moins délaissée', () => {
    const entries = [overdue('un-peu', 1, 5), overdue('beaucoup', 1, 50), overdue('moyen', 1, 20)];
    const plan = planRun(entries, NOW, { maxSourcesPerRun: 3 });
    expect(plan.selected.map((d) => d.sourceId)).toEqual(['beaucoup', 'moyen', 'un-peu']);
  });

  it('ne bouscule rien tant que personne n’est affamé', () => {
    // En régime ordinaire, la priorité continue de commander : c'est elle qui
    // règle le RYTHME, et le correctif ne devait pas la dissoudre.
    const entries = [overdue('c', 3, 1), overdue('a', 1, 1), overdue('b', 2, 1)];
    const plan = planRun(entries, NOW, { maxSourcesPerRun: 3 });
    expect(plan.selected.map((d) => d.sourceId)).toEqual(['a', 'b', 'c']);
  });

  it('donne sa chance à une source JAMAIS exécutée, quelle que soit sa priorité', () => {
    // `rentumo`, priorité 4, n'avait pas même une ligne d'état : jamais élue
    // depuis sa création. Une dette infinie doit passer devant un simple retard.
    const entries = [
      overdue('installee', 1, 2),
      {
        descriptor: descriptor({ id: 'jamais', priority: 4 }),
        state: state({ sourceId: 'jamais' }),
      },
    ];
    const plan = planRun(entries, NOW, { maxSourcesPerRun: 1 });
    expect(plan.selected.map((d) => d.sourceId)).toEqual(['jamais']);
  });

  it('départage deux dettes infinies par la priorité, sans laisser le hasard trancher', () => {
    // `Infinity - Infinity` vaut `NaN` : un comparateur qui le rend laisse
    // l'ordre à l'implémentation du tri.
    const entries = [
      { descriptor: descriptor({ id: 'z', priority: 3 }), state: state({ sourceId: 'z' }) },
      { descriptor: descriptor({ id: 'a', priority: 1 }), state: state({ sourceId: 'a' }) },
      { descriptor: descriptor({ id: 'm', priority: 2 }), state: state({ sourceId: 'm' }) },
    ];
    const plan = planRun(entries, NOW, { maxSourcesPerRun: 3 });
    expect(plan.selected.map((d) => d.sourceId)).toEqual(['a', 'm', 'z']);
  });
});
