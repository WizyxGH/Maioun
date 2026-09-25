/**
 * La date annoncée doit être celle des DONNÉES, ou se dire incertaine.
 *
 * Ouvrir une base SQLite suffit à rafraîchir son fichier : `pnpm serve:local`
 * annonçait « base du 25/09 11:36 » pour un contenu de la veille, parce qu'il
 * venait de l'ouvrir. La date la plus rassurante était la moins vraie.
 */

import { describe, expect, it } from 'vitest';
import { descriptionDeLaCopie } from './fraicheur.js';

const FICHIER = new Date('2026-09-25T09:36:00Z');

describe('descriptionDeLaCopie', () => {
  it('annonce la dernière collecte, pas la date du fichier', () => {
    const rendu = descriptionDeLaCopie('miroir de la production', '2026-09-24T15:06:38Z', FICHIER);
    expect(rendu).toMatch(/24\/09\/2026/);
    expect(rendu).not.toMatch(/25\/09\/2026/);
    expect(rendu).toMatch(/collectée/);
  });

  // Base vide, table absente : on retombe sur le fichier — mais on le DIT.
  it('dit que la date est celle du fichier quand les données se taisent', () => {
    const rendu = descriptionDeLaCopie('base locale', null, FICHIER);
    expect(rendu).toMatch(/25\/09\/2026/);
    expect(rendu).toMatch(/fichier/);
    expect(rendu).toMatch(/inconnue/);
    expect(rendu).not.toMatch(/collectée/);
  });

  // Une valeur illisible ne doit pas rendre « Invalid Date » à l'écran.
  it('retombe sur le fichier plutôt que d’afficher une date illisible', () => {
    const rendu = descriptionDeLaCopie('base locale', 'avant-hier', FICHIER);
    expect(rendu).toMatch(/fichier/);
    expect(rendu).not.toMatch(/Invalid/);
  });

  it('garde le nom de la base en tête', () => {
    expect(descriptionDeLaCopie('miroir de la production', null, FICHIER)).toMatch(
      /^miroir de la production,/,
    );
  });
});
