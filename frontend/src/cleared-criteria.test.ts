/**
 * LE RETOUR ARRIÈRE DOIT SURVIVRE AU RECHARGEMENT.
 *
 * « Effacer tout » lève quatre-vingt-sept quartiers cochés un à un ; la rangée
 * qui les remet ne vivait qu'en mémoire de page. Un rafraîchissement, un
 * onglet déchargé par le téléphone, et il n'y avait plus aucun chemin de
 * retour — la perte silencieuse que cette rangée existe pour éviter.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearedCriteria } from './criteria-chips.js';
import { forgetCleared, recallCleared, rememberCleared } from './cleared-criteria.js';
import type { FilterConfig } from './types.js';

const CRITERIA: FilterConfig = {
  cities: ['nice'],
  minPrice: 250,
  maxPrice: 700,
  minArea: 20,
  maxCommuteMinutes: 60,
  excludeFlatShare: true,
  excludeStudent: true,
  districts: ['cimiez', 'liberation', 'vieux-nice'],
};

const CLEARED = clearedCriteria(CRITERIA);

/** L'effacement qui vient d'avoir lieu, tel que l'écran le retient. */
const memo = {
  previous: CRITERIA,
  cleared: CLEARED,
  labels: ['3 quartiers', 'Colocations exclues'],
};

beforeEach(() => {
  localStorage.clear();
});

describe('le retour arrière d’« Effacer tout »', () => {
  it('se retrouve au rechargement', () => {
    rememberCleared(memo);
    expect(recallCleared(CLEARED)?.previous).toEqual(CRITERIA);
    expect(recallCleared(CLEARED)?.labels).toEqual(['3 quartiers', 'Colocations exclues']);
  });

  it('survit à un ordre de clés différent', () => {
    // Le réglage revient du serveur tel qu'il a été écrit, mais rien ne garantit
    // l'ordre dans lequel l'objet a été bâti. Comparer deux `JSON.stringify`
    // bruts jetterait le retour arrière à chaque rechargement.
    rememberCleared(memo);
    const remonte = Object.fromEntries(
      Object.entries(CLEARED).reverse(),
    ) as unknown as FilterConfig;
    expect(recallCleared(remonte)).not.toBeNull();
  });

  it('EST JETÉ si les critères ont bougé depuis', () => {
    // Réglés entre temps depuis le panneau, une autre machine ou une recherche
    // enregistrée : « Annuler » écraserait ce réglage-là au lieu de défaire
    // l'effacement.
    rememberCleared(memo);
    expect(recallCleared({ ...CLEARED, maxPrice: 900 })).toBeNull();
    // Et il ne revient pas au chargement suivant.
    expect(recallCleared(CLEARED)).toBeNull();
  });

  it('s’oublie quand on en a fini avec lui', () => {
    rememberCleared(memo);
    forgetCleared();
    expect(recallCleared(CLEARED)).toBeNull();
  });

  it('ne rend rien quand rien n’a été effacé', () => {
    expect(recallCleared(CRITERIA)).toBeNull();
  });
});

describe('ce qui est stocké n’est jamais cru sur parole', () => {
  it.each([
    ['illisible', '{'],
    ['sans critères d’avant', JSON.stringify({ cleared: CLEARED, labels: [] })],
    ['sans état effacé', JSON.stringify({ previous: CRITERIA, labels: [] })],
    ['avec des étiquettes qui n’en sont pas', JSON.stringify({ ...memo, labels: [3] })],
  ])('oublie une valeur %s', (_cas, raw) => {
    localStorage.setItem('maioun.clearedCriteria', raw);
    expect(recallCleared(CLEARED)).toBeNull();
    expect(localStorage.getItem('maioun.clearedCriteria')).toBeNull();
  });

  it('se tait quand le navigateur refuse son stockage', () => {
    // Navigation privée, stockage plein, site bloqué : le retour arrière ne
    // vivra que le temps de la page — mais l'écran ne doit pas tomber.
    const refus = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => rememberCleared(memo)).not.toThrow();
    refus.mockRestore();

    const muet = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    expect(recallCleared(CLEARED)).toBeNull();
    muet.mockRestore();
  });
});
