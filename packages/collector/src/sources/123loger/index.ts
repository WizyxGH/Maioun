import type {
  RawListing,
  Scraper,
  ScrapeContext,
  ScrapeResult,
  SourceDescriptor,
  StopReason,
} from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { stopReasonFromError } from '../shared/stop-reason.js';
import { parseDetailPage, parseSearchPage } from './parser.js';

const ORIGIN = 'https://www.123loger.com';
const SEARCH_URL = `${ORIGIN}/location/nice-06000/appartement/`;
/**
 * Plafond de pages, LARGE À DESSEIN.
 *
 * Il valait treize, soit exactement la taille du catalogue au relevé du
 * 2026-09-24 : la treizième page était pleine (24 annonces) et la quatorzième
 * vide. Nous étions donc à la limite, et la première croissance du stock aurait
 * été tronquée sans un mot.
 *
 * Le relever ne coûte presque rien : la boucle s'arrête d'elle-même dès qu'une
 * page n'annonce plus de suite — ce que la quatorzième fait —, soit UNE requête
 * de plus aujourd'hui. Et si le plafond est un jour atteint pour de bon, la
 * source le dit au lieu de se taire.
 */
const MAX_PAGES = 20;
const MAX_DETAILS = 24;

export const ONE_TWO_THREE_LOGER_DESCRIPTOR: SourceDescriptor = {
  id: '123loger',
  name: '123Loger',
  domain: '123loger.com',
  kind: 'portal',
  method: 'html',
  priority: 3,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS,
    maxListingsPerRun: 400,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  hostsWantedAds: false,
  allowedPaths: ['/location/nice-06000/*'],
  /**
   * LE CONTACT EST PAYANT, et le site le dit lui-même sur chaque fiche :
   * « pour contacter tous les propriétaires qui louent le logement de vos
   * rêves, vous devez créer votre profil locataire et devenir Premium pour
   * 34 € ». Relevé le 2026-09-23.
   *
   * On le DIT à l'écran, avant le clic : découvrir le péage après avoir ouvert
   * l'annonce est une déception qu'un mot suffit à éviter. L'annonce, elle,
   * reste consultable librement — et c'est bien pour cela qu'on la collecte.
   */
  paidContact: true,
  notes:
    'robots.txt vérifié le 2026-09-22 : les pages publiques de location sont ' +
    'autorisées. La recherche appartement Nice annonce 13 pages publiques et ' +
    'expose les références dans les URLs. Les fiches sont enrichies seulement ' +
    'pour les nouvelles annonces ; les candidatures et contenus Premium ne sont ' +
    'pas consultés.',
};

export const oneTwoThreeLogerScraper: Scraper = {
  descriptor: ONE_TWO_THREE_LOGER_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    const confirmedRefs: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) break;
      const url = page === 1 ? SEARCH_URL : `${SEARCH_URL}?page=${page}`;
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const parsed = parseSearchPage(response.body, url);
        warnings.push(...parsed.warnings);
        for (const listing of parsed.listings) {
          confirmedRefs.push(listing.sourceRef);
          listings.push(listing);
        }
        if (!parsed.hasNextPage && page > 1) break;
        // Le plafond atteint alors que la page est encore pleine : le
        // catalogue nous dépasse, et c'est la seule occasion de le dire.
        if (page === MAX_PAGES && parsed.listings.length > 0) {
          warnings.push(
            `Plafond de ${MAX_PAGES} pages atteint, la dernière en portait encore ` +
              `${parsed.listings.length} : le catalogue est peut-être tronqué.`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec sur ${url} : ${message}`);
        stopReason = stopReasonFromError(message);
        break;
      }
    }

    let enriched = 0;
    for (const listing of listings) {
      if (enriched >= MAX_DETAILS || context.shouldStop()) break;
      if (context.isKnown(listing.sourceRef)) continue;
      try {
        const response = await context.fetch(listing.sourceUrl);
        requestCount += 1;
        if (response.notModified) continue;
        pagesFetched += 1;
        const detail = parseDetailPage(response.body, listing.sourceUrl);
        if (detail !== null) {
          const index = listings.findIndex(
            (candidate) => candidate.sourceRef === listing.sourceRef,
          );
          if (index >= 0) listings[index] = detail;
          enriched += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Détail échoué ${listing.sourceUrl} : ${message}`);
      }
    }

    return {
      sourceId: ONE_TWO_THREE_LOGER_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
