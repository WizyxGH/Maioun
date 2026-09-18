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
 *
 * ET IL NE SE REJOUE PAS. Le décompte dit « voilà ce qui vient de charger » :
 * revenir sur un écran déjà vu n'a rien chargé du tout, et refaire défiler les
 * mêmes chiffres à chaque aller-retour n'apprend rien tout en attirant l'œil.
 * Un compteur nommé ne s'anime donc qu'une fois par session.
 */

import { useEffect, useRef, useState } from 'react';

/** Assez pour voir le mouvement, trop court pour retarder la lecture. */
const DUREE_MS = 550;

/**
 * Les compteurs déjà déroulés dans cette session, par leur nom.
 *
 * Volontairement hors de React : l'information doit survivre au démontage de
 * l'écran — c'est justement le retour sur cet écran qu'on ne veut pas animer.
 * Elle se perd au rechargement de la page, et c'est bien : là, tout recharge.
 */
const dejaDeroules = new Set<string>();

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
 * @param name Nom du compteur. Donné, il ne s'anime qu'à sa PREMIÈRE arrivée
 *   dans la session ; revenir sur l'écran affiche la valeur sans défilement.
 *   Omis, le compteur s'anime à chaque montage.
 */
export function useCountUp(value: number, name?: string): number {
  // LU UNE SEULE FOIS, au premier rendu : l'effet inscrit le nom juste après,
  // et relire l'ensemble à chaque rendu couperait l'animation en cours dès sa
  // première image.
  const premiereFois = useRef(name === undefined || !dejaDeroules.has(name));
  const [displayed, setDisplayed] = useState(() =>
    mouvementRefuse() || !premiereFois.current ? value : 0,
  );
  // La valeur d'où repart l'animation, lue sans redéclencher l'effet.
  const depuis = useRef(displayed);

  useEffect(() => {
    if (name !== undefined) dejaDeroules.add(name);
    if (mouvementRefuse() || !premiereFois.current || typeof requestAnimationFrame !== 'function') {
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
  }, [value, name]);

  return displayed;
}
