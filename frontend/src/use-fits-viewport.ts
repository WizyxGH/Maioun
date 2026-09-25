/**
 * LA HAUTEUR QUI RESTE SOUS UN ÉLÉMENT, pour qu'il tienne sans défiler.
 *
 * La colonne de la carte était haute d'un écran entier (`100dvh - 2rem`) et
 * COLLÉE à un rem du haut. Une fois le défilement engagé, elle tombait juste ;
 * mais à l'arrivée sur la page elle commence sous l'en-tête, la barre de
 * recherche et les puces de filtres — et son bas passait alors sous le pli. Il
 * fallait faire défiler pour voir la carte en entier, ce qui est exactement ce
 * qu'une carte collée cherche à éviter.
 *
 * AUCUNE VALEUR EN DUR NE POUVAIT MARCHER : la hauteur du bandeau varie — les
 * puces passent à la ligne, un bandeau d'alerte s'ajoute, la fenêtre change de
 * taille. On MESURE donc la distance réelle entre le haut de l'élément et le
 * haut du document, et l'on en déduit ce qui reste.
 *
 * MESURÉ AU REPOS, PAS EN COURS DE DÉFILEMENT : `getBoundingClientRect` rend
 * une position relative à l'écran, qui change à chaque pixel défilé — d'où
 * l'ajout du défilement courant. Une fois collé, l'élément est un peu plus
 * court qu'il ne pourrait l'être ; c'est le bon compromis, puisque l'autre
 * sens le ferait déborder.
 */

import { useEffect, useState, type RefObject } from 'react';

/**
 * @param ref l'élément à mesurer
 * @param marginPx la marge à laisser sous lui
 * @returns une hauteur CSS, ou `null` tant qu'on n'a pas mesuré — l'appelant
 *   garde alors sa valeur de repli, plutôt que de sauter d'une taille à l'autre.
 */
export function useFitsViewport(ref: RefObject<HTMLElement | null>, marginPx = 16): string | null {
  const [height, setHeight] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof window === 'undefined') return;

    const measure = (): void => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      const left = window.innerHeight - top - marginPx;
      // Un plancher : sur un écran court, mieux vaut une carte petite mais
      // utilisable qu'une bande de quelques pixels.
      setHeight(`${Math.max(320, Math.round(left))}px`);
    };

    measure();
    window.addEventListener('resize', measure);
    // Le bandeau au-dessus change de hauteur sans que la fenêtre bouge : une
    // puce de plus, un bandeau d'alerte. `ResizeObserver` le voit, pas `resize`.
    const observer = new ResizeObserver(measure);
    if (element.parentElement !== null) observer.observe(element.parentElement);
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [ref, marginPx]);

  return height;
}
