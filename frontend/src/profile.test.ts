// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * UN PROFIL LU NE DOIT JAMAIS FAIRE TOMBER SON ÉCRAN.
 *
 * Relevé le 2026-09-25 : « profile.guarantors is not iterable », et l'écran du
 * profil remplacé par un bandeau d'erreur. La reprise des formes anciennes
 * rendait `{}` quand elle n'avait rien à dire, laissant passer ce que le profil
 * portait — y compris un `guarantors` qui n'était pas une liste, ou pas là du
 * tout. Le profil rapporté du COMPTE, lui, ne passait même pas par elle.
 *
 * Ces scénarios tiennent les deux : la liste existe toujours, et les deux
 * provenances suivent la même reprise.
 */

import { describe, expect, it } from 'vitest';
import { profilUtilisable } from './profile.js';

const NOMME = { firstName: 'Camille', lastName: 'Martin' };

describe('profilUtilisable', () => {
  // LE PLANTAGE : profil du compte enregistré avant la liste de garanties.
  it('rend une liste quand le profil n’en porte aucune', () => {
    const profil = profilUtilisable({ ...NOMME });
    expect(profil?.guarantors).toEqual([]);
    expect([...(profil?.guarantors ?? [])]).toEqual([]);
  });

  it.each([[null], ['physical'], [{ kind: 'physical' }], [42]])(
    'rend une liste même quand `guarantors` vaut %s',
    (valeur) => {
      const profil = profilUtilisable({ ...NOMME, guarantors: valeur });
      expect(Array.isArray(profil?.guarantors)).toBe(true);
    },
  );

  it('garde les garanties déjà en liste', () => {
    const profil = profilUtilisable({
      ...NOMME,
      guarantors: [{ kind: 'visale' }, { kind: 'physical', name: 'ma mère' }],
    });
    expect(profil?.guarantors).toEqual([{ kind: 'visale' }, { kind: 'physical', name: 'ma mère' }]);
  });

  // Une entrée sans nature ne se lit nulle part et ferait tomber l'écran un
  // cran plus loin, dans l'intitulé.
  it('laisse de côté une entrée dont la nature ne veut rien dire', () => {
    const profil = profilUtilisable({
      ...NOMME,
      guarantors: [{ kind: 'visale' }, { nom: 'papa' }, null, 'physical'],
    });
    expect(profil?.guarantors).toEqual([{ kind: 'visale' }]);
  });

  // Les deux formes anciennes, qui doivent continuer d'être rattrapées.
  it('reprend le choix unique d’autrefois', () => {
    const profil = profilUtilisable({ ...NOMME, guarantor: 'visale', guarantorName: ' Visale ' });
    expect(profil?.guarantors).toEqual([{ kind: 'visale', name: 'Visale' }]);
  });

  it('reprend la case cochée des tout premiers profils', () => {
    expect(profilUtilisable({ ...NOMME, hasGuarantor: true })?.guarantors).toEqual([
      { kind: 'physical' },
    ]);
  });

  it('refuse ce qui n’est pas un profil, sans lever', () => {
    expect(profilUtilisable(null)).toBeNull();
    expect(profilUtilisable('Camille')).toBeNull();
    // Un profil sans nom ne permet pas de composer un message crédible.
    expect(profilUtilisable({ firstName: 'Camille' })).toBeNull();
  });
});
