/**
 * Ce que la source voyait, et ce qu'elle voit maintenant.
 *
 * Dénombrement du 2026-09-17 sur century21.fr : 46 logements à louer dans le
 * périmètre, 20 lus. Trois restrictions se cumulaient — une seule page, une
 * seule commune, un seul type de bien —, et aucune ne se signalait. Ces tests
 * les tiennent ouvertes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { PERIMETER_COMMUNES } from '../shared/communes.js';
import { century21Scraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/century21');
const PAGE1 = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const PAGE2 = readFileSync(join(FIXTURES, 'nice-page2.html'), 'utf8');
const SANS_RESULTAT = readFileSync(join(FIXTURES, 'sans-resultat.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'fiche-description.html'), 'utf8');
const SAISONNIERE = readFileSync(join(FIXTURES, 'nice-saisonniere.html'), 'utf8');

const NICE_APPARTEMENT = 'https://www.century21.fr/annonces/location-appartement/v-nice/';
const NICE_APPARTEMENT_2 = `${NICE_APPARTEMENT}page-2/`;
const NICE_MAISON = 'https://www.century21.fr/annonces/location-maison/v-nice/';

/** Une réponse 200 nue, comme le client HTTP la rend. */
const ok = (body: string): FetchResult => ({ status: 200, body, headers: {}, notModified: false });

interface Trace {
  readonly urls: string[];
}

/**
 * Contexte de test : la page niçoise des appartements se pagine, toutes les
 * autres recherches sont muettes, et les fiches rendent la fixture de détail.
 */
function contexte(trace: Trace, pages: Readonly<Record<string, FetchResult>> = {}): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      trace.urls.push(url);
      if (pages[url] !== undefined) return Promise.resolve(pages[url]);
      if (url.includes('/trouver_logement/detail/')) return Promise.resolve(ok(FICHE));
      if (url === NICE_APPARTEMENT) return Promise.resolve(ok(PAGE1));
      if (url === NICE_APPARTEMENT_2) return Promise.resolve(ok(PAGE2));
      return Promise.resolve(ok(SANS_RESULTAT));
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
}

const listes = (trace: Trace): string[] =>
  trace.urls.filter((url) => url.includes('/annonces/location-'));

describe('century21Scraper — le périmètre entier, et les deux types de bien', () => {
  it('interroge les treize communes suivies en appartement ET en maison', async () => {
    const trace: Trace = { urls: [] };
    await century21Scraper.run(contexte(trace));

    const premieres = listes(trace).filter((url) => !url.includes('page-'));
    expect(premieres).toHaveLength(PERIMETER_COMMUNES.length * 2);
    // Le site abrège « saint » et sépare les mots par des espaces encodés.
    expect(premieres).toContain(
      'https://www.century21.fr/annonces/location-appartement/v-st+laurent+du+var/',
    );
    expect(premieres).toContain('https://www.century21.fr/annonces/location-maison/v-cap+d+ail/');
    expect(premieres).toContain('https://www.century21.fr/annonces/location-maison/v-nice/');
  });

  it('lit la DEUXIÈME page et rend les annonces qu’elle seule portait', async () => {
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(contexte(trace));

    expect(listes(trace)).toContain(NICE_APPARTEMENT_2);
    const refs = result.listings.map((listing) => listing.sourceRef);
    expect(refs).toContain('16000000004');
    expect(refs).toContain('16000000005');
    // Le total annoncé est atteint : l'inventaire est lu en entier.
    expect(result.stopReason).toBe('completed');
  });

  it('ne va pas au-delà de la dernière page, que le site ressert en page 1', async () => {
    const trace: Trace = { urls: [] };
    await century21Scraper.run(contexte(trace));
    expect(listes(trace).filter((url) => url.includes('page-3'))).toHaveLength(0);
  });

  it('se tait sur une ville sans bien comme sur une ville inconnue', async () => {
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(
      contexte(trace, {
        // Contes n'existe pas chez Century 21 : 410, et ce n'est pas un trou.
        'https://www.century21.fr/annonces/location-appartement/v-contes/': {
          status: 410,
          body: '',
          headers: {},
          notModified: false,
        },
      }),
    );
    expect(result.warnings).toEqual([]);
    expect(result.stopReason).toBe('completed');
  });

  it('signale un inventaire plus court que le total annoncé', async () => {
    // La page dit douze annonces et n'en porte que trois ; sa suite ne vient
    // pas. Sans ce contrôle, la source rendait trois annonces sur douze en se
    // déclarant complète — c'est exactement ce qui arrivait à Nice.
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(
      contexte(trace, {
        [NICE_APPARTEMENT]: ok(PAGE1.replace('5 annonces', '12 annonces')),
        [NICE_APPARTEMENT_2]: ok(SANS_RESULTAT),
      }),
    );
    expect(result.stopReason).toBe('incomplete');
    expect(result.fullPass).toBe(false);
  });

  it('refuse une page qui annonce une autre commune', async () => {
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(
      contexte(trace, {
        'https://www.century21.fr/annonces/location-appartement/v-drap/': ok(PAGE1),
      }),
    );
    expect(result.warnings.join(' ')).toContain('a servi « Nice » pour drap');
    // Rien de ce qu'elle portait n'est repris sous le nom de Drap.
    expect(result.stopReason).toBe('incomplete');
  });
});

describe('century21Scraper — les locations de vacances', () => {
  it('écarte la villa louée à la semaine sans se croire incomplète', async () => {
    // Le site compte la villa dans son total ; l'écarter sans la compter
    // rendrait la recherche éternellement incomplète, et une source incomplète
    // n'éteint plus rien. Elle compte comme lue, et n'est pas retenue.
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(contexte(trace, { [NICE_MAISON]: ok(SAISONNIERE) }));
    const refs = result.listings.map((listing) => listing.sourceRef);
    expect(refs).toContain('16000000011');
    expect(refs).not.toContain('16000000012');
    expect(result.stopReason).toBe('completed');
  });

  it('dit laquelle elle a écartée, et pourquoi', async () => {
    const trace: Trace = { urls: [] };
    const result = await century21Scraper.run(contexte(trace, { [NICE_MAISON]: ok(SAISONNIERE) }));
    const dit = result.warnings.join(' | ');
    expect(dit).toContain('Location saisonnière');
    expect(dit).toContain('/trouver_logement/detail/16000000012/');
  });

  it('ne va pas lire la fiche d’une annonce écartée', async () => {
    const trace: Trace = { urls: [] };
    await century21Scraper.run(contexte(trace, { [NICE_MAISON]: ok(SAISONNIERE) }));
    expect(trace.urls).not.toContain(
      'https://www.century21.fr/trouver_logement/detail/16000000012/',
    );
  });
});
