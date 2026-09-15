/**
 * Le passage Laforêt : la fiche lue, son étiquette DPE est demandée une fois et
 * rejoint la mémoire des fiches. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DetailMemoryEntry, RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { laforetScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/laforet');
const CARTE = readFileSync(join(FIXTURES, 'carte-photos.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'fiche.html'), 'utf8');
const ETIQUETTE = readFileSync(join(FIXTURES, 'etiquette-dpe.svg'), 'utf8');

function contexte(memory: Map<string, DetailMemoryEntry>) {
  const vues: string[] = [];
  const saved: { sourceRef: string; draft: Partial<RawListing> }[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      vues.push(url);
      const body = url.endsWith('/dpe')
        ? ETIQUETTE
        : url.includes('/louer/')
          ? FICHE
          : url.endsWith('06000')
            ? CARTE
            : '<html></html>';
      return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: {
      get: (ref) => memory.get(ref) ?? null,
      save: (entries) => {
        saved.push(...entries);
        return Promise.resolve();
      },
    },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues, saved };
}

describe('laforetScraper — étiquette DPE', () => {
  it('demande l’étiquette après la fiche et la garde en mémoire', async () => {
    const { ctx, vues, saved } = contexte(new Map());
    const result = await laforetScraper.run(ctx);
    const listing = result.listings.find((l) => l.sourceRef === '19168366');
    expect(listing?.extra?.['dpe']).toBe('E');
    expect(vues.filter((url) => url.endsWith('/19168366/dpe'))).toHaveLength(1);
    const last = saved.filter((entry) => entry.sourceRef === '19168366').at(-1);
    expect(last?.draft.extra?.['dpe']).toBe('E');
    expect(last?.draft.description).toBeDefined();
  });

  it('ne la redemande pas quand la mémoire la porte déjà', async () => {
    const memory = new Map<string, DetailMemoryEntry>([
      [
        '19168366',
        {
          draft: { description: 'Texte', extra: { dpe: 'C' } },
          fetchedAt: new Date().toISOString(),
        },
      ],
    ]);
    const { ctx, vues } = contexte(memory);
    const result = await laforetScraper.run(ctx);
    expect(vues.some((url) => url.endsWith('/dpe'))).toBe(false);
    expect(result.listings.find((l) => l.sourceRef === '19168366')?.extra?.['dpe']).toBe('C');
  });
});
