/**
 * VISIT PROBABILITY — « mon contact a-t-il des chances d'aboutir à une visite ? »
 * (§18).
 *
 * AVERTISSEMENT MÉTHODOLOGIQUE, à conserver tant que le modèle n'a pas été
 * calibré sur des résultats réels :
 *
 *   Ce score n'est PAS une probabilité statistique. C'est un indice de
 *   faisabilité fondé sur des règles explicites et assumées. Il ne repose sur
 *   aucun échantillon, aucune régression, aucun apprentissage.
 *
 * §18 demande explicitement de ne pas prétendre à une précision inexistante.
 * L'interface doit donc le présenter comme un classement relatif, jamais comme
 * « 84 % de chances ». Le score deviendra empirique en V2/V3, quand le journal
 * des contacts aura accumulé assez de résultats réels (§33).
 */

import type { AggregatedListing, ExplainedScore, ScoreReason } from '@maioun/shared';
import { clampScore } from '@maioun/shared';
import { ageMinutes, FIRST_SEEN_WEIGHT } from './opportunity.js';

export interface VisitProbabilityOptions {
  readonly nowMs: number;
}

/** Contribution du délai de contact, pour un âge en heures. */
function timing(ageHours: number): { code: string; label: string; delta: number } | null {
  if (ageHours <= 1) {
    return {
      code: 'timing.veryEarly',
      label: 'Contact dans l’heure suivant la publication',
      delta: 25,
    };
  }
  if (ageHours <= 6) return { code: 'timing.early', label: 'Contact le jour même', delta: 15 };
  if (ageHours <= 24) return { code: 'timing.sameDay', label: 'Contact sous 24 h', delta: 5 };
  if (ageHours > 72) {
    return {
      code: 'timing.late',
      label: `Annonce vieille de ${Math.round(ageHours / 24)} jours — probablement déjà pourvue`,
      delta: -20,
    };
  }
  return null;
}

/** Base de départ : sans aucune information, on ne présume rien de tranché. */
const NEUTRAL_BASE = 40;

export function scoreVisitProbability(
  listing: AggregatedListing,
  options: VisitProbabilityOptions,
): ExplainedScore {
  const reasons: ScoreReason[] = [];
  const unknownSignals: string[] = [];
  let total = NEUTRAL_BASE;
  reasons.push({ code: 'base', label: 'Base neutre', delta: NEUTRAL_BASE });

  // --- Délai entre publication et contact ----------------------------------
  // Le facteur le mieux documenté du marché locatif tendu : être parmi les
  // premiers à répondre.
  // Sans date de publication, on se rabat sur la première observation, au
  // même rabais que l'opportunité : ignorer l'âge favorisait les dates absentes.
  const age = ageMinutes(listing, options.nowMs);
  if (age === null) {
    unknownSignals.push('date de publication');
  } else {
    const tier = timing(age.minutes / 60);
    if (tier !== null) {
      const delta =
        age.basis === 'published' ? tier.delta : Math.round(tier.delta * FIRST_SEEN_WEIGHT);
      total += delta;
      reasons.push({
        code: tier.code,
        label: age.basis === 'published' ? tier.label : `${tier.label} (d’après la découverte)`,
        delta,
      });
    }
    if (age.basis === 'firstSeen') unknownSignals.push('date de publication exacte');
  }

  // --- Canal de contact disponible -----------------------------------------
  const { phone, email, formUrl, kind } = listing.contact;
  if (phone !== null) {
    total += 20;
    reasons.push({ code: 'channel.phone', label: 'Appel direct possible', delta: 20 });
  } else if (email !== null) {
    total += 10;
    reasons.push({ code: 'channel.email', label: 'Contact par e-mail', delta: 10 });
  } else if (formUrl !== null) {
    total += 3;
    reasons.push({
      code: 'channel.form',
      label: 'Formulaire uniquement — réponse plus lente',
      delta: 3,
    });
  } else {
    total -= 15;
    unknownSignals.push('moyen de contact');
    reasons.push({ code: 'channel.none', label: 'Aucun moyen de contact direct', delta: -15 });
  }

  // --- Nature du bailleur ---------------------------------------------------
  if (kind === 'agency') {
    total += 5;
    reasons.push({
      code: 'landlord.agency',
      label: 'Agence identifiée — process de visite établi',
      delta: 5,
    });
  } else if (kind === 'private') {
    // Un particulier répond de façon plus variable, mais sans intermédiaire.
    reasons.push({
      code: 'landlord.private',
      label: 'Particulier — réponse plus variable',
      delta: 0,
    });
  } else {
    unknownSignals.push('nature du bailleur');
  }

  // Pas de malus « plusieurs portails » : l'opportunité le comptait à
  // l'inverse, et les annonces multi-diffusées ne partent pas plus vite.

  // Publication, canal, nature du bailleur.
  const optionalSignals = 3;
  const missing = Math.min(optionalSignals, unknownSignals.length);

  return {
    value: clampScore(total),
    reasons,
    unknownSignals,
    confidence: (optionalSignals - missing) / optionalSignals,
  };
}
