/**
 * Source : Immobilière Tichadou (tichadou.fr) — 2 rue du Congrès, 06000 Nice.
 * Étude et pièges dans `parser.ts`.
 *
 * Demandée par son nom. UNE SEULE REQUÊTE PAR PASSAGE : la page de résultats
 * embarque son propre tableau d'annonces, description entière comprise. Aucune
 * fiche à visiter — et donc rien à relire.
 *
 * Quatre locations au relevé du 2026-09-23, toutes à Nice.
 */

import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { stopReasonFromError } from '../shared/stop-reason.js';
import { LIST_URL, parseListPage } from './parser.js';

export const TICHADOU_DESCRIPTOR: SourceDescriptor = {
  id: 'tichadou',
  name: 'Immobilière Tichadou',
  domain: 'tichadou.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 }),
  enabled: true,
  allowedPaths: ['/resultats*'],
  agencyContact: {
    address: { street: '2 rue du Congrès', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'robots.txt vérifié le 2026-09-23 : « Allow: / », sitemap déclaré. Site ICS, ' +
    'mais au gabarit à tableau JavaScript embarqué (var properties) et non au ' +
    'gabarit resultat.php des autres sources ICS : titre, loyer, lien, photo et ' +
    'description entière y figurent, honoraires au m² et part d’état des lieux ' +
    'compris. Aucune fiche à visiter.',
};

export const tichadouScraper: Scraper = {
  descriptor: TICHADOU_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;

    try {
      const response = await context.fetch(LIST_URL);
      requestCount += 1;
      if (!response.notModified) {
        pagesFetched += 1;
        const parsed = parseListPage(response.body);
        listings.push(...parsed.listings);
        warnings.push(...parsed.warnings);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${LIST_URL} : ${message}`);
      context.log('list.failed', { url: LIST_URL, error: message });
      return {
        sourceId: TICHADOU_DESCRIPTOR.id,
        listings,
        requestCount,
        pagesFetched,
        stopReason: stopReasonFromError(message),
        warnings,
      };
    }

    context.log('list.parsed', { listings: listings.length });
    return {
      sourceId: TICHADOU_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason: 'completed',
      warnings,
    };
  },
};
