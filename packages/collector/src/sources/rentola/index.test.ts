/**
 * Les photos de Rentola.
 *
 * LA LISTE NE SERT QU'UNE VIGNETTE, LA FICHE EN SERT VINGT — et la fiche
 * n'était demandée que pour les annonces INCONNUES. Relevé du 2026-09-29 sur
 * 314 annonces en base : 287 n'avaient qu'une image. La source publiait donc
 * presque rien de ses photos, alors qu'elle les a toutes.
 *
 * Aucun accès réseau : la liste et la fiche viennent des fixtures.
 */

import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { rentolaScraper } from './index.js';

const SAMPLE_LISTE = `
<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SearchResultsPage","mainEntity":{
"@type":"ItemList","itemListElement":[
 {"@type":"ListItem","position":1,"url":"https://rentola.fr/listings/studio-nice-23-m2-p05ad82",
  "item":{"@type":"RealEstateListing","name":"Studio Nice 23 m2",
   "url":"https://rentola.fr/listings/studio-nice-23-m2-p05ad82",
   "image":"https://cdn.rentola.fr/vignette-p05ad82.jpg",
   "offers":{"@type":"Offer","price":450,
    "itemOffered":{"@type":"Apartment","floorSize":{"value":23}}}}}]}}
</script></head><body></body></html>`;

/** La fiche : la même annonce, avec toutes ses photos. */
const SAMPLE_FICHE = `
<!DOCTYPE html><html><head>
<script type="application/ld+json">
{"@type":"RealEstateListing","name":"Studio Nice 23 m2",
 "url":"https://rentola.fr/listings/studio-nice-23-m2-p05ad82",
 "description":"Joli studio meublé.",
 "image":[
  "https://www.repimmo.com/upload/photos/p05ad82_1.jpg",
  "https://www.repimmo.com/upload/photos/p05ad82_2.jpg",
  "https://www.repimmo.com/upload/photos/p05ad82_3.jpg",
  "https://www.repimmo.com/upload/photos/p05ad82_4.jpg"],
 "offers":{"@type":"Offer","price":450,
  "itemOffered":{"@type":"Apartment","floorSize":{"value":23}}}}
</script></head><body><h1>Studio Nice 23 m2</h1></body></html>`;

const ok = (body: string): FetchResult => ({ status: 200, body, headers: {}, notModified: false });

/** La même liste, mais son JSON-LD porte déjà le carnet entier. */
const LISTE_COMPLETE = SAMPLE_LISTE.replace(
  '"image":"https://cdn.rentola.fr/vignette-p05ad82.jpg"',
  '"image":["https://www.repimmo.com/upload/photos/p05ad82_1.jpg",' +
    '"https://www.repimmo.com/upload/photos/p05ad82_2.jpg",' +
    '"https://www.repimmo.com/upload/photos/p05ad82_3.jpg",' +
    '"https://www.repimmo.com/upload/photos/p05ad82_4.jpg"]',
);

interface Trace {
  readonly urls: string[];
}

/**
 * Contexte de test.
 *
 * @param known Les références que la base connaît DÉJÀ — c'est le cas qu'on
 *              éprouve : une annonce connue n'était jamais relue.
 * @param liste La page de résultats servie.
 */
function contexte(
  trace: Trace,
  known: readonly string[] = [],
  liste: string = SAMPLE_LISTE,
): ScrapeContext {
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) => {
      trace.urls.push(url);
      if (url.includes('/listings/')) return Promise.resolve(ok(SAMPLE_FICHE));
      return Promise.resolve(ok(liste));
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

const imagesOf = (resultat: Awaited<ReturnType<typeof rentolaScraper.run>>, ref: string) =>
  resultat.listings.find((one) => one.sourceRef === ref)?.imageUrls ?? [];

describe('rentolaScraper — rattraper les photos des annonces déjà connues', () => {
  it('RELIT une fiche connue qui n’a qu’une vignette', async () => {
    const trace: Trace = { urls: [] };
    const resultat = await rentolaScraper.run(contexte(trace, ['p05ad82']));

    // La liste seule ne donne qu'une image. Sans relecture, l'annonce gardait
    // cette vignette à vie : c'est le cas de 287 annonces sur 314.
    expect(imagesOf(resultat, 'p05ad82').length).toBeGreaterThan(1);
  });

  it('prend les photos de la fiche, pas la vignette de la liste', async () => {
    const trace: Trace = { urls: [] };
    const resultat = await rentolaScraper.run(contexte(trace, ['p05ad82']));

    expect(imagesOf(resultat, 'p05ad82')).toEqual([
      'https://www.repimmo.com/upload/photos/p05ad82_1.jpg',
      'https://www.repimmo.com/upload/photos/p05ad82_2.jpg',
      'https://www.repimmo.com/upload/photos/p05ad82_3.jpg',
      'https://www.repimmo.com/upload/photos/p05ad82_4.jpg',
    ]);
  });

  it('NE RELIT PAS une annonce qui a déjà toutes ses photos', async () => {
    // Une liste qui porte DÉJÀ le carnet entier : la relecture, qui sert à
    // combler les vignettes, n'a plus rien à faire. Sans ce tri, elle
    // redemanderait la fiche des trois cent annonces déjà complètes.
    const trace: Trace = { urls: [] };
    const resultat = await rentolaScraper.run(contexte(trace, ['p05ad82'], LISTE_COMPLETE));

    expect(trace.urls.filter((url) => url.includes('/listings/'))).toHaveLength(0);
    expect(imagesOf(resultat, 'p05ad82')).toHaveLength(4);
  });

  it('conserve les autres champs de la fiche en même temps', async () => {
    // Une relecture n'est pas une mise à jour : le texte de la fiche remplace
    // celui de la liste, qui n'en a pas.
    const trace: Trace = { urls: [] };
    const resultat = await rentolaScraper.run(contexte(trace, ['p05ad82']));
    const annonce = resultat.listings.find((one) => one.sourceRef === 'p05ad82');
    expect(annonce?.description).toContain('Joli studio meublé');
  });

  it('tient son budget de pages', () => {
    // Quinze pages de liste, vingt-quatre fiches nouvelles, six relectures.
    expect(rentolaScraper.descriptor.budget.maxPagesPerRun).toBe(15 + 24 + 6);
  });
});
