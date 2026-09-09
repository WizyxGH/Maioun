/**
 * Source : Arthurimmo — agence de Nice du réseau. Voir `parser.ts` et
 * `docs/sources.md` pour l'étude.
 *
 * UNE PAGE DE LISTE, PUIS UNE FICHE PAR ANNONCE. La liste ne porte rien
 * d'exploitable hormis les adresses des fiches ; tout le reste est dans
 * l'en-tête de celles-ci. Sept locations relevées le 2026-09-09, donc huit
 * requêtes pour l'inventaire entier — et deux en régime établi, les fiches
 * déjà connues n'étant pas revisitées.
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
import { LIST_URL, parseDetail, parseListPage } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * Le stock niçois tient en une dizaine de biens : une première collecte est
 * couverte d'un seul passage, et il n'en reste ensuite qu'une à chaque parution.
 */
const MAX_DETAILS = 12;

export const ARTHURIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'arthurimmo',
  name: 'Arthurimmo.com Nice',
  domain: 'arthurimmo.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: 1 + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Premier contact via le formulaire de l'agence : on ne l'automatise pas.
  manualOnly: true,
  allowedPaths: ['/recherche,basic.htm', '/annonces/location/*'],
  notes:
    'robots.txt vérifié le 2026-09-09 : « User-agent: * » n’interdit rien. Le ' +
    'fichier bloque nommément Claudebot, Bytespider et barkrowler — des robots ' +
    'd’entraînement d’IA, pas un agent de recherche personnel qui s’annonce. ' +
    'Seule la page de recherche liste les biens ; les chemins nus rendent zéro. ' +
    'Les données viennent du titre social de chaque fiche, composé par le site ' +
    'dans un ordre invariable.',
};

export const arthurimmoScraper: Scraper = {
  descriptor: ARTHURIMMO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    let links: readonly { url: string; reference: string; city: string; postalCode: string }[] = [];
    try {
      const response = await context.fetch(LIST_URL);
      requestCount += 1;
      if (response.notModified) {
        context.log('page.not_modified', { url: LIST_URL });
        return {
          sourceId: ARTHURIMMO_DESCRIPTOR.id,
          listings,
          requestCount,
          pagesFetched,
          stopReason: 'notModified',
          warnings,
        };
      }
      pagesFetched += 1;
      links = parseListPage(response.body);
      context.log('page.parsed', { url: LIST_URL, found: links.length });
      // une page qui ne rend plus rien signale un gabarit changé.
      if (links.length === 0) {
        warnings.push('Aucune fiche de location trouvée — gabarit probablement modifié');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${LIST_URL} : ${message}`);
      context.log('page.failed', { url: LIST_URL, error: message });
      return {
        sourceId: ARTHURIMMO_DESCRIPTOR.id,
        listings,
        requestCount,
        pagesFetched,
        stopReason: message.includes('429') ? 'rateLimited' : 'tooManyErrors',
        warnings,
      };
    }

    // LES NOUVELLES SEULEMENT : une fiche connue n'apprendrait rien de plus, et
    // le titre social ne bouge pas d'une collecte à l'autre.
    let budget = MAX_DETAILS;
    for (const link of links) {
      if (budget <= 0 || context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      if (context.isKnown(link.reference)) continue;
      budget -= 1;

      try {
        const page = await context.fetch(link.url);
        requestCount += 1;
        if (page.notModified) continue;
        pagesFetched += 1;
        const listing = parseDetail(page.body, link);
        if (listing !== null) listings.push(listing);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('detail.failed', { url: link.url, error: message });
        warnings.push(`Fiche injoignable : ${link.url}`);
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
      }
    }

    return {
      sourceId: ARTHURIMMO_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
