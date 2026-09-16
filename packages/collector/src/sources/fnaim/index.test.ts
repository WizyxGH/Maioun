/**
 * Le passage FNAIM : toutes les recherches du périmètre, l'arrêt sur la
 * dernière page, et ce que devient une recherche que le portail ignore.
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { fnaimScraper } from './index.js';
import { SEARCHES } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/fnaim/${name}`, import.meta.url)),
    'utf8',
  );
const LISTE = fixture('liste.html');
const MAISONS = fixture('maisons-departement.html');
const ACCUEIL = fixture('recherche-inconnue.html');

/** Aucune page suivante : une seule page, et l'on passe à la recherche d'après. */
const DERNIERE = LISTE.replace(/ title="Page suivante"/, '');

function contexte(pages: (url: string) => string) {
  const vues: string[] = [];
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      vues.push(url);
      return Promise.resolve({ status: 200, body: pages(url), headers: {}, notModified: false });
    },
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues };
}

/** La réponse ordinaire : une page par recherche, la dernière. */
const ordinaire = (url: string): string =>
  url.includes('maison') ? MAISONS : url.includes('-page-') ? '' : DERNIERE;

describe('le passage FNAIM', () => {
  it('interroge chaque commune suivie, plus les maisons du département', async () => {
    const { ctx, vues } = contexte(ordinaire);
    const resultat = await fnaimScraper.run(ctx);

    expect(vues).toHaveLength(SEARCHES.length);
    for (const search of SEARCHES) {
      expect(vues.some((url) => url.includes(search.slug))).toBe(true);
    }
    // La recherche niçoise ne masque plus les maisons ni les communes voisines.
    expect(vues.some((url) => url.includes('st-laurent-du-var'))).toBe(true);
    expect(resultat.stopReason).toBe('completed');
  });

  it('suit la pagination d’une commune jusqu’au bout, et pas au-delà', async () => {
    const { ctx, vues } = contexte((url) =>
      url.includes('maison')
        ? MAISONS
        : url.includes('nice-06000-page-2')
          ? DERNIERE
          : url.includes('nice-06000')
            ? LISTE
            : DERNIERE,
    );
    await fnaimScraper.run(ctx);

    const niçoises = vues.filter((url) => url.includes('nice-06000'));
    expect(niçoises).toHaveLength(2);
    expect(niçoises[1]).toContain('-page-2.htm');
  });

  it('signale une recherche que le portail ne connaît pas, sans rien retirer', async () => {
    const { ctx } = contexte((url) =>
      url.includes('st-laurent-du-var') ? ACCUEIL : ordinaire(url),
    );
    const resultat = await fnaimScraper.run(ctx);

    expect(resultat.warnings).toContain(
      'Recherche inconnue du portail : 18-location-appartement-st-laurent-du-var-06700',
    );
    // Un inventaire à trou ne doit rien condamner.
    expect(resultat.stopReason).toBe('notModified');
  });

  it('ne condamne rien quand le budget coupe au milieu des recherches', async () => {
    const { ctx, vues } = contexte(ordinaire);
    const borne: ScrapeContext = { ...ctx, shouldStop: () => vues.length >= 3 };
    const resultat = await fnaimScraper.run(borne);

    expect(resultat.stopReason).toBe('incomplete');
  });

  it('ne rapporte des maisons du département que les communes suivies', async () => {
    const { ctx } = contexte(ordinaire);
    const resultat = await fnaimScraper.run(ctx);

    const maisons = resultat.listings.filter((listing) =>
      listing.sourceUrl.includes('location-maison'),
    );
    // Cannes est écartée ; Saint-Laurent-du-Var, que la carte écrit en toutes
    // lettres là où le portail l'abrège dans ses URL, ne l'est plus.
    expect(maisons.map((listing) => listing.cityText)).toEqual([
      'NICE',
      'CAGNES SUR MER',
      'SAINT LAURENT DU VAR',
    ]);
  });
});
