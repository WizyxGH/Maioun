/**
 * Le passage Rentumo face à une annonce désactivée : la fiche redirige vers la
 * recherche, et la carte encore listée ne doit pas la ramener. Aucun réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DetailMemoryEntry, FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { rentumoScraper } from './index.js';
import { WITHDRAWN_DRAFT } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/rentumo/${name}`, import.meta.url)),
    'utf8',
  );
const LISTE = fixture('liste.html');
const FICHE = fixture('fiche.html');

const page = (status: number, body = '', headers: Record<string, string> = {}): FetchResult => ({
  status,
  body,
  headers,
  notModified: false,
});

function contexte(options: {
  readonly known: readonly string[];
  readonly memoire?: ReadonlyMap<string, DetailMemoryEntry>;
  readonly fiches: Readonly<Record<string, FetchResult>>;
}) {
  const vues: { url: string; redirect: string | undefined }[] = [];
  const enregistrees = new Map<string, unknown>();
  const known = new Set(options.known);
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url, init) => {
      vues.push({ url, redirect: init?.redirect });
      if (url.includes('/rent-apartment/')) return Promise.resolve(page(200, LISTE));
      const ref = /(\d+)$/.exec(url)?.[1] ?? '';
      return Promise.resolve(options.fiches[ref] ?? page(200, FICHE));
    },
    isKnown: (ref) => known.has(ref),
    knownRefs: known,
    lastFullPassAt: null,
    detailMemory: {
      get: (ref) => options.memoire?.get(ref) ?? null,
      save: (entries) => {
        for (const entry of entries) enregistrees.set(entry.sourceRef, entry.draft);
        return Promise.resolve();
      },
    },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues, enregistrees };
}

const recent = (draft: DetailMemoryEntry['draft']): DetailMemoryEntry => ({
  draft,
  fetchedAt: new Date().toISOString(),
});

describe('annonce désactivée (Rentumo)', () => {
  it('ne ramène pas une carte encore listée dont la fiche est retirée', async () => {
    const { ctx } = contexte({
      known: ['6536139', '13559275', '19160932'],
      memoire: new Map([
        ['6536139', recent(WITHDRAWN_DRAFT)],
        ['13559275', recent({})],
        ['19160932', recent({})],
      ]),
      fiches: {},
    });
    const result = await rentumoScraper.run(ctx);
    expect(result.listings.map((l) => l.sourceRef)).toEqual(['13559275', '19160932']);
    expect(result.withdrawnRefs).toEqual(['6536139']);
  });

  it('retire une nouvelle annonce dont la fiche redirige vers la recherche', async () => {
    const { ctx, vues } = contexte({
      known: [],
      fiches: { '6536139': page(302, '', { location: 'https://rentumo.com/rentals/nice' }) },
    });
    const result = await rentumoScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual(['6536139']);
    expect(result.listings.map((l) => l.sourceRef)).toEqual(['13559275', '19160932']);
    // La redirection n'est pas suivie : c'est elle, le signe.
    expect(
      vues.filter((v) => v.url.includes('/listings/')).every((v) => v.redirect === 'manual'),
    ).toBe(true);
  });

  it('vérifie les connues absentes de la liste, et ne conclut que sur un retrait', async () => {
    const { ctx, vues, enregistrees } = contexte({
      known: ['6536139', '13559275', '19160932', '900001', '900002'],
      memoire: new Map([
        ['6536139', recent({})],
        ['13559275', recent({})],
        ['19160932', recent({})],
      ]),
      fiches: {
        '900001': page(302, '', { location: 'https://rentumo.com/rentals/nice' }),
        '900002': page(200, FICHE),
      },
    });
    const result = await rentumoScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual(['900001']);
    expect(vues.map((v) => v.url)).toContain('https://rentumo.com/listings/900002');
    expect(enregistrees.get('900001')).toEqual(WITHDRAWN_DRAFT);
    expect(enregistrees.get('900002')).not.toEqual(WITHDRAWN_DRAFT);
  });

  it('ne revérifie pas dans la journée, ni une annonce déjà retirée', async () => {
    const { ctx, vues } = contexte({
      known: ['6536139', '13559275', '19160932', '900001', '900002'],
      memoire: new Map([
        ['6536139', recent({})],
        ['13559275', recent({})],
        ['19160932', recent({})],
        ['900001', { draft: WITHDRAWN_DRAFT, fetchedAt: '2026-01-01T00:00:00Z' }],
        ['900002', recent({})],
      ]),
      fiches: {},
    });
    await rentumoScraper.run(ctx);
    expect(vues.filter((v) => v.url.includes('/listings/'))).toEqual([]);
  });
});

describe('pagination (Rentumo)', () => {
  /**
   * La liste n'est pas classée par fraîcheur : s'arrêter sur une page déjà
   * connue gelait l'inventaire. Quatre-vingt-trois annonces sur cent
   * vingt-cinq n'étaient plus revues, et les fiches déjà téléchargées pour
   * elles ne servaient à rien.
   */
  it('lit toutes les pages, même quand la première est entièrement connue', async () => {
    const { ctx, vues } = contexte({
      known: ['6536139', '13559275', '19160932'],
      memoire: new Map([
        ['6536139', recent({})],
        ['13559275', recent({})],
        ['19160932', recent({})],
      ]),
      fiches: {},
    });
    const result = await rentumoScraper.run(ctx);
    const pages = vues.filter((v) => v.url.includes('/rent-apartment/'));
    expect(pages).toHaveLength(4);
    expect(pages.map((v) => v.url)).toEqual([
      'https://rentumo.com/rent-apartment/nice',
      'https://rentumo.com/rent-apartment/nice?page=2',
      'https://rentumo.com/rent-apartment/nice?page=3',
      'https://rentumo.com/rent-apartment/nice?page=4',
    ]);
    expect(result.stopReason).toBe('completed');
  });

  it('réapplique sans requête la fiche mémorisée d’une annonce déjà connue', async () => {
    // C'est ce que l'arrêt anticipé faisait perdre : soixante-six textes
    // complets, déjà payés, que l'occurrence n'a jamais reçus.
    const { ctx, vues } = contexte({
      known: ['6536139', '13559275', '19160932'],
      memoire: new Map([
        ['6536139', recent({ description: 'Texte entier de l’annonce.', title: 'Studio vide' })],
        ['13559275', recent({})],
        ['19160932', recent({})],
      ]),
      fiches: {},
    });
    const result = await rentumoScraper.run(ctx);
    const reprise = result.listings.find((l) => l.sourceRef === '6536139');
    expect(reprise?.description).toBe('Texte entier de l’annonce.');
    expect(reprise?.title).toBe('Studio vide');
    expect(vues.filter((v) => v.url.includes('/listings/'))).toEqual([]);
  });
});
