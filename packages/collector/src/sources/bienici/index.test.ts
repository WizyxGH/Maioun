/**
 * Le passage Bien'ici face aux pages INCHANGÉES (304).
 *
 * Mesuré le 2026-09-10 : 191 de ses 340 requêtes en deux jours sont revenues
 * en 304. Le scraper les sautait sans rien compter — un passage entièrement
 * inchangé rendait « 0 annonce » pour 510 en ligne, et un passage à moitié
 * inchangé comptait l'autre moitié comme absente. Aucun accès réseau (§59).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { bieniciScraper } from './index.js';
import { buildSearchUrl, NICE_ZONE_ID, PAGE_SIZE } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const PLEINE = readFileSync(
  resolve(here, '../../../../../tests/fixtures/bienici/search.json'),
  'utf8',
);

/** Des références fictives, autant qu'une page pleine en porte. */
const refs = (prefixe: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefixe}-${i}`);

/**
 * Un contexte où chaque page répond comme on le lui dit : `200` avec la
 * fixture, ou `304` sans contenu. `memoire` simule `page_refs`.
 */
function contexte(reponses: readonly ('200' | '304')[], memoire: Map<string, readonly string[]>) {
  const urls: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      const rang = urls.push(url) - 1;
      const code = reponses[rang] ?? '200';
      return Promise.resolve(
        code === '304'
          ? { status: 304, body: '', headers: {}, notModified: true }
          : { status: 200, body: PLEINE, headers: {}, notModified: false },
      );
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: {
      get: (url) => Promise.resolve(memoire.get(url) ?? null),
      set: (url, liste) => {
        memoire.set(url, liste);
        return Promise.resolve();
      },
    },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, urls };
}

describe('pages inchangées', () => {
  it('CONFIRME les annonces d’une page 304 qu’on a déjà vue', async () => {
    const memoire = new Map<string, readonly string[]>();
    // Premier passage : on apprend la page 1 (la fixture n'est pas pleine, donc
    // c'est aussi la dernière).
    const premier = contexte(['200'], memoire);
    const vues = await bieniciScraper.run(premier.ctx);
    expect(vues.listings.length).toBeGreaterThan(0);

    // Second passage : la même page répond 304.
    const second = contexte(['304'], memoire);
    const resultat = await bieniciScraper.run(second.ctx);

    expect(resultat.listings).toHaveLength(0);
    // Mais ses annonces sont bien là, toutes, et le cycle de vie peut les compter.
    expect(resultat.confirmedRefs).toEqual(vues.listings.map((l) => l.sourceRef));
    expect(resultat.stopReason).toBe('completed');
  });

  it('continue de paginer après une page pleine inchangée, et s’arrête à la dernière', async () => {
    // La mémoire de deux pages : une pleine, puis une partielle.
    const memoire = new Map<string, readonly string[]>([
      [buildSearchUrl(NICE_ZONE_ID, 1), refs('p1', PAGE_SIZE)],
      [buildSearchUrl(NICE_ZONE_ID, 2), refs('p2', 40)],
    ]);
    const { ctx, urls } = contexte(['304', '304'], memoire);
    const resultat = await bieniciScraper.run(ctx);

    // Page 1 pleine → on continue ; page 2 partielle → c'était la dernière.
    expect(urls).toHaveLength(2);
    expect(resultat.confirmedRefs).toHaveLength(PAGE_SIZE + 40);
    expect(resultat.stopReason).toBe('completed');
  });

  it('ne RETIRE rien quand une page inchangée est inconnue', async () => {
    // Aucune mémoire : on ne sait pas ce que la page porte. Le passage le dit,
    // et le cycle de vie saute plutôt que de compter des absences inventées.
    const { ctx } = contexte(['304'], new Map());
    const resultat = await bieniciScraper.run(ctx);
    expect(resultat.stopReason).toBe('notModified');
    expect(resultat.confirmedRefs).toEqual([]);
  });
});
