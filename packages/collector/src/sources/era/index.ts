/**
 * Source : ERA Immobilier — voir l'étude dans `parser.ts` et la fiche de
 * `docs/sources-enquetes.md`.
 *
 * L'utilisateur a demandé « ERA Mac Immobilier », une franchise niçoise. On
 * prend le réseau plutôt que cette agence-là : la page ville d'ERA rassemble
 * les annonces de TOUTES ses franchises sur Nice — au relevé du 2026-09-04,
 * six agences différentes, dont ERA Mac — pour le même nombre de requêtes
 * (§30). Le nom de la franchise reste porté par chaque annonce.
 *
 * QUATRE COMMUNES, depuis le 2026-09-22 : Nice ne montre que les biens situés
 * à Nice, si bien que les franchises du réseau publiant ailleurs dans le
 * périmètre restaient invisibles — ERA Maresol, à Cagnes-sur-Mer, en tête de
 * notre relevé des agences « sans source directe » alors que nous lisions déjà
 * son réseau. Quinze annonces de plus, sur trois pages de plus.
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
import { parseListPage } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

const ORIGIN = 'https://www.eraimmobilier.com';

/**
 * Page ville, tous types de location confondus. Elle figure telle quelle dans
 * `sitemap_silo_location.xml` — le site l'offre donc explicitement au
 * référencement. Sa variante `/location-appartement/...` ne verrait pas les
 * maisons ; celle-ci porte tout, et le parseur écarte ce qui n'est pas un
 * logement.
 */
const VILLES = `${ORIGIN}/location/provence-alpes-cote-dazur-17/alpes-maritimes-10`;

/**
 * QUATRE COMMUNES, ET NON PLUS NICE SEULE.
 *
 * La page de Nice ne voit que les biens situés à Nice : les franchises du
 * réseau qui publient ailleurs dans le périmètre restaient invisibles. ERA
 * Maresol, à Cagnes-sur-Mer, était ainsi la PREMIÈRE agence de notre relevé
 * « vue par les portails, sans source directe » — quinze annonces, dont
 * quatorze vivantes — alors que nous lisions déjà son réseau.
 *
 * Relevé du 2026-09-22 sur les treize communes du périmètre : Cagnes-sur-Mer
 * en porte huit, Saint-Laurent-du-Var cinq, Villeneuve-Loubet deux, et les
 * neuf autres aucune. On demande donc ces trois-là, et pas les neuf vides —
 * une page inutile coûte autant qu'une page pleine.
 */
const LIST_URLS: readonly string[] = [
  `${VILLES}/nice-13662`,
  `${VILLES}/cagnes-sur-mer-3968`,
  `${VILLES}/saint-laurent-du-var-33535`,
  `${VILLES}/villeneuve-loubet-11603`,
];

/** Dix annonces par page ; la plus fournie des quatre en compte seize. */
const PER_PAGE = 10;
const MAX_PAGES_PER_CITY = 3;

export const ERA_DESCRIPTOR: SourceDescriptor = {
  id: 'era',
  name: 'ERA Immobilier',
  domain: 'eraimmobilier.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: LIST_URLS.length * MAX_PAGES_PER_CITY,
    maxListingsPerRun: 120,
  }),
  enabled: true,
  allowedPaths: ['/location/*', '/annonces/*'],
  notes:
    'robots.txt de www vérifié le 2026-09-04 : /louer, /acheter, /estimer et ' +
    'les URLs à paramètres *agence_id=*, *groupe_id=*, *display=*, *agent=*, ' +
    '*language=* sont interdits ; /location/... et /annonces/<id> ne le sont ' +
    'pas, et la page ville figure dans sitemap_silo_location.xml. ' +
    'Angular rendu côté serveur : la page embarque son état de transfert ' +
    '(<script id="ng-state">), qui porte les annonces structurées — ' +
    'descriptif entier, photos, franchise et son téléphone en clair. ' +
    'IMPORTANT : cet état nomme l’API interne api.eraimmobilier.com, dont le ' +
    'robots.txt est Disallow: / — elle n’est JAMAIS appelée (§10). ' +
    'La géolocalisation fournie est celle de l’agence ou le centroïde de la ' +
    'ville, jamais celle du bien : elle est ignorée (§17, §20).',
};

export const eraScraper: Scraper = {
  descriptor: ERA_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    for (const ville of LIST_URLS) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      // UNE COMMUNE MUETTE N'ARRÊTE PAS LES AUTRES : `notModified` et les
      // pages épuisées ne concluent que cette commune-ci.
      for (let page = 1; page <= MAX_PAGES_PER_CITY; page += 1) {
        if (context.shouldStop()) {
          stopReason = 'maxPages';
          break;
        }
        const url = page === 1 ? ville : `${ville}?page=${page}`;
        try {
          const response = await context.fetch(url);
          requestCount += 1;
          if (response.notModified) break;
          pagesFetched += 1;

          const parsed = parseListPage(response.body, url);
          warnings.push(...parsed.warnings);
          for (const listing of parsed.listings) byRef.set(listing.sourceRef, listing);

          // Le total annoncé par la recherche dit s'il reste une page ; sans
          // lui, on s'arrête plutôt que de tirer une requête à l'aveugle (§30).
          if (parsed.total === null || page * PER_PAGE >= parsed.total) break;
        } catch (error) {
          // §69 : échec propre, les autres sources continuent.
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Échec sur ${url} : ${message}`);
          context.log('page.failed', { url, error: message });
          stopReason = stopReasonFromError(message);
          break;
        }
      }
    }

    const listings = [...byRef.values()];
    context.log('list.parsed', { listings: listings.length, pages: pagesFetched });

    return {
      sourceId: ERA_DESCRIPTOR.id,
      listings,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
