import { describe, expect, it } from 'vitest';
import { archiveReasonOf, isArchivedBySource, isUnavailable } from './availability.js';

const base = { lifecycle: 'active' as const, archived: false, rented: false };

describe('archivage d’office', () => {
  it('range louée et retirée, jamais le doute', () => {
    expect(archiveReasonOf({ ...base, rented: true })).toBe('rented');
    expect(archiveReasonOf({ ...base, lifecycle: 'inactive' })).toBe('offline');
    expect(archiveReasonOf({ ...base, lifecycle: 'possiblyInactive' })).toBeNull();
    expect(isUnavailable({ ...base, lifecycle: 'possiblyInactive' })).toBe(false);
  });

  it('distingue le geste du lecteur de la décision de la source', () => {
    expect(isArchivedBySource({ ...base, archived: true })).toBe(false);
    expect(isArchivedBySource({ ...base, applicationStatus: 'full' })).toBe(true);
    // Désarchivée à l'instant : l'écran le montre avant le rechargement.
    expect(archiveReasonOf({ ...base, archived: false })).toBeNull();
  });
});
