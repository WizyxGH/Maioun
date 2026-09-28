/**
 * Source : Arthurimmo.com — réseau national d'experts immobiliers.
 *
 * Implantation à Nice (Arthurimmo Nice Transactions Nord et Est).
 * Scraping HTML de la recherche location Nice et 10 km alentours.
 */

import type { Scraper, ScrapeContext, ScrapeResult, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { ARTHURIMMO_SEARCH_URL, parseList } from './parser.js';

export const ARTHURIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'arthurimmo',
  name: 'Arthurimmo.com',
  domain: 'arthurimmo.com',
  kind: 'portal',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: 4,
    maxListingsPerRun: 50,
  }),
  enabled: true,
  allowedPaths: ['/recherche,basic.htm*', '/annonces/location/*'],
  notes:
    'Réseau d’agences Arthurimmo.com. Recherche location Nice + 10 km. ' +
    'Extraction directe des fiches et visuels sur les cartes de recherche.',
};

export const arthurimmoScraper: Scraper = {
  descriptor: ARTHURIMMO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;

    try {
      const response = await context.fetch(ARTHURIMMO_SEARCH_URL, {
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      requestCount += 1;

      if (response.notModified) {
        return {
          sourceId: ARTHURIMMO_DESCRIPTOR.id,
          listings: [],
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }

      pagesFetched += 1;
      const parsed = parseList(response.body);
      warnings.push(...parsed.warnings);

      return {
        sourceId: ARTHURIMMO_DESCRIPTOR.id,
        listings: parsed.listings,
        requestCount,
        pagesFetched,
        stopReason: parsed.listings.length === 0 ? 'empty' : 'completed',
        warnings,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec Arthurimmo : ${message}`);
      return {
        sourceId: ARTHURIMMO_DESCRIPTOR.id,
        listings: [],
        requestCount,
        pagesFetched,
        stopReason: message.includes('429') ? 'rateLimited' : 'tooManyErrors',
        warnings,
      };
    }
  },
};
