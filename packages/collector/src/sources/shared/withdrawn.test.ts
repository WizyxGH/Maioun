/**
 * Les garde-fous du retrait immédiat. Chacun de ces tests décrit un cas où
 * éteindre l'annonce serait une faute : c'est la condition posée au mécanisme.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ScrapeContext, StopReason } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { withdrawnRefsFrom, type GoneDetail } from './withdrawn.js';

function context(log = vi.fn()): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: () => Promise.reject(new Error('aucune requête attendue')),
    isKnown: () => true,
    knownRefs: new Set<string>(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log,
    credentials: null,
    shouldStop: () => false,
  };
}

const absente = (sourceRef: string, status = 404): GoneDetail => ({
  sourceRef,
  url: `https://exemple.invalid/fiche/${sourceRef}`,
  status,
});

describe('withdrawnRefsFrom', () => {
  it('retire une fiche absente quand le passage est sain', () => {
    const refs = withdrawnRefsFrom(
      context(),
      { gone: [absente('a')], detailsRequested: 10 },
      'completed',
    );
    expect(refs).toEqual(['a']);
  });

  it.each<StopReason>(['rateLimited', 'blocked', 'tooManyErrors', 'incomplete', 'notModified'])(
    'ne retire rien quand le passage s’est terminé en %s',
    (stopReason) => {
      const refs = withdrawnRefsFrom(
        context(),
        { gone: [absente('a')], detailsRequested: 10 },
        stopReason,
      );
      expect(refs).toEqual([]);
    },
  );

  it('ne retire rien quand la moitié des fiches répond absente : le site, pas les annonces', () => {
    const gone = ['a', 'b', 'c', 'd', 'e', 'f'].map((ref) => absente(ref));
    const refs = withdrawnRefsFrom(context(), { gone, detailsRequested: 8 }, 'completed');
    expect(refs).toEqual([]);
  });

  it('retire encore quand les absences restent minoritaires', () => {
    const gone = ['a', 'b'].map((ref) => absente(ref));
    const refs = withdrawnRefsFrom(context(), { gone, detailsRequested: 20 }, 'completed');
    expect(refs).toEqual(['a', 'b']);
  });

  it('ne se fie pas à la proportion sur trop peu de fiches', () => {
    // Deux fiches lues, une absente : une agence qui a loué un bien, pas un site
    // déplacé. La proportion ne dit rien à cette échelle.
    const refs = withdrawnRefsFrom(
      context(),
      { gone: [absente('a')], detailsRequested: 2 },
      'completed',
    );
    expect(refs).toEqual(['a']);
  });

  it('journalise chaque retrait avec sa référence, son adresse et son code', () => {
    const log = vi.fn();
    withdrawnRefsFrom(
      context(log),
      { gone: [absente('a', 410)], detailsRequested: 10 },
      'completed',
    );
    expect(log).toHaveBeenCalledWith('withdrawn.gone', {
      ref: 'a',
      url: 'https://exemple.invalid/fiche/a',
      status: 410,
    });
  });
});
