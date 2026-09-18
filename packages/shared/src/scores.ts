/**
 * Les quatre scores du projet (§16, §17, §18, §19).
 *
 * Règle absolue commune : un score n'invente jamais de donnée. Lorsqu'un signal
 * est indisponible, il ne contribue pas au score et il est listé dans
 * `unknownSignals` — de sorte que l'interface puisse dire « calculé sans le
 * nombre de favoris » plutôt que de laisser croire à une précision inexistante.
 */

/** Entier borné à l'intervalle [0, 100]. */
export type Score = number;

/**
 * Explication d'une contribution au score.
 * Chaque score doit pouvoir se justifier ligne à ligne dans l'interface (§19).
 */
export interface ScoreReason {
  /** Clé stable, utilisable pour la traduction et les tests. */
  readonly code: string;
  /** Phrase courte affichable telle quelle. */
  readonly label: string;
  /** Contribution en points, positive ou négative. */
  readonly delta: number;
}

/** Score accompagné de ses justifications et de ses angles morts. */
export interface ExplainedScore {
  readonly value: Score;
  readonly reasons: readonly ScoreReason[];
  /**
   * Signaux qui auraient compté mais qu'aucune source n'a fournis (§17).
   * Leur présence signifie « score calculé sur une information partielle ».
   */
  readonly unknownSignals: readonly string[];
  /**
   * Part de l'information disponible, dans [0, 1].
   * 1 = tous les signaux prévus étaient présents. Sert à afficher une réserve
   * honnête sur la fiabilité du score (§18).
   */
  readonly confidence: number;
}

/**
 * Les quatre scores d'un logement.
 *
 * - `match` : correspond-il à mes critères ? (§16)
 * - `opportunity` : dois-je agir maintenant ? (§17)
 * - `visitProbability` : mon contact a-t-il des chances d'aboutir ? (§18)
 * - `risk` : cette annonce est-elle suspecte ? (§19)
 */
export interface ListingScores {
  readonly match: ExplainedScore;
  readonly opportunity: ExplainedScore;
  readonly visitProbability: ExplainedScore;
  readonly risk: ExplainedScore;
}

/** Borne une valeur dans [0, 100] et l'arrondit à l'entier le plus proche. */
export function clampScore(value: number): Score {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Paliers d'affichage de `actionPriority`.
 *
 * Calés sur la distribution réelle, pas sur une échelle idéale : aucune annonce
 * n'atteignait les anciens 85 et 70, la section « à contacter » restait vide. Mesuré le
 * 2026-09-14 sur les annonces actives dans les critères : ≥ 58 ≈ 12 %,
 * ≥ 50 ≈ 32 %. À recaler si les poids ou les scores changent.
 */
export const PRIORITY_HOT = 58;
export const PRIORITY_WORTH_SEEING = 50;

/**
 * LE SEUL SEUIL DU SCORE DE RISQUE, au-delà duquel la fiche met ses raisons
 * sous les yeux au lieu de les laisser repliées.
 *
 * Il vit ici, et non dans un composant, parce qu'il y avait DEUX notions
 * concurrentes pour une seule question : la carte portait son propre
 * `SUSPICIOUS_RISK = 40` sous le nom « Trop beau ? », la fiche montrait le même
 * score sous le nom « Signaux d'alerte ». Un seul calcul donnait l'impression
 * de deux vérifications. Le badge est retiré, le nom et le seuil sont uniques.
 *
 * Volontairement haut. Un avertissement posé à tort sur une annonce honnête
 * coûte plus qu'un avertissement manquant : on écarte un vrai logement, et on
 * met en cause une agence qui n'a rien fait. Relevé du 2026-09-17, une fois le
 * score corrigé : six annonces actives sur 3 210 atteignent 40, toutes pour un
 * loyer au m² hors de proportion — c'est l'ordre de grandeur d'un
 * avertissement qu'on croit quand il paraît.
 *
 * `AutoContactLimits.thresholds.maxRisk` lit le même score mais ne dit pas la
 * même chose : ce n'est pas un second verdict, c'est la règle de dépense d'un
 * envoi automatique, délibérément plus sévère. Le verdict affiché, lui, n'a
 * que ce seuil-ci.
 */
export const RISK_ALERT = 40;

/**
 * Score de tri global, utilisé pour classer la liste principale (§36).
 *
 * L'interface doit répondre à « que dois-je contacter maintenant ? ». On
 * privilégie donc l'urgence (opportunité) et la faisabilité (probabilité de
 * visite) autant que la pertinence, et on pénalise le risque.
 *
 * Les poids sont volontairement simples et lisibles : ils seront réévalués à
 * partir de statistiques réelles en V3 (§71), pas avant.
 */
export function actionPriority(scores: ListingScores): number {
  const { match, opportunity, visitProbability, risk } = scores;
  return clampScore(
    match.value * 0.3 +
      opportunity.value * 0.35 +
      visitProbability.value * 0.25 +
      (100 - risk.value) * 0.1,
  );
}
