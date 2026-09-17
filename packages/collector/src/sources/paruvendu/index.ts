/**
 * Source : ParuVendu. Voir `parser.ts` pour ce que le portail publie.
 *
 * L'INVENTAIRE ENTIER À CHAQUE PASSAGE, sans arrêt anticipé : un cycle de vie
 * qui tranche à chaque fois — la leçon de LocService, où l'arrêt sur du
 * déjà-vu empêchait de jamais retirer une annonce partie.
 *
 * ET IL NE TRANCHAIT PLUS. Le portail ne sert que cinq pages de trente par
 * recherche, soit 150 annonces pour 160 annoncées à Nice : le compte n'y était
 * jamais, l'inventaire se déclarait `incomplete` — 131 passages sur 194 en
 * quatre jours — et un inventaire incomplet ne retire rien. Soixante-huit
 * annonces éteintes pour 156 actives : tout ce qui partait restait.
 *
 * LES TRANCHES PAR NOMBRE DE PIÈCES n'y suffisaient pas, et c'est mesuré : le
 * portail n'en propose que de 1 à 4, si bien que les T5 et plus, et les
 * annonces dont il ignore le nombre de pièces, n'appartenaient à aucune
 * tranche. LES BANDES DE LOYER, elles, partitionnent — tout loyer est dans une
 * et une seule — et leur somme se compare au total annoncé. Voir `PRICE_BANDS`.
 *
 * TREIZE COMMUNES ET DEUX TYPES DE BIEN, pas une seule recherche. On ne posait
 * qu'une question au portail : appartements à Nice. Quarante-deux appartements
 * des douze communes voisines et vingt-sept maisons n'étaient pas cherchés.
 *
 * Les pages inchangées (304) sont confirmées par la mémoire des pages.
 *
 * LES FICHES des annonces nouvelles sont lues ensuite, pour le code postal, les
 * charges, l'étage, la référence de l'annonceur et la description entière que
 * la carte n'a pas.
 *
 * DES DEMANDES DE LOGEMENT se cachent parmi les offres — un particulier qui
 * cherche, publié dans la rubrique de ceux qui proposent.
 *
 * LA RUBRIQUE DÉDIÉE NE SERT À RIEN POUR LES ÉVITER, et c'est mesuré. Le site
 * en a bien une, `/immobilier/demande-de-location/` (« avis de recherche »,
 * rubrique `IDELO000`), cinq pages de trente, que le menu ne montre nulle part
 * et que le `robots.txt` n'interdit pas. Mais c'est un espace de dépôt SÉPARÉ :
 * ses 159 annonces ne partagent AUCUN identifiant avec les offres que nous
 * collectons, et aucune des cinq demandes retrouvées en base n'y figurait. La
 * relire à chaque passage coûterait cinq pages pour une liste d'exclusion qui,
 * par construction, ne croise jamais rien. On ne la lit donc pas — elle a servi
 * de corpus d'essai, pas de garde-fou.
 *
 * Reste le texte, lu dès la carte : l'extrait de description commence par
 * l'intitulé qu'a écrit le déposant, et c'est là que la demande se déclare.
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
import { wantedAdEvidence } from '../../normalization/housing-wanted.js';
import { enrichNewListings } from '../shared/enrich.js';
import { withdrawnAfterEnrich } from '../shared/withdrawn.js';
import {
  inPerimeter,
  namesCommune,
  parseDetail,
  parseSearchPage,
  PRICE_BANDS,
  SEARCHES,
  searchUrl,
  type Search,
} from './parser.js';

/** Pages lues au plus par recherche ; le site n'en sert pas plus de cinq. */
const MAX_PAGES = 6;

/**
 * Pages de toutes les recherches : vingt-deux en pratique le 2026-09-16 — une
 * de référence, huit pour les cinq bandes de loyer niçoises, douze pour les
 * communes voisines, une pour les maisons du département. Le plafond laisse de
 * quoi grandir sans jamais couper un inventaire en deux.
 */
const MAX_LIST_PAGES = 30;

/** Fiches lues par passage : le stock se complète en quelques cycles. */
const MAX_DETAILS = 20;

export const PARUVENDU_DESCRIPTOR: SourceDescriptor = {
  id: 'paruvendu',
  name: 'ParuVendu',
  domain: 'paruvendu.fr',
  kind: 'portal',
  method: 'html',
  // Des particuliers, que presque aucune autre source n'apporte.
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: MAX_LIST_PAGES + MAX_DETAILS,
    // 210 annonces relevées le 2026-09-16 (160 à Nice, 42 dans les communes
    // voisines, 8 maisons) : le gabarit de famille en plafonnait 120.
    maxListingsPerRun: 300,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  // Le portail REPUBLIE des annonces d'agences — LocService, BEP, Citya… Deux
  // annonces de cette source qui partagent une photo sont donc le même bien.
  relaysListings: true,
  // Formulaire de dépôt libre : des locataires en quête d'un toit publient
  // parmi les offres. Cinq étaient en base le 2026-09-16.
  hostsWantedAds: true,
  allowedPaths: ['/immobilier/recherche/location/*', '/immobilier/location/*'],
  notes:
    'robots.txt revérifié le 2026-09-16 : ferme /immobilier/annonceimmofo/, ' +
    '/immobilier/annoncefo/, /communfo/popincommunfo/ et les paramètres ' +
    '?pagv=, ?tri=, ?d=, ?fulltext= ; la pagination ?p=N et les bornes de ' +
    'loyer ?px0=/?px1= restent ouvertes, et aucun Crawl-delay n’est demandé. ' +
    'CINQ PAGES DE TRENTE PAR RECHERCHE, pas une de plus, quel que soit le ' +
    'stock : l’inventaire niçois se lit donc par BANDES DE LOYER, dont la ' +
    'somme des totaux doit retrouver le total annoncé (4+23+55+40+38 = 160 le ' +
    '2026-09-16). Les tranches ?nbpieces= ne servent plus : le portail n’en ' +
    'propose que de 1 à 4 et laissait sept annonces hors de toute tranche. ' +
    'Treize communes et deux types de bien : Nice en appartement par bandes, ' +
    'douze communes voisines une requête chacune (42 annonces), les maisons du ' +
    'département en une requête (27, dont 22 à Nice). Le portail répond 200 et ' +
    'sert la recherche DÉPARTEMENTALE pour une commune sans annonce — quatre ' +
    'des douze le 2026-09-16 : le titre de la page est le seul garde-fou. ' +
    'La carte donne loyer CC, surface, pièces, chambres, DPE, photos en 320 px ' +
    'et le nom du déposant, mais son TITRE est un gabarit composé par le site ' +
    '(« Appartement - 2/3 pièce(s) - 50 m² ») : les 207 annonces actives du ' +
    '2026-09-17 en portaient un. La fiche ajoute LE TITRE DE L’ANNONCEUR — ' +
    '150 des 207 en ont un —, le code postal, les charges, le dépôt, les ' +
    'honoraires, l’étage, l’ascenseur, la référence de l’annonceur et les ' +
    'photos en 1 000 px. Ni téléphone ni courriel nulle part : le contact ' +
    'passe par une fenêtre que le robots.txt ferme.',
};

export const paruvenduScraper: Scraper = {
  descriptor: PARUVENDU_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const listings: RawListing[] = [];
    const confirmedRefs: string[] = [];
    const warnings: string[] = [];
    const counters = { requestCount: 0, pagesFetched: 0 };
    let stopReason: StopReason = 'completed';
    const passes: SearchPass[] = [];

    for (const search of SEARCHES) {
      const pass = await readSearch(context, search, counters);
      passes.push(pass);
      // Une bande ne répète que des annonces déjà lues ailleurs : on n'en garde
      // qu'une, et c'est la page de référence qui les apporte le plus souvent.
      const already = new Set(listings.map((listing) => listing.sourceRef));
      listings.push(...pass.listings.filter((listing) => !already.has(listing.sourceRef)));
      confirmedRefs.push(...pass.confirmedRefs);
      warnings.push(...pass.warnings);
      if (pass.stopReason !== 'completed') {
        stopReason = pass.stopReason;
        break;
      }
    }

    // Un inventaire à trou ne doit rien retirer.
    if (stopReason === 'completed') {
      const trou = inventoryGap(context, passes);
      if (trou !== null) {
        context.log('list.incomplete', trou);
        stopReason = 'incomplete';
      }
    }

    // DES DEMANDES chez les offres : des particuliers déposent ici leur
    // recherche de logement, et la rubrique, la carte et la fiche sont celles
    // d'une location ordinaire — seul le texte les trahit. Écartées APRÈS le
    // décompte, qui les a bien lues, et AVANT les fiches, qu'elles ne valent pas.
    // Chacune est NOMMÉE dans le journal, motif compris : une annonce qu'on
    // retire sur son texte doit pouvoir être revue.
    const offres = listings.filter((listing) => {
      const motif = wantedAdEvidence(listing.title, listing.description);
      if (motif === null) return true;
      context.log('demande.ecartee', {
        ref: listing.sourceRef,
        url: listing.sourceUrl,
        motif,
      });
      return false;
    });

    const enriched = await enrichNewListings(context, offres, {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html, listing) => parseDetail(html, listing.priceText),
    });
    counters.requestCount += enriched.requestCount;
    counters.pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    // Fiches que le site dit absentes : éteintes dès ce passage.
    const restantes = withdrawnAfterEnrich(context, enriched, stopReason);
    const parties = new Set(restantes.withdrawnRefs);

    return {
      sourceId: PARUVENDU_DESCRIPTOR.id,
      listings: restantes.listings,
      confirmedRefs: confirmedRefs.filter((ref) => !parties.has(ref)),
      withdrawnRefs: restantes.withdrawnRefs,
      requestCount: counters.requestCount,
      pagesFetched: counters.pagesFetched,
      stopReason,
      warnings,
    };
  },
};

interface SearchPass {
  readonly search: Search;
  readonly listings: readonly RawListing[];
  readonly confirmedRefs: readonly string[];
  readonly warnings: readonly string[];
  /** Le total que la recherche annonce, `null` s'il n'a pas été lu. */
  readonly totalCount: number | null;
  /** Les références lues ou confirmées, AVANT tout filtrage de périmètre. */
  readonly refs: ReadonlySet<string>;
  /** `true` si la lecture est allée jusqu'à la dernière page. */
  readonly finished: boolean;
  /** `true` si une page inchangée n'avait pas de mémoire : on ne sait pas ce qu'elle portait. */
  readonly pageInconnue: boolean;
  /** `true` si le portail a servi sa recherche départementale à la place. */
  readonly fallback: boolean;
  readonly stopReason: StopReason;
}

/**
 * Ce qui manque à l'inventaire pour faire foi, ou `null` s'il fait foi.
 *
 * TROIS CONDITIONS, et aucune ne se déduit d'une autre :
 *
 *   1. chaque recherche est allée jusqu'à sa dernière page, et en a rapporté
 *      autant d'annonces qu'elle en annonçait ;
 *   2. les bandes de loyer se REJOIGNENT sur le total niçois — une annonce qui
 *      n'entrerait dans aucune bande ferait tomber la somme à côté ;
 *   3. le portail n'a pas servi sa recherche départementale à la place de trop
 *      de communes : une seule est ordinaire — la commune n'a rien à louer —
 *      mais la moitié d'un coup sent le gabarit changé, pas le marché.
 */
function inventoryGap(
  context: ScrapeContext,
  passes: readonly SearchPass[],
): Record<string, unknown> | null {
  for (const pass of passes) {
    // La page de référence est TRONQUÉE par construction — trente annonces sur
    // cent soixante — et son total ne lui est pas opposable : il ne sert qu'à
    // vérifier la somme des bandes, plus bas.
    if (pass.search.reference === true || pass.fallback) continue;
    if (pass.pageInconnue) {
      return { recherche: pass.search.label, motif: 'page inchangée sans mémoire' };
    }
    if (!pass.finished) {
      return { recherche: pass.search.label, motif: 'dernière page non atteinte' };
    }
    if (pass.totalCount !== null && pass.refs.size < pass.totalCount) {
      return { recherche: pass.search.label, lues: pass.refs.size, annoncees: pass.totalCount };
    }
  }

  const facultatives = passes.filter((pass) => pass.search.mayBeEmpty === true);
  const replis = facultatives.filter((pass) => pass.fallback);
  for (const pass of replis) context.log('commune.repli', { recherche: pass.search.label });
  if (replis.length * 2 > facultatives.length) {
    return { motif: 'repli départemental', communes: replis.length, sur: facultatives.length };
  }

  const reference = passes.find((pass) => pass.search.reference === true);
  const bandes = passes.filter(
    (pass) => pass.search.minPrice !== undefined || pass.search.maxPrice !== undefined,
  );
  const totaux = bandes.map((pass) => pass.totalCount);
  if (
    reference?.totalCount != null &&
    bandes.length === PRICE_BANDS.length &&
    totaux.every((total): total is number => total !== null)
  ) {
    const somme = totaux.reduce((total, band) => total + band, 0);
    if (somme !== reference.totalCount) {
      return { motif: 'bandes de loyer', somme, annoncees: reference.totalCount };
    }
  }
  return null;
}

/** Lit une recherche jusqu'à sa dernière page. */
async function readSearch(
  context: ScrapeContext,
  search: Search,
  counters: { requestCount: number; pagesFetched: number },
): Promise<SearchPass> {
  const listings: RawListing[] = [];
  const confirmedRefs: string[] = [];
  const warnings: string[] = [];
  const refs = new Set<string>();
  let totalCount: number | null = null;
  let pageInconnue = false;
  let finished = false;
  let fallback = false;
  let stopReason: StopReason = 'completed';

  // La page de référence ne sert qu'à lire le total : les bandes en rendent le
  // détail, et la relire page à page coûterait cinq requêtes pour rien.
  const maxPages = search.reference === true ? 1 : MAX_PAGES;

  for (let page = 1; page <= maxPages; page += 1) {
    if (context.shouldStop()) {
      // Le budget coupe au milieu des recherches : l'inventaire est partiel, et
      // `maxPages` le ferait passer pour concluant — ce qui éteindrait tout ce
      // que les recherches suivantes auraient confirmé.
      stopReason = 'incomplete';
      break;
    }
    const url = searchUrl(search, page);
    try {
      const response = await context.fetch(url);
      counters.requestCount += 1;

      if (response.notModified) {
        // Page inchangée : ses annonces aussi. On ne sait pas si elle a une
        // suivante — on continue, une page vide dira la fin.
        const known = await context.pageRefs.get(url);
        pageInconnue ||= known === null;
        confirmedRefs.push(...(known ?? []));
        for (const ref of known ?? []) refs.add(ref);
        continue;
      }
      counters.pagesFetched += 1;

      const parsed = parseSearchPage(response.body, url);
      // LE PORTAIL RÉPOND 200 EN SERVANT SA RECHERCHE DÉPARTEMENTALE pour une
      // commune qui n'a rien à louer. Sans ce contrôle, trente annonces de
      // Grasse ou de Cannes entreraient comme niçoises.
      if (search.commune !== undefined && !namesCommune(parsed.heading, search.commune)) {
        fallback = true;
        finished = true;
        break;
      }
      if (page === 1) totalCount = parsed.totalCount;
      if (parsed.listings.length === 0) {
        if (page === 1) warnings.push(...parsed.warnings);
        finished = true;
        break;
      }
      for (const listing of parsed.listings) refs.add(listing.sourceRef);
      // Une recherche qui déborde le périmètre — les maisons du département —
      // rapporte des communes qu'on ne suit pas : elles ne sont pas collectées,
      // mais elles comptent dans ce que la page annonçait.
      listings.push(
        ...(search.beyondPerimeter === true
          ? parsed.listings.filter((listing) => inPerimeter(listing.cityText))
          : parsed.listings),
      );
      await context.pageRefs.set(
        url,
        parsed.listings.map((listing) => listing.sourceRef),
      );
      // Le plafond de pages n'est PAS une fin d'inventaire : s'il est atteint,
      // `finished` reste faux et le passage se déclare incomplet.
      if (!parsed.hasNextPage) {
        finished = true;
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de ${search.label}, page ${page} : ${message}`);
      context.log('list.failed', { url, error: message });
      stopReason = message.includes('429') ? 'rateLimited' : 'tooManyErrors';
      break;
    }
  }
  return {
    search,
    listings,
    confirmedRefs,
    warnings,
    totalCount,
    refs,
    finished,
    pageInconnue,
    fallback,
    stopReason,
  };
}
