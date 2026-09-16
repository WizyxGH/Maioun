/**
 * Source : FNAIM — voir l'étude dans `parser.ts` et la fiche de
 * `docs/sources.md`.
 *
 * C'est la réponse à « réduire la dépendance aux alertes e-mail de SeLoger » :
 * 193 agences niçoises publient sur ce portail, dont beaucoup n'ont pas de
 * site scrapable, et chaque carte donne le nom de l'agence ET son téléphone.
 *
 * TREIZE COMMUNES ET DEUX TYPES DE BIEN, pas une seule recherche. Nice en
 * appartement était complète — 173 annonces, sept pages, vérifiées une à une le
 * 2026-09-16 — mais c'était tout ce que nous demandions au portail : les
 * maisons et les douze autres communes suivies n'étaient tout simplement pas
 * cherchées. Quarante-huit annonces de plus, treize requêtes de plus.
 *
 * LE TRI PAR PRIX CROISSANT NE SERT PLUS À ÉCONOMISER DES PAGES — on les lit
 * toutes — mais il reste un filet : si le budget venait à manquer en cours de
 * route, ce qui se perdrait serait le haut du marché, jamais la tranche
 * recherchée.
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
import { listUrl, parseDetail, parseListPage, SEARCHES } from './parser.js';

/**
 * Pages lues au plus PAR RECHERCHE.
 *
 * Nice en occupe sept — cent soixante-treize annonces le 2026-09-16 — et les
 * douze autres communes une seule chacune. Dix laissent de la marge à Nice sans
 * rien coûter : la lecture s'arrête au lien « page suivante ».
 */
const MAX_PAGES_PER_SEARCH = 10;

/**
 * Budget de pages du passage entier : vingt et une en pratique (sept pour
 * Nice, une par commune, deux pour les maisons du département). Le plafond
 * laisse de quoi grandir sans jamais couper un inventaire en deux.
 */
const MAX_PAGES = 30;

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
    maxListingsPerRun: 250,
  }),
  enabled: true,
  allowedPaths: ['/liste-annonces-immobilieres/*'],
  notes:
    'robots.txt revérifié le 2026-09-16 : les listes sont autorisées, les ' +
    'fiches de location NON (/annonce-immobiliere/*/18-location*) — elles ne ' +
    'sont pas lues. Pages entièrement rendues côté serveur, ' +
    '25 annonces par page, pagination SEO `…-nice-06000-page-N.htm` SANS ' +
    'querystring (celle du gabarit en porte une, on ne l’utilise pas), et un ' +
    'lien « Page suivante » qui dit seul où s’arrêter. ' +
    'La recherche par 06000 remonte aussi les 06100/06200/06300 : une seule ' +
    'URL couvre Nice. BUDGET : vingt et une pages par passage (sept pour ' +
    'Nice, une par commune suivie, deux pour les maisons du département), ' +
    'pour 221 annonces relevées le 2026-09-16 contre 173 avec la seule ' +
    'recherche niçoise. La recherche départementale des APPARTEMENTS est ' +
    'écartée : tronquée à 225 annonces pour tout le 06, il lui en manque 67 ' +
    'de Nice. Le portail répond 200 et sert son ACCUEIL à un slug de commune ' +
    'qu’il ne connaît pas — il abrège « st-laurent-du-var », « st-andre ». ' +
    'Résultats triés par loyer croissant, ce qui laisse le haut du marché en ' +
    'dernier si le budget manquait. Les cartes portent le nom de ' +
    'l’agence, son téléphone en clair, le code postal et la commune sous la ' +
    'description, et une description qui contient ' +
    'souvent l’adresse en toutes lettres (§14, §20). La carte coupe la ' +
    'description vers 250 caractères et ne publie ni charges, ni honoraires, ' +
    'ni dépôt, ni DPE, ni disponibilité : tout cela n’est que sur la fiche, ' +
    'interdite.',
};

export const fnaimScraper: Scraper = {
  descriptor: FNAIM_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    // Une page inchangée ou manquée laisse un trou : l'inventaire ne fait plus
    // foi, et rien ne doit être retiré sur cette base.
    let incomplete = false;

    recherches: for (const search of SEARCHES) {
      for (let page = 1; page <= MAX_PAGES_PER_SEARCH; page += 1) {
        if (context.shouldStop()) {
          // Le budget coupe au milieu des recherches : l'inventaire est partiel,
          // et un inventaire partiel ne doit rien condamner.
          stopReason = 'incomplete';
          break recherches;
        }
        const url = listUrl(search, page);
        try {
          const response = await context.fetch(url);
          requestCount += 1;
          if (response.notModified) {
            // On ne sait pas ce que portait cette page : on passe à la suivante,
            // une page vide dira la fin.
            incomplete = true;
            continue;
          }
          pagesFetched += 1;

          const parsed = parseListPage(response.body, url, search);
          warnings.push(...parsed.warnings);
          if (page === 1 && !parsed.recognized) {
            // Le portail a servi son accueil : le slug ne lui dit rien.
            warnings.push(`Recherche inconnue du portail : ${search.slug}`);
            context.log('search.unknown', { url });
            incomplete = true;
            break;
          }
          for (const listing of parsed.listings) byRef.set(listing.sourceRef, listing);
          // Pas d'arrêt sur une page sans annonce : celle des maisons peut
          // n'en garder aucune et pourtant continuer.
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
          break recherches;
        }
      }
    }

    if (incomplete && stopReason === 'completed') stopReason = 'notModified';

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
      searches: SEARCHES.length,
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
