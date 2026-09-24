/**
 * Le 24 septembre 2026, la collecte a rendu « LibsqlError: BLOCKED » et quatre
 * lignes de pile, toutes les quinze minutes pendant des heures. La cause — un
 * quota de lectures épuisé — n'apparaissait nulle part, et une intégration
 * continue rouge en permanence ne prévient plus de rien.
 */

import { describe, expect, it } from 'vitest';
import { readsBlocked } from './quota.js';

describe('readsBlocked', () => {
  it('reconnaît le refus que Turso rend vraiment', () => {
    const vrai = new Error(
      'BLOCKED: Operation was blocked: SQL read operations are forbidden ' +
        '(reads are blocked, do you need to upgrade your plan?)',
    );
    expect(readsBlocked(vrai)).toContain('quota mensuel');
  });

  it('dit que rien n’a été collecté, et qu’aucune source n’a été sollicitée', () => {
    // L'arrêt a lieu dans les migrations, deux secondes après le départ : c'est
    // la première question qu'on se pose devant un passage rouge.
    const message = readsBlocked(new Error('reads are blocked')) ?? '';
    expect(message).toContain('aucune source');
  });

  it('ne s’empare pas d’une erreur ordinaire', () => {
    expect(readsBlocked(new Error('SQLITE_BUSY: database is locked'))).toBeNull();
    expect(readsBlocked(new Error('fetch failed'))).toBeNull();
    expect(readsBlocked('quelque chose')).toBeNull();
  });
});
