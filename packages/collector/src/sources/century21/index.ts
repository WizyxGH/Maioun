/**
 * Source : Century 21 (réseau d'agences).
 *
 * Le verdict initial « écartée » reposait sur une lecture trop rapide du
 * robots.txt : seules les recherches par CODE POSTAL (`cp-…`) et par agence
 * sont interdites — le format par ville `/annonces/location-appartement/v-nice/`
 * ne l'est pas, s'affiche en SSR et se déclare lui-même indexable. Corrigé le
 * 2026-08-15, voir docs/sources.md.
 *
 * UNE SEULE RECHERCHE POUR TOUT UN RÉSEAU, ET ELLE EN VOYAIT MOINS DE LA
 * MOITIÉ. Dénombrement du 2026-09-17, à partir des totaux que le site publie
 * lui-même : 46 logements à louer dans le périmètre, contre 20 lus. Trois
 * restrictions se cumulaient, toutes invisibles :
 *
 *   - la page n'affiche QUE VINGT annonces et la seconde n'était jamais
 *     demandée : douze manquaient à Nice ;
 *   - une seule commune était interrogée, alors que le réseau publie aussi à
 *     Saint-Laurent-du-Var (3), Cap-d'Ail (3), Villeneuve-Loubet (2) et
 *     Cagnes-sur-Mer (1) ;
 *   - un seul type de bien : les MAISONS (Nice 2, Villefranche 2, Beaulieu 1)
 *     ont leur propre recherche, qu'on ne faisait pas.
 *
 * Vérification faite en base le même jour : 23 des 46 annonces du site étaient
 * absentes de l'inventaire, neuf d'entre elles sur la seule deuxième page
 * niçoise. Elles nous revenaient par Bien'ici et ParuVendu, sans commune ni
 * téléphone.
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
import { portalCommuneSlugs } from '../shared/communes.js';
import { slugify } from '../../normalization/text.js';
import { enrichNewListings } from '../shared/enrich.js';
import { withdrawnAfterEnrich } from '../shared/withdrawn.js';
import { parseDetail, parseSearchPage } from './parser.js';
import { stopReasonFromError } from '../shared/stop-reason.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES seulement.
 *
 * LA CARTE TRONQUE, et le site l'annonce : le fragment qu'elle affiche porte
 * la classe `tw-truncate-safe`. Relevé du 2026-09-08 — 238 caractères de
 * moyenne sur les trente-quatre annonces en base, coupés en plein mot, contre
 * 577 sur la fiche, adresse de rue comprise. (La fiche porte aussi une
 * traduction anglaise : le parseur ne retient que le français.)
 *
 * Douze par passage : le stock du périmètre approche la cinquantaine, de quoi
 * le rattraper en quatre passages puis absorber les parutions.
 */
const MAX_DETAILS = 12;

/** Pages de liste par recherche. Nice en appartement en occupe deux. */
const MAX_PAGES_PER_SEARCH = 6;

/**
 * Les types de bien à louer, chacun avec sa propre recherche.
 *
 * Le site n'a pas de recherche « toutes locations » : `/annonces/location/v-…`
 * répond 410. Les parkings et locaux, eux, ne sont pas des logements et ne sont
 * pas demandés.
 */
const PROPERTY_TYPES = ['appartement', 'maison'] as const;

/**
 * Les communes du périmètre, écrites comme Century 21 les attend.
 *
 * Le site abrège « saint » en « st » et sépare les mots par des espaces, que
 * l'URL encode en `+` — « st+laurent+du+var », « cap+d+ail ». Le slug canonique
 * du projet porte déjà l'apostrophe en tiret (« cap-d-ail ») : la règle
 * « abréger saint » et le remplacement des tirets suffisent à toutes les
 * treize.
 *
 * Les communes où le réseau n'a rien à louer restent demandées : elles coûtent
 * une requête, et le jour où une agence y ouvrira, la page existera sans qu'on
 * ait à y penser. Le site répond alors de deux façons, toutes deux lues comme
 * un silence et non comme un trou : le bandeau « Nos biens actuels ne
 * correspondent pas à votre recherche », ou un 410 pour une ville qu'il ne
 * connaît pas du tout (Contes, le 2026-09-17).
 */
const COMMUNES = portalCommuneSlugs({ abbreviateSaint: true });

const searchUrl = (type: string, commune: string, page: number): string => {
  const base = `https://www.century21.fr/annonces/location-${type}/v-${commune.replace(/-/g, '+')}/`;
  return page === 1 ? base : `${base}page-${String(page)}/`;
};

export const CENTURY21_DESCRIPTOR: SourceDescriptor = {
  id: 'century21',
  name: 'Century 21',
  domain: 'century21.fr',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  // SOIXANTE MINUTES, ET NON QUARANTE-CINQ : lire les treize communes dans les
  // deux types de bien coûte vingt-six requêtes de liste au lieu d'une. On paie
  // l'exhaustivité par l'espacement plutôt qu'en renonçant à des communes —
  // même arbitrage que pour Orpi, et le rythme se resserre de lui-même quand la
  // source publie.
  schedule: scheduleFor('agencyNetwork', { baseIntervalMinutes: 60 }),
  budget: budgetFor('agencyNetwork', {
    // Le budget compte TOUTES les requêtes : une par recherche, la pagination
    // de celles qui débordent, puis les fiches nouvelles.
    maxPagesPerRun: COMMUNES.length * PROPERTY_TYPES.length + MAX_PAGES_PER_SEARCH + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: [
    '/annonces/location-appartement/v-*',
    '/annonces/location-maison/v-*',
    '/trouver_logement/detail/*',
  ],
  notes:
    'robots.txt vérifié le 2026-08-15, relu le 2026-09-17 : cp-* et ' +
    '/a/*/annonces/ interdits (recherches par code postal et par agence), les ' +
    'formats par ville location-appartement/v-* et location-maison/v-* ne le ' +
    'sont pas (SSR, meta robots index), et les fiches /trouver_logement/detail/ ' +
    'non plus — seul /a/*/trouver_logement/, la variante par agence, est fermé. ' +
    'TREIZE COMMUNES du périmètre et DEUX TYPES de bien : 46 logements annoncés ' +
    'le 2026-09-17 contre 20 pour la seule recherche « appartement à Nice ». ' +
    'VINGT ANNONCES PAR PAGE et le site PUBLIE SON TOTAL en tête de liste ' +
    '(« 32 annonces immobilières ») : c’est lui qui dit si l’inventaire a été lu ' +
    'en entier. Au-delà de sa dernière page le site répond 200 en resservant la ' +
    'page 1 — seule la flèche « suivant » de la barre de pagination est suivie. ' +
    'Une ville sans stock rend un bandeau « aucun bien ne correspond », une ' +
    'ville inconnue un 410 : ni l’un ni l’autre n’est un trou. Réf. agence dans ' +
    'le h3. Les fiches des annonces nouvelles sont visitées (12 par exécution) : ' +
    'la carte tronque la description, et seule la fiche porte montants, ' +
    'disponibilité, DPE et téléphone de l’agence.',
};

/**
 * Manque toléré face au total annoncé avant de tenir l'inventaire pour
 * incomplet. Le site publie ses totaux à la minute et une annonce peut paraître
 * ou partir pendant le passage ; exiger l'égalité stricte rendrait la source
 * incomplète au moindre battement.
 */
function tolerated(total: number): number {
  return Math.max(2, Math.ceil(total * 0.03));
}

interface Counters {
  requestCount: number;
  pagesFetched: number;
}

interface SearchPass {
  readonly listings: readonly RawListing[];
  readonly incomplete: boolean;
  readonly stopReason: StopReason;
}

export const century21Scraper: Scraper = {
  descriptor: CENTURY21_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const warnings: string[] = [];
    const withdrawnRefs: string[] = [];
    const counters: Counters = { requestCount: 0, pagesFetched: 0 };
    let stopReason: StopReason = 'completed';
    let incomplete = false;

    for (const type of PROPERTY_TYPES) {
      for (const commune of COMMUNES) {
        const pass = await readSearch(context, type, commune, counters, warnings);
        for (const listing of pass.listings) {
          if (!byRef.has(listing.sourceRef)) byRef.set(listing.sourceRef, listing);
        }
        incomplete ||= pass.incomplete;
        if (pass.stopReason !== 'completed') {
          stopReason = pass.stopReason;
          break;
        }
      }
      if (stopReason !== 'completed') break;
    }

    // TOUT LE PÉRIMÈTRE MUET N'EST JAMAIS CRÉDIBLE : si aucune recherche n'a
    // rien rendu alors qu'on connaît déjà des annonces, c'est le gabarit ou les
    // adresses qui ont changé, et rien ne doit s'éteindre là-dessus.
    if (byRef.size === 0 && context.knownRefs.size > 0) {
      warnings.push('Aucune annonce sur aucune commune — gabarit probablement modifié');
      incomplete = true;
    }
    if (incomplete && stopReason === 'completed') stopReason = 'incomplete';

    // LA CARTE TRONQUE — sa classe s'appelle `tw-truncate-safe`. La fiche des
    // annonces NOUVELLES porte le texte entier, souvent précédé de l'adresse de
    // rue. Une fois les listes finies, pour ne visiter chaque annonce qu'une fois.
    const enriched = await enrichNewListings(context, [...byRef.values()], {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html) => parseDetail(html),
    });
    counters.requestCount += enriched.requestCount;
    counters.pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    // Fiches que le site dit absentes : éteintes dès ce passage.
    const restantes = withdrawnAfterEnrich(context, enriched, stopReason);
    withdrawnRefs.push(...restantes.withdrawnRefs);

    context.log('list.parsed', {
      found: byRef.size,
      communes: COMMUNES.length,
      pages: counters.pagesFetched,
      details: enriched.pagesFetched,
    });

    return {
      sourceId: CENTURY21_DESCRIPTOR.id,
      listings: restantes.listings,
      withdrawnRefs,
      requestCount: counters.requestCount,
      pagesFetched: counters.pagesFetched,
      stopReason,
      warnings,
      fullPass: stopReason === 'completed',
    };
  },
};

/**
 * Lit une recherche (un type de bien dans une commune) jusqu'à son total
 * annoncé.
 *
 * TROIS FAÇONS DE S'ARRÊTER, et une seule est une conclusion : avoir lu autant
 * de cartes que le site en annonce. Les deux autres — plus de flèche
 * « suivant », plafond de pages — laissent l'inventaire en doute, et le disent.
 */
async function readSearch(
  context: ScrapeContext,
  type: string,
  commune: string,
  counters: Counters,
  warnings: string[],
): Promise<SearchPass> {
  const listings: RawListing[] = [];
  const refs = new Set<string>();
  let announcedTotal: number | null = null;
  let incomplete = false;
  /** Le réseau ne publie rien ici : zéro annonce, et pas un trou. */
  let muette = false;
  let url: string | null = searchUrl(type, commune, 1);

  for (let page = 1; url !== null && page <= MAX_PAGES_PER_SEARCH; page += 1) {
    if (context.shouldStop()) {
      // Le budget coupe au milieu du périmètre : inventaire partiel, et un
      // inventaire partiel ne condamne rien.
      return { listings, incomplete: true, stopReason: 'incomplete' };
    }

    const pageUrl: string = url;
    url = null;
    let response;
    try {
      response = await context.fetch(pageUrl);
      counters.requestCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${pageUrl} : ${message}`);
      context.log('page.failed', { url: pageUrl, error: message });
      return { listings, incomplete: true, stopReason: stopReasonFromError(message) };
    }

    // Une ville dont le site n'a jamais entendu parler répond 410 (Contes, le
    // 2026-09-17). Elle n'a rien à publier : son silence n'est ni un incident
    // ni un trou, et l'exiger ferait de la source une source éternellement
    // incomplète.
    if (response.status === 404 || response.status === 410) {
      context.log('recherche.inconnue', { url: pageUrl, status: response.status });
      return { listings, incomplete: false, stopReason: 'completed' };
    }

    if (response.notModified) {
      context.log('page.not_modified', { url: pageUrl });
      break;
    }

    counters.pagesFetched += 1;
    const parsed = parseSearchPage(response.body, pageUrl);
    if (parsed.empty) {
      // Le bandeau ne vaut silence que sur la PREMIÈRE page : plus loin dans la
      // pagination, il dit que la suite promise n'est pas venue, et le total
      // annoncé doit encore être confronté à ce qu'on a lu.
      muette = page === 1;
      break;
    }

    // Une page qui annonce une AUTRE commune n'est pas celle qu'on a demandée :
    // ce qu'elle porte appartient à quelqu'un d'autre, et on n'en lit rien.
    if (parsed.headingCity !== null && slugify(parsed.headingCity) !== commune) {
      warnings.push(`Century 21 a servi « ${parsed.headingCity} » pour ${commune}`);
      context.log('recherche.autre_commune', { url: pageUrl, servie: parsed.headingCity });
      return { listings, incomplete: true, stopReason: 'completed' };
    }

    warnings.push(...parsed.warnings);
    if (page === 1) announcedTotal = parsed.announcedTotal;
    for (const listing of parsed.listings) {
      if (refs.has(listing.sourceRef)) continue;
      refs.add(listing.sourceRef);
      listings.push(listing);
    }

    if (parsed.listings.length === 0) break;
    if (page === MAX_PAGES_PER_SEARCH) incomplete = true;
    else url = parsed.nextPageUrl;
  }

  if (muette) {
    context.log('recherche.vide', { type, commune });
  } else if (announcedTotal === null) {
    // Sans total publié, on ne peut plus rien affirmer sur l'exhaustivité :
    // c'est exactement l'hypothèse qu'on refuse de refaire.
    warnings.push(`Total non publié par ${type} / ${commune} — inventaire non vérifiable`);
    context.log('recherche.sans_total', { type, commune, lues: refs.size });
    incomplete = true;
  } else if (announcedTotal - refs.size > tolerated(announcedTotal)) {
    context.log('recherche.incomplete', {
      type,
      commune,
      lues: refs.size,
      annoncees: announcedTotal,
    });
    incomplete = true;
  }

  return { listings, incomplete, stopReason: 'completed' };
}
