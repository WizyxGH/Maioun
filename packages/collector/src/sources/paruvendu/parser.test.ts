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
import { pageUrlFor, parseDetail, parseSearchPage } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/paruvendu/${name}`, import.meta.url)),
    'utf8',
  );
const PAGE = fixture('nice.html');
const URL_PAGE = pageUrlFor(1);

describe('parseSearchPage', () => {
  const { listings, hasNextPage } = parseSearchPage(PAGE, URL_PAGE);
  const particulier = listings.find((l) => l.sourceRef === '1295002360');

  it('suit la page suivante d’une tranche par pièces', () => {
    const tranche = PAGE.replace('?p=2', '?nbpieces=1&amp;p=2');
    expect(pageUrlFor(2, 1)).toContain('?nbpieces=1&p=2');
    expect(parseSearchPage(tranche, pageUrlFor(1, 1)).hasNextPage).toBe(true);
  });

  it('lit le nombre d’annonces que la recherche annonce', () => {
    const avecCompte = PAGE.replace(
      '</body>',
      '<span class="aff_nbann">165 annonces</span></body>',
    );
    expect(parseSearchPage(avecCompte, URL_PAGE).totalCount).toBe(165);
    expect(parseSearchPage(PAGE, URL_PAGE).totalCount).toBeNull();
  });

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

/**
 * Fiches prélevées le 2026-09-14, réduites au bloc prix et au texte : BEP
 * (charges dans le bloc), Century 21 (charges dans le texte seulement), un
 * particulier (aucune).
 */
describe('parseDetail', () => {
  const normaliser = (fiche: string, priceText: string) => {
    const draft = parseDetail(fixture(fiche), priceText);
    return normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://www.paruvendu.fr/immobilier/location/appartement/1',
        title: 'Appartement - 1 pièce(s) - 18 m²',
        priceText,
        ...Object.fromEntries(Object.entries(draft ?? {}).filter(([, v]) => v !== undefined)),
      },
      { sourceId: 'paruvendu', nowMs: Date.parse('2026-09-14T10:00:00Z') },
    );
  };

  it('lit « Dont charges/mois » : la part des charges dans le loyer CC', () => {
    expect(parseDetail(fixture('fiche-1295274200.html'))?.chargesText).toBe('30 €');
    const annonce = normaliser('fiche-1295274200.html', '690 € CC*');
    expect(annonce?.price).toBe(690);
    expect(annonce?.chargesIncluded).toBe(true);
    expect(annonce?.charges).toBe(30);
  });

  it('sans ligne de charges, les lit dans le texte, point décimal compris', () => {
    const draft = parseDetail(fixture('fiche-1295275678.html'), '890 € CC*');
    // « 50.0 euros » : 50, pas 500.
    expect(draft?.chargesText).toBe('50 €');
    expect(draft?.description).toContain('dont charges mensuelles : 50.0 euros');
    // Le bloc caché de localisation n'est pas du texte d'annonce.
    expect(draft?.description).not.toContain('Lieu : Alpes-Maritimes');
    expect(normaliser('fiche-1295275678.html', '890 € CC*')?.charges).toBe(50);
  });

  it('n’invente pas de charges quand la fiche n’en donne pas', () => {
    const draft = parseDetail(fixture('fiche-1295199212.html'));
    expect(draft?.chargesText).toBeUndefined();
    expect(draft?.description).toBeDefined();
    expect(normaliser('fiche-1295199212.html', '1 550 € CC*')?.charges).toBeNull();
  });

  it('lit dépôt de garantie et honoraires dans le bloc prix', () => {
    const draft = parseDetail(fixture('fiche-1295274200.html'), '690 € CC*');
    expect(draft).toMatchObject({ depositText: '660 €', feesText: '220 €' });
    expect(normaliser('fiche-1295274200.html', '690 € CC*')).toMatchObject({
      deposit: 660,
      tenantFees: 220,
    });
    expect(normaliser('fiche-1295275678.html', '890 € CC*')).toMatchObject({
      deposit: 1680,
      tenantFees: 261,
    });
  });

  it('« NC » ou une fiche muette ne donnent ni dépôt ni honoraires', () => {
    const nc =
      '<div id="autoprix"><div class="opt19_hd_det"><span>Dépôt garantie :</span><strong>NC</strong></div>' +
      '<div class="opt19_hd_det"><span>Honoraires :</span><strong>NC</strong></div></div>' +
      '<div id="txtAnnonceTrunc">Studio lumineux.</div>';
    expect(parseDetail(nc)).toMatchObject({ depositText: undefined, feesText: undefined });
    expect(normaliser('fiche-1295199212.html', '1 550 € CC*')).toMatchObject({
      deposit: null,
      tenantFees: null,
    });
  });

  it('ne reprend pas le loyer : la mémoire des fiches le figerait', () => {
    expect(parseDetail(fixture('fiche-1295274200.html'))?.priceText).toBeUndefined();
  });

  it('rend null sur une page sans bloc prix ni texte', () => {
    expect(parseDetail('<html><body></body></html>')).toBeNull();
  });
});

describe('le passage', () => {
  /** Deux pages pleines, puis une page sans lien « suivante » ; les fiches rendent celle de BEP. */
  const contexte = (connues: boolean, annoncees?: number) => {
    const vues: string[] = [];
    let pages = 0;
    const ctx: ScrapeContext = {
      criteria: MVP_CRITERIA,
      mode: 'live',
      fetch: (url) => {
        vues.push(url);
        let body = fixture('fiche-1295274200.html');
        if (url.includes('/recherche/')) {
          pages += 1;
          body = pages < 3 ? PAGE : PAGE.replace(/\?p=\d/g, '?p=0');
          if (annoncees !== undefined) {
            body = body.replace(
              '</body>',
              `<span class="aff_nbann">${annoncees} annonces</span></body>`,
            );
          }
        }
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
      isKnown: () => connues,
      knownRefs: new Set(),
      lastFullPassAt: null,
      // Connues : fiches déjà lues, et récemment.
      detailMemory: {
        get: () => (connues ? { draft: {}, fetchedAt: new Date().toISOString() } : null),
        save: () => Promise.resolve(),
      },
      pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      log: () => undefined,
      credentials: null,
      shouldStop: () => false,
    };
    return { ctx, vues };
  };

  it('relit tout l’inventaire, jusqu’à la dernière page', async () => {
    const { ctx, vues } = contexte(true);
    const resultat = await paruvenduScraper.run(ctx);
    // TOUT EST CONNU, et on continue quand même : pas d'arrêt anticipé.
    // Trois pages de la recherche entière, puis une par tranche de pièces.
    expect(vues).toHaveLength(7);
    expect(vues.filter((url) => url.includes('nbpieces='))).toHaveLength(4);
    expect(resultat.stopReason).toBe('completed');
  });

  it('ne retire rien quand le site annonce plus d’annonces qu’il n’en laisse lire', async () => {
    const { ctx } = contexte(true, 165);
    const resultat = await paruvenduScraper.run(ctx);
    expect(resultat.stopReason).toBe('incomplete');
  });

  it('retire normalement quand le compte y est', async () => {
    const { ctx } = contexte(true, 3);
    const resultat = await paruvenduScraper.run(ctx);
    expect(resultat.stopReason).toBe('completed');
  });

  it('lit la fiche des annonces nouvelles, et en garde les charges', async () => {
    const { ctx, vues } = contexte(false);
    const resultat = await paruvenduScraper.run(ctx);
    const fiches = new Set(vues.filter((url) => url.includes('/immobilier/location/')));
    expect(fiches.size).toBe(3);
    expect(resultat.listings.every((l) => l.chargesText === '30 €')).toBe(true);
  });
});
