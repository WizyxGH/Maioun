/**
 * L'écran courant, tenu par la barre d'adresse.
 *
 * `useState` n'était pas la bonne mémoire : le bouton « Précédent » quittait le
 * site au lieu de refermer une fiche, et sur Android le geste de retour fermait
 * l'application. L'historique du navigateur est fait pour ça — encore
 * fallait-il l'utiliser.
 *
 * DEUX GESTES SEULEMENT, et la différence compte :
 *
 *   - `go` empile une entrée. Ouvrir une fiche, entrer dans les paramètres :
 *     autant d'endroits d'où l'on doit pouvoir revenir.
 *   - `replace` réécrit l'entrée courante. Passer de la liste aux favoris n'est
 *     pas un voyage : empiler chaque bascule obligerait à appuyer dix fois sur
 *     « Précédent » pour sortir.
 *
 * La seule dépendance est `history`, présent partout. Une bibliothèque de
 * routage aurait apporté son propre modèle d'état à côté de celui de l'écran,
 * pour une table de quinze chemins.
 */

import { useCallback, useEffect, useState } from 'react';
import { currentRoute, hrefOf, sameRoute, type Route } from './router.js';

/** Lit l'adresse courante, ou l'accueil hors navigateur (rendu de test). */
function readRoute(): Route {
  if (typeof window === 'undefined') return { view: 'home' };
  return currentRoute(window.location.pathname);
}

/**
 * COMBIEN D'ÉCRANS ON A OUVERTS DEPUIS QU'ON EST ARRIVÉ, rangé dans l'entrée
 * d'historique elle-même.
 *
 * Chaque bouton « Retour » choisissait une destination FIXE — la fiche d'une
 * source ramenait à la liste des sources, même quand on l'avait ouverte depuis
 * le nom de l'agence sur une annonce. Le bouton du navigateur, lui, revenait
 * bien à l'annonce : deux boutons « Retour » côte à côte qui ne font pas la
 * même chose.
 *
 * Revenir, c'est `history.back()` — encore faut-il savoir s'il y a quelque
 * chose derrière. `history.length` ne le dit pas : il compte aussi les pages
 * visitées AVANT d'arriver ici, et y revenir ferait sortir du site. D'où ce
 * compteur, porté par l'entrée : il vaut 0 sur celle par laquelle on est entré
 * (lien direct, notification), et il survit à un rechargement puisque le
 * navigateur conserve l'état de chaque entrée.
 */
function depthOf(state: unknown): number {
  const depth = (state as { readonly depth?: unknown } | null)?.depth;
  return typeof depth === 'number' && Number.isFinite(depth) && depth > 0 ? depth : 0;
}

/** Y a-t-il un écran de l'application derrière celui-ci ? */
export function canGoBack(): boolean {
  return typeof window !== 'undefined' && depthOf(window.history.state) > 0;
}

/**
 * L'état à écrire en empilant un écran.
 *
 * Exporté parce que tout ce qui empile une entrée doit le faire : un lien
 * interne qui appellerait `pushState` seul remettrait le compteur à zéro, et
 * les « Retour » suivants croiraient être arrivés par un lien direct.
 */
export function nextHistoryState(): { readonly depth: number } {
  return { depth: (typeof window === 'undefined' ? 0 : depthOf(window.history.state)) + 1 };
}

/**
 * Une destination, ou de quoi la calculer.
 *
 * La forme fonction n'est pas un ornement : deux navigations déclenchées dans
 * le même gestionnaire liraient toutes deux l'adresse du rendu précédent.
 * « Ouvrir cette annonce » puis « aller sur la fiche » se traduirait alors par
 * une fiche sans identifiant.
 */
export type RouteTarget = Route | ((current: Route) => Route);

export interface RouteControls {
  readonly route: Route;
  /** Empile une entrée : on pourra revenir ici. */
  readonly go: (target: RouteTarget) => void;
  /** Réécrit l'entrée courante : la précédente reste la sortie. */
  readonly replace: (target: RouteTarget) => void;
  /**
   * Revient d'où l'on vient, comme le bouton du navigateur.
   *
   * `fallback` sert quand il n'y a rien derrière — on est entré par ce
   * lien-là. L'écran voisin qu'on propose alors est empilé, pour que le bouton
   * du navigateur défasse ce déplacement comme n'importe quel autre.
   */
  readonly back: (fallback: Route) => void;
}

export function useRoute(): RouteControls {
  const [route, setRoute] = useState<Route>(readRoute);

  // Le bouton « Précédent », le geste Android, un lien collé : dans les trois
  // cas c'est le navigateur qui décide, et l'écran suit.
  useEffect(() => {
    const onPop = (): void => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const move = useCallback((target: RouteTarget, push: boolean): void => {
    setRoute((current) => {
      const next = typeof target === 'function' ? target(current) : target;
      // Rejouer la même adresse empilerait des entrées identiques, qu'il
      // faudrait ensuite dépiler une à une.
      if (sameRoute(current, next)) return current;
      const href = hrefOf(next);
      // Réécrire garde la profondeur de l'entrée : passer de la liste aux
      // favoris ne rapproche ni n'éloigne de la sortie.
      if (push) window.history.pushState(nextHistoryState(), '', href);
      else window.history.replaceState(window.history.state, '', href);
      return next;
    });
  }, []);

  const go = useCallback((target: RouteTarget): void => move(target, true), [move]);
  const replace = useCallback((target: RouteTarget): void => move(target, false), [move]);
  const back = useCallback(
    (fallback: Route): void => {
      if (canGoBack()) {
        window.history.back();
        return;
      }
      move(fallback, true);
    },
    [move],
  );

  return { route, go, replace, back };
}
