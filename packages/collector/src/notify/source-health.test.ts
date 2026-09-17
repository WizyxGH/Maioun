/**
 * La surveillance des sources : ce qui doit sonner, et surtout ce qui ne doit
 * PAS sonner.
 *
 * Chaque cas correspond à une panne réelle ou à une fausse alerte mesurée sur
 * les quatorze jours de `collection_runs` (relevé du 2026-09-16).
 */

import { describe, expect, it } from 'vitest';
import {
  deduplicate,
  detectSourceAlerts,
  parseReported,
  sourceHealthPush,
  type SourceAlert,
} from './source-health.js';
import type { SourceObservation, WatchedField } from '../db/repository.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-16T12:00:00.000Z');

const dayKey = (offset: number): string => new Date(NOW - offset * DAY).toISOString().slice(0, 10);

function observation(over: Partial<SourceObservation> & { sourceId: string }): SourceObservation {
  return {
    newByDay: new Map(),
    stopReasons: [],
    activeCount: 0,
    fields: new Map(),
    ...over,
  };
}

/** Une source qui publie `perDay` annonces neuves par jour depuis `days` jours. */
function steady(sourceId: string, perDay: number, days: number, silentDays = 0): SourceObservation {
  const newByDay = new Map<string, number>();
  for (let offset = silentDays; offset < days; offset += 1) newByDay.set(dayKey(offset), perDay);
  for (let offset = 0; offset < silentDays; offset += 1) newByDay.set(dayKey(offset), 0);
  return observation({ sourceId, newByDay, activeCount: 100 });
}

function fields(
  entries: readonly [WatchedField, { older: [number, number]; recent: [number, number] }][],
): SourceObservation['fields'] {
  return new Map(
    entries.map(([name, spec]) => [
      name,
      {
        older: { total: spec.older[0], filled: spec.older[1] },
        recent: { total: spec.recent[0], filled: spec.recent[1] },
      },
    ]),
  );
}

const EMPTY = { transitions: [], lifecycleSkips: [], observations: [], nowMs: NOW };
const kinds = (alerts: readonly SourceAlert[]): string[] => alerts.map((one) => one.kind);

describe('changement de santé', () => {
  it('signale une source qui se dégrade, en nommant l’erreur', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      transitions: [
        {
          sourceId: 'marchal',
          from: 'healthy',
          to: 'degraded',
          listingsFound: 0,
          error: 'gabarit inconnu',
        },
      ],
    });
    expect(kinds(alerts)).toEqual(['health']);
    expect(alerts[0]?.detail).toContain('gabarit inconnu');
  });

  it('signale aussi le retour à la normale', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      transitions: [
        { sourceId: 'bbii', from: 'blocked', to: 'healthy', listingsFound: 12, error: null },
      ],
    });
    expect(kinds(alerts)).toEqual(['recovered']);
  });
});

describe('effondrement du stock', () => {
  it('reprend le verdict du cycle de vie sans le recalculer', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      lifecycleSkips: [
        {
          sourceId: 'rentumo',
          code: 'collapse',
          reason: 'chute suspecte : 21 annonces rendues pour 107 connues',
        },
      ],
      observations: [observation({ sourceId: 'rentumo', activeCount: 107 })],
    });
    expect(kinds(alerts)).toEqual(['collapse']);
    expect(alerts[0]?.detail).toContain('21 annonces rendues pour 107 connues');
  });

  it('ignore un passage aveugle : on n’a pas regardé, ce n’est pas une panne', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      lifecycleSkips: [
        { sourceId: 'locservice', code: 'blind', reason: 'inventaire lu en partie seulement' },
      ],
      observations: [observation({ sourceId: 'locservice', activeCount: 784 })],
    });
    expect(alerts).toEqual([]);
  });
});

describe('page rendue sans la moindre annonce', () => {
  const skip = {
    code: 'emptyWithoutSign' as const,
    reason: 'aucune annonce, sans liste vide affichée par la source',
  };

  it('signale une source qui a du stock et ne rend plus rien', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      lifecycleSkips: [{ sourceId: 'giletta', ...skip }],
      observations: [observation({ sourceId: 'giletta', activeCount: 30 })],
    });
    expect(kinds(alerts)).toEqual(['template']);
  });

  it('SE TAIT pour une agence qui n’a simplement rien à louer', () => {
    // Trente sources sont dans ce cas le 2026-09-16 et se portent très bien :
    // sans ce garde-fou, la surveillance les nommerait toutes à chaque passage.
    const alerts = detectSourceAlerts({
      ...EMPTY,
      lifecycleSkips: [{ sourceId: 'petite-agence', ...skip }],
      observations: [observation({ sourceId: 'petite-agence', activeCount: 0 })],
    });
    expect(alerts).toEqual([]);
  });
});

describe('source muette', () => {
  it('signale Rentumo : rien de neuf depuis trois jours, 40 attendues', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [steady('rentumo', 40, 10, 3)],
    });
    expect(kinds(alerts)).toEqual(['silent']);
    expect(alerts[0]?.detail).toContain('3 jours');
  });

  it('se tait pour une petite agence au rythme lent', () => {
    // Une annonce par jour : trois jours sans rien n'a rien d'anormal.
    expect(detectSourceAlerts({ ...EMPTY, observations: [steady('winter', 1, 10, 3)] })).toEqual(
      [],
    );
  });

  it('se tait pour une source dont le catalogue est arrivé d’un coup', () => {
    // Trente annonces au premier passage, puis plus rien : c'est le profil
    // d'une source ajoutée la semaine dernière, pas celui d'une panne. Une
    // moyenne garderait la rafale en mémoire ; la médiane l'ignore.
    const newByDay = new Map<string, number>();
    newByDay.set(dayKey(12), 30);
    for (let offset = 0; offset <= 11; offset += 1) newByDay.set(dayKey(offset), 0);
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [observation({ sourceId: 'giletta', newByDay, activeCount: 30 })],
    });
    expect(alerts).toEqual([]);
  });

  it('se tait pour une source qui n’a pas tourné : elle n’a pas parlé', () => {
    const base = steady('orpi', 40, 10, 3);
    const newByDay = new Map(base.newByDay);
    newByDay.delete(dayKey(0));
    newByDay.delete(dayKey(1));
    expect(
      detectSourceAlerts({ ...EMPTY, observations: [observation({ ...base, newByDay })] }),
    ).toEqual([]);
  });

  it('se tait pour une source sans stock, quel que soit son passé', () => {
    const base = steady('agence-vide', 40, 10, 3);
    expect(
      detectSourceAlerts({ ...EMPTY, observations: [observation({ ...base, activeCount: 0 })] }),
    ).toEqual([]);
  });
});

describe('passages interrompus', () => {
  it('signale Foncia, que la santé laissait au vert', () => {
    // Un scraper qui S'ARRÊTE sur « bloqué » rend un résultat au lieu de lever :
    // l'état de santé restait « saine » après 91 passages bloqués.
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [
        observation({
          sourceId: 'foncia',
          stopReasons: ['blocked', 'blocked', 'blocked'],
          activeCount: 24,
        }),
      ],
    });
    expect(kinds(alerts)).toEqual(['interrupted']);
  });

  it('se tait tant que le dernier passage a abouti', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [
        observation({
          sourceId: 'foncia',
          stopReasons: ['blocked', 'blocked', 'completed'],
          activeCount: 24,
        }),
      ],
    });
    expect(alerts).toEqual([]);
  });
});

describe('champ clé disparu', () => {
  it('signale un téléphone qui disparaît des nouvelles annonces', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [
        observation({
          sourceId: 'fnaim',
          activeCount: 222,
          fields: fields([['phone', { older: [80, 78], recent: [9, 0] }]]),
        }),
      ],
    });
    expect(kinds(alerts)).toEqual(['field']);
    expect(alerts[0]?.detail).toContain('téléphone');
  });

  it('se tait quand le champ n’était déjà là qu’une fois sur deux', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [
        observation({
          sourceId: 'paruvendu',
          activeCount: 205,
          fields: fields([['phone', { older: [80, 40], recent: [9, 0] }]]),
        }),
      ],
    });
    expect(alerts).toEqual([]);
  });

  it('se tait sur trop peu d’annonces récentes pour conclure', () => {
    const alerts = detectSourceAlerts({
      ...EMPTY,
      observations: [
        observation({
          sourceId: 'petite',
          activeCount: 40,
          fields: fields([['price', { older: [80, 80], recent: [2, 0] }]]),
        }),
      ],
    });
    expect(alerts).toEqual([]);
  });
});

describe('une alerte par source et par incident', () => {
  const alert: SourceAlert = { sourceId: 'rentumo', kind: 'silent', detail: 'muette' };

  it('ne répète pas la même alerte au passage suivant', () => {
    const first = deduplicate([alert], {}, NOW);
    expect(first.fresh).toHaveLength(1);

    // Trente minutes plus tard, la collecte repasse et le symptôme est toujours là.
    const second = deduplicate([alert], first.memory, NOW + 30 * 60_000);
    expect(second.fresh).toEqual([]);
  });

  it('ne rouvre pas l’incident sur une rechute le lendemain', () => {
    // Pujol va mal un passage sur deux : sans délai de refroidissement, chaque
    // rechute comptait pour un incident neuf.
    const first = deduplicate([alert], {}, NOW);
    const calme = deduplicate([], first.memory, NOW + 6 * 3_600_000);
    const rechute = deduplicate([alert], calme.memory, NOW + 12 * 3_600_000);
    expect(rechute.fresh).toEqual([]);
  });

  it('resignale après vingt-quatre heures de calme : c’est un incident neuf', () => {
    const first = deduplicate([alert], {}, NOW);
    const plusTard = deduplicate([alert], first.memory, NOW + 30 * 3_600_000);
    expect(plusTard.fresh).toHaveLength(1);
  });

  it('un rétablissement referme ce qui était ouvert sur la source', () => {
    const first = deduplicate([alert], {}, NOW);
    const guerie = deduplicate(
      [{ sourceId: 'rentumo', kind: 'recovered', detail: 'de nouveau saine' }],
      first.memory,
      NOW + 3_600_000,
    );
    expect(kinds(guerie.fresh)).toEqual(['recovered']);
    expect(guerie.memory).toEqual({});

    // Et une rechute ultérieure se dit de nouveau.
    expect(deduplicate([alert], guerie.memory, NOW + 2 * 3_600_000).fresh).toHaveLength(1);
  });

  it('repart d’une mémoire vide si le réglage est illisible, sans lever', () => {
    expect(parseReported('{ pas du json')).toEqual({});
    expect(parseReported(null)).toEqual({});
    expect(parseReported('{"a|silent":"2026-09-16T00:00:00.000Z"}')).toEqual({
      'a|silent': '2026-09-16T00:00:00.000Z',
    });
  });
});

describe('la notification', () => {
  it('groupe tout en un seul message, sous une étiquette fixe', () => {
    const payload = sourceHealthPush(
      [
        { sourceId: 'rentumo', kind: 'silent', detail: 'muette' },
        { sourceId: 'foncia', kind: 'interrupted', detail: 'bloquée' },
      ],
      'https://exemple.test/app/',
    );
    // L'étiquette fixe fait REMPLACER la notification précédente : il ne peut
    // jamais y avoir plus d'un avis d'exploitation en attente.
    expect(payload?.tag).toBe('maioun-sources');
    expect(payload?.title).toContain('2 sources');
    expect(payload?.body).toContain('rentumo');
    expect(payload?.body).toContain('foncia');
    expect(payload?.url).toBe('https://exemple.test/app/sources');
    // Aucun identifiant d'annonce : ce n'est pas une alerte de logement.
    expect(payload?.listingId).toBeUndefined();
  });

  it('nomme les plus graves et compte le reste', () => {
    const many: SourceAlert[] = Array.from({ length: 7 }, (_, i) => ({
      sourceId: `source-${i}`,
      kind: 'silent',
      detail: 'muette',
    }));
    expect(sourceHealthPush(many, 'https://exemple.test')?.body).toContain('et 3 autres');
  });

  it('ne compose rien quand il n’y a rien à dire', () => {
    expect(sourceHealthPush([], 'https://exemple.test')).toBeNull();
  });

  it('n’annonce pas une panne quand un candidat endormi se réveille', () => {
    const payload = sourceHealthPush(
      [{ sourceId: 'confiance-immobiliere', kind: 'awake', detail: 'son sitemap rend 4 annonces' }],
      'https://exemple.test',
    );
    expect(payload?.title).toContain('candidat');
    expect(payload?.title).not.toContain('à vérifier');
    // Même étiquette : un seul avis d'exploitation en attente, quel qu'il soit.
    expect(payload?.tag).toBe('maioun-sources');
  });

  it('parle d’abord des pannes quand les deux arrivent ensemble', () => {
    const payload = sourceHealthPush(
      [
        { sourceId: 'confiance-immobiliere', kind: 'awake', detail: 'réveillée' },
        { sourceId: 'foncia', kind: 'interrupted', detail: 'bloquée' },
      ],
      'https://exemple.test',
    );
    expect(payload?.title).toContain('1 source');
    expect(payload?.body.indexOf('foncia')).toBeLessThan(
      payload?.body.indexOf('confiance-immobiliere') ?? 0,
    );
  });
});
