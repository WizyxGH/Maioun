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
 * Production à laquelle une source mérite d'être vue deux fois plus souvent.
 *
 * C'ÉTAIT UN SEUIL, C'EST UNE ÉCHELLE. Un seuil ne distingue que deux
 * mondes : relevé du 2026-09-16, quarante-huit sources sur deux cent dix
 * le franchissaient, vingt-neuf touchaient la branche opposée, et les cent
 * trente-trois du milieu ne recevaient aucune adaptation — elles restaient à
 * leur intervalle de base quoi qu'elles publient.
 *
 * Le milieu est pourtant l'essentiel du parc : une agence qui sort une annonce
 * tous les deux jours n'a rien d'une source endormie, et c'est elle qu'on veut
 * voir arriver. La valeur garde exactement le même sens qu'avant — à
 * `ACTIVE_THRESHOLD` annonces par passage, l'intervalle est toujours divisé par
 * deux — mais elle vaut désormais des deux côtés, sans marche.
 */
const ACTIVE_THRESHOLD = 3;

/**
 * Espacement d'une source qui n'a JAMAIS rien montré depuis qu'on la relève.
 *
 * Vérifié le 2026-09-16 : les vingt-neuf sources concernées affichent toutes
 * zéro annonce active et s'arrêtent sur `empty` — ce sont des agences sans
 * aucune location en ligne, pas des collectes cassées. Les espacer davantage ne
 * coûte donc aucune annonce, et paie les passages plus fréquents accordés
 * ailleurs.
 */
const DORMANT_FACTOR = 3;

/** Facteur d'espacement appliqué à chaque erreur consécutive. */
const ERROR_BACKOFF_FACTOR = 2;

/**
 * CE QU'UNE SOURCE PERD ENTRE DEUX PASSAGES.
 *
 * `retired` compte les annonces dont on a constaté le retrait — la source est
 * repassée assez souvent pour conclure. `vanished` compte celles qu'on n'a
 * JAMAIS revues après les avoir découvertes : elles ont vécu moins longtemps
 * que l'écart entre deux de nos passages. Le rapport des deux mesure la vitesse
 * de disparition, et il se calibre tout seul sur la cadence de la source :
 * inutile de connaître son intervalle pour savoir qu'on la relit trop tard.
 */
export interface VanishRate {
  readonly retired: number;
  readonly vanished: number;
}

/**
 * En dessous, la part n'est qu'un coup de dé.
 *
 * Relevé du 2026-09-17 : dix sources affichaient 100 % d'annonces disparues
 * avant d'être revues sur UNE ou DEUX annonces retirées — `acropolis-immo`,
 * `alberti`, `coprogestimmo`… Les classer parmi les plus fuyantes du parc
 * revenait à tirer au sort.
 */
const VANISH_MIN_EVIDENCE = 8;

/** Part d'annonces perdues entre deux passages à partir de laquelle on réagit. */
const VANISH_THRESHOLD = 0.15;

/**
 * PLAFOND DUR : on n'accélère pas un parc entier.
 *
 * Les places d'un cycle sont comptées et ce qu'on donne aux unes se prend aux
 * autres. Trois sources se justifient par la mesure ; au-delà, on déplacerait la
 * famine sans rien gagner. Relevé du 2026-09-17 : seules quatre sources sur
 * deux cent treize franchissent le seuil avec assez d'annonces retirées pour
 * qu'il veuille dire quelque chose.
 */
const VANISH_MAX_SOURCES = 3;

/**
 * Les sources dont les annonces meurent plus vite qu'on ne les relit.
 *
 * Classement décroissant, borné, et déterministe à part égale — un tri instable
 * ferait entrer et sortir la même source d'un cycle à l'autre.
 */
export function vanishingSources(
  rates: ReadonlyMap<string, VanishRate>,
  max: number = VANISH_MAX_SOURCES,
): ReadonlySet<string> {
  const part = (rate: VanishRate): number => rate.vanished / rate.retired;
  const retenues = [...rates.entries()]
    .filter(([, rate]) => rate.retired >= VANISH_MIN_EVIDENCE && part(rate) >= VANISH_THRESHOLD)
    .sort(([idA, a], [idB, b]) => part(b) - part(a) || idA.localeCompare(idB))
    .slice(0, Math.max(0, max));
  return new Set(retenues.map(([id]) => id));
}

/**
 * Calcule l'intervalle réel entre deux exécutions d'une source.
 *
 * L'adaptation est volontairement simple et monotone : plus la source produit,
 * plus on la voit ; plus elle échoue, moins on insiste.
 */
export function effectiveInterval(descriptor: SourceDescriptor, state: SourceRuntimeState): number {
  const { baseIntervalMinutes, minIntervalMinutes, maxIntervalMinutes } = descriptor.schedule;

  // Continu et décroissant : `ACTIVE_THRESHOLD` annonces par passage valent la
  // moitié de l'intervalle, deux fois plus le tiers, et ainsi de suite. Le
  // plancher de la source reste la seule limite basse.
  let interval = baseIntervalMinutes / (1 + state.averageNewListingCount / ACTIVE_THRESHOLD);

  // Source qui n'a rien montré une seule fois : on l'espace franchement.
  if (state.averageNewListingCount === 0 && state.lastSuccessAt !== null) {
    interval = baseIntervalMinutes * DORMANT_FACTOR;
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
  /**
   * Sources ATTENDUES, et depuis quel instant : une alerte e-mail vient de
   * nommer leur agence, leur catalogue a donc quelque chose de neuf à montrer.
   *
   * Elles passent en tête de la file et n'attendent pas la fin de leur
   * intervalle — mais rien d'autre ne change : une source bloquée, mise au
   * repos ou désactivée le reste, et ses budgets et délais sont les siens. Une
   * alerte dit « c'est le moment », jamais « insiste ».
   *
   * L'INSTANT REND L'ATTENTE JETABLE : dès que la source a tourné APRÈS lui,
   * elle a déjà relu son catalogue et repasse dans le rang. Sans cette borne,
   * la même agence reviendrait en tête à chaque cycle.
   */
  readonly expected?: ReadonlyMap<string, string>;
  /**
   * Ce que chaque source perd entre deux passages (voir `VanishRate`).
   *
   * Sert à départager les sources DUES, jamais à en rendre une due plus tôt :
   * l'intervalle reste celui qu'`effectiveInterval` calcule, plancher compris.
   */
  readonly vanishRates?: ReadonlyMap<string, VanishRate>;
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
 * Cette source a-t-elle du retard sur une attente ?
 *
 * `false` dès qu'elle a tourné après l'alerte : le catalogue a été relu, il n'y
 * a plus rien à rattraper.
 */
function stillAwaited(state: SourceRuntimeState, since: string | undefined): boolean {
  if (since === undefined) return false;
  if (state.lastRunAt === null) return true;
  const lastRun = Date.parse(state.lastRunAt);
  const alert = Date.parse(since);
  if (!Number.isFinite(alert)) return false;
  return !Number.isFinite(lastRun) || lastRun < alert;
}

/** Ce qui ne retient une source que par l'heure — le seul refus qui se lève. */
const WAITING_ITS_TURN = /prochaine exécution/i;

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
 *
 * PUIS LES FUYANTES, ET C'EST ICI QUE ÇA SE JOUE. Le volume décidait seul de la
 * fréquence : une agence qui publie peu était relue lentement, même si ses
 * annonces ne tenaient pas deux heures. Mais raccourcir son intervalle n'y
 * aurait rien changé — relevé du 2026-09-17, le scheduler réclame 5 436
 * passages par jour et la file en sert 2 794, soit un sur deux, et CHAQUE
 * source tourne déjà à près du double de l'intervalle qu'on lui accorde. Ce qui
 * manque à une source qui perd ses annonces entre deux passages n'est donc pas
 * un intervalle plus court : c'est une place dans les cinquante du cycle.
 *
 * D'où une bande, et non un facteur. Rien n'est relu plus tôt que son
 * intervalle, aucun plancher n'est abaissé, aucune requête n'est ajoutée au
 * cycle : seules trois sources au plus passent devant l'ordre habituel, et
 * seulement parmi celles qui étaient déjà dues.
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
    const waiting = !decision.shouldRun && WAITING_ITS_TURN.test(decision.reason);
    const forced = options.force === true && waiting;
    // Une alerte e-mail lève la même chose, et rien de plus.
    const awaited = stillAwaited(state, options.expected?.get(descriptor.id));
    if (forced) {
      return {
        decision: { ...decision, shouldRun: true, reason: 'ciblée manuellement' },
        state,
        awaited,
      };
    }
    if (awaited && waiting) {
      return {
        decision: {
          ...decision,
          shouldRun: true,
          reason: 'une alerte e-mail nomme cette agence : catalogue relu sans attendre',
        },
        state,
        awaited,
      };
    }
    return { decision, state, awaited };
  });

  const fuyantes = vanishingSources(options.vanishRates ?? new Map());

  const eligible = decisions
    .filter((entry) => entry.decision.shouldRun)
    .map((entry) => ({ ...entry, overdue: overdueRatio(entry.decision, entry.state, nowMs) }))
    .sort((a, b) => {
      // L'agence qu'une alerte vient de nommer passe devant : son annonce est
      // déjà en ligne, et c'est le seul moment où la devancer sert à quelque
      // chose. Elles sont au plus une poignée, la famine ne s'en aggrave pas.
      if (a.awaited !== b.awaited) return a.awaited ? -1 : 1;
      // La bande de famine ensuite, la plus affamée en tête.
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

      // Après la famine, et non avant : une source oubliée depuis des jours
      // garde son droit de passage absolu.
      const aFuyante = fuyantes.has(a.decision.sourceId);
      const bFuyante = fuyantes.has(b.decision.sourceId);
      if (aFuyante !== bFuyante) return aFuyante ? -1 : 1;

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
