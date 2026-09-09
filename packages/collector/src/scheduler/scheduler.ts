/**
 * Scheduler adaptatif (§7, §29).
 *
 * Le projet refuse le « tous les scrapers toutes les 10 minutes ». Chaque
 * source gagne ou perd de la fréquence selon ce qu'elle produit réellement :
 * une source qui sort des annonces neuves est interrogée plus souvent, une
 * source qui dort est espacée, une source en erreur est mise de côté.
 *
 * Toutes les décisions sont pures et déterministes : elles dépendent
 * uniquement du descripteur, de l'état persisté et de l'instant fourni. Elles
 * sont donc directement testables (§59).
 */

import type { SourceDescriptor, SourceRuntimeState } from '@maioun/shared';

/** Décision prise pour une source lors d'un tick du scheduler. */
export interface ScheduleDecision {
  readonly sourceId: string;
  readonly shouldRun: boolean;
  /** Intervalle retenu après adaptation, en minutes. */
  readonly effectiveIntervalMinutes: number;
  /** Explication lisible, journalisée puis affichée dans la page d'état (§63). */
  readonly reason: string;
  /** Sert à ordonner les sources retenues quand le budget de run est limité. */
  readonly priority: number;
}

/**
 * Seuil au-delà duquel une source est considérée comme « active » et mérite
 * d'être interrogée plus souvent.
 */
const ACTIVE_THRESHOLD = 3;

/** Facteur d'espacement appliqué à chaque erreur consécutive. */
const ERROR_BACKOFF_FACTOR = 2;

/**
 * Calcule l'intervalle réel entre deux exécutions d'une source.
 *
 * L'adaptation est volontairement simple et monotone : plus la source produit,
 * plus on la voit ; plus elle échoue, moins on insiste.
 */
export function effectiveInterval(descriptor: SourceDescriptor, state: SourceRuntimeState): number {
  const { baseIntervalMinutes, minIntervalMinutes, maxIntervalMinutes } = descriptor.schedule;
  let interval = baseIntervalMinutes;

  // Source productive : on se rapproche du plancher.
  if (state.averageNewListingCount >= ACTIVE_THRESHOLD) {
    interval = Math.max(minIntervalMinutes, interval / 2);
  } else if (state.averageNewListingCount === 0 && state.lastSuccessAt !== null) {
    // Source qui ne sort plus rien : on l'espace progressivement.
    interval = Math.min(maxIntervalMinutes, interval * 2);
  }

  // Erreurs consécutives : espacement exponentiel, plafonné.
  if (state.consecutiveErrors > 0) {
    interval = Math.min(
      maxIntervalMinutes,
      interval * ERROR_BACKOFF_FACTOR ** state.consecutiveErrors,
    );
  }

  return Math.round(Math.max(minIntervalMinutes, Math.min(maxIntervalMinutes, interval)));
}

/** Décide si une source doit tourner maintenant. */
export function decideForSource(
  descriptor: SourceDescriptor,
  state: SourceRuntimeState,
  nowMs: number,
): ScheduleDecision {
  const interval = effectiveInterval(descriptor, state);
  const base = {
    sourceId: descriptor.id,
    effectiveIntervalMinutes: interval,
    priority: descriptor.priority,
  };

  if (!descriptor.enabled) {
    return { ...base, shouldRun: false, reason: 'source désactivée dans le registre' };
  }

  if (state.health === 'blocked') {
    // §10 : une source qui refuse l'accès automatisé n'est plus sollicitée.
    return { ...base, shouldRun: false, reason: 'source bloquée — accès automatisé refusé' };
  }

  if (state.health === 'disabled') {
    return { ...base, shouldRun: false, reason: 'source désactivée après échecs répétés' };
  }

  if (state.cooldownUntil !== null) {
    const until = Date.parse(state.cooldownUntil);
    if (Number.isFinite(until) && nowMs < until) {
      return { ...base, shouldRun: false, reason: 'cooldown en cours après HTTP 429' };
    }
  }

  if (state.lastRunAt === null) {
    return { ...base, shouldRun: true, reason: 'jamais exécutée' };
  }

  const lastRun = Date.parse(state.lastRunAt);
  if (!Number.isFinite(lastRun)) {
    return { ...base, shouldRun: true, reason: 'dernière exécution illisible' };
  }

  const elapsedMinutes = (nowMs - lastRun) / 60_000;
  if (elapsedMinutes >= interval) {
    return {
      ...base,
      shouldRun: true,
      reason: `${Math.round(elapsedMinutes)} min écoulées ≥ ${interval} min d'intervalle`,
    };
  }

  return {
    ...base,
    shouldRun: false,
    reason: `prochaine exécution dans ${Math.ceil(interval - elapsedMinutes)} min`,
  };
}

export interface PlanOptions {
  /**
   * Nombre maximal de sources exécutées lors d'un même run GitHub Actions.
   * Borne la durée du job et la consommation de minutes gratuites (§29, §30).
   */
  readonly maxSourcesPerRun: number;
  /**
   * Passer outre l'intervalle : la source tourne maintenant.
   *
   * Réservé au ciblage manuel (« --source »). Une mise au repos après erreur ou
   * refus n'est PAS levée pour autant : ce drapeau dit « c'est le moment »,
   * jamais « ignore ce que le site a répondu ».
   */
  readonly force?: boolean;
}

export interface SchedulePlan {
  /** Sources à exécuter, déjà triées par priorité puis par ancienneté. */
  readonly selected: readonly ScheduleDecision[];
  /** Sources écartées, avec la raison — utile au diagnostic (§63). */
  readonly skipped: readonly ScheduleDecision[];
}

/**
 * Au-delà de ce multiple de SON PROPRE intervalle, une source est affamée.
 *
 * Le seuil se compte en intervalles et non en heures : une source relevée
 * toutes les vingt minutes est en retard bien avant une source quotidienne, et
 * un seuil absolu punirait la seconde pour la lenteur qu'on lui a choisie.
 */
const STARVATION_FACTOR = 4;

/**
 * De combien de fois son intervalle une source a-t-elle dépassé son tour.
 *
 * `Infinity` pour une source jamais exécutée : elle n'a pas un retard, elle a
 * une dette entière, et rien ne doit passer devant.
 */
function overdueRatio(
  decision: ScheduleDecision,
  state: SourceRuntimeState,
  nowMs: number,
): number {
  if (state.lastRunAt === null) return Number.POSITIVE_INFINITY;
  const intervalMs = Math.max(1, decision.effectiveIntervalMinutes) * 60_000;
  return (nowMs - Date.parse(state.lastRunAt)) / intervalMs;
}

/**
 * Construit le plan d'exécution d'un tick.
 *
 * LA PRIORITÉ NE DOIT PAS ÊTRE ABSOLUE, et elle l'était. Ce commentaire
 * promettait « qu'aucune source ne soit indéfiniment évincée par une voisine
 * plus prioritaire » ; le tri ne le tenait pas. Il classait d'abord par
 * priorité, et ne départageait par ancienneté qu'À PRIORITÉ ÉGALE — si bien
 * qu'avec six places par tick, cinq sources de priorité 1 et dix-neuf de
 * priorité 2, celles de priorité 3 et 4 ne passaient jamais.
 *
 * Relevé du 2026-09-09, et il ne laisse aucun doute : `inli` et `nousgerons`
 * (priorité 3) n'avaient pas tourné depuis huit jours, en bonne santé, sans
 * erreur et sans mise au repos ; `rentumo` (priorité 4) n'avait JAMAIS tourné
 * une seule fois — pas même une ligne d'état en base. Rien ne le signalait :
 * une source jamais élue ne produit ni erreur, ni avertissement, ni trace.
 *
 * D'où une BANDE DE FAMINE devant les autres. Une source qui a dépassé quatre
 * fois son propre intervalle passe avant tout le monde, la plus affamée en
 * tête ; le reste garde l'ordre habituel — priorité, puis ancienneté. La
 * priorité continue donc de décider du RYTHME ORDINAIRE, sans pouvoir
 * condamner personne au silence.
 */
export function planRun(
  entries: readonly { descriptor: SourceDescriptor; state: SourceRuntimeState }[],
  nowMs: number,
  options: PlanOptions,
): SchedulePlan {
  const decisions = entries.map(({ descriptor, state }) => {
    const decision = decideForSource(descriptor, state, nowMs);
    // Le ciblage manuel ne force QUE l'attente : un refus ou une mise au repos
    // vient du site, et lui passer outre serait insister là où il a dit non.
    const forced =
      options.force === true && !decision.shouldRun && /prochaine exécution/i.test(decision.reason);
    return {
      decision: forced ? { ...decision, shouldRun: true, reason: 'ciblée manuellement' } : decision,
      state,
    };
  });

  const eligible = decisions
    .filter((entry) => entry.decision.shouldRun)
    .map((entry) => ({ ...entry, overdue: overdueRatio(entry.decision, entry.state, nowMs) }))
    .sort((a, b) => {
      // La bande de famine d'abord, la plus affamée en tête.
      const aStarving = a.overdue >= STARVATION_FACTOR;
      const bStarving = b.overdue >= STARVATION_FACTOR;
      if (aStarving !== bStarving) return aStarving ? -1 : 1;
      if (aStarving) {
        // DEUX SOURCES JAMAIS EXÉCUTÉES ONT LE MÊME RETARD INFINI, et
        // `Infinity - Infinity` vaut `NaN` — un comparateur qui rend `NaN`
        // laisse l'ordre au hasard de l'implémentation. À dette égale, on
        // retombe donc sur les règles ordinaires, plus bas.
        const ecart = b.overdue - a.overdue;
        if (Number.isFinite(ecart) && ecart !== 0) return ecart;
      }

      if (a.decision.priority !== b.decision.priority) {
        return a.decision.priority - b.decision.priority;
      }
      const aRun = a.state.lastRunAt === null ? 0 : Date.parse(a.state.lastRunAt);
      const bRun = b.state.lastRunAt === null ? 0 : Date.parse(b.state.lastRunAt);
      return aRun - bRun;
    });

  const selected = eligible.slice(0, options.maxSourcesPerRun).map((entry) => entry.decision);
  const overflow = eligible.slice(options.maxSourcesPerRun).map((entry) => ({
    ...entry.decision,
    shouldRun: false,
    reason: 'reportée : quota de sources par run atteint',
  }));

  const skipped = [
    ...decisions.filter((entry) => !entry.decision.shouldRun).map((entry) => entry.decision),
    ...overflow,
  ];

  return { selected, skipped };
}
