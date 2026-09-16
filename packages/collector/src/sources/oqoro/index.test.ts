/**
 * Le passage Oqoro : où il s'arrête dans la pagination, ce qu'il rend loué, et
 * ce qu'il refuse de conclure d'une lecture partielle. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { oqoroScraper } from './index.js';
import { CARDS_PER_PAGE } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/oqoro/${name}`, import.meta.url)),
    'utf8',
  );

const LISTE = fixture('liste-departement.html');
const FICHE = fixture('fiche.html');

/** Une page PLEINE : vingt annonces disponibles, donc une suivante à lire. */
function pagePleine(depart: number): string {
  const cartes = Array.from({ length: CARDS_PER_PAGE }, (_i, index) => {
    const ref = (depart + index).toString(16).padStart(8, '0');
    return `<a href="/location/nice/t2-rue-inventee-${ref}">
      <div role="img" aria-label="Photo du ${index + 1} Rue Inventée, Nice"
           style="background-image: url(https://cdn.oqoro.com/x${ref})"></div>
      <div class="oq-badge">Disponible</div>
      <span class="text-md font-semibold text-primary">Appartement T2 - location nue</span>
      <span class="text-sm font-md text-secondary">40m²</span>
      <div class="text-xl font-semibold text-primary">700 €<span>&nbsp;/mois cc</span></div>
    </a>`;
  });
  return `<html><body>${cartes.join('')}</body></html>`;
}

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

/** La réponse ordinaire : une liste courte, donc unique, puis les fiches. */
const ordinaire = (url: string): string =>
  url.includes('/locations-departement/') ? LISTE : FICHE;

describe('le passage Oqoro', () => {
  it('s’arrête à la première page incomplète, sans demander la suivante', async () => {
    const { ctx, vues } = contexte(ordinaire);
    const resultat = await oqoroScraper.run(ctx);

    const listes = vues.filter((url) => url.includes('/locations-departement/'));
    expect(listes).toEqual(['https://www.oqoro.com/locations-departement/alpes-maritimes']);
    expect(resultat.stopReason).toBe('completed');
    expect(resultat.fullPass).toBe(true);
  });

  it('rend les annonces du périmètre, et signale louées celles qui le sont', async () => {
    const { ctx } = contexte(ordinaire);
    const resultat = await oqoroScraper.run(ctx);

    expect(resultat.listings.map((one) => one.sourceRef)).toEqual(['1a2b3c4d', '2b3c4d5e']);
    expect([...(resultat.rentedRefs ?? [])].sort()).toEqual(['3c4d5e6f', '5e6f7081']);
  });

  it('complète les nouvelles annonces par leur fiche', async () => {
    const { ctx, vues } = contexte(ordinaire);
    const resultat = await oqoroScraper.run(ctx);

    expect(vues.filter((url) => url.includes('/colocation/'))).toHaveLength(1);
    const chambre = resultat.listings.find((one) => one.sourceRef === '1a2b3c4d');
    // La carte ne donnait ni dépôt, ni honoraires, ni DPE : la fiche les ajoute.
    expect(chambre?.depositText).toBe('1 100 €');
    expect(chambre?.extra?.['dpe']).toBe('E');
  });

  it('suit la pagination tant que les pages sont pleines, et prévient si elle est tronquée', async () => {
    let page = 0;
    const { ctx, vues } = contexte((url) => {
      if (!url.includes('/locations-departement/')) return FICHE;
      page += 1;
      return pagePleine(page * 1000);
    });
    const resultat = await oqoroScraper.run(ctx);

    const listes = vues.filter((url) => url.includes('/locations-departement/'));
    expect(listes).toHaveLength(5);
    expect(listes.at(-1)).toContain('/page/5');
    expect(resultat.stopReason).toBe('maxPages');
    expect(resultat.fullPass).toBe(false);
    expect(resultat.warnings.some((one) => one.includes('tronquée'))).toBe(true);
  });

  it('ne conclut rien d’une liste qui a échoué', async () => {
    const { ctx } = contexte((url) => {
      if (url.includes('/locations-departement/')) throw new Error('HTTP 503');
      return FICHE;
    });
    const resultat = await oqoroScraper.run(ctx);

    expect(resultat.stopReason).toBe('tooManyErrors');
    expect(resultat.listings).toEqual([]);
    expect(resultat.rentedRefs).toEqual([]);
  });
});
