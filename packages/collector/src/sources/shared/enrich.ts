/**
 * Compléter les annonces NOUVELLES par leur fiche.
 *
 * LE PROBLÈME. Plusieurs sources ne sont lues que sur leur page de liste — un
 * choix d'économie assumé (§30) — et cette page COUPE la description. Relevé du
 * 2026-09-04 sur l'inventaire : FNAIM tronque 72 descriptions sur 75, Foncia
 * les 18 siennes à 99 caractères de moyenne, Century 21 dix-huit sur vingt.
 * Ce qui disparaît n'est pas du décor : la fiche FNAIM du même bien fait 1 900
 * caractères et donne l'adresse en toutes lettres — « 94 AV. DE LA CORNICHE
 * FLEURIE 06200 NICE » — c'est-à-dire de quoi placer une punaise et calculer
 * un trajet (§20), et de quoi reconnaître un doublon (§14).
 *
 * LE COMPROMIS. Pas plus de `max` fiches par exécution, et une fiche lue n'est
 * pas relue avant une semaine : ce qu'elle a appris est gardé en mémoire et
 * réappliqué à chaque passage. Une source dont le stock ne bouge pas ne coûte
 * donc rien de plus ; une première collecte s'étale sur quelques cycles au lieu
 * de tirer cent requêtes d'un coup.
 *
 * L'ÉCHEC N'EST JAMAIS BLOQUANT (§69). Une fiche injoignable laisse l'annonce
 * telle que la liste l'a donnée — tronquée, mais présente. Un 429 arrête la
 * série sur-le-champ : la source vient de dire qu'elle en a assez.
 */

import type { DetailMemoryEntry, FetchResult, RawListing, ScrapeContext } from '@maioun/shared';
import type { RawDraft } from './raw-listing.js';
import type { GoneDetail, GoneReport } from './withdrawn.js';

export interface EnrichOptions {
  /** Fiches visitées au plus par exécution. */
  readonly max: number;
  /** URL de la fiche, ou `null` si l'annonce n'en a pas d'exploitable. */
  readonly detailUrl: (listing: RawListing) => string | null;
  /**
   * Ce que la fiche apprend, à fusionner sur l'annonce. `null` si la page
   * n'apprend rien — on ne remplace alors surtout pas ce qu'on avait (§17).
   */
  readonly parse: (html: string, listing: RawListing, page: DetailPage) => RawDraft | null;
  /**
   * `'manual'` : une redirection n'est pas suivie, et `parse` la reçoit (statut,
   * `location`, corps vide). Pour les sources qui redirigent une fiche retirée.
   */
  readonly redirect?: 'follow' | 'manual';
  /**
   * Fiches déjà lues pendant ce passage, par référence, avec ce que `parse` en
   * a tiré : traitées comme une visite, sans requête ni part du budget.
   */
  readonly prefetched?: ReadonlyMap<string, RawDraft | null>;
}

/** La réponse d'une fiche, au-delà de son corps. */
export interface DetailPage {
  readonly status: number;
  readonly location: string | null;
}

export interface EnrichResult extends GoneReport {
  readonly listings: readonly RawListing[];
  readonly requestCount: number;
  readonly pagesFetched: number;
  readonly warnings: readonly string[];
}

/** Codes qui disent la page définitivement absente : introuvable, supprimée. */
const PAGE_DISPARUE: ReadonlySet<number> = new Set([404, 410]);

/**
 * Au-delà, on relit une fiche si le budget le permet : l'annonceur a pu changer
 * son texte, et la mémoire ne doit pas le figer indéfiniment.
 */
export const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fiche lue mais écartée par le parseur (saisonnier, « prix sur demande »,
 * local commercial) : mémorisée vide, elle ne coûte plus de requête avant
 * `REFRESH_AFTER_MS`. Sans cela, elle était relue à chaque passage.
 */
export const REJECTED_DRAFT: RawDraft = {};

/** `true` si la mémoire de cette fiche est assez récente pour ne pas la relire. */
export function isFreshMemory(memory: DetailMemoryEntry | null, nowMs: number): boolean {
  if (memory === null) return false;
  const age = nowMs - Date.parse(memory.fetchedAt);
  return Number.isFinite(age) && age < REFRESH_AFTER_MS;
}

/**
 * La mémoire s'écrit PAR PAQUETS, au fil de la lecture.
 *
 * Écrite d'un bloc en fin de passage, elle a fait échouer le premier rattrapage
 * LocService le 2026-09-10 : un millier de fiches, environ deux mégaoctets en
 * une requête, que la base a refusés — et quarante minutes de lecture perdues
 * avec. Par paquets, un incident ne coûte que le paquet en cours.
 */
const SAVE_EVERY = 25;

/** Fusionne ce que la fiche apprend sur l'annonce de la liste. */
function mergeDraft(listing: RawListing, draft: RawDraft): RawListing {
  // Les champs de la fiche PRIMENT : c'est la page complète, la liste n'en était
  // qu'un résumé. Les clés absentes laissent l'annonce intacte.
  const merged: Record<string, unknown> = { ...listing };
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined) merged[key] = value;
  }
  // `extra` SE FUSIONNE, il ne se remplace pas. Remplacé en bloc, un DPE lu sur
  // la fiche effaçait la référence ou le quartier que la liste y avait posés —
  // sans erreur, et sans que rien ne le signale.
  if (draft.extra !== undefined) {
    merged['extra'] = { ...(listing.extra ?? {}), ...draft.extra };
  }
  return merged as unknown as RawListing;
}

/**
 * Visite les fiches des annonces qui en ont besoin, et applique à TOUTES ce que
 * leur fiche a appris — maintenant ou lors d'un passage précédent.
 *
 * L'ENRICHISSEMENT NE DURAIT QU'UN PASSAGE, et c'était le défaut de fond. Une
 * annonce n'était complétée que le jour de sa découverte ; au passage suivant,
 * déjà connue, elle n'était plus visitée, et la version tronquée de la liste
 * écrasait ce que la fiche avait donné. Relevé le 2026-09-10 : l'annonce Orpi
 * corrigée le matin (869 caractères) retombée à 148 le soir ; aucune
 * description FNAIM au-delà de 263 caractères, quand la fiche en porte 1 289.
 * La mémoire des fiches (`context.detailMemory`) garde maintenant ce qui a été
 * appris, et chaque passage le réapplique sans requête.
 *
 * QUI VISITER, PAR ORDRE DE NÉCESSITÉ, dans la limite de `max` :
 *
 *   1. les annonces NOUVELLES ;
 *   2. les connues dont on n'a JAMAIS lu la fiche — le stock collecté avant que
 *      la source ne visite ses fiches, qui se complète ainsi de lui-même, sur le
 *      budget que les nouvelles laissent libre ;
 *   3. les connues dont la fiche date de plus d'une semaine.
 *
 * Une inconnue dont la fiche a été lue cette semaine n'est pas revisitée : le
 * parseur ou la normalisation l'a écartée, et rien n'aura changé d'ici là.
 *
 * En rattrapage, toutes les connues suivent, fraîches comprises.
 *
 * L'ordre de la liste est conservé : elle est triée par la source (fraîcheur,
 * loyer croissant…), et la bousculer changerait ce que voit l'utilisateur.
 */
export async function enrichNewListings(
  context: ScrapeContext,
  listings: readonly RawListing[],
  options: EnrichOptions,
): Promise<EnrichResult> {
  const warnings: string[] = [];
  const learned = new Map<string, RawDraft>();
  const gone: GoneDetail[] = [];
  let requestCount = 0;
  let pagesFetched = 0;
  let detailsRequested = 0;

  const nowMs = Date.now();
  const rang = (listing: RawListing): number | null => {
    const memory = context.detailMemory.get(listing.sourceRef);
    const fresh = isFreshMemory(memory, nowMs);
    // Une inconnue à mémoire fraîche a déjà été lue : écartée par le parseur
    // ou par la normalisation, elle ne se relit pas.
    if (!context.isKnown(listing.sourceRef) && !fresh) return 0;
    if (memory === null) return 1;
    if (!fresh) return 2;
    return context.mode === 'backfill' ? 3 : null;
  };
  const aVisiter = listings
    .map((listing, index) => ({ listing, index, rang: rang(listing) }))
    .filter((one): one is { listing: RawListing; index: number; rang: number } => one.rang !== null)
    // Tri STABLE par nécessité : l'ordre de la source départage.
    .sort((a, b) => a.rang - b.rang || a.index - b.index)
    .map((one) => one.listing);

  /** Les fiches lues et pas encore mémorisées. */
  let pending: { sourceRef: string; draft: RawDraft }[] = [];
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    try {
      await context.detailMemory.save(batch);
    } catch (error) {
      // L'ÉCHEC N'EST JAMAIS BLOQUANT : les annonces de ce passage
      // reçoivent quand même ce qu'on vient de lire ; seule la mémoire de ce
      // paquet manque, et ses fiches seront relues.
      const message = error instanceof Error ? error.message : String(error);
      context.log('detail.memory_failed', { count: batch.length, error: message });
      warnings.push(`Mémoire des fiches non enregistrée (${batch.length}) : ${message}`);
    }
  };

  const remember = async (sourceRef: string, draft: RawDraft | undefined): Promise<void> => {
    if (draft === undefined) return;
    pending.push({ sourceRef, draft });
    if (pending.length >= SAVE_EVERY) await flush();
  };
  /** Ce qu'une fiche lue apprend. Écartée : on garde l'acquis, sinon on la note vide. */
  const learn = async (listing: RawListing, draft: RawDraft | null): Promise<void> => {
    if (draft !== null) learned.set(listing.sourceRef, draft);
    const previous = context.detailMemory.get(listing.sourceRef)?.draft;
    await remember(listing.sourceRef, draft ?? previous ?? REJECTED_DRAFT);
  };

  /** Une demande de fiche, avec les options de la source. */
  const demander = async (url: string, conditionnel: boolean): Promise<FetchResult> =>
    context.fetch(url, {
      ...(options.redirect === undefined ? {} : { redirect: options.redirect }),
      ...(conditionnel ? {} : { conditional: false }),
    });

  let budget = options.max;
  for (const listing of aVisiter) {
    if (options.prefetched?.has(listing.sourceRef) === true) {
      await learn(listing, options.prefetched.get(listing.sourceRef) ?? null);
      continue;
    }
    if (context.shouldStop()) break;
    // Budget épuisé : seules les fiches déjà lues passent encore.
    if (budget <= 0) continue;
    const url = options.detailUrl(listing);
    if (url === null) continue;

    budget -= 1;
    try {
      const page = await demander(url, true);
      requestCount += 1;
      detailsRequested += 1;
      if (page.notModified) {
        // Fiche inchangée : ce que la mémoire en garde reste vrai, et rajeunit.
        await remember(listing.sourceRef, context.detailMemory.get(listing.sourceRef)?.draft);
      } else if (PAGE_DISPARUE.has(page.status)) {
        pagesFetched += 1;
        // DEUX LECTURES, PAS UNE. Un 404 passager — déploiement en cours, cache
        // de bordure fautif — ne doit pas suffire à retirer une annonce. La
        // seconde est non conditionnelle, pour qu'un 304 ne trouble pas la
        // réponse ; elle ne coûte une requête qu'aux fiches déjà absentes.
        const confirmation = await demander(url, false);
        requestCount += 1;
        if (PAGE_DISPARUE.has(confirmation.status)) {
          gone.push({ sourceRef: listing.sourceRef, url, status: confirmation.status });
        } else {
          context.log('detail.gone_unconfirmed', {
            url,
            premier: page.status,
            second: confirmation.status,
          });
        }
        // Une page absente n'apprend rien : ce que la fiche avait donné reste.
        await learn(listing, null);
      } else {
        pagesFetched += 1;
        const location = options.redirect === 'manual' ? (page.headers['location'] ?? null) : null;
        const response = { status: page.status, location };
        await learn(listing, options.parse(page.body, listing, response));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.log('detail.failed', { url, error: message });
      warnings.push(`Fiche injoignable : ${url}`);
      // 429 : la source dit qu'elle en a assez. On s'arrête là, sans insister.
      if (message.includes('429')) break;
    }
  }

  // Ce qu'on vient d'apprendre, sinon ce que la mémoire garde.
  const enriched = listings.map((listing) => {
    const draft =
      learned.get(listing.sourceRef) ?? context.detailMemory.get(listing.sourceRef)?.draft;
    return draft === undefined ? listing : mergeDraft(listing, draft);
  });

  await flush();

  return { listings: enriched, requestCount, pagesFetched, warnings, gone, detailsRequested };
}
