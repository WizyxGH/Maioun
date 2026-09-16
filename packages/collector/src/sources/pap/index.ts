/**
 * Source : PAP — De Particulier À Particulier (portail).
 *
 * POURQUOI CETTE SOURCE — voir `docs/sources.md` pour l'étude complète.
 *
 *   - Bailleurs PARTICULIERS : contact direct, sans agence ni frais d'agence.
 *     Complément exact des réseaux déjà couverts (Laforêt, Orpi).
 *   - Chemin d'accès CONFORME (§6, §10) : les pages de liste par ville sont
 *     déclarées dans le sitemap officiel `liste_annonces.xml` et ne figurent
 *     pas dans les Disallow — c'est la méthode prévue par le site. La
 *     recherche interne (`/recherche/…`), elle, est interdite et jamais
 *     utilisée.
 *   - Les cartes de liste contiennent tout (prix, pièces, chambres, surface,
 *     CP, description, DPE) : AUCUNE fiche n'est visitée (§6, §30).
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
import { parseSearchPage } from './parser.js';
import { KNOWN_RATIO_STOP, knownRatio } from '../shared/known-territory.js';

/**
 * Points d'entrée, tous déclarés dans le sitemap officiel :
 *   - toutes les locations à Nice (studios et maisons comprises) ;
 *   - la déclinaison studios, cœur de cible du budget ≤ 700 €.
 * La pagination suffixe le chemin : `…-g8979-2`.
 */
const ENTRY_POINTS = [
  'https://www.pap.fr/annonce/locations-nice-06-g8979',
  'https://www.pap.fr/annonce/locations-nice-06-g8979-studio',
] as const;

export const PAP_DESCRIPTOR: SourceDescriptor = {
  id: 'pap',
  name: 'PAP',
  domain: 'pap.fr',
  kind: 'portal',
  // PAP = « De Particulier à Particulier » : aucune agence n'y publie, c'est sa
  // raison d'être. Le seul portail dont la nature du bailleur soit certaine.
  landlord: 'private',
  method: 'html',
  priority: 1,
  schedule: scheduleFor('portal', { baseIntervalMinutes: 30 }),
  budget: budgetFor('portal', {
    maxPagesPerRun: 4,
    delayBetweenRequestsMs: 3_000,
  }),
  /**
   * DÉSACTIVÉE le 2026-08-15, RECONTRÔLÉE le 2026-09-16 — voir docs/sources.md.
   *
   * Le robots.txt autorise toujours ces pages et le sitemap les déclare
   * toujours, MAIS le pare-feu s'est refermé davantage. En août, le filtrage
   * portait sur l'empreinte du client : même UA, même IP, curl passait quand
   * fetch Node recevait 403. Le 2026-09-16, LES DEUX reçoivent 403, et la page
   * servie est le défi JavaScript de Cloudflare — « Just a moment... » —, que
   * seul un navigateur peut résoudre.
   *
   * Le franchir demanderait d'exécuter ce défi : c'est exactement le
   * contournement d'anti-bot que le projet s'interdit (§10). On n'insiste pas.
   * Le scraper et ses tests restent prêts si la politique du site évolue ; la
   * vérification se refait en deux requêtes.
   */
  enabled: false,
  allowedPaths: ['/annonce/locations-*'],
  notes:
    'robots.txt revérifié le 2026-09-16 : /*?*, /recherche/detail/ et ' +
    '/annonce/liste/ interdits, pages /annonce/locations-{ville}-g{id} ' +
    'toujours autorisées ET déclarées dans le sitemap liste_annonces.xml — ' +
    'mais Cloudflare y répond 403 avec un défi JavaScript, pour curl comme ' +
    'pour fetch Node (en août, curl passait encore). Source désactivée sans ' +
    'contournement (§10).',
};

export const papScraper: Scraper = {
  descriptor: PAP_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    const seenRefs = new Set<string>();
    let pagesFetched = 0;
    let requestCount = 0;
    let stopReason: StopReason = 'completed';

    // Live : première page de chaque point d'entrée (les nouveautés remontent
    // en tête) ; backfill : une page de plus (§8).
    const maxPagesPerEntry = context.mode === 'backfill' ? 2 : 1;

    outer: for (const entryUrl of ENTRY_POINTS) {
      for (let page = 1; page <= maxPagesPerEntry; page += 1) {
        if (context.shouldStop()) {
          stopReason = 'maxPages';
          break outer;
        }

        const url = page === 1 ? entryUrl : `${entryUrl}-${page}`;

        let html: string;
        try {
          const response = await context.fetch(url);
          requestCount += 1;

          if (response.notModified) {
            context.log('page.not_modified', { url });
            break;
          }
          html = response.body;
        } catch (error) {
          // §69 : l'échec d'une page n'abat pas la source ; un refus global si.
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${url} : ${message}`);
          context.log('page.failed', { url, error: message });
          if (message.includes('429')) {
            stopReason = 'rateLimited';
            break outer;
          }
          if (message.includes('refusé')) {
            stopReason = 'blocked';
            break outer;
          }
          continue;
        }

        pagesFetched += 1;
        const parsed = parseSearchPage(html, url);
        warnings.push(...parsed.warnings);

        let knownOnPage = 0;
        for (const listing of parsed.listings) {
          if (seenRefs.has(listing.sourceRef)) continue;
          seenRefs.add(listing.sourceRef);

          if (context.isKnown(listing.sourceRef)) knownOnPage += 1;
          listings.push(listing);
        }

        context.log('page.parsed', {
          url,
          found: parsed.listings.length,
          known: knownOnPage,
          total: listings.length,
        });

        if (listings.length >= PAP_DESCRIPTOR.budget.maxListingsPerRun) {
          stopReason = 'maxListings';
          break outer;
        }

        // Arrêt anticipé en terrain connu.
        const ratio = knownRatio(parsed.listings.length, knownOnPage);
        if (ratio >= KNOWN_RATIO_STOP) {
          context.log('page.known_territory', { url, ratio: Math.round(ratio * 100) });
          stopReason = 'knownTerritory';
          break;
        }

        if (!parsed.hasNextPage) break;
      }
    }

    return {
      sourceId: PAP_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
