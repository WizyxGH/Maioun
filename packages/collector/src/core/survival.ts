/**
 * COMBIEN DE TEMPS UNE ANNONCE RESTE-T-ELLE DISPONIBLE ? (§31, §17)
 *
 * La question décide de l'urgence : sur un marché où la moitié des annonces
 * disparaît en trois jours, une annonce d'un jour est déjà à mi-vie. Le score
 * d'opportunité repose aujourd'hui sur des paliers ÉCRITS À LA MAIN — 15 min,
 * 1 h, 6 h, 1 jour, 3 jours, 7 jours —, identiques pour toutes les sources et
 * jamais confrontés au marché. Ce module fournit la mesure qui leur manque.
 *
 * CE QU'ON MESURE, ET CE QU'ON NE PEUT PAS MESURER. Une annonce éteinte a vécu
 * `last_seen_at − first_seen_at` : de la première fois qu'on l'a vue à la
 * dernière. C'est une borne INFÉRIEURE — elle est peut-être restée en ligne
 * entre notre dernier passage et son retrait —, et l'écart est celui de
 * l'intervalle de la source. `listing_history` ne peut pas répondre : il
 * n'enregistre que les changements de prix, de surface et de disponibilité,
 * jamais les bascules de cycle de vie.
 *
 * LE PIÈGE, ET LA RAISON D'ÊTRE DE CE FICHIER : LA CENSURE. Les annonces
 * ENCORE EN LIGNE n'ont pas fini de vivre. Faire la moyenne des seules vies
 * achevées revient à ne compter que ceux qui sont déjà morts — cela sous-estime
 * toujours, et d'autant plus que la base est jeune : on ne peut pas observer
 * une vie de soixante jours dans une base qui en a vingt. Une moyenne simple
 * aurait donc l'air juste et serait fausse, sans que rien ne le dise.
 *
 * Kaplan-Meier répond exactement à cela : chaque annonce encore en ligne compte
 * comme « a vécu AU MOINS n jours » et reste dans l'effectif à risque jusque-là,
 * au lieu d'être ignorée ou comptée comme morte. Trente lignes, aucune
 * dépendance, et une médiane qui vaut `null` tant que la courbe n'est pas
 * descendue à la moitié — parce qu'alors la réponse honnête est « on ne sait
 * pas encore », et non un nombre.
 */

/** Une vie observée : sa durée, et si elle est achevée. */
export interface Lifetime {
  /** Jours écoulés. Pour une annonce encore en ligne : depuis sa découverte. */
  readonly days: number;
  /** `true` si l'annonce s'est éteinte ; `false` si elle est encore en ligne. */
  readonly ended: boolean;
}

/** Un point de la courbe de survie. */
export interface SurvivalPoint {
  readonly day: number;
  /** Part encore disponible, de 1 à 0. */
  readonly share: number;
}

export interface SurvivalCurve {
  /** Vies achevées — les seules qui font descendre la courbe. */
  readonly completed: number;
  /** Vies encore en cours, prises en compte comme « au moins n jours ». */
  readonly censored: number;
  /**
   * Jours au bout desquels la moitié des annonces a disparu.
   *
   * `null` quand la courbe ne descend jamais à 0,5 : la médiane est alors
   * au-delà de ce qu'on a observé, et l'annoncer serait l'inventer.
   */
  readonly medianDays: number | null;
  /** La courbe elle-même, un point par jour d'extinction observé. */
  readonly points: readonly SurvivalPoint[];
  /** La plus longue observation, achevée ou non : on ne voit pas au-delà. */
  readonly horizonDays: number;
}

/**
 * Estimateur de Kaplan-Meier.
 *
 * À chaque instant où des annonces s'éteignent, la survie est multipliée par
 * la part de celles qui passent : `S(t) = S(t⁻) × (1 − morts / à risque)`.
 * Une annonce encore en ligne sort de l'effectif à risque au moment où on
 * cesse de l'observer, sans jamais faire descendre la courbe — c'est là toute
 * la différence avec une moyenne des vies achevées.
 */
export function survivalCurve(lifetimes: readonly Lifetime[]): SurvivalCurve {
  const clean = lifetimes.filter((one) => Number.isFinite(one.days) && one.days >= 0);
  const completed = clean.filter((one) => one.ended).length;
  const censored = clean.length - completed;

  if (clean.length === 0) {
    return { completed: 0, censored: 0, medianDays: null, points: [], horizonDays: 0 };
  }

  const horizonDays = Math.max(...clean.map((one) => one.days));

  // Instants d'extinction, dans l'ordre. Seuls eux font des marches.
  const deathDays = [...new Set(clean.filter((one) => one.ended).map((one) => one.days))].sort(
    (a, b) => a - b,
  );

  const points: SurvivalPoint[] = [];
  let share = 1;
  let medianDays: number | null = null;

  for (const day of deathDays) {
    // À RISQUE : tout ce qu'on observait encore juste avant cet instant —
    // les annonces éteintes plus tard, et celles encore en ligne depuis au
    // moins aussi longtemps.
    const atRisk = clean.filter((one) => one.days >= day).length;
    if (atRisk === 0) break;
    const deaths = clean.filter((one) => one.ended && one.days === day).length;

    share *= 1 - deaths / atRisk;
    points.push({ day, share });
    if (medianDays === null && share <= 0.5) medianDays = day;
  }

  return { completed, censored, medianDays, points, horizonDays };
}

/**
 * Part encore disponible au bout de `day` jours, lue sur la courbe.
 *
 * `null` au-delà de l'horizon observé : la courbe s'arrête où s'arrêtent les
 * observations, et la prolonger serait une extrapolation (§17).
 */
export function shareAlive(curve: SurvivalCurve, day: number): number | null {
  if (day > curve.horizonDays) return null;
  let share = 1;
  for (const point of curve.points) {
    if (point.day > day) break;
    share = point.share;
  }
  return share;
}
