/**
 * Le passage AFEDIM : l'inventaire en une requête, la fiche de chaque bien
 * ciblé, et ce qui reste d'une fiche injoignable. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RawListing, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { afedimScraper } from './index.js';
import { LIST_URL } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/afedim/${name}`, import.meta.url)),
    'utf8',
  );
const LISTE = fixture('liste-06.html');
const SUSPENDUE = fixture('fiche-nice-candidatures-suspendues.html');

type Reponse = string | '304' | Error;

interface Options {
  readonly liste?: Reponse;
  /** Réponse par référence ; par défaut, une page sans données. */
  readonly fiches?: Readonly<Record<string, Reponse>>;
  readonly memoire?: ReadonlyMap<string, Partial<RawListing>>;
  readonly pageRefs?: readonly string[] | null;
}

function contexte(options: Options = {}) {
  const vues: string[] = [];
  const enregistrees: string[] = [];
  const repondre = (reponse: Reponse) => {
    if (reponse instanceof Error) return Promise.reject(reponse);
    if (reponse === '304') {
      return Promise.resolve({ status: 304, body: '', headers: {}, notModified: true });
    }
    return Promise.resolve({ status: 200, body: reponse, headers: {}, notModified: false });
  };
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      vues.push(url);
      if (url === LIST_URL) return repondre(options.liste ?? LISTE);
      const ref = /\/(\d+)\/Fiche$/.exec(url)?.[1] ?? '';
      return repondre(options.fiches?.[ref] ?? '<html><body>Bien non trouvé</body></html>');
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: {
      get: (ref) => {
        const draft = options.memoire?.get(ref);
        return draft === undefined ? null : { draft, fetchedAt: '2026-09-01T00:00:00Z' };
      },
      save: (entries) => {
        enregistrees.push(...entries.map((entry) => entry.sourceRef));
        return Promise.resolve();
      },
    },
    pageRefs: {
      get: () => Promise.resolve(options.pageRefs ?? null),
      set: () => Promise.resolve(),
    },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues, enregistrees };
}

describe('le passage', () => {
  it('ne garde que les communes cibles et lit chacune de leurs fiches', async () => {
    const { ctx, vues, enregistrees } = contexte({ fiches: { '0028370': SUSPENDUE } });
    const resultat = await afedimScraper.run(ctx);

    // Nice ×2 et La Trinité ; ni Le Cannet ni Mouans-Sartoux.
    expect(resultat.listings.map((l) => l.sourceRef).sort()).toEqual([
      '0028370',
      '0029193',
      '0061649',
    ]);
    expect(vues).toHaveLength(4);
    expect(resultat.requestCount).toBe(4);
    expect(resultat.stopReason).toBe('completed');

    const enrichie = resultat.listings.find((l) => l.sourceRef === '0028370');
    expect(enrichie?.priceText).toBe('824 € CC');
    expect(enrichie?.addressText).toBe('439 AVENUE DE PESSICART');
    // `extra` fusionné : la référence de la liste reste, la fiche ajoute.
    expect(enrichie?.extra).toMatchObject({ reference: '0028370', applicationStatus: 'full' });
    expect(enrichie?.extra?.['depotGarantie']).toBe('704 €');
    expect(enrichie?.imageUrls).toHaveLength(3);
    expect(enrichie?.title).toBe('SUNSET VILLA - Appartement - 2 pièces');

    expect(enregistrees).toEqual(['0028370']);
    expect(resultat.warnings.filter((w) => w.includes('sans données'))).toHaveLength(2);
  });

  it('une fiche injoignable garde la mémoire, pas l’état de candidature', async () => {
    const memoire = new Map<string, Partial<RawListing>>([
      [
        '0028370',
        { addressText: '439 AVENUE DE PESSICART', extra: { applicationStatus: 'open', dpe: 'B' } },
      ],
    ]);
    const { ctx } = contexte({ fiches: { '0028370': new Error('HTTP 503') }, memoire });
    const resultat = await afedimScraper.run(ctx);
    const annonce = resultat.listings.find((l) => l.sourceRef === '0028370');
    expect(annonce?.addressText).toBe('439 AVENUE DE PESSICART');
    expect(annonce?.extra?.['applicationStatus']).toBeUndefined();
    expect(annonce?.extra?.['reference']).toBe('0028370');
    expect(resultat.stopReason).toBe('completed');
  });

  it('s’arrête au premier 429 sur les fiches', async () => {
    const { ctx, vues } = contexte({
      // La Trinité vient la première dans la liste.
      fiches: { '0061649': new Error('HTTP 429 sur la fiche'), '0028370': SUSPENDUE },
    });
    const resultat = await afedimScraper.run(ctx);
    expect(vues).toHaveLength(2);
    expect(resultat.listings).toHaveLength(3);
  });

  it('ne se dit pas complet quand la liste a changé de forme', async () => {
    const { ctx } = contexte({ liste: '<html><body>Nouvelle maquette</body></html>' });
    const resultat = await afedimScraper.run(ctx);
    expect(resultat.listings).toEqual([]);
    expect(resultat.stopReason).toBe('tooManyErrors');
  });

  it('confirme le stock d’une liste inchangée', async () => {
    const { ctx } = contexte({ liste: '304', pageRefs: ['0028370', '0029193'] });
    const resultat = await afedimScraper.run(ctx);
    expect(resultat.confirmedRefs).toEqual(['0028370', '0029193']);
    expect(resultat.stopReason).toBe('completed');
  });

  it('un 429 sur la liste arrête tout', async () => {
    const { ctx, vues } = contexte({ liste: new Error('HTTP 429') });
    const resultat = await afedimScraper.run(ctx);
    expect(vues).toHaveLength(1);
    expect(resultat.stopReason).toBe('rateLimited');
  });
});
