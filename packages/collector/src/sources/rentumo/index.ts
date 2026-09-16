/**
 * Source : Rentumo — voir l'étude dans `parser.ts` et la fiche de
 * `docs/sources.md`.
 *
 * AGRÉGATEUR, et collecté en connaissance de cause (décision utilisateur du
 * 2026-09-03) : il republie des annonces sans jamais lier l'annonce d'origine
 * ni publier de coordonnées — celles-ci sont floutées derrière un abonnement
 * payant. Ce qu'il apporte, ce sont des biens venus de portails auxquels le
 * projet n'a aucun accès conforme (§10), avec assez de faits pour décider s'il
 * vaut la peine de les chercher ailleurs.
 *
 * LES FICHES DES NOUVELLES seulement, en plus des pages de résultats : la
 * carte ne donne qu'une accroche, la fiche le texte entier de l'annonce
 * d'origine (voir `parseDetail`).
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
import { enrichNewListings, REJECTED_DRAFT } from '../shared/enrich.js';
import type { RawDraft } from '../shared/raw-listing.js';
import { isWithdrawnDraft, parseDetailResponse, parseListPage } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

const ORIGIN = 'https://rentumo.com';

/** La fiche répond aussi à la seule référence de la carte (vérifié le 2026-09-15). */
const listingUrl = (reference: string): string => `${ORIGIN}/listings/${reference}`;

/**
 * Connues absentes des pages lues, dont on relit la fiche par passage : la
 * liste s'arrête aux nouveautés, et une annonce désactivée n'y reparaît pas.
 */
const MAX_WITHDRAWN_CHECKS = 4;

/** Une fiche vérifiée ne l'est pas de nouveau avant un jour. */
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;

/** Page de résultats par commune. 21 annonces par page. */
const LIST_URL = `${ORIGIN}/rent-apartment/nice`;

/**
 * Pages parcourues par exécution, TOUTES lues, même déjà connues.
 *
 * La liste n'est PAS classée par fraîcheur : relevé le 2026-09-16, la première
 * carte datait d'un an et la deuxième de six mois. S'arrêter sur une page
 * entièrement connue reposait donc sur une règle fausse, et gelait
 * l'inventaire : quatre-vingt-trois annonces sur cent vingt-cinq n'étaient plus
 * revues depuis six jours, et soixante-six fiches déjà téléchargées gardaient
 * leur texte en mémoire sans jamais l'appliquer.
 *
 * Trois requêtes de plus par passage, sur une source qui pèse un demi-pour-cent
 * du trafic.
 */
const MAX_PAGES = 4;

/** Fiches lues par passage : les nouveautés d'un cycle, pages de 450 Ko. */
const MAX_DETAILS = 10;

/** En rattrapage : le stock entier, environ 120 annonces. */
const MAX_DETAILS_BACKFILL = 150;

export const RENTUMO_DESCRIPTOR: SourceDescriptor = {
  id: 'rentumo',
  name: 'Rentumo',
  domain: 'rentumo.com',
  kind: 'aggregator',
  method: 'html',
  // Priorité basse : donnée de seconde main, sans lien vers l'annonce
  // d'origine. Une source directe qui publie le même bien doit primer (§13).
  priority: 4,
  schedule: scheduleFor('aggregator'),
  budget: budgetFor('aggregator', {
    maxPagesPerRun: MAX_PAGES + MAX_DETAILS_BACKFILL + MAX_WITHDRAWN_CHECKS,
    maxListingsPerRun: 100,
  }),
  enabled: true,
  // Agrégateur : les photos décodées portent l'URL d'origine, propre à UNE
  // annonce — deux fiches qui la partagent sont le même bien (§14).
  relaysListings: true,
  // Les coordonnées de l'annonceur sont réservées aux abonnés : on le dit
  // avant le clic, comme pour LocService.
  paidContact: true,
  allowedPaths: ['/rent-apartment/*', '/listings/*'],
  notes:
    'robots.txt vérifié le 2026-09-03 : Allow: / ; seuls *?sort_by=*, ' +
    '/users/sign_in et /search-agents/new sont interdits — les listes et les ' +
    'fiches sont autorisées. Pages entièrement rendues côté serveur, 21 ' +
    'annonces par page, pagination `?page=N` déclarée en <link rel="next">. ' +
    'AGRÉGATEUR : aucun lien vers l’annonce d’origine, coordonnées floutées ' +
    'derrière un abonnement payant, et champs annoncés comme « extraits par ' +
    'IA » — on ne retient donc que ce que la carte affiche tel quel, et, sur ' +
    'la fiche, le titre et le texte d’origine recopiés dans le JSON-LD, et la ' +
    'localisation affichée (#address ; le code postal du JSON-LD vaut 06000 ' +
    'par défaut et n’est pas repris). Le loyer affiché est HORS CHARGES : il ' +
    'part avec la mention, sans quoi la copie passe pour moins chère que ' +
    'l’originale. Les ' +
    'photos passent par un proxy dont l’URL encode en base64 l’adresse ' +
    'D’ORIGINE : on la décode, ce qui donne la photo en pleine qualité et ' +
    'révèle l’hébergeur du site source (FNAIM, La Boîte Immo, Orpi…). ' +
    'CE QU’ON LAISSE, ET POURQUOI (relevé du 2026-09-16) : la fiche affiche ' +
    'un bloc « Property features / About the rental » dont le site marque ' +
    'lui-même les champs devinés (data-popover-target=llm-extraction-popup-*), ' +
    'mais ceux qu’il ne marque PAS se trompent aussi — « Furnished: No » sur ' +
    'un studio dont le titre dit « LOCATION MEUBLÉE », « Utilities: 234 € » ' +
    'sur un 18 m² à 510 € dont le texte d’origine n’annonce aucun montant. ' +
    'La carte porte aussi les coordonnées du bien, dans l’image de repli du ' +
    'carrousel (osm-maps.rentumo.com/get_map?lat=…) : elles sont fausses — ' +
    '2,4 km d’écart pour une annonce rue Saint-François-de-Paule — et une ' +
    'même position sert de défaut à plusieurs annonces. La fiche, enfin, ' +
    'n’expose qu’UNE photo du bien, les autres étant derrière l’inscription : ' +
    'la carte, qui en donne jusqu’à six, reste la meilleure source d’images.',
};

/** Âge de la mémoire d'une fiche ; illisible ou absente, elle passe en premier. */
function memoryTime(context: ScrapeContext, reference: string): number {
  const at = Date.parse(context.detailMemory.get(reference)?.fetchedAt ?? '');
  return Number.isFinite(at) ? at : 0;
}

/**
 * Relit la fiche des annonces connues que les pages lues ne portaient pas, les
 * moins récemment lues d'abord. Une fiche injoignable ne prouve rien.
 */
async function checkVanished(
  context: ScrapeContext,
  seen: ReadonlySet<string>,
): Promise<{ withdrawn: string[]; requestCount: number; pagesFetched: number }> {
  const nowMs = Date.now();
  const due = [...context.knownRefs]
    .filter((reference) => !seen.has(reference))
    .filter((reference) => !isWithdrawnDraft(context.detailMemory.get(reference)?.draft))
    .filter((reference) => nowMs - memoryTime(context, reference) >= RECHECK_AFTER_MS)
    .sort((a, b) => memoryTime(context, a) - memoryTime(context, b))
    .slice(0, MAX_WITHDRAWN_CHECKS);

  const withdrawn: string[] = [];
  const learned: { sourceRef: string; draft: RawDraft }[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  for (const reference of due) {
    if (context.shouldStop()) break;
    const previous = context.detailMemory.get(reference)?.draft;
    try {
      const page = await context.fetch(listingUrl(reference), { redirect: 'manual' });
      requestCount += 1;
      if (page.notModified) {
        if (previous !== undefined) learned.push({ sourceRef: reference, draft: previous });
        continue;
      }
      pagesFetched += 1;
      const draft = parseDetailResponse(page.body, {
        status: page.status,
        location: page.headers['location'] ?? null,
      });
      if (draft !== null && isWithdrawnDraft(draft)) withdrawn.push(reference);
      learned.push({ sourceRef: reference, draft: draft ?? previous ?? REJECTED_DRAFT });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('withdrawn.check_failed', { reference, error: message });
      if (message.includes('429')) break;
    }
  }

  if (learned.length > 0) {
    try {
      await context.detailMemory.save(learned);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('detail.memory_failed', { count: learned.length, error: message });
    }
  }
  return { withdrawn, requestCount, pagesFetched };
}

export const rentumoScraper: Scraper = {
  descriptor: RENTUMO_DESCRIPTOR,

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
      const url = page === 1 ? LIST_URL : `${LIST_URL}?page=${page}`;
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

        // Pas d'arrêt sur une page déjà connue : voir `MAX_PAGES`. Une annonce
        // revue est une annonce dont on rafraîchit la date et à qui on
        // réapplique sa fiche mémorisée, sans une requête de plus.
        if (!parsed.hasNext) break;
      } catch (error) {
        // §69 : échec propre, les autres sources continuent.
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Échec sur ${url} : ${message}`);
        context.log('page.failed', { url, error: message });
        stopReason = stopReasonFromError(message);
        break;
      }
    }

    // Les fiches APRÈS la pagination, et aucune après un 429.
    const halted = stopReason === 'rateLimited' || stopReason === 'blocked';
    const enriched = await enrichNewListings(context, [...byRef.values()], {
      max: halted ? 0 : context.mode === 'backfill' ? MAX_DETAILS_BACKFILL : MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      // Non suivie : la redirection EST le signe du retrait.
      redirect: 'manual',
      parse: (html, _listing, page) => parseDetailResponse(html, page),
    });
    requestCount += enriched.requestCount;
    pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    const checked = halted
      ? { withdrawn: [], requestCount: 0, pagesFetched: 0 }
      : await checkVanished(context, new Set(byRef.keys()));
    requestCount += checked.requestCount;
    pagesFetched += checked.pagesFetched;

    // Retirée d'après sa fiche, lue maintenant ou mémorisée : la carte ne la
    // ramène pas.
    const listings = enriched.listings.filter((listing) => !isWithdrawnDraft(listing));
    const withdrawnRefs = [
      ...enriched.listings.filter((listing) => isWithdrawnDraft(listing)).map((l) => l.sourceRef),
      ...checked.withdrawn,
    ];
    context.log('list.parsed', {
      listings: listings.length,
      known: listings.filter((listing) => context.isKnown(listing.sourceRef)).length,
      withdrawn: withdrawnRefs.length,
    });

    return {
      sourceId: RENTUMO_DESCRIPTOR.id,
      listings,
      withdrawnRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    };
  },
};
