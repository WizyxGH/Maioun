/**
 * Source : Oqoro — voir l'étude dans `parser.ts` et la fiche de
 * `docs/sources.md`.
 *
 * TROIS PAGES PAR PASSAGE, pas treize. La liste départementale porte les mêmes
 * annonces que les treize pages de commune, et une commune où Oqoro n'a encore
 * rien y apparaîtra d'elle-même le jour où elle comptera. On s'arrête sur la
 * première page incomplète : la dernière en porte moins de vingt.
 *
 * LE PARC EST PRESQUE ENTIÈREMENT LOUÉ — quarante-quatre biens sur quarante-sept
 * dans le département le 2026-09-16 — et le site le dit lui-même sur chaque
 * carte. Ce que d'autres sources font deviner par une absence, celle-ci
 * l'affiche : une annonce déjà publiée qui passe à « Occupé » est rendue louée
 * sur-le-champ, sans attendre trois passages.
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
import { withdrawnRefsFrom } from '../shared/withdrawn.js';
import { CARDS_PER_PAGE, listUrl, parseDetail, parseListPage } from './parser.js';

/**
 * Trois pages suffisaient au département entier le 2026-09-16. Cinq laissent
 * grandir le parc sans jamais couper l'inventaire en silence : la lecture
 * s'arrête d'elle-même sur la première page incomplète.
 */
const MAX_PAGES = 5;

/** Fiches lues par passage : le parc disponible en compte deux ou trois. */
const MAX_DETAILS = 6;

export const OQORO_DESCRIPTOR: SourceDescriptor = {
  id: 'oqoro',
  name: 'Oqoro',
  domain: 'oqoro.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS,
    maxListingsPerRun: 60,
  }),
  enabled: true,
  allowedPaths: ['/locations-departement/*', '/location/*', '/colocation/*'],
  // Le gestionnaire agit pour des propriétaires particuliers, mais c'est lui qui
  // publie, lui qui détient la carte professionnelle, et lui qui facture des
  // honoraires au locataire : le bailleur que l'on aura en face est un
  // professionnel.
  landlord: 'agency',
  notes:
    'Gestionnaire locatif en ligne (Lyon), présent à Nice. robots.txt vérifié ' +
    'le 2026-09-16 : interdit /recherche?*, /candidat*, /proprietaire*, ' +
    '/partenaire*, /candidature*, /*.pdf* et /s/* — les listes et les fiches ' +
    'ne le sont pas. Pages rendues côté serveur (Rails/Turbo), aucun appel ' +
    'd’API à imiter, et aucun en-tête de cache : le site ne rend jamais 304. ' +
    'Entrée par la liste DÉPARTEMENTALE (3 pages de 20 le 2026-09-16, 47 ' +
    'biens pour tout le 06), filtrée sur les communes du périmètre ; les ' +
    'pages de commune existent pour toute la France mais coûtaient 13 pages ' +
    'de 113 Ko par passage. Le parc est publié EN ENTIER, loué compris : ' +
    'seuls les bandeaux « Disponible » et « Dispo le JJ/MM » sont des offres ' +
    '(2 sur 40 dans le périmètre le 2026-09-16, deux chambres d’une même ' +
    'colocation niçoise). La fiche donne l’adresse exacte, la position, le ' +
    'loyer charges comprises, la provision, le dépôt, les honoraires ' +
    'détaillés, le DPE ET le GES chiffrés, l’étage, les commodités et la ' +
    'galerie. Aucun téléphone ni e-mail : la candidature passe par ' +
    '/candidat/applications/new, que le robots.txt interdit — on ne la ' +
    'remplit pas, l’utilisateur clique lui-même.',
};

export const oqoroScraper: Scraper = {
  descriptor: OQORO_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const rentedRefs = new Set<string>();
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';
    let fullPass = false;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'incomplete';
        break;
      }
      const url = listUrl(page);
      try {
        const response = await context.fetch(url);
        requestCount += 1;
        if (response.notModified) {
          // Le site n'en envoie pas, mais un intermédiaire le pourrait : on ne
          // sait alors pas ce que portait la page, et rien ne conclut.
          stopReason = 'notModified';
          break;
        }
        pagesFetched += 1;

        const parsed = parseListPage(response.body, url);
        warnings.push(...parsed.warnings);
        for (const listing of parsed.listings) byRef.set(listing.sourceRef, listing);
        for (const ref of parsed.rentedRefs) rentedRefs.add(ref);

        // Une page incomplète est la dernière ; une page pleine au dernier tour
        // laisse du stock derrière elle, et l'inventaire ne fait plus foi.
        if (parsed.cards < CARDS_PER_PAGE) {
          fullPass = true;
          break;
        }
        if (page === MAX_PAGES) {
          warnings.push(`Liste tronquée : ${MAX_PAGES} pages pleines à ${url}`);
          stopReason = 'maxPages';
        }
      } catch (error) {
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

    const enriched = await enrichNewListings(context, [...byRef.values()], {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetail(html),
    });
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    const withdrawnRefs = withdrawnRefsFrom(context, enriched, stopReason);
    const parties = new Set(withdrawnRefs);
    const listings = enriched.listings.filter((listing) => !parties.has(listing.sourceRef));

    context.log('list.parsed', {
      listings: listings.length,
      rented: rentedRefs.size,
      pages: pagesFetched,
      details: enriched.pagesFetched,
    });

    return {
      sourceId: OQORO_DESCRIPTOR.id,
      listings,
      // Le bandeau « Occupé » ne vaut que pour une annonce qu'on a publiée : la
      // base ne connaît aucune des autres, et l'extinction ne vise qu'elle.
      rentedRefs: [...rentedRefs],
      withdrawnRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
      fullPass,
    };
  },
};
