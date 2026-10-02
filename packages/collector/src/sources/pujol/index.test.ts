/**
 * La relecture des fiches CONNUES — et ce qu'elle rattrape.
 *
 * Le bandeau « Location clôturée » n'apparaît qu'APRÈS la signature du bail.
 * Une fiche lue la veille est donc encore ouverte en base, et comme elle ne
 * reparait plus ensuite dans les plans de site, rien ne la revisitait : elle
 * restait active indéfiniment. Ces tests tiennent la relecture ouverte.
 *
 * Aucun accès réseau : les plans de site et les fiches viennent des fixtures.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { pujolScraper } from './index.js';
import { SITEMAPS } from './parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (nom: string): string =>
  readFileSync(resolve(here, `../../../../../tests/fixtures/pujol/${nom}`), 'utf8');

const LOUEE = fixture('louee.html');
const ACTIVE = fixture('active.html');

const URL_LOUEE =
  'https://www.immobiliere-pujol.fr/annonces/l003048-66-barberis-06300-nice-france/';
const URL_ACTIVE =
  'https://www.immobiliere-pujol.fr/annonces/1089neot-65-boulevard-gambetta-6000-nice/';

/** Un plan de site qui énumère les deux fiches, et rien d'autre. */
const PLAN = `<?xml version="1.0"?><urlset>
  <url><loc>${URL_LOUEE}</loc></url>
  <url><loc>${URL_ACTIVE}</loc></url>
</urlset>`;

const ok = (body: string): FetchResult => ({
  status: 200,
  body,
  headers: {},
  notModified: false,
});

interface Trace {
  readonly urls: string[];
}

/**
 * Contexte de test.
 *
 * @param known    Les références que la base connaît DÉJÀ.
 * @param fetches  Ce que rend chaque URL de fiche.
 */
function contexte(
  trace: Trace,
  known: readonly string[] = [],
  fetches: Readonly<Record<string, FetchResult>> = {},
): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      trace.urls.push(url);
      if (url.endsWith('.xml')) return Promise.resolve(ok(PLAN));
      if (fetches[url] !== undefined) return Promise.resolve(fetches[url]);
      return Promise.resolve(ok(ACTIVE));
    },
    isKnown: (reference) => known.includes(reference),
    knownRefs: new Set(known),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
}

const fiches = (trace: Trace): string[] => trace.urls.filter((url) => url.includes('/annonces/'));

describe('pujolScraper — relire les fiches connues pour voir lesquelles se ferment', () => {
  it('MARQUE LOUÉE une fiche connue dont le bandeau est apparu depuis', async () => {
    const trace: Trace = { urls: [] };
    // La référence est CONNUE, donc le parcours normal la saute : sans relecture
    // sa fiche ne serait jamais demandée.
    const resultat = await pujolScraper.run(
      contexte(trace, ['l003048'], { [URL_LOUEE]: ok(LOUEE) }),
    );

    expect(fiches(trace)).toContain(URL_LOUEE);
    expect(resultat.rentedRefs).toContain('l003048');
  });

  it('NE MARQUE PAS LOUÉE une fiche connue qui reste en cours', async () => {
    const trace: Trace = { urls: [] };
    const resultat = await pujolScraper.run(contexte(trace, ['1089neot']));

    expect(fiches(trace)).toContain(URL_ACTIVE);
    expect(resultat.rentedRefs).not.toContain('1089neot');
  });

  it('NE RELIT PAS une fiche lue il y a moins d’un jour', async () => {
    const trace: Trace = { urls: [] };
    const maintenant = new Date().toISOString();
    const context: ScrapeContext = {
      ...contexte(trace, ['l003048'], { [URL_LOUEE]: ok(LOUEE) }),
      detailMemory: {
        get: () => ({ fetchedAt: maintenant, draft: {} }),
        save: () => Promise.resolve(),
      },
    };

    await pujolScraper.run(context);

    // Le bail ne se signe pas en heure : relire à chaque passage serait du bruit.
    expect(fiches(trace)).not.toContain(URL_LOUEE);
  });

  it('ne relit pas une référence absente des plans de site', async () => {
    const trace: Trace = { urls: [] };
    await pujolScraper.run(contexte(trace, ['reference-inconnue']));

    // On ne réécrit pas une URL qui n'existe pas : rien à demander.
    expect(fiches(trace)).toEqual([URL_LOUEE, URL_ACTIVE]);
  });

  it('reste dans son budget de requêtes', () => {
    // Cinq plans de site, vingt fiches nouvelles, quatre relectures.
    expect(pujolScraper.descriptor.budget.maxPagesPerRun).toBe(SITEMAPS.length + 24);
  });
});
