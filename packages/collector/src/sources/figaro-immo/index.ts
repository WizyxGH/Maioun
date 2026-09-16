/**
 * Source : Figaro Immobilier — voir `parser.ts`.
 *
 * L'INVENTAIRE ENTIER À CHAQUE PASSAGE : douze pages d'appartements (chambres
 * comprises) et une de maisons au relevé du 2026-09-15, 31 annonces par page.
 * Aucune fiche n'est lue : le robots.txt les ferme, et la liste suffit.
 *
 * Le tri est « par pertinence » : une annonce publiée pendant le passage
 * décale les pages, et l'on peut en lire une deux fois et en manquer une.
 * Le total annoncé par le site sert de garde-fou avant tout retrait.
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
import { listUrl, parseListPage, SEARCHES, type FigaroSearch } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

/** Pages lues au plus par recherche : 12 pour les appartements aujourd'hui. */
const MAX_PAGES = 16;

/** Pages de toutes les recherches : 12 + 1 aujourd'hui. */
const MAX_LIST_PAGES = 20;

/**
 * Manque toléré face au total annoncé ; au-delà, l'inventaire est tenu pour
 * incomplet et rien ne se retire. Le site compte ses doublons (9 maisons
 * annoncées, 8 distinctes le 2026-09-15) et le tri glisse pendant le passage.
 */
function tolerated(total: number): number {
  return Math.max(2, Math.ceil(total * 0.03));
}

export const FIGARO_IMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'figaro-immo',
  name: 'Figaro Immobilier',
  domain: 'immobilier.lefigaro.fr',
  kind: 'portal',
  method: 'html',
  // Des agences qu'on ne lit pas ailleurs, avec leur téléphone ; le reste est
  // relayé de sources déjà collectées (LocService, BEP, Orpi…).
  priority: 2,
  // Treize pages pour tout relire : toutes les heures suffisent à un relais.
  schedule: scheduleFor('portal', { baseIntervalMinutes: 60, minIntervalMinutes: 30 }),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_LIST_PAGES,
    maxListingsPerRun: 600,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Le portail REPUBLIE : deux de ses annonces qui partagent une photo sont le
  // même bien.
  relaysListings: true,
  allowedPaths: [
    '/annonces/immobilier-location-appartement-nice+06000.html',
    '/annonces/immobilier-location-maison-nice+06000.html',
  ],
  notes:
    'robots.txt vérifié le 2026-09-15 : /annonce/ interdit, et aucune fiche ' +
    '(/annonces/annonce-N.html) n’est lue ; /rest/, /s/, ?pagination= et toute querystring sous /annonces/ ' +
    'fermés SAUF page= (Allow: /annonces/*page=*), que le site utilise lui-même ' +
    '(link rel="next" …html?page=2). Page Nuxt rendue côté serveur, état ' +
    '__NUXT_DATA__ : description entière, photos, DPE, agence et téléphone. La ' +
    'page « nice+06000 » couvre les quatre codes postaux. Coordonnées non reprises ' +
    '(centre-ville ou point par défaut). Pas d’ETag : aucune réponse 304.',
};

export const figaroImmoScraper: Scraper = {
  descriptor: FIGARO_IMMO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const confirmed = new Set<string>();
    const warnings: string[] = [];
    const counters = { requestCount: 0, pagesFetched: 0 };
    let stopReason: StopReason = 'completed';
    let incomplete = false;

    for (const search of SEARCHES) {
      const pass = await readSearch(context, search, counters);
      for (const listing of pass.listings) byRef.set(listing.sourceRef, listing);
      for (const ref of pass.confirmedRefs) confirmed.add(ref);
      warnings.push(...pass.warnings);
      incomplete ||= pass.incomplete;
      if (pass.stopReason !== 'completed') {
        stopReason = pass.stopReason;
        break;
      }
    }

    // Un inventaire à trou ne doit rien retirer.
    if (incomplete && stopReason === 'completed') stopReason = 'incomplete';
    const listings = [...byRef.values()];
    const confirmedRefs = [...confirmed].filter((ref) => !byRef.has(ref));

    context.log('list.parsed', {
      listings: listings.length,
      confirmed: confirmedRefs.length,
      pages: counters.pagesFetched,
    });

    return {
      sourceId: FIGARO_IMMO_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount: counters.requestCount,
      pagesFetched: counters.pagesFetched,
      stopReason,
      warnings,
    };
  },
};

interface SearchPass {
  readonly listings: readonly RawListing[];
  readonly confirmedRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly incomplete: boolean;
  readonly stopReason: StopReason;
}

/** Lit une recherche jusqu'à sa dernière page. */
async function readSearch(
  context: ScrapeContext,
  search: FigaroSearch,
  counters: { requestCount: number; pagesFetched: number },
): Promise<SearchPass> {
  const refs = new Set<string>();
  const listings: RawListing[] = [];
  const confirmedRefs: string[] = [];
  const warnings: string[] = [];
  let total: number | null = null;
  let incomplete = false;
  let stopReason: StopReason = 'completed';

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (context.shouldStop()) {
      return { listings, confirmedRefs, warnings, incomplete: true, stopReason: 'maxPages' };
    }
    const url = listUrl(search, page);
    try {
      const response = await context.fetch(url);
      counters.requestCount += 1;

      if (response.notModified) {
        // Inchangée : ses annonces aussi. Une page vide dira où finit la liste.
        const known = await context.pageRefs.get(url);
        if (known === null) {
          incomplete = true;
          continue;
        }
        if (known.length === 0) break;
        const fresh = known.filter((ref) => !refs.has(ref));
        for (const ref of fresh) refs.add(ref);
        confirmedRefs.push(...fresh);
        continue;
      }
      counters.pagesFetched += 1;

      const parsed = parseListPage(response.body);
      if (page === 1) total = parsed.total;
      warnings.push(...parsed.warnings);
      for (const listing of parsed.listings) {
        if (refs.has(listing.sourceRef)) continue;
        refs.add(listing.sourceRef);
        listings.push(listing);
      }
      await context.pageRefs.set(
        url,
        parsed.listings.map((listing) => listing.sourceRef),
      );
      if (parsed.total === null) {
        // Pas d'état lisible : on ne sait pas ce que la page portait.
        incomplete = true;
        break;
      }
      if (!parsed.hasNext || parsed.listings.length === 0) break;
      if (page === MAX_PAGES) incomplete = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de ${url} : ${message}`);
      context.log('list.failed', { url, error: message });
      stopReason = stopReasonFromError(message);
      break;
    }
  }

  if (total !== null && total - refs.size > tolerated(total)) {
    context.log('list.incomplete', { search, lues: refs.size, annoncees: total });
    incomplete = true;
  }
  return { listings, confirmedRefs, warnings, incomplete, stopReason };
}
