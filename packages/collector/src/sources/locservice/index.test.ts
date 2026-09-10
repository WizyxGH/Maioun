/**
 * Le passage LocService : ce qu'il relit, quand il va jusqu'au bout, et ce que
 * lui apprennent les fiches.
 *
 * Relevé le 2026-09-10 : 38 % du volume du projet, une description de 60 à
 * 110 caractères, aucun DPE — et un cycle de vie qui ne tournait jamais, faute
 * de relire l'inventaire en entier. Aucun accès réseau (§59).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { locserviceScraper } from './index.js';
import { parseDetail } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/locservice/${name}`, import.meta.url)),
    'utf8',
  );
const LISTE = fixture('commune.html');
const FICHE = fixture('fiche.html');
const VIDE = '<html><body><ul></ul></body></html>';

interface Options {
  /** Pages de liste renvoyées dans l'ordre ; au-delà, une page vide. */
  readonly pages?: readonly ('liste' | '304')[];
  readonly known?: readonly string[];
  readonly lastFullPassAt?: string | null;
  readonly mode?: 'live' | 'backfill';
  readonly memoire?: Map<string, readonly string[]>;
}

function contexte(options: Options = {}) {
  const pages = options.pages ?? ['liste'];
  const memoire = options.memoire ?? new Map<string, readonly string[]>();
  const vues: string[] = [];
  let rangListe = 0;
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: options.mode ?? 'live',
    fetch: (url) => {
      vues.push(url);
      if (!url.includes('location-nice')) {
        return Promise.resolve({ status: 200, body: FICHE, headers: {}, notModified: false });
      }
      const quoi = pages[rangListe++];
      if (quoi === '304') {
        return Promise.resolve({ status: 304, body: '', headers: {}, notModified: true });
      }
      return Promise.resolve({
        status: 200,
        body: quoi === 'liste' ? LISTE : VIDE,
        headers: {},
        notModified: false,
      });
    },
    isKnown: (ref) => (options.known ?? []).includes(ref),
    knownRefs: new Set(options.known ?? []),
    lastFullPassAt: options.lastFullPassAt === undefined ? null : options.lastFullPassAt,
    pageRefs: {
      get: (url) => Promise.resolve(memoire.get(url) ?? null),
      set: (url, refs) => {
        memoire.set(url, refs);
        return Promise.resolve();
      },
    },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues, memoire };
}

const IL_Y_A_UNE_HEURE = (): string => new Date(Date.now() - 3_600_000).toISOString();

describe('la fiche', () => {
  it('apprend ce que la liste ne dit pas', () => {
    const detail = parseDetail(FICHE);
    expect(detail?.description?.startsWith('MONT BORON CAPITAINE SCOTT')).toBe(true);
    expect(detail?.description?.length).toBeGreaterThan(400);
    expect(detail?.availableAtText).toBe('Disponible immédiatement');
    expect(detail?.furnishedText).toBe('Meublé');
    // Toutes les photos du JSON-LD, là où la liste n'en montre qu'une.
    expect(detail?.imageUrls).toHaveLength(10);
    // La lettre du DPE, et la nature réelle du bailleur : cette annonce d'un
    // « portail de particuliers » est d'un professionnel.
    expect(detail?.extra).toEqual({ dpe: 'D', landlord: 'agency' });
  });

  it('rend null sur une page qui n’est pas une fiche (§17)', () => {
    expect(parseDetail(LISTE)).toBeNull();
  });
});

describe('le passage ordinaire', () => {
  it('s’arrête sur du déjà-vu et ne se dit pas complet', async () => {
    const { ctx } = contexte({
      pages: ['liste', 'liste'],
      known: ['700001', '700002', '700003'],
      lastFullPassAt: IL_Y_A_UNE_HEURE(),
    });
    const resultat = await locserviceScraper.run(ctx);
    expect(resultat.stopReason).toBe('knownTerritory');
    expect(resultat.fullPass).toBe(false);
  });

  it('visite la fiche des annonces NOUVELLES seulement', async () => {
    const { ctx, vues } = contexte({ known: ['700001'], lastFullPassAt: IL_Y_A_UNE_HEURE() });
    const resultat = await locserviceScraper.run(ctx);
    const fiches = vues.filter((url) => !url.includes('location-nice'));
    expect(fiches).toHaveLength(2);
    const enrichie = resultat.listings.find((l) => l.sourceRef === '700002');
    expect(enrichie?.extra?.['dpe']).toBe('D');
  });

  it('confirme les annonces d’une première page inchangée', async () => {
    const memoire = new Map([
      ['https://www.locservice.fr/alpes-maritimes-06/location-nice.html', ['A', 'B']],
    ]);
    const { ctx } = contexte({ pages: ['304'], memoire, lastFullPassAt: IL_Y_A_UNE_HEURE() });
    const resultat = await locserviceScraper.run(ctx);
    expect(resultat.confirmedRefs).toEqual(['A', 'B']);
  });
});

describe('le passage complet', () => {
  it('va jusqu’au bout quand le dernier date de plus de six heures', async () => {
    // Tout est connu : un passage ordinaire s'arrêterait dès la première page.
    const { ctx } = contexte({
      pages: ['liste', 'liste'],
      known: ['700001', '700002', '700003'],
      lastFullPassAt: new Date(Date.now() - 7 * 3_600_000).toISOString(),
    });
    const resultat = await locserviceScraper.run(ctx);
    expect(resultat.stopReason).toBe('completed');
    expect(resultat.fullPass).toBe(true);
  });

  it('est dû quand il n’y en a jamais eu', async () => {
    const { ctx } = contexte({ pages: ['liste'], lastFullPassAt: null });
    expect((await locserviceScraper.run(ctx)).fullPass).toBe(true);
  });

  it('ne se dit PAS complet quand une page inchangée est inconnue', async () => {
    // Sans mémoire, on ignore ce que la page porte : le cycle de vie ne doit pas
    // trancher sur un inventaire à trou.
    const { ctx } = contexte({ pages: ['304', 'liste'], lastFullPassAt: null });
    expect((await locserviceScraper.run(ctx)).fullPass).toBe(false);
  });
});
