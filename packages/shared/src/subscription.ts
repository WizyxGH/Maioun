/**
 * Qui a droit à quoi.
 *
 * TROIS MARCHES, ET UNE SEULE SE PAIE. Consulter les annonces est libre ; agir
 * — favori, dossier, suivi — demande un compte gratuit ; candidater à votre
 * place se paie. Ce module ne connaît que la troisième.
 *
 * LE DROIT SE DÉDUIT, IL NE SE STOCKE PAS. Une colonne « payant = 1 » serait un
 * droit qu'il faudrait penser à retirer, et personne ne le fait : le jour où un
 * paiement échoue, l'accès resterait ouvert indéfiniment. On garde l'état que
 * Stripe a annoncé et la fin de la période payée, et l'on recalcule. Un
 * abonnement expiré cesse d'ouvrir sans que quiconque intervienne.
 */

/** Ce que la base garde d'un abonnement. Rien de plus n'est nécessaire. */
export interface SubscriptionState {
  /** État nommé par Stripe, recopié sans interprétation. `null` = jamais abonné. */
  readonly status: string | null;
  /** Fin de la période PAYÉE, en ISO. `null` quand il n'y en a pas. */
  readonly until: string | null;
}

/**
 * Les états de Stripe qui ouvrent l'accès.
 *
 * `trialing` en fait partie : un essai est un accès consenti. `past_due` n'y
 * est pas — le paiement a échoué, Stripe réessaie, et pendant ce temps le
 * service reste ouvert jusqu'à la fin de la période déjà payée, ce dont
 * `until` se charge. Inutile d'ajouter une seconde règle qui dirait la même
 * chose autrement.
 */
const OPEN_STATUSES = new Set(['active', 'trialing']);

/**
 * `true` si ce compte peut faire candidater à sa place, à cet instant.
 *
 * DEUX CONDITIONS, ET LES DEUX COMPTENT. L'état doit être ouvert ET la période
 * payée ne doit pas être écoulée. L'état seul laisserait passer un abonnement
 * qu'on n'a pas vu se terminer — un webhook manqué, une base restée en arrière ;
 * la date seule laisserait passer un abonnement remboursé le lendemain.
 */
export function hasPaidPlan(state: SubscriptionState, nowMs: number): boolean {
  if (state.status === null || !OPEN_STATUSES.has(state.status)) return false;
  if (state.until === null) return false;
  const until = Date.parse(state.until);
  return Number.isFinite(until) && until > nowMs;
}

/**
 * Ce que l'écran doit dire, en un mot.
 *
 * `unconfigured` n'est pas un état de l'utilisateur mais de l'INSTALLATION :
 * aucune clé de paiement n'est branchée, donc personne ne peut s'abonner. Le
 * dire franchement vaut mieux qu'un bouton qui échouerait au clic.
 */
export type PlanLabel = 'paid' | 'expired' | 'free' | 'unconfigured';

export function planLabel(state: SubscriptionState, nowMs: number, configured: boolean): PlanLabel {
  if (hasPaidPlan(state, nowMs)) return 'paid';
  if (!configured) return 'unconfigured';
  // A payé un jour, ne paie plus : le distinguer de « n'a jamais payé » évite
  // de proposer « découvrez l'offre » à quelqu'un qui la connaît déjà.
  return state.status !== null ? 'expired' : 'free';
}
