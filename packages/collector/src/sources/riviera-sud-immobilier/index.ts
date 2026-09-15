/**
 * Source : Riviera Sud Immobilier (rsi-immo.com) — 5 boulevard Gambetta,
 * 06000 Nice. Transaction, gestion et location ; site IWS Création (Next.js).
 *
 * Liste seule : la page des locations porte les biens complets dans son flux
 * RSC (voir `parser.ts`), dix par page, `?page=N` au-delà.
 * robots.txt vérifié le 2026-09-15 : seuls /auth, /fr/admin* et /fr/user*
 * sont interdits. 3 locations à Nice au relevé (dont un parking moto).
 */

import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { listingsOf, parseListPage } from './parser.js';

const ORIGIN = 'https://www.rsi-immo.com';
const LIST_URL = `${ORIGIN}/biens-immobiliers/tous/location`;
const MAX_PAGES = 5;

export const RIVIERA_SUD_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'riviera-sud-immobilier',
  name: 'Riviera Sud Immobilier',
  domain: 'rsi-immo.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: MAX_PAGES }),
  enabled: true,
  allowedPaths: ['/biens-immobiliers/*', '/fr/estate/*'],
  agencyContact: {
    phone: '04 93 44 24 14', // secret-scan-ignore
    email: 'info@rsi-immo.com', // secret-scan-ignore
    address: { street: '5 boulevard Gambetta', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'Site IWS Création (Next.js). robots.txt vérifié le 2026-09-15 : /auth, ' +
    '/fr/admin* et /fr/user* interdits, le reste permis. Liste ' +
    '/biens-immobiliers/tous/location (?page=N) dont le flux RSC porte loyer CC ' +
    'et HC, honoraires, surface, pièces, meublé, adresse et DPE : fiches non lues.',
};

export const rivieraSudImmobilierScraper: Scraper = {
  descriptor: RIVIERA_SUD_IMMOBILIER_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const sourceId = RIVIERA_SUD_IMMOBILIER_DESCRIPTOR.id;
    const warnings: string[] = [];
    const listings: RawListing[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) break;
      const url = page === 1 ? LIST_URL : `${LIST_URL}?page=${page}`;
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) {
          if (page === 1) stopReason = 'notModified';
          break;
        }
        pagesFetched += 1;
        const parsed = parseListPage(response.body);
        if (parsed === null) {
          warnings.push(`Aucun bien lisible dans le flux de ${url}`);
          break;
        }
        if (page === 1 && parsed.total === 0) {
          stopReason = 'empty';
          break;
        }
        listings.push(
          ...listingsOf(response.body, parsed, ORIGIN, RIVIERA_SUD_IMMOBILIER_DESCRIPTOR.name),
        );
        if (parsed.page * parsed.limit >= parsed.total) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('list.failed', { url, error: message });
        warnings.push(`Échec de la liste ${url} : ${message}`);
        stopReason = message.includes('429')
          ? 'rateLimited'
          : message.includes('refusé')
            ? 'blocked'
            : pagesFetched === 0
              ? 'tooManyErrors'
              : 'completed';
        break;
      }
    }

    context.log('list.parsed', { listings: listings.length, pages: pagesFetched });
    return { sourceId, listings, requestCount, pagesFetched, stopReason, warnings };
  },
};
