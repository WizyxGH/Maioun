/**
 * Source : Orpi (réseau d'agences).
 *
 * POURQUOI CETTE SOURCE EN DEUXIÈME — voir `docs/sources.md` pour l'étude.
 *
 *   - `robots.txt` (revérifié le 2026-09-16) : `/recherche/*` est interdit,
 *     mais les pages ville `/location-immobiliere-{commune}/` ne le sont pas,
 *     et leur pagination `?page=N` n'apparaît dans aucun Disallow (seuls
 *     `agency=`, `sujet=`, `contact=`, `orderBy=` sont bloqués).
 *   - Les cartes embarquent prix, surface, pièces, agence, quartier et — fait
 *     rare — les COORDONNÉES GPS : le signal de dédoublonnage le plus fort
 *     après le téléphone (§14).
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
import { portalCommuneSlugs } from '../shared/communes.js';
import { enrichNewListings } from '../shared/enrich.js';
import { withdrawnRefsFrom, type GoneDetail } from '../shared/withdrawn.js';
import { compactListing } from '../shared/raw-listing.js';
import { CHARGES_INCLUDED_KEY, isWithdrawnDetail, parseDetail, parseSearchPage } from './parser.js';

/**
 * Fiches visitées par exécution, pour les annonces NOUVELLES d'abord.
 *
 * La fiche est devenue bien plus qu'une description complète : chambres,
 * étage, dépôt, charges, honoraires, DPE, date de mise en ligne, téléphone et
 * e-mail de l'agence n'existent QUE là (le tracking de la liste rend
 * `nbChambres`, `etage` et `dpe` à `null` sur les cinquante-sept cartes
 * niçoises du 2026-09-16). Douze par passage suffisent à rattraper le stock du
 * périmètre — environ soixante-dix annonces — en six cycles, puis à absorber
 * les parutions (§30).
 */
const MAX_DETAILS = 12;

/**
 * Pages de LISTE parcourues par commune.
 *
 * Nice en occupe quatre (57 annonces, 15 par page) ; les douze autres communes
 * suivies tiennent en une seule. Huit laissent de la marge sans rien coûter :
 * la lecture s'arrête dès que le total annoncé est atteint.
 */
const MAX_PAGES_PER_COMMUNE = 8;

/**
 * NE JAMAIS DÉPASSER LA DERNIÈRE PAGE, et c'est une correction, pas une
 * prudence.
 *
 * Le relevé du 2026-09-09 concluait que « les pages 5 à 8 répondent et portent
 * d'autres biens », et la source paginait jusqu'à huit depuis. Relecture du
 * 2026-09-16 : ces pages répondent en effet 200, mais leur lien canonique est
 * `/location-immobiliere-alpes-maritimes/` — le site sert la page du
 * DÉPARTEMENT dès qu'on dépasse sa dernière page, et la sert à l'identique
 * pour 5, 6, 7 et 8. Les « quarante-deux annonces inédites » étaient des biens
 * de Cannes, d'Antibes et de Grasse. Le même repli se produit sur une commune
 * qu'Orpi ne connaît pas (Cap-d'Ail, Drap et Contes le 2026-09-16).
 *
 * C'est pourquoi chaque page est vérifiée : `canonicalPath` doit être celui de
 * la commune demandée, sinon on ne lit rien de ce qu'elle porte.
 */
const COMMUNE_PATH = (slug: string): string => `/location-immobiliere-${slug}/`;

const BASE_URL = (slug: string): string => `https://www.orpi.com${COMMUNE_PATH(slug)}`;

/**
 * Les communes du périmètre (§20), interrogées une par une.
 *
 * ORPI EST UN RÉSEAU NATIONAL ET ON NE LUI DEMANDAIT QUE NICE. Relevé du
 * 2026-09-16, logements à louer annoncés par le site lui-même : Nice 50,
 * Cagnes-sur-Mer 7, Saint-Laurent-du-Var 5, Villeneuve-Loubet 4, La Trinité 2,
 * Beaulieu-sur-Mer 1, Colomars 1, Villefranche-sur-Mer 1 — soit 71 contre 50.
 * Vingt et une annonces de plus pour douze requêtes, la même arithmétique que
 * l'élargissement FNAIM.
 *
 * La recherche DÉPARTEMENTALE ferait le même travail en neuf pages, mais rien
 * ne dit qu'elle soit complète — celle de la FNAIM était tronquée de
 * soixante-sept annonces niçoises. Commune par commune, le total annoncé de
 * chaque page permet de le VÉRIFIER.
 *
 * Les trois communes sans page (Cap-d'Ail, Drap, Contes) restent dans la
 * liste : elles coûtent une requête, et le jour où Orpi y publiera, la page
 * existera sans qu'on ait à y penser (§ agences vides suivies quand même).
 *
 * Orpi écrit les communes comme nous : ni code postal, ni abréviation.
 */
const COMMUNES = portalCommuneSlugs();

export const ORPI_DESCRIPTOR: SourceDescriptor = {
  id: 'orpi',
  name: 'Orpi',
  domain: 'orpi.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  // SOIXANTE MINUTES, ET NON QUARANTE-CINQ : lire les treize communes et les
  // fiches coûte seize à vingt-huit requêtes par passage au lieu de cinq. On
  // paie l'exhaustivité par l'espacement plutôt qu'en renonçant à des communes ;
  // l'adaptation du rythme resserre d'elle-même quand la source publie.
  schedule: scheduleFor('agencyNetwork', { baseIntervalMinutes: 60 }),
  budget: budgetFor('agencyNetwork', {
    // Le budget compte TOUTES les requêtes, pages de liste et fiches. Seize
    // pages de liste en pratique (quatre pour Nice, une par autre commune),
    // douze fiches, et de quoi confirmer une fiche absente par une seconde
    // lecture.
    maxPagesPerRun: COMMUNES.length + MAX_PAGES_PER_COMMUNE + 2 * MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/location-immobiliere-*', '/annonce-location-*'],
  notes:
    'robots.txt revérifié le 2026-09-16 : /recherche/* interdit, pages ville et ' +
    'pagination ?page=N autorisées ; les paramètres agency/sujet/contact/orderBy ' +
    'sont interdits et ne sont jamais utilisés. TREIZE COMMUNES du périmètre, ' +
    'une page ville chacune (Nice en occupe quatre, 15 annonces par page) : ' +
    '71 logements annoncés le 2026-09-16 contre 50 pour la seule recherche ' +
    'niçoise. Le site PUBLIE SON TOTAL par type de bien (attribut ' +
    'data-eulerian-action des liens de filtre, champ nbResults) : c’est lui qui ' +
    'dit si l’inventaire a été lu en entier, et non plus la pagination. Au-delà ' +
    'de sa dernière page, comme pour une commune inconnue, Orpi répond 200 et ' +
    'sert la page du DÉPARTEMENT — reconnue par son lien canonique, et ignorée. ' +
    'Un carrousel « communes à proximité » répète six annonces d’autres ' +
    'communes sur chaque page : seules les cartes du conteneur de résultats ' +
    'sont lues. Cartes riches (GPS, quartier, agence) via data-eulerian-action — ' +
    'traité comme enrichissement fragile, le HTML visible fait foi ; ses champs ' +
    'meuble et dateCreation sont écartés, ils se contredisent. Fiches des ' +
    'nouvelles : JSON data-estate (description entière, chambres, surface, ' +
    'étage, dépôt, charges, honoraires, DPE, mise en ligne, photos, téléphone ' +
    'et e-mail de l’agence du bien). Une fiche retirée répond 410, ou 200 avec ' +
    'le canonique /louer/biens-loues/.',
};

/**
 * Manque toléré face au total annoncé avant de tenir l'inventaire pour
 * incomplet. Le site publie ses totaux à la minute et une annonce peut paraître
 * ou partir pendant le passage ; exiger l'égalité stricte rendrait la source
 * incomplète au moindre battement, et rien ne se retirerait plus jamais.
 */
function tolerated(total: number): number {
  return Math.max(2, Math.ceil(total * 0.03));
}

export const orpiScraper: Scraper = {
  descriptor: ORPI_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const byRef = new Map<string, RawListing>();
    const confirmed = new Set<string>();
    const warnings: string[] = [];
    const counters = { requestCount: 0, pagesFetched: 0 };
    let stopReason: StopReason = 'completed';
    let incomplete = false;

    for (const slug of COMMUNES) {
      const pass = await readCommune(context, slug, counters);
      for (const listing of pass.listings) {
        if (!byRef.has(listing.sourceRef)) byRef.set(listing.sourceRef, listing);
      }
      for (const ref of pass.confirmedRefs) confirmed.add(ref);
      warnings.push(...pass.warnings);
      incomplete ||= pass.incomplete;
      if (pass.stopReason !== 'completed') {
        stopReason = pass.stopReason;
        break;
      }
    }

    // TOUT LE PÉRIMÈTRE MUET N'EST JAMAIS CRÉDIBLE. Une commune inconnue du
    // portail ne fait pas un trou — elle n'a rien à publier —, mais si AUCUNE
    // n'a rien rendu alors qu'on connaît déjà des annonces, c'est le gabarit ou
    // les adresses qui ont changé, et rien ne doit s'éteindre là-dessus.
    if (byRef.size === 0 && confirmed.size === 0 && context.knownRefs.size > 0) {
      warnings.push('Aucune annonce sur aucune commune — gabarit probablement modifié');
      incomplete = true;
    }
    if (incomplete && stopReason === 'completed') stopReason = 'incomplete';

    // LA CARTE COUPE À CENT CINQUANTE-DEUX CARACTÈRES ; la fiche porte le texte
    // entier, l'adresse de rue qu'Orpi ne publie nulle part ailleurs, et tout
    // ce que la liste tait. Une fois la pagination finie, pour ne visiter
    // chaque annonce qu'une fois.
    const parties: GoneDetail[] = [];
    const enriched = await enrichNewListings(context, [...byRef.values()], {
      max: MAX_DETAILS,
      detailUrl: (listing) => listing.sourceUrl,
      parse: (html, listing) => {
        // Le site dit lui-même le bien loué, sans passer par un 410.
        if (isWithdrawnDetail(html)) {
          parties.push({ sourceRef: listing.sourceRef, url: listing.sourceUrl, status: 200 });
          return null;
        }
        return parseDetail(html);
      },
    });
    counters.requestCount += enriched.requestCount;
    counters.pagesFetched += enriched.pagesFetched;
    warnings.push(...enriched.warnings);

    // Fiches que le site dit absentes — par son code, ou par son canonique :
    // éteintes dès ce passage, sous les garde-fous de `shared/withdrawn.ts`.
    const withdrawnRefs = withdrawnRefsFrom(
      context,
      { gone: [...enriched.gone, ...parties], detailsRequested: enriched.detailsRequested },
      stopReason,
    );
    const eteintes = new Set(withdrawnRefs);
    const listings = enriched.listings
      .filter((listing) => !eteintes.has(listing.sourceRef))
      .map(annonceChargesComprises);
    const confirmedRefs = [...confirmed].filter((ref) => !byRef.has(ref) && !eteintes.has(ref));

    context.log('list.parsed', {
      listings: listings.length,
      confirmed: confirmedRefs.length,
      communes: COMMUNES.length,
      pages: counters.pagesFetched,
      retirees: withdrawnRefs.length,
    });

    return {
      sourceId: ORPI_DESCRIPTOR.id,
      listings,
      confirmedRefs,
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
 * Recolle sur le loyer FRAIS de la carte la mention que seule la fiche connaît.
 *
 * La fiche prouve le « charges comprises » en additionnant ses montants, mais
 * son loyer, mémorisé une semaine, figerait le chiffre que la liste republie à
 * chaque passage. On garde donc le montant de la carte et on lui ajoute la
 * mention, que la normalisation lit dans le texte du prix.
 */
function annonceChargesComprises(listing: RawListing): RawListing {
  if (listing.extra?.[CHARGES_INCLUDED_KEY] !== '1') return listing;
  if (listing.priceText === undefined || /charges/i.test(listing.priceText)) return listing;
  return compactListing({ ...listing, priceText: `${listing.priceText} charges comprises` });
}

/** §69 : un refus et une limitation s'arrêtent net, un incident se signale. */
function raisonDArret(message: string): StopReason {
  if (message.includes('429')) return 'rateLimited';
  if (message.includes('refusé')) return 'blocked';
  return 'tooManyErrors';
}

/**
 * Page inchangée : ses annonces le sont aussi.
 *
 * Ce que la mémoire garde de ce qu'elle portait CONFIRME ces annonces sans les
 * redemander. Sans mémoire, on ne sait rien d'elle : c'est un trou, et un
 * inventaire à trou ne retire rien.
 */
async function pageInchangee(
  context: ScrapeContext,
  url: string,
  refs: Set<string>,
): Promise<{ confirmes: readonly string[]; suite: 'continuer' | 'finir' | 'trou' }> {
  const known = await context.pageRefs.get(url);
  if (known === null) return { confirmes: [], suite: 'trou' };
  const inedits = known.filter((ref) => !refs.has(ref));
  for (const ref of inedits) refs.add(ref);
  return { confirmes: inedits, suite: known.length === 0 ? 'finir' : 'continuer' };
}

interface CommunePass {
  readonly listings: readonly RawListing[];
  readonly confirmedRefs: readonly string[];
  readonly warnings: readonly string[];
  readonly incomplete: boolean;
  readonly stopReason: StopReason;
}

/**
 * Lit une commune jusqu'à son total annoncé.
 *
 * TROIS FAÇONS DE S'ARRÊTER, et une seule est une conclusion : avoir lu autant
 * de cartes que le site en annonce. Les deux autres — plus de page suivante,
 * plafond de pages — laissent l'inventaire en doute, et le disent.
 */
async function readCommune(
  context: ScrapeContext,
  slug: string,
  counters: { requestCount: number; pagesFetched: number },
): Promise<CommunePass> {
  const refs = new Set<string>();
  const listings: RawListing[] = [];
  const confirmedRefs: string[] = [];
  const warnings: string[] = [];
  let announcedTotal: number | null = null;
  let incomplete = false;
  /** Le portail ne connaît pas cette commune : zéro annonce, et pas un trou. */
  let inconnue = false;

  for (let page = 1; page <= MAX_PAGES_PER_COMMUNE; page += 1) {
    if (context.shouldStop()) {
      // Le budget coupe au milieu du périmètre : inventaire partiel, et un
      // inventaire partiel ne condamne rien.
      return { listings, confirmedRefs, warnings, incomplete: true, stopReason: 'incomplete' };
    }

    const url = page === 1 ? BASE_URL(slug) : `${BASE_URL(slug)}?page=${page}`;
    let response;
    try {
      response = await context.fetch(url);
      counters.requestCount += 1;
    } catch (error) {
      // §69 : un échec de page n'abat pas la source ; un refus ou une
      // limitation arrête le run proprement.
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec sur ${url} : ${message}`);
      context.log('page.failed', { url, error: message });
      return {
        listings,
        confirmedRefs,
        warnings,
        incomplete: true,
        stopReason: raisonDArret(message),
      };
    }

    if (response.notModified) {
      const inchangee = await pageInchangee(context, url, refs);
      confirmedRefs.push(...inchangee.confirmes);
      if (inchangee.suite === 'continuer') continue;
      incomplete ||= inchangee.suite === 'trou';
      break;
    }

    counters.pagesFetched += 1;
    const parsed = parseSearchPage(response.body, url);

    if (parsed.canonicalPath !== COMMUNE_PATH(slug)) {
      // Repli du site : commune inconnue, ou page au-delà de la dernière.
      // Ce qu'elle porte appartient à d'autres communes — on n'en lit rien.
      context.log('commune.repli', { url, canonique: parsed.canonicalPath });
      // Dès la première page, c'est que la commune n'a pas de page chez Orpi :
      // elle n'a donc rien à publier, et son silence n'est pas un trou. En
      // faire un trou rendrait la source éternellement incomplète — trois
      // communes du périmètre étaient dans ce cas le 2026-09-16.
      if (page === 1) inconnue = true;
      break;
    }

    warnings.push(...parsed.warnings);
    if (page === 1) announcedTotal = parsed.announcedTotal;
    for (const listing of parsed.listings) {
      if (refs.has(listing.sourceRef)) continue;
      listings.push(listing);
    }
    for (const ref of parsed.cardRefs) refs.add(ref);
    await context.pageRefs.set(url, parsed.cardRefs);

    // Le total annoncé est atteint : inutile de demander la page suivante,
    // le site n'y mettrait que son repli départemental.
    if (announcedTotal !== null && refs.size >= announcedTotal) break;
    if (!parsed.hasNextPage || parsed.cardRefs.length === 0) break;
    if (page === MAX_PAGES_PER_COMMUNE) incomplete = true;
  }

  if (inconnue) {
    context.log('commune.inconnue', { slug });
  } else if (announcedTotal === null) {
    // Sans total publié, on ne peut plus rien affirmer sur l'exhaustivité :
    // c'est exactement l'hypothèse qu'on refuse de refaire.
    warnings.push(`Total non publié par la page de ${slug} — inventaire non vérifiable`);
    context.log('commune.sans_total', { slug, lues: refs.size });
    incomplete = true;
  } else if (announcedTotal - refs.size > tolerated(announcedTotal)) {
    context.log('commune.incomplete', { slug, lues: refs.size, annoncees: announcedTotal });
    incomplete = true;
  }

  return { listings, confirmedRefs, warnings, incomplete, stopReason: 'completed' };
}
