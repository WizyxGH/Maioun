/**
 * Le passage Bien'ici face aux pages INCHANGÉES (304).
 *
 * Mesuré le 2026-09-10 : 191 de ses 340 requêtes en deux jours sont revenues
 * en 304. Le scraper les sautait sans rien compter — un passage entièrement
 * inchangé rendait « 0 annonce » pour 510 en ligne, et un passage à moitié
 * inchangé comptait l'autre moitié comme absente. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { BIENICI_DESCRIPTOR, bieniciScraper, fichesParPassage } from './index.js';
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

describe('fiches JSON', () => {
  const DETAIL = readFileSync(
    resolve(here, '../../../../../tests/fixtures/bienici/detail-twimmo-2125653.json'),
    'utf8',
  );

  it('complète les annonces par leur fiche, après la pagination', async () => {
    const urls: string[] = [];
    const saved: string[] = [];
    const { ctx } = contexte([], new Map());
    const resultat = await bieniciScraper.run({
      ...ctx,
      fetch: (url) => {
        urls.push(url);
        const body = url.includes('/realEstateAd.json') ? DETAIL : PLEINE;
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
      detailMemory: {
        get: () => null,
        save: (entries) => {
          saved.push(...entries.map((one) => one.sourceRef));
          return Promise.resolve();
        },
      },
    });

    expect(urls[0]).toContain('/realEstateAds.json');
    expect(urls.slice(1).every((url) => url.includes('/realEstateAd.json?id='))).toBe(true);
    expect(urls).toHaveLength(1 + resultat.listings.length);
    expect(resultat.requestCount).toBe(urls.length);
    expect(saved).toHaveLength(resultat.listings.length);
    expect(resultat.listings[0]).toMatchObject({ phoneText: '+33600000012' });
  });

  const RETIREE = readFileSync(
    resolve(here, '../../../../../tests/fixtures/bienici/detail-retiree.json'),
    'utf8',
  );

  /**
   * Une annonce que la liste portait au passage précédent et ne porte plus :
   * le portail dit si elle est retirée, et la collecte l'éteint sans attendre
   * le seuil d'absences.
   */
  async function passageAvecPartante(ficheDeLaPartante: string) {
    const page = buildSearchUrl(NICE_ZONE_ID, 1);
    const dejaVues = JSON.parse(PLEINE).realEstateAds.map((ad: { id: string }) => ad.id);
    const memoire = new Map<string, readonly string[]>([[page, [...dejaVues, 'partie-1']]]);
    const urls: string[] = [];
    const { ctx } = contexte([], memoire);
    const resultat = await bieniciScraper.run({
      ...ctx,
      fetch: (url) => {
        urls.push(url);
        const body = url.includes('id=partie-1')
          ? ficheDeLaPartante
          : url.includes('/realEstateAd.json')
            ? DETAIL
            : PLEINE;
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
    });
    return { resultat, urls };
  }

  it('signale RETIRÉE l’annonce que le portail dit hors marché', async () => {
    const { resultat, urls } = await passageAvecPartante(RETIREE);
    expect(urls.some((url) => url.includes('id=partie-1'))).toBe(true);
    expect(resultat.withdrawnRefs).toEqual(['partie-1']);
  });

  it('ne retire pas une annonce que sa fiche montre toujours en ligne', async () => {
    // Même disparition de la liste, mais la fiche ne dit rien de tel : seul le
    // cycle de vie ordinaire s'appliquera.
    const { resultat } = await passageAvecPartante(DETAIL);
    expect(resultat.withdrawnRefs).toEqual([]);
  });

  it('réapplique la mémoire des fiches sans requête', async () => {
    const urls: string[] = [];
    const { ctx } = contexte([], new Map());
    const resultat = await bieniciScraper.run({
      ...ctx,
      isKnown: () => true,
      fetch: (url) => {
        urls.push(url);
        return Promise.resolve({ status: 200, body: PLEINE, headers: {}, notModified: false });
      },
      detailMemory: {
        get: () => ({
          draft: { agencyName: 'ELITIMO', phoneText: '+33600000012' },
          fetchedAt: new Date().toISOString(),
        }),
        save: () => Promise.resolve(),
      },
    });

    expect(urls).toHaveLength(1);
    expect(resultat.listings.every((one) => one.agencyName === 'ELITIMO')).toBe(true);
  });
});

/**
 * LE RATTRAPAGE LIT TOUT LE STOCK, un passage ordinaire un paquet.
 *
 * Trente fiches par passage et une fiche qui se périme au bout d'une semaine :
 * le rattrapage courait après lui-même. Relevé du 2026-09-25, trente fiches
 * lues sur 571 annonces actives — donc ni téléphone ni nom d'agence pour les
 * 541 autres, que la fiche donne pourtant.
 */
describe('rattrapage', () => {
  /** La page de recherche, gonflée à `combien` annonces aux références distinctes. */
  function pageDe(combien: number): string {
    const base = JSON.parse(PLEINE) as { realEstateAds: { id: string }[] };
    const modele = base.realEstateAds;
    base.realEstateAds = Array.from({ length: combien }, (_, rang) => ({
      ...(modele[rang % modele.length] as { id: string }),
      id: `annonce-${rang}`,
    }));
    return JSON.stringify(base);
  }

  async function fichesLues(mode: 'live' | 'backfill', annonces: number): Promise<number> {
    const page = pageDe(annonces);
    const urls: string[] = [];
    const { ctx } = contexte([], new Map());
    await bieniciScraper.run({
      ...ctx,
      mode,
      fetch: (url) => {
        urls.push(url);
        const body = url.includes('/realEstateAd.json') ? '{}' : page;
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
    });
    return urls.filter((url) => url.includes('/realEstateAd.json?id=')).length;
  }

  it('s’arrête à trente fiches en passage ordinaire', async () => {
    expect(await fichesLues('live', 60)).toBe(30);
  });

  it('les lit toutes en rattrapage', async () => {
    expect(await fichesLues('backfill', 60)).toBe(60);
  });

  // LE PIÈGE N'EST PAS LE NOMBRE, C'EST LE BUDGET : relever le plafond des
  // fiches sans relever celui des pages fait couper `shouldStop()` au milieu,
  // et le rattrapage rend la main sans avoir rien rattrapé de plus.
  it('laisse le budget de pages couvrir un rattrapage entier', () => {
    expect(BIENICI_DESCRIPTOR.budget.maxPagesPerRun).toBeGreaterThan(fichesParPassage('backfill'));
  });
});
