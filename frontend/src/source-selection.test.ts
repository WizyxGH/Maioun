// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * LE FILTRE PAR SOURCE MÉMORISE UNE INTENTION.
 *
 * Il ne gardait qu'une liste de sources cochées : exclure LocService revenait à
 * cocher les 211 autres, si bien que toute source ajoutée ensuite — il en
 * arrive plusieurs par jour — se retrouvait exclue en silence.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_SOURCES,
  describeSourceSelection,
  includeSources,
  legacySourceSelection,
  readSourceSelection,
  restrictsSources,
  sourceAllowed,
  withSourceMode,
} from './source-selection.js';
import { SOURCES } from './sources.generated.js';

const CONNUES = Object.keys(SOURCES);

describe('ce qui passe le filtre', () => {
  it('sans réglage, tout passe — y compris une source inconnue', () => {
    expect(restrictsSources(ALL_SOURCES)).toBe(false);
    expect(sourceAllowed(ALL_SOURCES, 'agence-toute-neuve')).toBe(true);
  });

  it('« sauf » laisse entrer les sources ajoutées depuis', () => {
    const sauf = { mode: 'except' as const, ids: new Set(['locservice']) };
    expect(sourceAllowed(sauf, 'locservice')).toBe(false);
    expect(sourceAllowed(sauf, 'agence-toute-neuve')).toBe(true);
  });

  it('« seulement » les garde dehors, ce qui est le sens du mode', () => {
    const seulement = { mode: 'only' as const, ids: new Set(['orpi']) };
    expect(sourceAllowed(seulement, 'orpi')).toBe(true);
    expect(sourceAllowed(seulement, 'agence-toute-neuve')).toBe(false);
  });
});

describe('cocher et décocher', () => {
  it('décocher depuis « toutes » écarte cette source, et elle seule', () => {
    const next = includeSources(ALL_SOURCES, ['locservice'], false);
    expect(next).toEqual({ mode: 'except', ids: new Set(['locservice']) });
    expect(sourceAllowed(next, 'orpi')).toBe(true);
  });

  it('recocher la dernière écartée revient à « toutes »', () => {
    const sauf = { mode: 'except' as const, ids: new Set(['locservice']) };
    expect(restrictsSources(includeSources(sauf, ['locservice'], true))).toBe(false);
  });

  it('en mode « seulement », cocher désigne ce qu’on garde', () => {
    const seul = includeSources({ mode: 'only', ids: new Set() }, ['orpi', 'fnaim'], true);
    expect(seul.ids).toEqual(new Set(['orpi', 'fnaim']));
  });

  // Reprendre les cases cochées pour en faire une liste « seulement »
  // recréerait la photographie qu'on cherche à éviter.
  it('changer de mode repart d’une liste vide', () => {
    const sauf = { mode: 'except' as const, ids: new Set(['locservice']) };
    expect(withSourceMode(sauf, 'only')).toEqual({ mode: 'only', ids: new Set() });
    expect(withSourceMode(sauf, 'except')).toBe(sauf);
  });
});

describe('le résumé dit le mode', () => {
  it('nomme les sources, dans le sens du filtre', () => {
    expect(describeSourceSelection(ALL_SOURCES)).toBe('Toutes les sources');
    expect(describeSourceSelection({ mode: 'except', ids: new Set(['locservice']) })).toBe(
      'Sauf LocService',
    );
    expect(describeSourceSelection({ mode: 'only', ids: new Set(['locservice']) })).toBe(
      'Seulement LocService',
    );
  });

  it('au-delà de deux, dit combien d’autres', () => {
    const resume = describeSourceSelection({
      mode: 'only',
      ids: new Set(['orpi', 'fnaim', 'foncia', 'locservice']),
    });
    expect(resume).toMatch(/^Seulement .+, .+ \+2$/);
  });

  it('« seulement » sans source retenue ne se lit pas « toutes »', () => {
    const vide = { mode: 'only' as const, ids: new Set<string>() };
    expect(restrictsSources(vide)).toBe(true);
    expect(describeSourceSelection(vide)).toBe('Aucune source');
  });
});

describe('les anciens réglages', () => {
  it('une poignée de sources, c’était « seulement celles-ci »', () => {
    expect(legacySourceSelection(['orpi', 'fnaim'])).toEqual({
      mode: 'only',
      ids: new Set(['orpi', 'fnaim']),
    });
  });

  it('rien de coché valait « toutes »', () => {
    expect(legacySourceSelection([])).toEqual(ALL_SOURCES);
  });

  // Cocher presque tout était l'UNIQUE façon d'exclure une source : relu tel
  // quel, ce réglage continuerait d'exclure les agences ajoutées depuis.
  it('presque toutes les sources, c’était « sauf les manquantes »', () => {
    const presqueTout = CONNUES.filter((id) => id !== 'locservice');
    expect(legacySourceSelection(presqueTout)).toEqual({
      mode: 'except',
      ids: new Set(['locservice']),
    });
  });

  it('toutes les sources, c’était « toutes »', () => {
    expect(legacySourceSelection(CONNUES)).toEqual(ALL_SOURCES);
  });

  it('un mode écrit fait foi ; sans lui, on relit l’ancien tableau', () => {
    expect(readSourceSelection(['orpi'], 'except')).toEqual({
      mode: 'except',
      ids: new Set(['orpi']),
    });
    expect(readSourceSelection(['orpi'], undefined)).toEqual({
      mode: 'only',
      ids: new Set(['orpi']),
    });
    expect(readSourceSelection('n’importe quoi', 'n’importe quoi')).toEqual(ALL_SOURCES);
  });
});
