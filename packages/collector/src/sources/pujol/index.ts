/**
 * Source : Immobilière Pujol. Voir `parser.ts` et `docs/sources.md`.
 *
 * COLLECTE PAR PLAN DE SITE. Cinq fichiers énumèrent 4 681 annonces, dont
 * dix-huit à Nice — l'agence est marseillaise. On ne visite que celles-là, et
 * seulement les nouvelles : cinq requêtes par passage en régime établi.
 *
 * ON GARDE LES ANNONCES CLÔTURÉES, et c'est l'intérêt principal. Seize des
 * dix-huit portent le bandeau « Ce bien a été loué » avec le loyer réellement
 * obtenu, à une adresse exacte. Marquées louées, elles sortent de la liste de
 * recherche mais nourrissent les statistiques et le repère de prix — partout
 * ailleurs, le projet ne voit que des loyers DEMANDÉS.
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
import { niceListingUrls, parseDetail, referenceOf, SITEMAPS } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * Dix-huit annonces niçoises en tout : une première collecte les couvre d'un
 * seul passage, et il n'en paraît ensuite qu'une de loin en loin.
 */
const MAX_DETAILS = 20;

export const PUJOL_DESCRIPTOR: SourceDescriptor = {
  id: 'pujol',
  name: 'Immobilière Pujol',
  domain: 'immobiliere-pujol.fr',
  kind: 'localAgency',
  method: 'sitemap',
  // Volume minuscule, mais des adresses exactes et des loyers obtenus.
  priority: 3,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', {
    maxPagesPerRun: SITEMAPS.length + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  manualOnly: true,
  allowedPaths: ['/ads-sitemap*.xml', '/annonces/*'],
  notes:
    'robots.txt vérifié le 2026-09-09 : « Allow: / », plan de site déclaré. ' +
    '4 681 annonces dont 18 à Nice, l’agence étant marseillaise. Seize sont ' +
    'clôturées et portent le loyer obtenu à une adresse exacte — conservées ' +
    'comme louées. ATTENTION : le titre du site annonce « Marseille » sur des ' +
    'biens niçois ; la ville ne se lit jamais là, mais dans l’adresse de la fiche.',
};

export const pujolScraper: Scraper = {
  descriptor: PUJOL_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const rentedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    // 1. Les plans de site, pour ne retenir que Nice.
    const urls = new Set<string>();
    for (const sitemap of SITEMAPS) {
      if (context.shouldStop()) break;
      try {
        const response = await context.fetch(sitemap);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        for (const url of niceListingUrls(response.body)) urls.add(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Plan de site injoignable : ${sitemap}`);
        context.log('sitemap.failed', { url: sitemap, error: message });
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
      }
    }
    context.log('sitemap.parsed', { nice: urls.size });
    if (urls.size === 0 && pagesFetched > 0) {
      warnings.push('Aucune annonce niçoise dans les plans de site — gabarit modifié ?');
    }

    // 2. Les fiches nouvelles seulement : une annonce clôturée ne change plus.
    let budget = MAX_DETAILS;
    for (const url of urls) {
      if (budget <= 0 || context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const reference = referenceOf(url);
      if (reference === null || context.isKnown(reference)) continue;
      budget -= 1;

      try {
        const page = await context.fetch(url);
        requestCount += 1;
        if (page.notModified) continue;
        pagesFetched += 1;
        const parsed = parseDetail(page.body, url);
        if (parsed === null) continue;
        listings.push(parsed.listing);
        if (parsed.closed) rentedRefs.push(parsed.listing.sourceRef);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('detail.failed', { url, error: message });
        warnings.push(`Fiche injoignable : ${url}`);
        if (message.includes('429')) {
          stopReason = 'rateLimited';
          break;
        }
      }
    }

    return {
      sourceId: PUJOL_DESCRIPTOR.id,
      listings,
      rentedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
