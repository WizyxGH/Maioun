/**
 * Liste vide AFFICHÉE par l'agence ≠ gabarit cassé.
 *
 * Chaque adaptateur ne rend `empty` que sur le signe explicite de sa plateforme
 * (extraits relevés le 2026-09-15) ; une page vide sans ce signe reste un
 * passage ordinaire, que le pipeline marque dégradé.
 */

import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeApimoScraper } from './apimo/scraper.js';
import { makeHektorScraper } from './hektor/scraper.js';
import { makeIcsScraper } from './ics/scraper.js';
import { makeNettyScraper } from './netty/scraper.js';

function context(pages: Record<string, string>): ScrapeContext {
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

const base = { name: 'Agence Test', domain: 'agence.invalid' };

describe('La Boîte Immo (Hektor)', () => {
  const LIST = 'https://www.agence.invalid/location/1';
  const scraper = makeHektorScraper({ ...base, id: 'hektor-vide', listUrls: [LIST] });

  it('rend `empty` sur « Aucun bien ne correspond à vos critères » (acsimmo.fr)', async () => {
    const html = `<html><head><title>0 annonces de logements à louer</title></head><body>
      <button data-text="Aucune annonce trouvée"><span>Aucune annonce trouvée</span></button>
      <h2 class="title"><span class="title_content_1 block">Désolé,<br> Aucun bien ne correspond à vos critères de recherche</span></h2>
      <script>var t = { searchText: 'Aucun résultat' };</script></body></html>`;
    const result = await scraper.run(context({ [LIST]: html }));
    expect(result).toMatchObject({ stopReason: 'empty', warnings: [] });
  });

  it('ne s’y trompe pas : le bouton « Aucune annonce trouvée » est aussi sur les listes pleines', async () => {
    const html = '<button data-text="Aucune annonce trouvée">Voir</button><div class="new"></div>';
    const result = await scraper.run(context({ [LIST]: html }));
    expect(result.stopReason).toBe('completed');
    expect(result.warnings.join(' ')).toMatch(/Aucune fiche/);
  });
});

describe('ICS', () => {
  const LIST = 'https://www.agence.invalid/resultats?transac=location';
  const scraper = makeIcsScraper({ ...base, id: 'ics-vide', listUrl: LIST });

  it('rend `empty` sur « Votre recherche n’a donné aucun résultats » (agenceduportdenice.fr)', async () => {
    const html = `<section class="pgl-properties"><div class="properties-full properties-listing">
      <p class="text-center">Votre recherche n&apos;a donn&eacute; aucun r&eacute;sultats.</p>
      </div></section>`;
    expect(await scraper.run(context({ [LIST]: html }))).toMatchObject({
      stopReason: 'empty',
      warnings: [],
    });
  });

  it('garde l’avertissement sur une page sans annonces ni message', async () => {
    const result = await scraper.run(context({ [LIST]: '<html><body></body></html>' }));
    expect(result.stopReason).toBe('completed');
    expect(result.warnings).toHaveLength(1);
  });
});

describe('sitemaps (Apimo, Netty)', () => {
  const urlset = (...locs: string[]) =>
    `<urlset>${locs.map((loc) => `<url><loc><![CDATA[${loc}]]></loc></url>`).join('')}</urlset>`;

  it('Apimo : sitemap lu, aucune location visée — que des ventes (transactimo-nice.com)', async () => {
    const SITEMAP = 'https://agence.invalid/sitemap.xml';
    const scraper = makeApimoScraper({
      ...base,
      id: 'apimo-vide',
      sitemapUrl: SITEMAP,
      citySlugs: ['nice'],
    });
    const xml = urlset(
      'https://agence.invalid/fr/',
      'https://agence.invalid/fr/propriete/vente+appartement+nice+t3+87000001',
    );
    expect((await scraper.run(context({ [SITEMAP]: xml }))).stopReason).toBe('empty');
    // Sitemap illisible : rien ne dit que l'agence est vide.
    expect((await scraper.run(context({ [SITEMAP]: '<html>erreur</html>' }))).stopReason).toBe(
      'completed',
    );
  });

  it('Netty : sitemap lu, aucune location dans les communes visées (sunimmobilia.fr)', async () => {
    const SITEMAP = 'https://www.agence.invalid/sitemap.xml';
    const scraper = makeNettyScraper({
      ...base,
      id: 'netty-vide',
      sitemapUrl: SITEMAP,
      citySlugs: ['nice'],
    });
    const xml = urlset(
      'https://www.agence.invalid',
      'https://www.agence.invalid/location/local-commercial-61-00-m2-cagnes-sur-mer-06800,LP067',
    );
    expect((await scraper.run(context({ [SITEMAP]: xml }))).stopReason).toBe('empty');
  });
});
