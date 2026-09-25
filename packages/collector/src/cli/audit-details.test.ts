/**
 * Le relevé des fiches lues : ce qu'il montre, et ce qu'il refuse de conclure.
 */

import { describe, expect, it } from 'vitest';
import { couvertureDesFiches, type CouvertureSource } from './audit-details.js';

const source = (
  sourceId: string,
  actives: number,
  lues: number,
  perimees = 0,
): CouvertureSource => ({ sourceId, actives, lues, perimees });

describe('couvertureDesFiches', () => {
  // LE CAS QUI MOTIVE LE RELEVÉ : le plus gros reste passe devant, même si son
  // pourcentage est meilleur que celui d'une petite source.
  it('classe par le nombre de fiches restantes, pas par le pourcentage', () => {
    const { retards } = couvertureDesFiches([
      source('petite', 40, 4), // 10 %, 36 à lire
      source('locservice', 711, 15), // 2 %, 696 à lire
    ]);
    expect(retards.map((retard) => retard.sourceId)).toEqual(['locservice', 'petite']);
    expect(retards[0]?.aLire).toBe(696);
    expect(retards[0]?.part).toBe(2);
  });

  // Une source qui n'en lit aucune — la FNAIM, dont le robots.txt interdit les
  // fiches — n'est pas « en retard » : elle est à part, et sans verdict.
  it('met à part celles qui n’ont jamais lu une fiche', () => {
    const { retards, jamais } = couvertureDesFiches([
      source('fnaim', 211, 0),
      source('bienici', 571, 30),
    ]);
    expect(jamais).toEqual(['fnaim']);
    expect(retards.map((retard) => retard.sourceId)).toEqual(['bienici']);
  });

  it('ne signale pas une source déjà complète', () => {
    expect(couvertureDesFiches([source('finie', 50, 50)]).retards).toEqual([]);
  });

  // Trois annonces à 0 % ne sont pas un retard, juste un petit nombre.
  it('ignore les sources trop petites pour qu’un pourcentage veuille dire quelque chose', () => {
    const rendu = couvertureDesFiches([source('minuscule', 3, 0), source('autre', 5, 1)]);
    expect(rendu.retards).toEqual([]);
    expect(rendu.jamais).toEqual([]);
  });

  it('garde le compte des fiches périmées, qui seront relues', () => {
    const { retards } = couvertureDesFiches([source('orpi', 66, 12, 9)]);
    expect(retards[0]?.perimees).toBe(9);
  });

  it('rend les sans-fiche dans un ordre stable', () => {
    const { jamais } = couvertureDesFiches([
      source('studapart', 201, 0),
      source('email-alerts', 40, 0),
      source('fnaim', 211, 0),
    ]);
    expect(jamais).toEqual(['email-alerts', 'fnaim', 'studapart']);
  });
});
