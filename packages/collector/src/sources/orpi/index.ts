/**
 * Source : Orpi (réseau d'agences).
 *
 * POURQUOI CETTE SOURCE EN DEUXIÈME — voir `docs/sources.md` pour l'étude.
 *
 *   - `robots.txt` (revérifié le 2026-08-15) : `/recherche/*` est interdit,
 *     mais la page ville `/location-immobiliere-nice/` ne l'est pas, et sa
 *     pagination `?page=N` n'apparaît dans aucun Disallow (seuls `agency=`,
 *     `sujet=`, `contact=`, `orderBy=` sont bloqués).
 *   - Les cartes embarquent prix, surface, pièces, agence, quartier et — fait
 *     rare — les COORDONNÉES GPS : le signal de dédoublonnage le plus fort
 *     après le téléphone (§14). Une requête = ~15 annonces très riches (§6).
 *   - Premier réseau d'agences de France : forte couverture niçoise, biens
 *     parfois absents des grands portails (§3).
 *
 * CONFORMITÉ. Aucune requête vers `/recherche/*` ni vers un chemin à
 * paramètre interdit (`?contact=true` n'est jamais visité : l'URL est
 * canonisée avant toute chose). Arrêt au premier 429.
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
import { parseDetail, parseSearchPage } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * Le stock niçois d'Orpi tourne autour de cinquante annonces : douze visites
 * par cycle couvrent une première collecte en quatre passages, puis il n'en
 * reste qu'une poignée à chaque parution (§30).
 */
const MAX_DETAILS = 12;

/**
 * Pages de LISTE parcourues en rattrapage.
 *
 * QUATRE NE SUFFISAIENT PAS, et le manque était mesurable. Relevé du
 * 2026-09-09 sur la page ville : la pagination affichée s'arrête à quatre, mais
 * les pages suivantes RÉPONDENT et portent d'autres biens. En dénombrant les
 * références uniques — pages 1 à 4 : 89 annonces ; pages 5 à 8 : 60 de plus,
 * dont 42 inédites ; **131 au total**. Un tiers du stock niçois d'Orpi restait
 * donc invisible, sans que rien ne le signale : la source paraissait complète
 * puisqu'elle atteignait sa propre limite.
 *
 * CELA NE COÛTE RIEN UNE FOIS LE CATALOGUE CONNU. `KNOWN_RATIO_STOP` coupe la
 * pagination dès qu'une page est déjà vue à 80 % : les quatre pages ajoutées ne
 * sont réellement lues qu'au premier rattrapage, puis quand du neuf paraît
 * assez loin dans la liste (§9, §30).
 *
 * Distinct du budget de la source, qui compte toutes les requêtes — pages de
 * liste ET fiches. Les confondre ferait paginer seize pages de résultats dès
 * qu'on augmente le nombre de fiches visitées.
 */
const MAX_LIST_PAGES = 8;

/**
 * Point d'entrée unique : la page ville agrège tous les codes postaux de Nice
 * (06000 à 06300 observés sur la même page), contrairement à Laforêt qui
 * demande une page par code postal.
 */
const BASE_URL = 'https://www.orpi.com/location-immobiliere-nice/';

export const ORPI_DESCRIPTOR: SourceDescriptor = {
  id: 'orpi',
  name: 'Orpi',
  domain: 'orpi.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork', { baseIntervalMinutes: 45 }),
  budget: budgetFor('agencyNetwork', {
    // Une page porte 37 annonces (relevé du 2026-09-09 ; le commentaire disait
    // ~15), triées nouveautés en tête : en mode live, deux pages absorbent
    // largement le flux de parutions entre deux runs. C'est le RATTRAPAGE qui
    // avait besoin d'aller plus loin, pas la veille.
    maxPagesPerRun: MAX_LIST_PAGES + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Le premier contact passe par le formulaire d'agence (§23).
  manualOnly: true,
  allowedPaths: ['/location-immobiliere-*', '/annonce-location-*'],
  notes:
    'robots.txt vérifié le 2026-08-15 : /recherche/* interdit, page ville et ' +
    'pagination ?page=N autorisées ; les paramètres agency/sujet/contact/orderBy ' +
    'sont interdits et ne sont jamais utilisés. Cartes riches (GPS, quartier, ' +
    'agence, date de création) via attribut data-eulerian-action — traité comme ' +
    'enrichissement fragile, le HTML visible fait foi.',
};

/** §9 : au-delà de ce ratio de déjà-vu sur une page, on cesse de paginer. */
const KNOWN_RATIO_STOP = 0.8;

export const orpiScraper: Scraper = {
  descriptor: ORPI_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const warnings: string[] = [];
    // Une même annonce peut apparaître sur deux pages consécutives (le tri
    // bouge entre deux requêtes) : on ne la compte qu'une fois par run.
    const seenRefs = new Set<string>();
    let pagesFetched = 0;
    let requestCount = 0;
    let stopReason: StopReason = 'completed';

    // Mode live : 2 pages maximum ; backfill : toutes les pages de liste (§8).
    const maxPages = context.mode === 'backfill' ? MAX_LIST_PAGES : 2;

    for (let page = 1; page <= maxPages; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }

      const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

      let html: string;
      try {
        const response = await context.fetch(url);
        requestCount += 1;

        if (response.notModified) {
          // §30 : page inchangée depuis la dernière visite — rien à analyser,
          // et les pages suivantes n'ont pas bougé non plus.
          context.log('page.not_modified', { url });
          break;
        }
        html = response.body;
      } catch (error) {
        // §69 : un échec de page n'abat pas la source ; un refus ou une
        // limitation arrête le run proprement.
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec sur ${url} : ${message}`);
        context.log('page.failed', { url, error: message });
        if (message.includes('429')) {
          stopReason = 'rateLimited';
        } else if (message.includes('refusé')) {
          stopReason = 'blocked';
        }
        break;
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

      if (listings.length >= ORPI_DESCRIPTOR.budget.maxListingsPerRun) {
        stopReason = 'maxListings';
        break;
      }

      // §9 : arrêt anticipé en terrain connu.
      const ratio = parsed.listings.length === 0 ? 1 : knownOnPage / parsed.listings.length;
      if (ratio >= KNOWN_RATIO_STOP) {
        context.log('page.known_territory', { url, ratio: Math.round(ratio * 100) });
        stopReason = 'knownTerritory';
        break;
      }

      if (!parsed.hasNextPage) break;
    }

    // LA CARTE COUPE À CENT CINQUANTE-DEUX CARACTÈRES ; la fiche des annonces
    // NOUVELLES porte le texte entier, avec l'adresse de rue qu'Orpi ne publie
    // nulle part ailleurs. Une fois la pagination finie, pour ne visiter chaque
    // annonce qu'une fois.
    const enriched = await enrichNewListings(context, listings.splice(0), {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetail(html),
    });
    listings.push(...enriched.listings);
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    return {
      sourceId: ORPI_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
