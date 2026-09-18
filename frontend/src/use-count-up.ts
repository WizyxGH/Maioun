/**
 * LES CHIFFRES ARRIVENT EN COMPTANT, plutôt qu'en apparaissant d'un bloc.
 *
 * Les compteurs des statistiques passaient du squelette à leur valeur d'un
 * seul coup : rien ne reliait les deux états, et l'œil ne savait pas où
 * regarder. Un décompte court les amène à leur valeur — c'est le mouvement qui
 * dit « voilà ce qui vient de charger ».
 *
 * IL NE COMMENCE QU'UNE FOIS LA VRAIE VALEUR CONNUE, et il finit toujours
 * dessus, exactement. Aucun chiffre intermédiaire ne survit à la fin de
 * l'animation : on n'affiche jamais une valeur qui pourrait être prise pour
 * une donnée.
 *
 * LE MOUVEMENT SE REFUSE. Qui a demandé à son système de réduire les
 * animations voit la valeur finale immédiatement — un compteur qui défile est
 * exactement le genre de mouvement que ce réglage vise.
 */

import { useEffect, useRef, useState } from 'react';

/** Assez pour voir le mouvement, trop court pour retarder la lecture. */
const DUREE_MS = 550;

/** `true` si le système demande de limiter les animations. */
function mouvementRefuse(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * La valeur à afficher : elle monte jusqu'à `value`, puis s'y arrête.
 *
 * @param value La valeur finale. Un changement relance le décompte DEPUIS
 *   l'affichage courant, et non depuis zéro : un rafraîchissement qui fait
 *   passer 48 à 49 ne doit pas redérouler tout le compteur.
 */
export function useCountUp(value: number): number {
  const [displayed, setDisplayed] = useState(() => (mouvementRefuse() ? value : 0));
  // La valeur d'où repart l'animation, lue sans redéclencher l'effet.
  const depuis = useRef(displayed);

  useEffect(() => {
    if (mouvementRefuse() || typeof requestAnimationFrame !== 'function') {
      depuis.current = value;
      setDisplayed(value);
      return undefined;
    }
    const debut = depuis.current;
    if (debut === value) return undefined;

    let frame = 0;
    // L'ORIGINE VIENT DE LA PREMIÈRE IMAGE, et non d'une horloge lue à côté :
    // les deux ne partagent pas toujours le même point zéro, et l'écart faisait
    // partir le compteur à l'envers.
    let depart: number | null = null;
    const avance = (maintenant: number): void => {
      depart ??= maintenant;
      const part = Math.min(1, Math.max(0, (maintenant - depart) / DUREE_MS));
      // Sortie douce : rapide d'abord, posé à l'arrivée.
      const adouci = 1 - (1 - part) ** 3;
      const courant = part === 1 ? value : Math.round(debut + (value - debut) * adouci);
      depuis.current = courant;
      setDisplayed(courant);
      if (part < 1) frame = requestAnimationFrame(avance);
    };
    frame = requestAnimationFrame(avance);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return displayed;
}
