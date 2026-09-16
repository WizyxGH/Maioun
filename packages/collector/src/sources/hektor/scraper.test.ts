/**
 * Ce que la FICHE apprend, quand la liste ment encore.
 *
 * Relevé du 2026-09-16 sur sudagence.fr : une annonce retirée reste sur la
 * page de liste, son adresse de fiche redirige vers l'accueil, et l'accueil
 * répond 200. Le passage la rendait donc « vivante », avec le nom de l'agence
 * pour titre. C'est le canonique de la page servie qui la dénonce.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeHektorScraper } from './scraper.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/hektor');
const ACCUEIL = readFileSync(join(FIXTURES, 'detail-redirigee-accueil.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'detail-li-data.html'), 'utf8');

const ORIGIN = 'https://www.agence-fictive.fr';
const LIST = `${ORIGIN}/location/1`;
const ficheUrl = (reference: string): string =>
  `${ORIGIN}/location/06-alpes-maritimes/1-nice/grand-studio-vide-de-33-m-quartier-nord-790/${reference}-appartement`;

/** Liste qui affiche encore les références données, boutons `data-url`. */
const liste = (references: readonly string[]): string =>
  `<html><body>${references
    .map((reference) => `<div data-url="${ficheUrl(reference)}">Détails</div>`)
    .join('')}</body></html>`;

/** Chaque référence retirée reçoit l'accueil ; les autres, une vraie fiche. */
function contexte(references: readonly string[], retirees: readonly string[]): ScrapeContext {
  const pages: Record<string, string> = { [LIST]: liste(references) };
  for (const reference of references) {
    // La fiche porte SA propre canonique : sans quoi toutes se diraient retirées.
    pages[ficheUrl(reference)] = retirees.includes(reference)
      ? ACCUEIL
      : FICHE.replace(/href="[^"]*554-appartement"/, `href="${ficheUrl(reference)}"`);
  }
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) =>
      Promise.resolve({ status: 200, body: pages[url] ?? '', headers: {}, notModified: false }),
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

const scraper = makeHektorScraper({
  id: 'hektor-retiree',
  name: 'Agence Fictive',
  domain: 'agence-fictive.fr',
  listUrls: [LIST],
});

describe('makeHektorScraper — fiches retirées servies en 200', () => {
  it('éteint la fiche que le site remplace par son accueil', async () => {
    const result = await scraper.run(contexte(['553', '554', '282'], ['282']));
    expect(result.withdrawnRefs).toEqual(['282']);
    // Elle n'est rendue ni comme annonce, ni comme référence confirmée : la
    // réécrire vivante juste avant de l'éteindre l'aurait ressuscitée.
    expect(result.listings.map((listing) => listing.sourceRef).sort()).toEqual(['553', '554']);
    expect(result.confirmedRefs ?? []).not.toContain('282');
  });

  it('n’éteint rien quand toutes les fiches mènent à l’accueil', async () => {
    // Une salve pareille dénonce un gabarit changé, pas trois biens loués dans
    // la minute : le garde-fou de `shared/withdrawn.ts` s'applique.
    const result = await scraper.run(contexte(['553', '554', '282'], ['553', '554', '282']));
    expect(result.withdrawnRefs).toEqual([]);
  });
});
