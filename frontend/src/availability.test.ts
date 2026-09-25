// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it } from 'vitest';
import { archiveReasonOf, isArchivedBySource, isUnavailable, isUncertain } from './availability.js';

const base = { lifecycle: 'active' as const, archived: false, rented: false };

describe('archivage d’office', () => {
  it('range louée et retirée, jamais le doute', () => {
    expect(archiveReasonOf({ ...base, rented: true })).toBe('rented');
    expect(archiveReasonOf({ ...base, lifecycle: 'inactive' })).toBe('offline');
    expect(archiveReasonOf({ ...base, lifecycle: 'possiblyInactive' })).toBeNull();
    expect(isUnavailable({ ...base, lifecycle: 'possiblyInactive' })).toBe(false);
  });

  it('« à vérifier » ne vaut ni retirée ni archivée', () => {
    expect(isUncertain({ ...base, lifecycle: 'possiblyInactive' })).toBe(true);
    expect(isUncertain({ ...base, lifecycle: 'inactive' })).toBe(false);
    expect(isUncertain(base)).toBe(false);
  });

  it('distingue le geste du lecteur de la décision de la source', () => {
    expect(isArchivedBySource({ ...base, archived: true })).toBe(false);
    expect(isArchivedBySource({ ...base, applicationStatus: 'full' })).toBe(true);
    // Désarchivée à l'instant : l'écran le montre avant le rechargement.
    expect(archiveReasonOf({ ...base, archived: false })).toBeNull();
  });
});
