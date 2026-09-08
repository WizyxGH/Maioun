/**
 * De quelle ALERTE une ligne d'historique relève (§29).
 *
 * La collecte envoie cinq familles ; l'historique n'en montrait qu'une, et sans
 * la nommer. Deux ne l'atteignaient même pas : « un favori n'est plus
 * disponible » et « vous n'avez pas encore candidaté » s'horodatent dans
 * d'autres colonnes, que la requête ne regardait pas. Une annonce SIGNALÉE
 * PARCE QU'ELLE EST PROCHE des critères, elle, s'affichait exactement comme
 * une annonce qui les remplit — alors que la notification, elle, le disait.
 *
 * UNE ANNONCE PEUT RELEVER DE PLUSIEURS FAMILLES : signalée lundi, favorite
 * disparue jeudi. C'est l'événement le PLUS RÉCENT qui la classe et la date —
 * c'est celui qu'on vient chercher.
 */

import type { ListingView } from './types.js';

export type AlertKind = 'new' | 'nearMatch' | 'gone' | 'reminder';

export interface AlertEvent {
  readonly kind: AlertKind;
  /** Date ISO de l'événement retenu. */
  readonly at: string;
}

/** Ce que chaque famille annonce, dans les mots de la notification reçue. */
export const ALERT_LABELS: Readonly<Record<AlertKind, string>> = {
  new: 'Nouvelle annonce',
  nearMatch: 'Proche de vos critères',
  gone: 'Favori plus disponible',
  reminder: 'Pas encore candidaté',
};

function parsed(value: string | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  return Date.parse(value);
}

/**
 * L'événement le plus récent porté par cette annonce, ou `null` si elle n'a
 * jamais été signalée.
 *
 * `nearMatch` se déduit de `matchesCriteria` : les deux familles s'horodatent
 * dans la même colonne — c'est le même geste, « je te signale cette annonce » —
 * et seule la correspondance aux critères les distingue.
 */
export function alertEventOf(listing: ListingView): AlertEvent | null {
  const candidates: readonly AlertEvent[] = [
    {
      kind: listing.matchesCriteria ? ('new' as const) : ('nearMatch' as const),
      at: listing.notifiedAt ?? '',
    },
    { kind: 'gone' as const, at: listing.goneNotifiedAt ?? '' },
    { kind: 'reminder' as const, at: listing.remindedAt ?? '' },
  ];

  let best: AlertEvent | null = null;
  for (const candidate of candidates) {
    const time = parsed(candidate.at);
    if (Number.isNaN(time)) continue;
    if (best === null || time > parsed(best.at)) best = candidate;
  }
  return best;
}
