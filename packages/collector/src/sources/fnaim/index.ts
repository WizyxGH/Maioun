/**
 * Source : FNAIM — voir l'étude dans `parser.ts` et la fiche de
 * `docs/sources.md`.
 *
 * C'est la réponse à « réduire la dépendance aux alertes e-mail de SeLoger » :
 * 193 agences niçoises publient sur ce portail, dont beaucoup n'ont pas de
 * site scrapable, et chaque carte donne le nom de l'agence ET son téléphone.
 *
 * LE TRI PAR PRIX CROISSANT EST LA CLÉ DU BUDGET DE REQUÊTES. La FNAIM classe
 * les résultats du moins cher au plus cher : les premières pages portent donc
 * exactement la tranche recherchée. Trois pages — soixante-quinze annonces —
 * couvraient tout le stock sous 900 € au relevé du 2026-09-04, là où le stock
 * entier en demanderait sept (§30).
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
import { enrichNewListings } from '../shared/enrich.js';
import { listUrl, parseDetail, parseListPage } from './parser.js';

/**
 * TROIS PAGES COUVRAIENT MOINS DE LA MOITIÉ DU STOCK.
 *
 * La limite se justifiait par le tri : les résultats vont du moins cher au plus
 * cher, « trois pages suffisent donc à couvrir la tranche recherchée ». Le
 * raisonnement tenait tant que l'inventaire ne servait qu'à UN budget. Il ne
 * tient plus : consulter est libre, et la liste s'ouvre à des gens dont on ne
 * connaît pas les critères. Une source triée par prix et coupée au tiers ne
 * montre pas « les moins chers », elle CACHE tout le reste.
 *
 * Dénombrement du 2026-09-09, par titre canonique : sept pages réelles, la
 * huitième vide. Cent vingt-trois annonces au total, contre cinquante-six pour
 * les trois premières. Plus de la moitié manquait.
 *
 * Une page porte une vingtaine d'annonces — le commentaire en annonçait
 * vingt-cinq.
 */
const MAX_PAGES = 8;

/**
 * AUCUNE FICHE N'EST LUE : le robots.txt les interdit.
 *
 * `Disallow: /annonce-immobiliere/*\/18-location*` — les fiches de LOCATION,
 * précisément, et les sitemaps qui les listent. La règle a échappé au relevé du
 * 2026-09-04 et la source en lisait vingt par passage jusqu'au 2026-09-14. La
 * carte coupe la description vers 250 caractères : c'est ce qu'on garde.
 *
 * Ce qui avait été lu reste en mémoire et continue de s'appliquer ; rien n'est
 * redemandé au site.
 */
const MAX_DETAILS = 0;

export const FNAIM_DESCRIPTOR: SourceDescriptor = {
  id: 'fnaim',
  name: 'FNAIM',
  domain: 'fnaim.fr',
  kind: 'portal',
  method: 'html',
  // Le portail d'une fédération, pas un agrégateur commercial : l'annonce
  // identifie l'agence qui la publie et donne de quoi l'appeler.
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_PAGES,
    maxListingsPerRun: 100,
  }),
  enabled: true,
  allowedPaths: ['/liste-annonces-immobilieres/*'],
  notes:
    'robots.txt revérifié le 2026-09-14 : les listes sont autorisées, les ' +
    'fiches de location NON (/annonce-immobiliere/*/18-location*) — elles ne ' +
    'sont pas lues. Pages entièrement rendues côté serveur, ' +
    '25 annonces par page, pagination SEO `…-nice-06000-page-N.htm` SANS ' +
    'querystring (celle du gabarit en porte une, on ne l’utilise pas). ' +
    'La recherche par 06000 remonte aussi les 06100/06200/06300 : une seule ' +
    'URL couvre Nice. Résultats triés par loyer croissant, ce qui met la ' +
    'tranche recherchée sur les premières pages. Les cartes portent le nom de ' +
    'l’agence, son téléphone en clair, et une description qui contient ' +
    'souvent l’adresse en toutes lettres (§14, §20). La carte coupe la ' +
    'description vers 250 caractères.',
};

export const fnaimScraper: Scraper = {
  descriptor: FNAIM_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const url = listUrl(page);
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) {
          stopReason = 'notModified';
          break;
        }
        pagesFetched += 1;

        const parsed = parseListPage(response.body, url);
        warnings.push(...parsed.warnings);
        if (parsed.listings.length === 0) break;
        for (const listing of parsed.listings) byRef.set(listing.sourceRef, listing);
        if (!parsed.hasNext) break;
      } catch (error) {
        // §69 : échec propre, les autres sources continuent.
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec sur ${url} : ${message}`);
        context.log('page.failed', { url, error: message });
        stopReason = message.includes('429')
          ? 'rateLimited'
          : message.includes('refusé')
            ? 'blocked'
            : 'tooManyErrors';
        break;
      }
    }

    // Rien n'est lu (MAX_DETAILS = 0) : seule la mémoire des fiches déjà lues
    // s'applique.
    const enriched = await enrichNewListings(context, [...byRef.values()], {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetail(html),
    });
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    const listings = enriched.listings;
    context.log('list.parsed', {
      listings: listings.length,
      pages: pagesFetched,
      details: enriched.pagesFetched,
      known: listings.filter((listing) => context.isKnown(listing.sourceRef)).length,
    });

    return {
      sourceId: FNAIM_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
