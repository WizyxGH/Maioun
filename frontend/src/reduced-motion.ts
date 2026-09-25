/**
 * « Limiter les animations », demandé par le système.
 *
 * Ce n'est pas une préférence esthétique : le mouvement déclenche des nausées
 * et des migraines chez une partie des gens, et certains le désactivent pour
 * cette raison. Tout ce qui bouge TOUT SEUL doit donc le demander ici — une
 * animation qu'on déclenche soi-même, elle, reste.
 *
 * Lu à l'appel, pas mémorisé : le réglage change sans recharger la page, et
 * une valeur figée au premier rendu ferait mentir le reste de la session.
 */
export function mouvementRefuse(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
