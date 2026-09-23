/**
 * Sondage des nouvelles annonces, SITE OUVERT (§29).
 *
 * Deux canaux partent du même sondage, et c'est voulu :
 *   - un BANDEAU dans la page, qui ne demande aucune permission — c'est le
 *     canal « je suis déjà en train de regarder », le seul qui fonctionne quand
 *     l'onglet a le focus (le système masque alors les notifications) ;
 *   - la NOTIFICATION navigateur, qui prend le relais onglet en arrière-plan,
 *     si la permission a été accordée.
 *
 * Extrait de `App` : la boucle, son annulation et la mémoire des annonces déjà
 * vues forment un tout, et les y laisser poussait le composant au-delà de la
 * complexité tolérée.
 */

import { useEffect, useRef } from 'react';
import { fetchListings, isDemoMode } from './api/client.js';
import {
  diffForNotification,
  fireNotifications,
  NOTIFY_POLL_MS,
  readOptIn,
  readSeen,
  writeSeen,
} from './notifications.js';
import type { ListingView } from './types.js';

export function useNewListingAlerts({
  enabled,
  visible,
  onFresh,
  onOpen,
}: {
  /**
   * `false` tant qu'aucun compte n'est connu : sans session, le serveur ne
   * peut pas appliquer les critères de quelqu'un. Il rend alors le CATALOGUE —
   * tout ce qui n'est ni parking ni local commercial dans les communes du
   * projet —, sans budget, sans surface et sans exclusion de colocation. Le
   * sondage signalait donc des annonces que la liste n'affiche pas, dès que la
   * session expirait : l'accord « je suis prévenu » survit dans le navigateur,
   * la session non.
   */
  readonly enabled: boolean;
  /**
   * Ce que la liste MONTRERAIT de cette annonce, filtres de l'écran compris.
   *
   * Les critères disent ce qu'on cherche et le serveur les applique ; les
   * filtres disent ce qu'on veut voir en ce moment. Sans ce garde, une annonce
   * écartée par une source décochée faisait quand même surgir son bandeau.
   */
  readonly visible: (listing: ListingView) => boolean;
  /** Annonces jamais vues jusqu'ici, dans les critères. Jamais appelé à vide. */
  readonly onFresh: (fresh: readonly ListingView[]) => void;
  /** Ouverture d'une fiche depuis une notification cliquée. */
  readonly onOpen: (id: string) => void;
}): void {
  /**
   * PAR RÉFÉRENCE, ET NON EN DÉPENDANCE. Le prédicat se reconstruit à chaque
   * rendu — il enferme l'état des filtres —, et le mettre dans les dépendances
   * relancerait la minuterie de sondage à chaque frappe dans la recherche.
   */
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!enabled) return undefined;
    if (isDemoMode()) return undefined; // pas de vraies données à surveiller

    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (!readOptIn()) return;
      try {
        const response = await fetchListings({ sort: 'recent' });
        if (cancelled) return;
        // Le premier sondage amorce la mémoire sans rien signaler : sinon tout
        // le stock existant sonnerait d'un coup (voir `diffForNotification`).
        const { fresh, nextSeen } = diffForNotification(response.listings, readSeen(), (listing) =>
          visibleRef.current(listing),
        );
        writeSeen(nextSeen);
        if (fresh.length === 0) return;
        onFresh(fresh);
        // Silencieux si la permission n'a pas été accordée : le bandeau, lui,
        // s'affiche quand même.
        fireNotifications(fresh, onOpen);
      } catch {
        /* réseau indisponible : nouveau sondage au prochain tick */
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), NOTIFY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, onFresh, onOpen]);
}
