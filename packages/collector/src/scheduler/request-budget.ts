/**
 * OÙ PART LE BUDGET DE REQUÊTES, ET CE QU'IL RAPPORTE.
 *
 * La collecte se règle jusqu'ici sur des intervalles et des places de cycle,
 * sans jamais dire ce qu'une requête achète. Or les deux chiffres qui décident
 * ne sont écrits nulle part : combien de requêtes pour une annonce jamais vue,
 * et quelle part des passages ne rapporte rien du tout.
 *
 * Relevé du 2026-09-18 sur sept jours : 48 526 requêtes, 2 434 annonces
 * découvertes — vingt requêtes par annonce neuve — et 94 % des passages sans
 * la moindre découverte, qui absorbent 80 % du budget. Cinq sources en
 * consomment 42 %.
 *
 * DÉCOUVERTE, ET NON « NOUVEAUTÉ DÉCLARÉE ». `collection_runs.listings_new`
 * compte les fiches qu'un passage a rendues hors de ce qu'il connaissait, ce
 * qui inclut les revisites voulues (fiche sans photo, fiche ancienne) et les
 * sources qui rendent tout leur catalogue. Il annonçait 11 552 nouveautés là où
 * la table des occurrences en a enregistré 2 434. Seule une occurrence dont
 * c'est le PREMIER passage compte ici.
 *
 * Tout est pur : les lignes viennent de la base, le calcul se teste sans elle.
 */

/** Un passage, tel que `collection_runs` le garde. */
export interface RunRecord {
  readonly sourceId: string;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly requestCount: number;
}

/** Une annonce vue pour la première fois, et quand. */
export interface DiscoveryRecord {
  readonly sourceId: string;
  readonly atMs: number;
}

/** Ce qu'une source a dépensé, et ce qu'elle a rapporté. */
export interface SourceSpend {
  readonly sourceId: string;
  readonly passes: number;
  readonly requests: number;
  readonly discoveries: number;
  /** Requêtes par annonce neuve. `null` quand la source n'a rien découvert. */
  readonly requestsPerDiscovery: number | null;
  /** Passages qui n'ont découvert aucune annonce. */
  readonly sterilePasses: number;
  /** Requêtes dépensées par ces passages-là. */
  readonly sterileRequests: number;
}

/**
 * Le passage auquel rattacher une découverte.
 *
 * Sa fenêtre d'abord — une découverte appartient au passage qui tournait à cet
 * instant. À défaut, le dernier passage commencé avant elle : l'écriture en
 * base suit la collecte de quelques secondes, et une découverte tombée juste
 * après la fin d'un passage lui revient tout de même.
 */
function runFor(runs: readonly RunRecord[], atMs: number): RunRecord | null {
  let before: RunRecord | null = null;
  for (const run of runs) {
    if (atMs >= run.startedAtMs && atMs <= run.finishedAtMs) return run;
    if (run.startedAtMs <= atMs) before = run;
  }
  return before;
}

/** Dépense et rendement de chaque source, la plus dépensière d'abord. */
export function spendBySource(
  runs: readonly RunRecord[],
  discoveries: readonly DiscoveryRecord[],
): readonly SourceSpend[] {
  const runsBySource = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const known = runsBySource.get(run.sourceId);
    if (known === undefined) runsBySource.set(run.sourceId, [run]);
    else known.push(run);
  }
  for (const list of runsBySource.values()) list.sort((a, b) => a.startedAtMs - b.startedAtMs);

  const found = new Map<RunRecord, number>();
  for (const discovery of discoveries) {
    const candidates = runsBySource.get(discovery.sourceId);
    if (candidates === undefined) continue;
    const run = runFor(candidates, discovery.atMs);
    if (run !== null) found.set(run, (found.get(run) ?? 0) + 1);
  }

  const spends = [...runsBySource.entries()].map(([sourceId, list]) => {
    let requests = 0;
    let found_ = 0;
    let sterilePasses = 0;
    let sterileRequests = 0;
    for (const run of list) {
      const neuves = found.get(run) ?? 0;
      requests += run.requestCount;
      found_ += neuves;
      if (neuves === 0) {
        sterilePasses += 1;
        sterileRequests += run.requestCount;
      }
    }
    return {
      sourceId,
      passes: list.length,
      requests,
      discoveries: found_,
      requestsPerDiscovery: found_ === 0 ? null : requests / found_,
      sterilePasses,
      sterileRequests,
    };
  });

  return spends.sort((a, b) => b.requests - a.requests || a.sourceId.localeCompare(b.sourceId));
}

/** Le même bilan, regroupé — par famille de source, ou par plateforme. */
export interface GroupSpend extends Omit<SourceSpend, 'sourceId'> {
  readonly group: string;
  readonly sources: number;
}

/** Regroupe des dépenses par la clé que rend `keyOf`. */
export function spendByGroup(
  spends: readonly SourceSpend[],
  keyOf: (sourceId: string) => string,
): readonly GroupSpend[] {
  const groups = new Map<string, SourceSpend[]>();
  for (const spend of spends) {
    const key = keyOf(spend.sourceId);
    const known = groups.get(key);
    if (known === undefined) groups.set(key, [spend]);
    else known.push(spend);
  }

  const somme = (list: readonly SourceSpend[], pick: (one: SourceSpend) => number): number =>
    list.reduce((total, one) => total + pick(one), 0);

  return [...groups.entries()]
    .map(([group, list]) => {
      const requests = somme(list, (one) => one.requests);
      const discoveries = somme(list, (one) => one.discoveries);
      return {
        group,
        sources: list.length,
        passes: somme(list, (one) => one.passes),
        requests,
        discoveries,
        requestsPerDiscovery: discoveries === 0 ? null : requests / discoveries,
        sterilePasses: somme(list, (one) => one.sterilePasses),
        sterileRequests: somme(list, (one) => one.sterileRequests),
      };
    })
    .sort((a, b) => b.requests - a.requests || a.group.localeCompare(b.group));
}

/**
 * Au-delà, deux passages ne sont plus le même cycle.
 *
 * Un cycle lance ses sources par grappes de douze et dure une minute et demie
 * en médiane ; trois minutes de silence séparent donc deux cycles sans jamais
 * couper celui qui traîne.
 */
const CYCLE_GAP_MS = 3 * 60_000;

/**
 * À partir de là, un écart entre deux cycles n'est plus un retard mais un trou.
 *
 * Le réveil est demandé toutes les quinze minutes : au-delà de vingt-cinq, un
 * réveil a été perdu, pas simplement décalé.
 */
const HOLE_MS = 25 * 60_000;

/** Ce que la cadence des cycles a réellement valu. */
export interface Cadence {
  readonly cycles: number;
  readonly windowHours: number;
  readonly cyclesPerDay: number;
  /** Écart médian entre deux départs de cycle, en minutes. */
  readonly medianGapMinutes: number;
  readonly longestGapMinutes: number;
  /** Part du temps passée dans un trou — collecte à l'arrêt. */
  readonly holeShare: number;
  readonly holes: number;
}

/**
 * LA CADENCE RÉELLE, ET NON CELLE QU'ON DEMANDE.
 *
 * Le cron réclame quatre-vingt-seize cycles par jour ; relevé du 2026-09-18, il
 * en passe soixante et onze, et la moitié du temps s'écoule dans un silence de
 * plus de vingt-cinq minutes — jusqu'à onze heures d'affilée. Aucun réglage
 * d'intervalle ne rattrape une collecte qui ne tourne pas : c'est le premier
 * chiffre à regarder avant de raccourcir quoi que ce soit.
 */
export function cadence(startsMs: readonly number[]): Cadence {
  const tries = [...startsMs].sort((a, b) => a - b);
  const departs: number[] = [];
  for (const start of tries) {
    const dernier = departs[departs.length - 1];
    if (dernier === undefined || start - dernier > CYCLE_GAP_MS) departs.push(start);
  }
  const premier = departs[0];
  const dernier = departs[departs.length - 1];
  if (premier === undefined || dernier === undefined || departs.length < 2) {
    return {
      cycles: departs.length,
      windowHours: 0,
      cyclesPerDay: 0,
      medianGapMinutes: 0,
      longestGapMinutes: 0,
      holeShare: 0,
      holes: 0,
    };
  }

  const gaps = departs.slice(1).map((start, index) => start - (departs[index] as number));
  const tri = [...gaps].sort((a, b) => a - b);
  const median = tri[Math.floor((tri.length - 1) / 2)] as number;
  const trous = gaps.filter((gap) => gap > HOLE_MS);
  const fenetre = dernier - premier;

  return {
    cycles: departs.length,
    windowHours: fenetre / 3_600_000,
    cyclesPerDay: (departs.length / fenetre) * 86_400_000,
    medianGapMinutes: median / 60_000,
    longestGapMinutes: Math.max(...gaps) / 60_000,
    holeShare: fenetre === 0 ? 0 : trous.reduce((total, gap) => total + gap, 0) / fenetre,
    holes: trous.length,
  };
}

/** Ce que les cycles peuvent servir, face à ce que les intervalles réclament. */
export interface Service {
  /** Passages par jour réclamés par les intervalles des sources. */
  readonly demandPerDay: number;
  /** Passages par jour que les cycles peuvent offrir. */
  readonly capacityPerDay: number;
  /** Part de la demande servie, plafonnée à 1. */
  readonly serviceRate: number;
  /** Vrai quand le plafond de places, et non le temps, décide du service. */
  readonly capped: boolean;
}

/**
 * LE PLAFOND DE PLACES SE COMPARE À LA DEMANDE, PAS AU TEMPS D'UN CYCLE.
 *
 * Un cycle qui finit en avance mais refuse des sources dues ne perd pas de
 * temps : il perd des places. Tant que la capacité reste sous la demande,
 * raccourcir un intervalle n'avance rien — la source attendra son tour.
 *
 * Relevé du 2026-09-18 : 5 400 passages réclamés par jour, 4 800 offerts par
 * quatre-vingt-seize cycles de cinquante places.
 */
export function service(
  intervalsMinutes: readonly number[],
  cyclesPerDay: number,
  maxSourcesPerRun: number,
): Service {
  const demandPerDay = intervalsMinutes.reduce(
    (total, minutes) => (minutes > 0 ? total + 1_440 / minutes : total),
    0,
  );
  const capacityPerDay = cyclesPerDay * maxSourcesPerRun;
  return {
    demandPerDay,
    capacityPerDay,
    serviceRate: demandPerDay === 0 ? 1 : Math.min(1, capacityPerDay / demandPerDay),
    capped: capacityPerDay < demandPerDay,
  };
}

/**
 * CE QUE LES REQUÊTES CONDITIONNELLES ATTEIGNENT VRAIMENT.
 *
 * Le client envoie `If-None-Match` et `If-Modified-Since` partout où il a un
 * validateur — encore faut-il que le site en donne un. La table `http_cache`
 * répond sans rien demander à personne : une origine absente est une origine
 * qui n'a jamais rendu ni `ETag` ni `Last-Modified`.
 *
 * Relevé du 2026-09-18 : vingt-trois origines sur deux cent quatorze sources.
 * Les plateformes qui portent le parc s'y refusent en clair — Apimo répond
 * `must-revalidate, private` et La Boîte Immo `no-store`, sans validateur.
 * La piste est donc déjà exploitée à fond, et il n'y a plus rien à y prendre.
 */
export interface ConditionalReach {
  readonly cachedUrls: number;
  readonly origins: number;
  /** Origines de sources couvertes par au moins une entrée de cache. */
  readonly coveredSources: number;
  readonly totalSources: number;
}

/** Ce que le cache conditionnel couvre, par origine. */
export function conditionalReach(
  cachedUrls: readonly string[],
  sourceDomains: readonly string[],
): ConditionalReach {
  const origines = new Set<string>();
  for (const url of cachedUrls) {
    try {
      origines.add(new URL(url).hostname.replace(/^www\./, ''));
    } catch {
      // Une adresse illisible ne compte pas : on ne devine pas son origine.
    }
  }
  const domaines = new Set(sourceDomains.map((one) => one.replace(/^www\./, '')));
  let couvertes = 0;
  for (const domaine of domaines) {
    if ([...origines].some((origine) => origine === domaine || origine.endsWith(`.${domaine}`))) {
      couvertes += 1;
    }
  }
  return {
    cachedUrls: cachedUrls.length,
    origins: origines.size,
    coveredSources: couvertes,
    totalSources: domaines.size,
  };
}
