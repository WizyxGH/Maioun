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
  const base = clampScore(
    match.value * 0.3 +
      opportunity.value * 0.35 +
      visitProbability.value * 0.25 +
      (100 - risk.value) * 0.1,
  );
  /**
   * UN AVERTISSEMENT PLAFONNE LE SCORE, il ne se dilue pas dedans.
   *
   * Le risque pesait pour un dixième : une annonce très bien notée par
   * ailleurs pouvait déclencher un avertissement ET rester en tête de liste,
   * présentée comme « à contacter ». Les dix points retirés ne suffisaient pas
   * à dire ce que l'avertissement dit.
   *
   * Il ne DESCEND jamais le score en dessous de ce plafond : ce n'est pas une
   * pénalité de plus, c'est une interdiction de figurer parmi les urgentes.
   *
   * MESURÉ SUR L'INVENTAIRE DU 2026-09-22 : neuf annonces actives atteignent
   * le seuil d'alerte, AUCUNE n'était mise en avant. Ce plafond ne change donc
   * rien aujourd'hui — il tient une garantie pour le jour où ce sera le cas.
   */
  return risk.value >= RISK_ALERT ? Math.min(base, PRIORITY_WORTH_SEEING - 1) : base;
}

/**
 * LE SCORE, DIT EN TOUTES LETTRES — le même texte partout où on l'explique.
 *
 * Quatre scores répondaient à quatre questions différentes, sans rien dire de
 * ce qu'on devait en conclure : lequel regarder d'abord, et à partir de quand
 * une annonce vaut un appel. Il n'y en a plus qu'un à lire, et les trois
 * mesures qui le composent restent consultables dessous.
 *
 * LES PALIERS SONT DES RANGS, PAS DES NOTES. Mesuré le 2026-09-22 sur les 350
 * annonces actives dans les critères : la meilleure est à 74, la moyenne à 53,
 * et 99,7 % dépassent 40. « 53 sur 100 » ne veut donc pas dire « moyen » — il
 * veut dire « au milieu de ce qui est disponible à Nice en ce moment ». C'est
 * ce que ces libellés disent à la place du chiffre nu.
 */
export const SCORE_EXPLANATION =
  'Un seul score, de 0 à 100 : 30 % la correspondance à vos critères, ' +
  '35 % l’urgence (annonce récente, loyer en baisse), 25 % la facilité de ' +
  'contact, 10 % l’absence de signaux d’alerte. Un avertissement plafonne le ' +
  'score au lieu de s’y diluer.';

/** Ce que vaut un score, dit en mots — et ce qu'il vaut par rapport aux autres. */
export function scoreBand(value: number): { label: string; rank: string } {
  if (value >= PRIORITY_HOT) return { label: 'À contacter', rank: 'dans le tiers le mieux placé' };
  if (value >= PRIORITY_WORTH_SEEING) {
    return { label: 'À voir', rank: 'au-dessus de la moitié des annonces' };
  }
  return { label: 'Dans la liste', rank: 'en dessous de la moitié des annonces' };
}
