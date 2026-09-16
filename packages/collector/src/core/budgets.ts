/**
 * Budgets et fréquences par défaut, par famille de source (§7, §10).
 *
 * Aucune de ces valeurs n'est codée en dur dans un scraper : une source part
 * du gabarit de sa famille et surcharge uniquement ce qui la distingue. C'est
 * ce qui permet de régler la pression de collecte sans toucher au code.
 */

import type { RateLimitBudget, SourceKind, SourceSchedule } from '@maioun/shared';

/**
 * Budget prudent servant de base commune.
 * Un délai d'une seconde et une seule requête à la fois : on privilégie la
 * longévité de l'accès plutôt que la vitesse (§10).
 */
export const DEFAULT_BUDGET: RateLimitBudget = {
  requestsPerMinute: 20,
  delayBetweenRequestsMs: 1_500,
  maxConcurrentRequests: 1,
  maxPagesPerRun: 3,
  maxListingsPerRun: 120,
  retryLimit: 2,
  backoffFactor: 3,
  cooldownSecondsAfter429: 3_600,
  maxConsecutiveErrors: 3,
};

/**
 * Fréquences indicatives par famille (§7).
 *
 * Ce ne sont que des points de départ : le scheduler ajuste ensuite en fonction
 * de ce que la source produit réellement.
 */
export const SCHEDULE_BY_KIND: Record<SourceKind, SourceSchedule> = {
  // Portails à fort volume : ce sont eux qui bougent le plus vite.
  portal: { baseIntervalMinutes: 20, minIntervalMinutes: 10, maxIntervalMinutes: 180 },
  // Réseaux d'agences : renouvellement plus lent, volume moyen.
  agencyNetwork: { baseIntervalMinutes: 45, minIntervalMinutes: 30, maxIntervalMinutes: 360 },
  /**
   * Agences locales : peu d'annonces, mais souvent exclusives (§3).
   *
   * DEUX HEURES ÉTAIENT PAYÉES POUR RIEN. Relevé du 2026-09-16 : un passage
   * d'agence locale qui ne rapporte aucune annonce coûte UNE requête (médiane ;
   * quatre au neuvième décile), les cycles de collecte se succèdent toutes les
   * neuf minutes, et le plafond de cinquante sources par cycle n'est atteint
   * que douze fois sur cent cinquante-sept. La lenteur ne protégeait donc ni le
   * site d'en face, ni notre budget : elle ne faisait qu'attendre.
   *
   * Ce qu'elle coûtait, en revanche, se mesure : l'annonce paraissait en
   * moyenne une heure avant qu'on la voie, et une annonce retirée restait six
   * heures à l'affiche (trois passages manqués). À soixante-quinze minutes, ces
   * deux chiffres tombent à trente-sept minutes et trois heures et demie, pour
   * un quart de requêtes en plus sur l'ensemble de la collecte.
   *
   * Pas plus bas, et c'est délibéré : le plancher vaut soixante minutes, et un
   * intervalle de base égal au plancher supprimerait toute adaptation — une
   * agence qui publie beaucoup ne pourrait plus être vue plus souvent qu'une
   * agence qui dort.
   */
  localAgency: { baseIntervalMinutes: 75, minIntervalMinutes: 60, maxIntervalMinutes: 1_440 },
  // Agrégateurs : redondants avec les portails, donc peu prioritaires.
  aggregator: { baseIntervalMinutes: 60, minIntervalMinutes: 30, maxIntervalMinutes: 720 },
};

/** Budgets ajustés par famille, dérivés du gabarit prudent. */
export const BUDGET_BY_KIND: Record<SourceKind, RateLimitBudget> = {
  portal: { ...DEFAULT_BUDGET, requestsPerMinute: 20, maxPagesPerRun: 3 },
  agencyNetwork: { ...DEFAULT_BUDGET, requestsPerMinute: 15, maxPagesPerRun: 4 },
  // Les petits sites d'agence encaissent mal la charge : on ralentit nettement.
  localAgency: {
    ...DEFAULT_BUDGET,
    requestsPerMinute: 6,
    delayBetweenRequestsMs: 4_000,
    maxPagesPerRun: 2,
    maxListingsPerRun: 40,
  },
  aggregator: { ...DEFAULT_BUDGET, requestsPerMinute: 12, maxPagesPerRun: 2 },
};

/** Compose un budget à partir de la famille et de quelques surcharges. */
export function budgetFor(
  kind: SourceKind,
  overrides: Partial<RateLimitBudget> = {},
): RateLimitBudget {
  return { ...BUDGET_BY_KIND[kind], ...overrides };
}

/** Compose une fréquence à partir de la famille et de quelques surcharges. */
export function scheduleFor(
  kind: SourceKind,
  overrides: Partial<SourceSchedule> = {},
): SourceSchedule {
  return { ...SCHEDULE_BY_KIND[kind], ...overrides };
}
