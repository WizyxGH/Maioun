/**
 * L'état d'affichage mémorisé, et la RELECTURE des réglages d'avant les modes.
 *
 * Le filtre par source n'était qu'un tableau : relu tel quel, il continuerait
 * d'exclure les sources ajoutées depuis.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { DEFAULT_VIEW_STATE, readViewState, writeViewState } from './view-state.js';
import { ALL_SOURCES } from './source-selection.js';
import { SOURCES } from './sources.generated.js';

const KEY = 'maioun.viewState';

beforeEach(() => {
  localStorage.clear();
});

describe('readViewState', () => {
  it('sans rien de mémorisé, les valeurs d’ouverture', () => {
    expect(readViewState().sources).toEqual(ALL_SOURCES);
  });

  it('un ancien tableau de quelques sources se lit « seulement celles-ci »', () => {
    localStorage.setItem(KEY, JSON.stringify({ selectedSources: ['orpi', 'fnaim'] }));
    expect(readViewState().sources).toEqual({ mode: 'only', ids: new Set(['orpi', 'fnaim']) });
  });

  it('un ancien tableau de presque toutes se lit « sauf les manquantes »', () => {
    const presqueTout = Object.keys(SOURCES).filter((id) => id !== 'locservice');
    localStorage.setItem(KEY, JSON.stringify({ selectedSources: presqueTout }));
    expect(readViewState().sources).toEqual({ mode: 'except', ids: new Set(['locservice']) });
  });

  it('relit ce qu’elle a écrit, mode compris', () => {
    const sources = { mode: 'except' as const, ids: new Set(['locservice']) };
    writeViewState({ ...DEFAULT_VIEW_STATE, sources });
    expect(readViewState().sources).toEqual(sources);
  });
});
