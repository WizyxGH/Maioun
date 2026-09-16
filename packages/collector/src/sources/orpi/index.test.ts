/**
 * Le passage Orpi : il couvre les treize communes du périmètre, ne conclut à
 * un inventaire complet que si le site le confirme par son propre total, et ne
 * prend jamais pour niçois ce que le repli départemental lui sert.
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';
import { orpiScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/orpi');
const NICE = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const REPLI = readFileSync(join(FIXTURES, 'repli-departement.html'), 'utf8');
const RETIREE = readFileSync(join(FIXTURES, 'fiche-retiree.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'fiche-estate.html'), 'utf8');

/**
 * La page de Nice telle que le site la sert VRAIMENT quand tout son inventaire
 * tient sur une page : les cinq cartes annoncées, et plus de lien « suivant ».
 */
const NICE_COMPLETE = NICE.replace(/rel="next"/g, '');

interface Options {
  readonly mode?: 'live' | 'backfill';
  /** Corps servi par commune ; défaut : la page de repli départemental. */
  readonly pages?: Record<string, string>;
  /** Références dont la fiche répond « bien loué » ; les autres sont normales. */
  readonly retirees?: readonly string[];
  readonly knownRefs?: readonly string[];
}

function contexte(options: Options = {}): { ctx: ScrapeContext; vues: string[] } {
  const vues: string[] = [];
  const known = new Set(options.knownRefs ?? []);
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: options.mode ?? 'live',
    fetch: (url): Promise<FetchResult> => {
      vues.push(url);
      const reponse = (body: string, status = 200): Promise<FetchResult> =>
        Promise.resolve({ status, body, headers: {}, notModified: false });
      if (url.includes('/annonce-location-')) {
        const partie = options.retirees?.some((ref) => url.includes(ref)) === true;
        return reponse(partie ? RETIREE : FICHE);
      }
      const slug = /location-immobiliere-([a-z0-9-]+)\//.exec(url)?.[1] ?? '';
      return reponse(options.pages?.[slug] ?? REPLI);
    },
    isKnown: (ref) => known.has(ref),
    knownRefs: known,
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues };
}

const listes = (vues: readonly string[]): string[] =>
  vues.filter((url) => url.includes('location-immobiliere'));

describe('orpiScraper — couverture du périmètre', () => {
  it('interroge les treize communes suivies, pas la seule ville de Nice', async () => {
    const { ctx, vues } = contexte({ pages: { nice: NICE_COMPLETE } });
    await orpiScraper.run(ctx);
    for (const slug of NICE_AREA_SLUGS) {
      expect(listes(vues)).toContain(`https://www.orpi.com/location-immobiliere-${slug}/`);
    }
  });

  it('ne prend pas pour local ce que le repli départemental lui sert', async () => {
    // Douze communes sur treize répondent ici le repli, qui porte une annonce
    // cannoise. Sans la vérification du canonique, elle entrait en base au nom
    // de chacune d'elles.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.listings.map((l) => l.sourceRef)).not.toContain('x-000080-880');
  });

  it('ne demande pas de page au-delà du total annoncé', async () => {
    // Cinq cartes annoncées, cinq lues : la page suivante ne porterait que le
    // repli départemental.
    const { ctx, vues } = contexte({ pages: { nice: NICE } });
    await orpiScraper.run(ctx);
    expect(listes(vues).filter((url) => url.includes('?page='))).toHaveLength(0);
  });
});

describe('orpiScraper — un inventaire complet, ou dit incomplet', () => {
  it('conclut « complet » quand le total annoncé est atteint', async () => {
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('completed');
    expect(result.fullPass).toBe(true);
  });

  it('se dit incomplet quand le site ne publie plus son total', async () => {
    // Sans total, l'exhaustivité redevient une hypothèse — celle-là même qui
    // laissait un tiers du stock invisible sans que rien ne le signale.
    const sansTotal = NICE_COMPLETE.replace(/&quot;nbResults&quot;:\d+/g, '&quot;x&quot;:0');
    const { ctx } = contexte({ pages: { nice: sansTotal } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
    expect(result.fullPass).toBe(false);
  });

  it('se dit incomplet quand il manque des annonces au total annoncé', async () => {
    // Le site en annonce cinq et la liste n'en porte plus qu'une : ce n'est pas
    // un inventaire, c'est un trou.
    const ampute = NICE_COMPLETE.replace(/<!-- Carte [2345][\s\S]*?<\/article>\n/g, '');
    const { ctx } = contexte({ pages: { nice: ampute } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
  });

  it('reste complet malgré les communes qu’Orpi ne connaît pas', async () => {
    // Cap-d'Ail, Drap et Contes n'ont pas de page chez Orpi : leur silence
    // n'est pas un trou, sans quoi la source serait incomplète à jamais — et
    // n'éteindrait plus jamais une annonce.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('completed');
  });

  it('refuse de conclure quand le périmètre entier devient muet', async () => {
    // Aucune commune ne répond, mais des annonces sont connues : c'est le
    // gabarit ou les adresses qui ont changé, pas le marché qui s'est vidé.
    const { ctx } = contexte({ knownRefs: ['x-000001-101'] });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
  });
});

describe('orpiScraper — ce que la fiche apprend', () => {
  it('éteint sur-le-champ l’annonce qu’Orpi dit louée en 200', async () => {
    // Orpi répond 410 sur la plupart de ses fiches parties — ce cas-là est
    // couvert par `shared/withdrawn.ts` — mais pas sur toutes : celle-ci rend
    // 200 et l'accueil du site, et seul son canonique la dénonce.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE }, retirees: ['x-000001-101'] });
    const result = await orpiScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual(['x-000001-101']);
    // Une annonce retirée n'est pas rendue AUSSI comme en ligne.
    const eteintes = new Set(result.withdrawnRefs ?? []);
    for (const listing of result.listings) expect(eteintes.has(listing.sourceRef)).toBe(false);
  });

  it('n’éteint rien quand TOUTES les fiches se disent louées', async () => {
    // Une salve pareille dénonce un gabarit d'URL changé, pas quatre biens
    // loués dans la minute : le garde-fou de `shared/withdrawn.ts` s'applique.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      retirees: [
        'x-000001-101',
        '00000000-0000-4000-8000-000000000202',
        'x-000003-303',
        'x-000004-404',
      ],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual([]);
  });

  it('recolle « charges comprises » sur le loyer frais de la carte', async () => {
    // La fiche le démontre (950 = 894 + 56) mais son loyer, mémorisé une
    // semaine, figerait le chiffre de la liste : on garde le montant de la
    // carte et on lui ajoute la mention.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    const studio = result.listings.find((l) => l.sourceRef === 'x-000001-101');
    expect(studio?.priceText).toBe('690 € par mois charges comprises');
  });
});
