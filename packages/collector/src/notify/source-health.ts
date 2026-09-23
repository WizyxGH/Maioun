/**
 * SURVEILLANCE DES SOURCES QUI CASSENT.
 *
 * TROIS PANNES ONT ÉTÉ SIGNALÉES PAR L'UTILISATEUR, JAMAIS PAR LE SYSTÈME :
 * Rentumo à l'arrêt six jours (sa collecte s'arrêtait à la première page
 * connue), un mauvais quartier publié pendant des semaines, FNAIM qui ne
 * couvrait qu'une commune sur treize. Le pipeline calculait pourtant déjà les
 * changements d'état de santé et les verdicts « on ne conclut pas » du cycle de
 * vie : ils partaient dans le journal, que personne ne lit.
 *
 * CE MODULE NE CALCULE RIEN DE NEUF SUR L'ÉTAT D'UNE SOURCE. Il assemble ce
 * qui existe — transitions de santé, verdicts de cycle de vie, journaux de
 * passages, remplissage des champs — et décide de ce qui mérite qu'on sonne.
 *
 * LE RISQUE PRINCIPAL N'EST PAS DE MANQUER UNE PANNE, C'EST DE CRIER POUR
 * RIEN : une surveillance qui se trompe une fois sur deux est coupée en une
 * semaine, et on se retrouve moins bien loti qu'avant. Chaque seuil est donc
 * mesuré sur les quatorze jours de `collection_runs` (10 004 passages,
 * 212 sources, relevé du 2026-09-16) et choisi pour le volume d'alertes qu'il
 * produit, pas pour sa beauté. Et TRENTE SOURCES N'ONT AUCUNE ANNONCE ACTIVE
 * sans être en panne : une agence qui n'a rien à louer ne doit déclencher
 * aucune règle. C'est `activeCount` qui les met hors de portée.
 */

import type { Logger } from '../core/logger.js';
import type { Repository, SourceObservation, WatchedField } from '../db/repository.js';
import type { LifecycleSkip, SourceHealthTransition } from '../pipeline.js';

/**
 * Où la surveillance note ce qu'elle a DÉJÀ signalé.
 *
 * Pas dans `source_state.memo` : cette colonne appartient à la source, qui y
 * range son repère de lecture et le relit au passage suivant. Deux écrivains
 * pour une case, c'est un repère perdu et une boîte aux lettres relue en
 * entier.
 */
export const SOURCE_HEALTH_SETTING = 'sourceHealthReported';

/** Combien de jours de silence avant de parler de source muette. */
const SILENCE_DAYS = 3;

/**
 * Combien d'annonces la source aurait dû publier sur ces trois jours pour que
 * son silence soit anormal.
 *
 * CINQ, parce que c'est là que le hasard cesse d'expliquer le silence : avec
 * une loi de Poisson d'espérance 5, ne rien voir arrive une fois sur 150. À
 * trois, c'est une fois sur vingt — et la mesure le confirme, on passe de
 * 4 alertes en quatorze jours à 10, dont la moitié pour des agences qui ont
 * simplement eu une semaine calme.
 */
const SILENCE_EXPECTED = 5;

/** Jours servant à établir le rythme habituel d'une source. */
const RATE_DAYS = 10;

/** En deçà, on ne prétend pas connaître le rythme d'une source. */
const RATE_MIN_DAYS = 4;

/** Journées avec passage exigées dans la fenêtre : une source non programmée n'est pas muette. */
const SILENCE_MIN_DAYS = 2;

/**
 * Passages interrompus d'affilée avant d'alerter.
 *
 * TROIS, et cette règle comble un angle mort : un scraper qui s'ARRÊTE sur
 * `blocked` ou `tooManyErrors` rend un résultat — il ne lève pas — et la santé
 * de la source reste donc « saine ». Foncia s'est arrêté 91 fois sur
 * « bloqué » en quatorze jours en affichant OK à l'écran.
 */
const BROKEN_PASSES = 3;

const BROKEN_REASONS = new Set(['blocked', 'tooManyErrors', 'rateLimited']);

/** Journées récentes servant à juger qu'un champ a disparu. */
const FIELD_RECENT_DAYS = 3;

/** Le champ était la règle avant : 80 % des annonces le portaient. */
const FIELD_BASELINE = 0.8;

/** Références minimales, avant et après : sous ce volume, zéro n'est pas un signal. */
const FIELD_MIN_OLDER = 10;
const FIELD_MIN_RECENT = 5;

/**
 * Stock minimal pour qu'un inventaire vide soit une panne.
 *
 * DIX, le même chiffre que le garde-fou « chute suspecte » du cycle de vie, et
 * pour la même raison : en dessous, une page qui n'a pas répondu et une agence
 * qui vient de tout louer se ressemblent trop.
 */
const STOCK_MIN = 10;

/**
 * Temps de calme avant qu'un incident soit considéré comme refermé.
 *
 * VINGT-QUATRE HEURES. Sans ce délai, une source qui va mal un passage sur deux
 * — c'est le cas de Pujol — rouvre un incident à chaque rechute : douze alertes
 * en quatorze jours au lieu de dix, pour la même panne.
 */
const INCIDENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Ce qu'une alerte reproche à une source. */
export type SourceAlertKind =
  /** L'état de santé a changé pour le pire (dégradée, bloquée, en repos). */
  | 'health'
  /** L'état de santé est revenu à la normale. */
  | 'recovered'
  /** L'inventaire a fondu : une fraction du stock connu est rendue. */
  | 'collapse'
  /** Aucune annonce rendue, sans que la source affiche de liste vide. */
  | 'template'
  /** Plus rien de neuf depuis trois jours, alors que le rythme en promettait. */
  | 'silent'
  /** Les derniers passages se sont tous interrompus. */
  | 'interrupted'
  /** Un champ clé a disparu des nouvelles annonces. */
  | 'field'
  /**
   * Un candidat écarté pour un motif réversible ne l'est plus.
   *
   * Ce n'est pas une panne : c'est une source à étudier de nouveau. Elle passe
   * par ce canal parce qu'il existe déjà, qu'il ne sonne qu'une fois et qu'il
   * remplace sa propre notification au lieu de l'empiler.
   */
  | 'awake';

export interface SourceAlert {
  readonly sourceId: string;
  readonly kind: SourceAlertKind;
  /** Une phrase qui suffit à décider s'il faut aller voir. */
  readonly detail: string;
}

/** La clé sous laquelle un incident est retenu : une source, un symptôme. */
export function incidentKey(alert: SourceAlert): string {
  return `${alert.sourceId}|${alert.kind}`;
}

/** Ce qui a déjà été signalé : clé d'incident → dernier instant où le symptôme était là. */
export type ReportedIncidents = Readonly<Record<string, string>>;

export function parseReported(raw: string | null): ReportedIncidents {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    );
  } catch {
    // Un réglage illisible ne doit pas faire échouer une collecte : on
    // repart d'une mémoire vide, quitte à re-signaler une fois.
    return {};
  }
}

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Médiane — la moyenne se laisse emporter par la rafale du tout premier passage. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Une source qui ne publie plus rien de neuf alors que son rythme en promettait.
 *
 * LE RYTHME EST UNE MÉDIANE, ET C'EST TOUT L'INTÉRÊT. Une source ajoutée la
 * semaine dernière déverse tout son catalogue au premier passage — trente
 * annonces « neuves » d'un coup —, puis n'en publie plus qu'une de temps en
 * temps. Une moyenne garderait cette rafale en mémoire dix jours et crierait
 * pour un silence parfaitement normal : c'est ce que donnait la mesure,
 * 11 alertes dont Giletta et ses trente annonces du premier jour. La médiane
 * l'ignore.
 */
function silentSources(
  observations: readonly SourceObservation[],
  nowMs: number,
): readonly SourceAlert[] {
  const day = 24 * 60 * 60 * 1000;
  const windowKeys = Array.from({ length: SILENCE_DAYS }, (_, i) => dayKey(nowMs - i * day));
  const referenceKeys = Array.from({ length: RATE_DAYS }, (_, i) =>
    dayKey(nowMs - (SILENCE_DAYS + i) * day),
  );

  return observations.flatMap((observation) => {
    if (observation.activeCount < STOCK_MIN) return [];

    const inWindow = windowKeys.flatMap((key) => {
      const count = observation.newByDay.get(key);
      return count === undefined ? [] : [count];
    });
    // Une source qui n'a pas tourné n'est pas muette : elle n'a pas parlé.
    if (inWindow.length < SILENCE_MIN_DAYS) return [];
    if (inWindow.some((count) => count > 0)) return [];

    const reference = referenceKeys.flatMap((key) => {
      const count = observation.newByDay.get(key);
      return count === undefined ? [] : [count];
    });
    if (reference.length < RATE_MIN_DAYS) return [];

    const expected = median(reference) * SILENCE_DAYS;
    if (expected < SILENCE_EXPECTED) return [];
    return [
      {
        sourceId: observation.sourceId,
        kind: 'silent' as const,
        detail:
          `aucune annonce nouvelle depuis ${SILENCE_DAYS} jours, ` +
          `alors que son rythme en annonçait ${Math.round(expected)}`,
      },
    ];
  });
}

/** Les sources dont les derniers passages se sont tous interrompus. */
function interruptedSources(observations: readonly SourceObservation[]): readonly SourceAlert[] {
  return observations.flatMap((observation) => {
    const last = observation.stopReasons.slice(-BROKEN_PASSES);
    if (last.length < BROKEN_PASSES) return [];
    if (!last.every((reason) => BROKEN_REASONS.has(reason))) return [];
    return [
      {
        sourceId: observation.sourceId,
        kind: 'interrupted' as const,
        detail: `${BROKEN_PASSES} passages interrompus d'affilée (${last[last.length - 1] ?? ''})`,
      },
    ];
  });
}

const FIELD_LABELS: Record<WatchedField, string> = {
  phone: 'téléphone',
  price: 'loyer',
  photo: 'photo',
};

/**
 * Un champ clé qui disparaît des NOUVELLES annonces.
 *
 * C'est le symptôme le plus silencieux de tous : la source répond, le nombre
 * d'annonces ne bouge pas, la santé reste au vert, et les fiches arrivent
 * vides. Rien ne le signalait.
 *
 * ON NE COMPARE QUE CE QUI EST COMPARABLE : il faut que le champ ait été la
 * RÈGLE avant (80 % sur au moins dix annonces) et qu'il manque sur TOUTES les
 * récentes (au moins cinq). Une source qui publiait le téléphone une fois sur
 * deux n'apprend rien en ne le publiant plus.
 */
function fadedFields(observations: readonly SourceObservation[]): readonly SourceAlert[] {
  return observations.flatMap((observation) =>
    [...observation.fields].flatMap(([field, fill]) => {
      if (fill.older.total < FIELD_MIN_OLDER || fill.recent.total < FIELD_MIN_RECENT) return [];
      if (fill.older.filled / fill.older.total < FIELD_BASELINE) return [];
      if (fill.recent.filled > 0) return [];
      const before = Math.round((fill.older.filled / fill.older.total) * 100);
      return [
        {
          sourceId: observation.sourceId,
          kind: 'field' as const,
          detail:
            `plus aucun ${FIELD_LABELS[field]} sur ses ${fill.recent.total} dernières annonces ` +
            `(${before} % en portaient auparavant)`,
        },
      ];
    }),
  );
}

export interface DetectionInput {
  readonly transitions: readonly SourceHealthTransition[];
  readonly lifecycleSkips: readonly LifecycleSkip[];
  readonly observations: readonly SourceObservation[];
  readonly nowMs: number;
}

/** Tout ce qui, ce passage-ci, mérite qu'on regarde une source. PUR. */
export function detectSourceAlerts(input: DetectionInput): readonly SourceAlert[] {
  const stockOf = new Map(input.observations.map((one) => [one.sourceId, one.activeCount]));

  const health = input.transitions.flatMap((transition): SourceAlert[] =>
    transition.to === 'healthy'
      ? [
          {
            sourceId: transition.sourceId,
            kind: 'recovered',
            detail: `de nouveau saine (elle était ${transition.from})`,
          },
        ]
      : [
          {
            sourceId: transition.sourceId,
            kind: 'health',
            detail: `passée de ${transition.from} à ${transition.to}${
              transition.error === null ? '' : ` — ${transition.error}`
            }`,
          },
        ],
  );

  const lifecycle = input.lifecycleSkips.flatMap((skip): SourceAlert[] => {
    // Un passage aveugle — page inchangée, quota, interruption — ne dit rien de
    // la source : il dit qu'on n'a pas regardé.
    if (skip.code === 'blind') return [];
    if (skip.code === 'collapse') {
      return [{ sourceId: skip.sourceId, kind: 'collapse', detail: skip.reason }];
    }
    // UNE AGENCE VIDE N'EST PAS UNE AGENCE EN PANNE. Trente sources ne
    // rapportent aucune annonce et se portent très bien ; sans ce garde-fou,
    // cette règle les nommerait toutes à chaque passage.
    if ((stockOf.get(skip.sourceId) ?? 0) < STOCK_MIN) return [];
    return [{ sourceId: skip.sourceId, kind: 'template', detail: skip.reason }];
  });

  return [
    ...health,
    ...lifecycle,
    ...silentSources(input.observations, input.nowMs),
    ...interruptedSources(input.observations),
    ...fadedFields(input.observations),
  ];
}

export interface Deduplicated {
  /** Ce qui n'a pas encore été signalé : c'est cela, et cela seul, qui sonne. */
  readonly fresh: readonly SourceAlert[];
  /** La mémoire à réécrire. */
  readonly memory: ReportedIncidents;
}

/**
 * UNE ALERTE PAR SOURCE ET PAR INCIDENT, jamais une par passage.
 *
 * La collecte tourne deux fois par heure : sans cette mémoire, une source
 * dégradée pendant une semaine produirait trois cents notifications, et on
 * couperait le canal au bout de la première journée.
 *
 * Un incident ne se referme qu'après vingt-quatre heures SANS le symptôme —
 * pas au premier passage qui va bien. Un retour à la santé, lui, referme tout
 * ce qui était ouvert sur la source : la panne est finie, la suivante méritera
 * qu'on en reparle.
 */
export function deduplicate(
  alerts: readonly SourceAlert[],
  reported: ReportedIncidents,
  nowMs: number,
): Deduplicated {
  const nowIso = new Date(nowMs).toISOString();
  const recovered = new Set(
    alerts.filter((alert) => alert.kind === 'recovered').map((alert) => alert.sourceId),
  );

  const memory: Record<string, string> = {};
  for (const [key, seenAt] of Object.entries(reported)) {
    const age = nowMs - Date.parse(seenAt);
    if (Number.isNaN(age) || age > INCIDENT_COOLDOWN_MS) continue;
    if (recovered.has(key.split('|')[0] ?? '')) continue;
    memory[key] = seenAt;
  }

  const fresh: SourceAlert[] = [];
  for (const alert of alerts) {
    const key = incidentKey(alert);
    // Un rétablissement se dit une fois, au moment où il arrive : il n'y a pas
    // d'incident à rouvrir derrière lui.
    if (alert.kind === 'recovered') {
      fresh.push(alert);
      continue;
    }
    if (memory[key] === undefined) fresh.push(alert);
    memory[key] = nowIso;
  }

  return { fresh, memory };
}

export interface SourceHealthDeps {
  readonly repository: Repository;
  readonly transitions: readonly SourceHealthTransition[];
  readonly lifecycleSkips: readonly LifecycleSkip[];
  readonly logger: Logger;
  readonly nowMs: number;
  /**
   * Alertes calculées ailleurs et signalées par le même canal — la veille des
   * candidats endormis. Un second système de notification aurait sa propre
   * étiquette, donc sa propre pile d'avis en attente.
   */
  readonly extraAlerts?: readonly SourceAlert[];
}

/**
 * Détecte, dédoublonne, journalise et prévient. NE LÈVE JAMAIS : une
 * surveillance en panne ne doit pas faire échouer une collecte réussie.
 *
 * @returns les alertes réellement neuves, pour les tests et le journal.
 */
export async function reportSourceHealth(deps: SourceHealthDeps): Promise<readonly SourceAlert[]> {
  const { repository, logger, nowMs } = deps;
  try {
    const recentSince = new Date(nowMs - FIELD_RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const observations = await repository.sourceObservations(recentSince, BROKEN_PASSES);
    const alerts = [
      ...detectSourceAlerts({
        transitions: deps.transitions,
        lifecycleSkips: deps.lifecycleSkips,
        observations,
        nowMs,
      }),
      ...(deps.extraAlerts ?? []),
    ];
    const { fresh, memory } = deduplicate(
      alerts,
      parseReported(await repository.readSetting(SOURCE_HEALTH_SETTING)),
      nowMs,
    );

    // LE JOURNAL D'ABORD, ET TOUJOURS : c'est le seul canal qui ne dépend de
    // rien. Les notifications, elles, supposent des clés et un appareil.
    for (const alert of fresh) {
      logger.warn('source.alert', {
        source: alert.sourceId,
        motif: alert.kind,
        detail: alert.detail,
      });
    }

    await repository.writeSetting(SOURCE_HEALTH_SETTING, JSON.stringify(memory));

    return fresh;
  } catch (error) {
    logger.warn('source.alert_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
