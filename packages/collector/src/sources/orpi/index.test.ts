/**
 * Le passage Orpi : un passage courant ne lit que deux pages, et ne doit donc
 * rien retirer de ce qu'il n'a pas vu. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { orpiScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/orpi');
const PAGE = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
// Troisième page : plus de lien « suivant », c'est la fin de la liste.
const DERNIERE = PAGE.replace(/rel="next"/g, '');

function contexte(options: { lastFullPassAt?: string | null; mode?: 'live' | 'backfill' }) {
  const vues: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: options.mode ?? 'live',
    fetch: (url) => {
      vues.push(url);
      const body = url.includes('/annonce-location-')
        ? '<html></html>'
        : url.includes('page=3')
          ? DERNIERE
          : PAGE;
      return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
    },
    // Tout est connu : aucune fiche à visiter, seul le parcours compte.
    isKnown: () => true,
    knownRefs: new Set(),
    lastFullPassAt: options.lastFullPassAt ?? null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues };
}

const listes = (vues: readonly string[]): number =>
  vues.filter((url) => url.includes('location-immobiliere')).length;

describe('orpiScraper — cycle de vie', () => {
  it('passage courant : deux pages au plus, et rien ne se retire', async () => {
    const recent = new Date(Date.now() - 3_600_000).toISOString();
    const { ctx, vues } = contexte({ lastFullPassAt: recent });
    const result = await orpiScraper.run(ctx);
    expect(listes(vues)).toBeLessThanOrEqual(2);
    expect(result.stopReason).toBe('incomplete');
    expect(result.fullPass).toBe(false);
  });

  it('passage complet dû : lit jusqu’à la dernière page, malgré le déjà-vu', async () => {
    const { ctx, vues } = contexte({ lastFullPassAt: null });
    const result = await orpiScraper.run(ctx);
    expect(listes(vues)).toBe(3);
    expect(result.stopReason).toBe('completed');
    expect(result.fullPass).toBe(true);
  });
});
