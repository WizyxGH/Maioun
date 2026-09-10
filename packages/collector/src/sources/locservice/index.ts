/**
 * Source : LocService (locservice.fr) — voir l'étude dans `parser.ts`.
 *
 * UN PORTAIL DE PARTICULIERS, ce qui manquait : l'essentiel du stock du projet
 * vient d'agences. Neuf cent cinquante logements référencés pour Nice.
 *
 * Sondée le 2026-09-08 : `robots.txt` ouvre les pages de commune et ferme
 * l'espace locataire — on ne lit donc que les premières (§10). Quarante-sept
 * annonces par page.
 *
 * QUATRE PAGES PAR PASSAGE, et pas vingt : deux cents annonces suffisent à
 * rattraper les nouveautés d'un cycle, et l'arrêt anticipé (§9) coupe dès que
 * la page ne contient plus que du déjà-vu. Le stock entier entrerait en
 * quelques jours, sans peser sur personne (§30).
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
import { pageUrlFor, parseDetail, parseListPage } from './parser.js';

/** La page « toutes natures » d'une commune : appartements, studios, maisons. */
const NICE_BASE = 'https://www.locservice.fr/alpes-maritimes-06/location-nice';

/**
 * QUATRE PAGES SUR VINGT : nous ne voyions qu'un cinquième de la source.
 *
 * Le chiffre en base le criait sans que personne l'entende — 188 annonces,
 * soit EXACTEMENT quatre pages de quarante-sept. Un compte qui tombe juste sur
 * un multiple de sa propre limite n'est pas un inventaire, c'est un plafond.
 * L'en-tête de ce fichier annonçait d'ailleurs « neuf cent cinquante logements
 * référencés pour Nice », sans que rien ne rapproche les deux nombres.
 *
 * Dénombrement du 2026-09-09, par identifiant d'annonce : quarante-sept par
 * page jusqu'à la dix-neuvième, quarante-deux sur la vingtième, et au-delà le
 * site resert la vingtième — c'est donc la dernière. Soit **935 annonces**, là
 * où nous en prenions 188. Sept cent cinquante logements DE PARTICULIERS
 * échappaient à un inventaire qui, sans eux, est presque entièrement agence.
 *
 * CELA NE COÛTE PAS VINGT REQUÊTES PAR PASSAGE. La liste est triée par
 * fraîcheur et la boucle s'arrête sur la première page entièrement connue
 * (§9) : le prix des vingt pages n'est payé qu'au premier rattrapage, puis
 * deux pages suffisent — celle des nouveautés, et la suivante qui confirme
 * qu'on est retombé dans le connu (§30).
 */
const MAX_PAGES = 30;

/**
 * Tous les combien un passage relit l'inventaire EN ENTIER.
 *
 * Un passage ordinaire s'arrête dès qu'une page est entièrement connue — deux ou
 * trois pages sur une vingtaine. Le cycle de vie ne pouvait alors jamais
 * trancher : ~140 annonces vues pour un millier connues, et le garde-fou
 * « chute suspecte » le sautait à chaque fois. Les annonces parties restaient
 * affichées jusqu'au prochain rattrapage manuel — 109 le 2026-09-10. Toutes les
 * six heures, un passage va jusqu'au bout : une annonce disparue est retirée en
 * une journée au plus, pour une vingtaine de pages de plus quatre fois par jour.
 */
const FULL_PASS_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Fiches visitées par passage, pour les annonces NOUVELLES.
 *
 * La liste n'en donne qu'un avant-goût — 60 à 110 caractères, ni DPE, ni
 * disponibilité, une seule photo. Une quinzaine couvre largement ce qui paraît
 * en une demi-heure.
 */
const MAX_DETAILS = 15;

/** En rattrapage : tout le stock, une fois, pour compléter ce qui a été collecté avant. */
const MAX_DETAILS_BACKFILL = 1_100;

export const LOCSERVICE_DESCRIPTOR: SourceDescriptor = {
  id: 'locservice',
  name: 'LocService',
  domain: 'locservice.fr',
  kind: 'portal',
  method: 'html',
  // Priorité haute : du particulier, que les autres sources n'apportent pas.
  priority: 1,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    // Plafond du RATTRAPAGE, qui visite tout le stock. Un passage ordinaire
    // reste borné bien en dessous : ses pages par MAX_PAGES, ses fiches par
    // MAX_DETAILS.
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS_BACKFILL,
    maxListingsPerRun: 1_000,
    // Deux secondes entre deux pages : le rattrapage en demande vingt d'un
    // coup, ce qui n'arrive qu'une fois mais mérite d'être poli (§10).
    delayBetweenRequestsMs: 2_000,
  }),
  enabled: true,
  // LEUR MÉTIER EST LA MISE EN RELATION, contre paiement. On ne cherche donc
  // ni adresse ni téléphone, et l'on n'écrit jamais à leur place (§23, §24).
  manualOnly: true,
  // Et on le DIT à l'écran, avant le clic : découvrir le péage après avoir
  // ouvert l'annonce est une déception qu'un mot suffit à éviter.
  paidContact: true,
  allowedPaths: ['/alpes-maritimes-06/location-*'],
  notes:
    'Portail de particuliers. robots.txt vérifié le 2026-09-08 : ferme ' +
    '/locataires/consulter/, /locataires/match-*, /proprietaires/locations/ ' +
    'et /selections-* ; les pages de commune restent ouvertes, ce sont les ' +
    'seules lues. Cartes `li.accommodation-ad`, 47 par page, pagination ' +
    '`-pN.html`. Le contact passe par leur service payant : jamais extrait.',
};

export const locserviceScraper: Scraper = {
  descriptor: LOCSERVICE_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const bySourceRef = new Map<string, RawListing>();
    /** Les annonces des pages INCHANGÉES : toujours en ligne, pas retéléchargées. */
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    let stopReason: StopReason = 'completed';

    // Passage complet dû ? En rattrapage toujours ; sinon toutes les six heures.
    const last = context.lastFullPassAt === null ? Number.NaN : Date.parse(context.lastFullPassAt);
    const fullPassDue =
      context.mode === 'backfill' ||
      !Number.isFinite(last) ||
      Date.now() - last >= FULL_PASS_INTERVAL_MS;
    /** La liste a été lue jusqu'à sa fin — condition d'un passage complet. */
    let reachedEnd = false;
    /** Une page inchangée dont on ignore le contenu : l'inventaire est incomplet. */
    let pageInconnue = false;
    let firstPageSize = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (context.shouldStop()) {
        stopReason = 'maxPages';
        break;
      }
      const url = pageUrlFor(NICE_BASE, page);
      try {
        const response = await context.fetch(url);
        requestCount += 1;

        /**
         * PAGE INCHANGÉE (304). Ses annonces n'ont pas bougé : on relit ce
         * qu'elle portait, et elles valent confirmation. En marche courante on
         * s'arrête là — la liste est triée par fraîcheur, les suivantes sont
         * inchangées aussi. En passage complet on continue jusqu'au bout.
         */
        if (response.notModified) {
          const refs = await context.pageRefs.get(url);
          if (refs === null) pageInconnue = true;
          else confirmedRefs.push(...refs);
          if (!fullPassDue) break;
          if (refs !== null && refs.length < firstPageSize) {
            reachedEnd = true;
            break;
          }
          continue;
        }
        pagesFetched += 1;

        const parsed = parseListPage(response.body, url);
        // Une page vide est la fin de la liste — ou, en première page, un
        // gabarit changé : le premier avertissement suffit.
        if (parsed.listings.length === 0) {
          if (page === 1) warnings.push(...parsed.warnings);
          reachedEnd = page > 1;
          break;
        }
        if (page === 1) firstPageSize = parsed.listings.length;
        for (const listing of parsed.listings) bySourceRef.set(listing.sourceRef, listing);
        await context.pageRefs.set(
          url,
          parsed.listings.map((listing) => listing.sourceRef),
        );
        // Une page moins remplie que la première est la dernière.
        if (parsed.listings.length < firstPageSize) {
          reachedEnd = true;
          break;
        }

        /**
         * ARRÊT ANTICIPÉ : une page entièrement connue signale qu'on est
         * retombé dans le stock déjà collecté.
         *
         * SAUF QUAND UN PASSAGE COMPLET EST DÛ — rattrapage compris, et c'en
         * est tout l'objet. La liste est triée par fraîcheur : les premières
         * pages sont les plus susceptibles d'être connues, et l'arrêt se
         * déclenchait dès la deuxième, avant d'avoir atteint celles qu'on
         * venait chercher. Relevé le 2026-09-09 : « 94 annonces, 2 requêtes,
         * knownTerritory ».
         */
        if (
          !fullPassDue &&
          parsed.listings.every((listing) => context.isKnown(listing.sourceRef))
        ) {
          stopReason = 'knownTerritory';
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec de la page ${page} : ${message}`);
        context.log('list.failed', { url, error: message });
        stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
        break;
      }
    }

    /**
     * LES FICHES, pour ce que la liste ne dit pas : texte entier, DPE,
     * disponibilité, toutes les photos, et la nature réelle du bailleur. Les
     * nouvelles à chaque passage ; tout le stock en rattrapage.
     */
    const enriched = await enrichNewListings(context, [...bySourceRef.values()], {
      max: context.mode === 'backfill' ? MAX_DETAILS_BACKFILL : MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetail(html),
    });
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    const listings = [...enriched.listings];
    const fullPass = fullPassDue && reachedEnd && !pageInconnue && stopReason === 'completed';
    context.log('list.parsed', {
      listings: listings.length,
      confirmed: confirmedRefs.length,
      pages: pagesFetched,
      fullPass,
    });
    return {
      sourceId: LOCSERVICE_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
      fullPass,
    };
  },
};
