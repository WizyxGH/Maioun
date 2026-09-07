import { describe, expect, it } from 'vitest';
import { shareAlive, survivalCurve, type Lifetime } from './survival.js';

const ended = (days: number): Lifetime => ({ days, ended: true });
const alive = (days: number): Lifetime => ({ days, ended: false });

describe('courbe de survie des annonces (§31)', () => {
  it('ne rend aucune médiane sans observation', () => {
    const curve = survivalCurve([]);
    expect(curve.medianDays).toBeNull();
    expect(curve.completed).toBe(0);
  });

  it('trouve la médiane quand la moitié s’est éteinte', () => {
    // Quatre annonces, éteintes à 1, 2, 3 et 4 jours : la survie tombe à 0,5
    // au deuxième jour.
    const curve = survivalCurve([ended(1), ended(2), ended(3), ended(4)]);
    expect(curve.medianDays).toBe(2);
    expect(curve.completed).toBe(4);
    expect(curve.censored).toBe(0);
  });

  it('NE COMPTE PAS une annonce encore en ligne comme une disparition', () => {
    /**
     * LE CŒUR DU SUJET. Trois annonces éteintes à 10 jours, sept encore en
     * ligne depuis 1 jour. Une moyenne des vies achevées annoncerait « 10
     * jours » ; une moyenne de TOUTES les durées annoncerait 3,7 jours en
     * traitant les vivantes comme des mortes — deux fois faux, dans deux
     * directions opposées.
     *
     * Kaplan-Meier ne fait pas descendre la courbe sur une annonce vivante :
     * les sept sorties d'observation à 1 jour quittent l'effectif à risque
     * sans compter comme des morts, et la survie ne bouge qu'à 10 jours.
     */
    const curve = survivalCurve([
      ended(10),
      ended(10),
      ended(10),
      ...Array.from({ length: 7 }, () => alive(1)),
    ]);

    expect(curve.completed).toBe(3);
    expect(curve.censored).toBe(7);
    // À 10 jours, il ne restait que les 3 annonces observées jusque-là, et
    // toutes s'éteignent : la survie tombe à 0.
    expect(curve.points).toEqual([{ day: 10, share: 0 }]);
    expect(curve.medianDays).toBe(10);
  });

  it('avoue ne pas savoir quand la courbe ne descend pas à la moitié', () => {
    // Une seule extinction sur dix : la médiane est au-delà de ce qu'on a vu.
    // Annoncer un nombre ici serait l'inventer (§17).
    const curve = survivalCurve([ended(3), ...Array.from({ length: 9 }, () => alive(30))]);
    expect(curve.medianDays).toBeNull();
    expect(curve.completed).toBe(1);
  });

  it('ne lit pas la courbe au-delà de ce qui a été observé', () => {
    const curve = survivalCurve([ended(2), ended(4), alive(5)]);
    expect(shareAlive(curve, 0)).toBe(1);
    expect(shareAlive(curve, 2)).toBeCloseTo(2 / 3, 5);
    // 90 jours dépassent l'horizon : on ne prolonge pas.
    expect(shareAlive(curve, 90)).toBeNull();
  });

  it('écarte les durées absurdes plutôt que de les compter', () => {
    // Une date illisible en base donnerait NaN : elle ne doit ni compter ni
    // faire planter le calcul.
    const curve = survivalCurve([ended(Number.NaN), ended(2), ended(4), alive(-1)]);
    expect(curve.completed).toBe(2);
    expect(curve.censored).toBe(0);
  });
});
