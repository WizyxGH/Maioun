/**
 * Source : AFEDIM — voir `parser.ts` et `docs/sources.md`.
 *
 * Une requête pour l'inventaire du département, puis la fiche de CHAQUE bien
 * retenu, à chaque passage. Le stock est minuscule (trois biens dans les
 * communes cibles le 2026-09-14) et la fiche porte l'état de la candidature en
 * ligne, qui bascule d'un jour à l'autre : le lire une fois par semaine,
 * comme `enrichNewListings`, le rendrait faux la plupart du temps.
 *
 * Ce que la fiche apprend est gardé en mémoire : une fiche injoignable laisse
 * l'annonce complète, sans l'état de candidature, qui serait périmé.
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
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';
import type { RawDraft } from '../shared/raw-listing.js';
import { LIST_URL, announcedCount, parseDetail, parseListPage } from './parser.js';

/** Fiches lues par passage : large devant le stock niçois actuel. */
const MAX_DETAILS = 12;

const TARGET_CITIES: ReadonlySet<string> = new Set(NICE_AREA_SLUGS);

export const AFEDIM_DESCRIPTOR: SourceDescriptor = {
  id: 'afedim',
  name: 'AFEDIM',
  domain: 'afedim.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 3,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', {
    maxPagesPerRun: 1 + MAX_DETAILS,
  }),
  enabled: true,
  allowedPaths: ['/fr/location/annonces/*'],
  notes:
    'Crédit Mutuel Alliance Fédérale ; locations gérées par AFEDIM Gestion, ' +
    'surtout du Pinel sous plafond de ressources. robots.txt vérifié le ' +
    '2026-09-14 : `User-agent: *` → `Allow: /` ; seuls les robots d’IA nommés ' +
    'se voient fermer `_stack=` et les pages de demande/dépôt de dossier, que ' +
    'le scraper ne visite pas. Pas d’anti-bot sur les pages lues. Liste du ' +
    'département en une requête (JSON embarqué), fiche relue à chaque passage ' +
    'pour l’état de candidature.',
};

/** Fusionne la fiche sur l'annonce de la liste ; `extra` se fusionne aussi. */
function applyDetail(listing: RawListing, draft: RawDraft): RawListing {
  const merged: Record<string, unknown> = { ...listing };
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined) merged[key] = value;
  }
  if (draft.extra !== undefined) merged['extra'] = { ...(listing.extra ?? {}), ...draft.extra };
  return merged as unknown as RawListing;
}

/** Une fiche lue à un passage précédent, sans l'état de candidature. */
function withoutApplicationStatus(draft: Partial<RawListing>): RawDraft {
  if (draft.extra === undefined) return draft;
  const { applicationStatus: _stale, ...extra } = draft.extra;
  return { ...draft, extra };
}

export const afedimScraper: Scraper = {
  descriptor: AFEDIM_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    const warnings: string[] = [];
    let requestCount = 0;
    let pagesFetched = 0;
    const result = (
      listings: readonly RawListing[],
      stopReason: StopReason,
      confirmedRefs: readonly string[] = [],
    ): ScrapeResult => ({
      sourceId: AFEDIM_DESCRIPTOR.id,
      listings,
      confirmedRefs,
      requestCount,
      pagesFetched,
      stopReason,
      warnings,
    });

    // --- 1. Inventaire du département ----------------------------------------
    let html: string;
    try {
      const response = await context.fetch(LIST_URL);
      requestCount += 1;
      if (response.notModified) {
        const refs = await context.pageRefs.get(LIST_URL);
        return refs === null ? result([], 'notModified') : result([], 'completed', refs);
      }
      pagesFetched += 1;
      html = response.body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Échec de la liste : ${message}`);
      context.log('list.failed', { url: LIST_URL, error: message });
      return result([], message.includes('429') ? 'rateLimited' : 'tooManyErrors');
    }

    const parsed = parseListPage(html, AFEDIM_DESCRIPTOR.name);
    warnings.push(...parsed.warnings);
    // Sans JSON, la page a changé : rendre « complet » avec zéro annonce
    // retirerait tout le stock.
    if (parsed.items === null) return result([], 'tooManyErrors');

    const announced = announcedCount(html);
    if (announced !== undefined && announced !== parsed.items.length) {
      warnings.push(`Liste AFEDIM : ${announced} biens annoncés, ${parsed.items.length} lus`);
    }

    const targeted = parsed.items
      .filter((item) => TARGET_CITIES.has(item.citySlug))
      .map((item) => item.listing);
    await context.pageRefs.set(
      LIST_URL,
      targeted.map((listing) => listing.sourceRef),
    );
    context.log('list.parsed', { department: parsed.items.length, targeted: targeted.length });

    // --- 2. Fiches ------------------------------------------------------------
    const learned = new Map<string, RawDraft>();
    for (const listing of targeted.slice(0, MAX_DETAILS)) {
      if (context.shouldStop()) break;
      try {
        const page = await context.fetch(listing.sourceUrl);
        requestCount += 1;
        if (page.notModified) {
          // Page inchangée : ce que la mémoire en garde est encore exact.
          const memory = context.detailMemory.get(listing.sourceRef);
          if (memory !== null) learned.set(listing.sourceRef, memory.draft);
          continue;
        }
        pagesFetched += 1;
        const draft = parseDetail(page.body, listing.sourceRef);
        if (draft === null) warnings.push(`Fiche AFEDIM sans données : ${listing.sourceUrl}`);
        else learned.set(listing.sourceRef, draft);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.log('detail.failed', { url: listing.sourceUrl, error: message });
        warnings.push(`Fiche injoignable : ${listing.sourceUrl}`);
        if (message.includes('429')) break;
      }
    }

    const fresh = [...learned].map(([sourceRef, draft]) => ({ sourceRef, draft }));
    if (fresh.length > 0) {
      try {
        await context.detailMemory.save(fresh);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Mémoire des fiches non enregistrée (${fresh.length}) : ${message}`);
      }
    }

    const listings = targeted.map((listing) => {
      const draft = learned.get(listing.sourceRef);
      if (draft !== undefined) return applyDetail(listing, draft);
      const memory = context.detailMemory.get(listing.sourceRef);
      return memory === null
        ? listing
        : applyDetail(listing, withoutApplicationStatus(memory.draft));
    });

    // L'inventaire est complet même si une fiche a manqué : la liste fait foi.
    return result(listings, 'completed');
  },
};
