/**
 * Garde-fous du contact automatique (§23).
 *
 * Cette fonction est le seul point autorisé à répondre « oui » à un envoi
 * automatique. Elle est volontairement écrite en refus par défaut : chaque
 * condition doit être explicitement satisfaite, et le premier refus arrête
 * l'évaluation.
 *
 * §42 le rappelle : le contact automatique ne doit pas être construit avant
 * d'avoir une collecte fiable et un bon dédoublonnage. Le code existe ici pour
 * que la logique soit testable dès maintenant (§53 scénario 5), mais
 * l'interrupteur global reste sur OFF tant qu'il n'est pas activé sciemment.
 */

import type {
  AutoContactLimits,
  ContactAttempt,
  ScoredListing,
  SubscriptionState,
} from '@maioun/shared';
import { hasPaidPlan } from '@maioun/shared';

export interface AutoContactDecision {
  readonly allowed: boolean;
  /** Raison du refus, ou justification de l'autorisation. Toujours renseignée. */
  readonly reason: string;
}

export interface AutoContactInput {
  readonly listing: ScoredListing;
  readonly limits: AutoContactLimits;
  /** Journal des envois, tous listings confondus (§23). */
  readonly history: readonly ContactAttempt[];
  /**
   * L'abonnement du compte pour qui l'on candidaterait.
   *
   * CHAMP OBLIGATOIRE, ET C'EST VOULU. Optionnel, il vaudrait « autorisé » par
   * défaut : le droit qu'on oublie de retirer. Ici tout appelant doit dire ce
   * que Stripe a annoncé, et le compiler le lui rappelle.
   */
  readonly subscription: SubscriptionState;
  readonly nowMs: number;
}

/** Refuse ou autorise un envoi automatique. */
export function evaluateAutoContact(input: AutoContactInput): AutoContactDecision {
  const { listing, limits, history, subscription, nowMs } = input;

  // 0. L'abonnement. Consulter est libre, agir demande un compte, candidater à
  //    votre place se paie — et c'est ici que la troisième marche se vérifie,
  //    au seul endroit qui puisse répondre « oui » à un envoi. Le droit se
  //    déduit de l'état et de la date : un abonnement expiré se referme seul.
  if (!hasPaidPlan(subscription, nowMs)) {
    return { allowed: false, reason: 'candidature automatisée réservée à l’offre payante' };
  }

  // 1. Interrupteur global — la première barrière, et la plus importante.
  if (!limits.enabled) {
    return { allowed: false, reason: 'contact automatique désactivé globalement' };
  }

  // 2. Un seul contact par annonce, jamais deux. Aucune source n'est plus
  //    interdite d'office : l'automatisation se décide au cas par cas, quand
  //    on la construit pour une source.
  const alreadyContacted = history.some((attempt) => attempt.listingId === listing.id);
  if (alreadyContacted) {
    return { allowed: false, reason: 'annonce déjà contactée' };
  }

  // 3. Seuils de score.
  const { scores } = listing;
  const { thresholds } = limits;
  if (scores.match.value < thresholds.minMatch) {
    return { allowed: false, reason: `match ${scores.match.value} < ${thresholds.minMatch}` };
  }
  if (scores.opportunity.value < thresholds.minOpportunity) {
    return {
      allowed: false,
      reason: `opportunité ${scores.opportunity.value} < ${thresholds.minOpportunity}`,
    };
  }
  if (scores.visitProbability.value < thresholds.minVisitProbability) {
    return {
      allowed: false,
      reason: `probabilité de visite ${scores.visitProbability.value} < ${thresholds.minVisitProbability}`,
    };
  }
  if (scores.risk.value > thresholds.maxRisk) {
    return { allowed: false, reason: `risque ${scores.risk.value} > ${thresholds.maxRisk}` };
  }

  // 4. Quotas glissants.
  const sentAt = history.map((attempt) => Date.parse(attempt.sentAt)).filter(Number.isFinite);
  const lastHour = sentAt.filter((time) => nowMs - time < 3_600_000).length;
  if (lastHour >= limits.maxPerHour) {
    return { allowed: false, reason: `quota horaire atteint (${lastHour}/${limits.maxPerHour})` };
  }

  const lastDay = sentAt.filter((time) => nowMs - time < 86_400_000).length;
  if (lastDay >= limits.maxPerDay) {
    return { allowed: false, reason: `quota journalier atteint (${lastDay}/${limits.maxPerDay})` };
  }

  const sourceIds = new Set(listing.occurrences.map((occurrence) => occurrence.sourceId));
  for (const sourceId of sourceIds) {
    const perSource = history.filter(
      (attempt) => attempt.sourceId === sourceId && nowMs - Date.parse(attempt.sentAt) < 86_400_000,
    ).length;
    if (perSource >= limits.maxPerSourcePerDay) {
      return {
        allowed: false,
        reason: `quota journalier atteint pour ${sourceId} (${perSource}/${limits.maxPerSourcePerDay})`,
      };
    }
  }

  // 5. Cooldown entre deux envois.
  const lastSent = sentAt.length > 0 ? Math.max(...sentAt) : null;
  if (lastSent !== null && nowMs - lastSent < limits.cooldownSeconds * 1000) {
    const remaining = Math.ceil((limits.cooldownSeconds * 1000 - (nowMs - lastSent)) / 1000);
    return { allowed: false, reason: `cooldown actif encore ${remaining} s` };
  }

  // 6. Un moyen de contact doit exister.
  if (listing.contact.email === null && listing.contact.formUrl === null) {
    return { allowed: false, reason: 'aucun canal automatisable (ni e-mail ni formulaire)' };
  }

  return { allowed: true, reason: 'toutes les conditions sont satisfaites' };
}
