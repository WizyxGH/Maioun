/**
 * ParuVendu, sur trois cartes PRÉLEVÉES le 2026-09-11 et recopiées telles
 * quelles : un particulier, une annonce relayée de LocService, une annonce
 * d'agence. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { paruvenduScraper } from './index.js';
import { pageUrlFor, parseSearchPage } from './parser.js';

const PAGE = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/paruvendu/nice.html', import.meta.url)),
  'utf8',
);
const URL_PAGE = pageUrlFor(1);

describe('parseSearchPage', () => {
  const { listings, hasNextPage } = parseSearchPage(PAGE, URL_PAGE);
  const particulier = listings.find((l) => l.sourceRef === '1295002360');

  it('lit les trois cartes, et voit qu’il y a une page suivante', () => {
    expect(listings).toHaveLength(3);
    expect(hasNextPage).toBe(true);
  });

  it('reconnaît le PARTICULIER, la denrée rare de l’inventaire', () => {
    expect(particulier?.extra?.['landlord']).toBe('private');
    expect(particulier?.agencyName).toBeUndefined();
  });

  it('nomme l’agence d’une annonce professionnelle, par le logo', () => {
    const relayee = listings.find((l) => l.sourceRef === '1295223805');
    expect(relayee?.agencyName).toBe('LOCService');
    expect(relayee?.extra?.['landlord']).toBe('agency');
  });

  it('prend TOUTES les photos, la première comprise, jamais le logo', () => {
    // La première est posée par un script, l'`<img>` ne portant qu'un pixel
    // transparent en attendant.
    expect(particulier?.imageUrls?.length).toBeGreaterThan(1);
    for (const photo of particulier?.imageUrls ?? []) {
      expect(photo).toMatch(/^https:\/\/img\.paruvendu\.fr\/media_ext\//);
      expect(photo).not.toContain('media-logo');
    }
  });

  it('se normalise en une annonce complète', () => {
    if (particulier === undefined) throw new Error('carte du particulier introuvable');
    const annonce = normalizeListing(particulier, {
      sourceId: 'paruvendu',
      nowMs: Date.parse('2026-09-11T10:00:00Z'),
    });
    expect(annonce?.price).toBe(420);
    expect(annonce?.chargesIncluded).toBe(true);
    expect(annonce?.area).toBe(20);
    expect(annonce?.rooms).toBe(1);
    expect(annonce?.dpe).toBe('B');
    expect(annonce?.furnished).toBe(true);
    expect(annonce?.contact.kind).toBe('private');
    // La date affichée est celle de la dernière MISE À JOUR : elle ne passe
    // pas pour une date de parution.
    expect(annonce?.publishedAt).toBeNull();
  });
});

describe('le passage', () => {
  it('relit tout l’inventaire, jusqu’à la dernière page', async () => {
    const vues: string[] = [];
    const ctx: ScrapeContext = {
      criteria: MVP_CRITERIA,
      mode: 'live',
      fetch: (url) => {
        vues.push(url);
        // Deux pages pleines, puis une page sans lien « suivante ».
        const body = vues.length < 3 ? PAGE : PAGE.replace(/\?p=\d/g, '?p=0');
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
      isKnown: () => true,
      knownRefs: new Set(),
      lastFullPassAt: null,
      detailMemory: { get: () => null, save: () => Promise.resolve() },
      pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      log: () => undefined,
      credentials: null,
      shouldStop: () => false,
    };
    const resultat = await paruvenduScraper.run(ctx);
    // TOUT EST CONNU, et on continue quand même : pas d'arrêt anticipé.
    expect(vues).toHaveLength(3);
    expect(resultat.stopReason).toBe('completed');
  });
});
