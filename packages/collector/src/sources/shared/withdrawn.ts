/**
 * Retrait immédiat d'une annonce dont la FICHE n'existe plus.
 *
 * Une annonce partie restait affichée le temps de trois passages sans la revoir
 * — près de quatre heures, pour une durée de vie médiane de 1,4 jour. Quand on
 * visite déjà la fiche et que le site répond 404 ou 410, on n'a pas besoin
 * d'attendre : la page n'existe plus, l'occurrence s'éteint dans la collecte
 * même.
 *
 * LA CONDITION EST DE NE JAMAIS RETIRER UNE ANNONCE ENCORE EN LIGNE. Tout ce
 * qui n'est pas « cette page n'existe plus » laisse donc l'annonce intacte :
 *
 *   - une erreur réseau, un 403, un 429, un 5xx : le client HTTP lève, et une
 *     exception n'est pas une preuve d'absence ;
 *   - une redirection vers l'accueil ou la recherche : elle finit en 200, et
 *     un 200 ne dit rien ici — c'est le rôle des parseurs de source, qui
 *     reconnaissent le bandeau « annonce introuvable » ;
 *   - un passage interrompu ou un inventaire lu en partie : la source est
 *     dégradée, on ne conclut rien de ce qu'elle dit ;
 *   - une salve de 404 : un site déplacé ou un gabarit d'URL changé les
 *     produirait tous d'un coup, et emporterait un inventaire entier.
 *
 * CE QUE FONT VRAIMENT LES SITES, relevé le 2026-09-16 sur cinquante annonces
 * déjà parties : un quart répond 404 ou 410 (Laforêt 404, Orpi et Foncia 410,
 * et les petites agences à parseur dédié), et c'est ce quart-là que ce
 * mécanisme gagne. Le reste répond 200 : dix-huit redirigent vers la page de
 * recherche (Century 21, FNAIM, LocService, Rentumo, ParuVendu, ArthurImmo) et
 * quatre servent un bandeau « annonce introuvable » (L'Adresse). Ces deux
 * familles ne sont pas traitées ici : elles demandent le parseur de la source.
 *
 * Et la fiche doit avoir été DEMANDÉE directement, une par une : un lot rendu
 * en bloc par une API ne distingue pas « absente » de « pas dans ce lot ».
 *
 * On n'exige PAS que la référence soit déjà connue. `isKnown` ne répond pas
 * « est-elle en base ? » mais « faut-il la revisiter ? », et il rend faux
 * exprès pour les fiches à rattraper — justement celles qu'on relit. L'extinction
 * ne vise de toute façon qu'une occurrence existante : une référence absente de
 * la base ne désigne rien.
 */

import type { RawListing, ScrapeContext, StopReason } from '@maioun/shared';
import type { EnrichResult } from './enrich.js';

/** Une fiche demandée directement dont le site dit qu'elle n'existe plus. */
export interface GoneDetail {
  readonly sourceRef: string;
  readonly url: string;
  readonly status: number;
}

/**
 * Passages dont on accepte les conclusions. Les autres disent que la source a
 * mal répondu ou n'a été lue qu'en partie : `incomplete`, `rateLimited`,
 * `blocked`, `tooManyErrors`, `notModified`.
 */
const SOURCE_SAINE: ReadonlySet<StopReason> = new Set<StopReason>([
  'completed',
  'knownTerritory',
  'maxPages',
  'maxListings',
  'empty',
]);

/**
 * En dessous, la proportion ne veut rien dire : deux fiches lues dont une
 * absente, c'est une agence qui a loué un bien, pas un site déplacé.
 */
const FICHES_MINIMUM_POUR_LA_PROPORTION = 3;

/**
 * Au-delà, on soupçonne le site plutôt que les annonces : un changement de
 * gabarit d'URL rend 404 sur tout. Le doute coûte quelques heures d'affichage,
 * le temps que les absences tranchent ; l'erreur inverse efface un inventaire.
 */
const PROPORTION_MAXIMALE_ABSENTES = 0.5;

/** Ce qu'une lecture de fiches apprend sur les pages disparues. */
export interface GoneReport {
  /** Fiches que le site dit absentes, après confirmation. */
  readonly gone: readonly GoneDetail[];
  /** Fiches réellement demandées pendant ce passage — le dénominateur. */
  readonly detailsRequested: number;
}

/**
 * Les références à éteindre sur-le-champ, garde-fous appliqués. Chaque retrait
 * est journalisé avec sa source, sa référence, son adresse et son code.
 */
export function withdrawnRefsFrom(
  context: ScrapeContext,
  report: GoneReport,
  stopReason: StopReason,
): readonly string[] {
  if (report.gone.length === 0) return [];

  if (!SOURCE_SAINE.has(stopReason)) {
    context.log('withdrawn.skipped', { reason: stopReason, candidates: report.gone.length });
    return [];
  }

  const proportion =
    report.detailsRequested === 0 ? 1 : report.gone.length / report.detailsRequested;
  if (
    report.detailsRequested >= FICHES_MINIMUM_POUR_LA_PROPORTION &&
    proportion > PROPORTION_MAXIMALE_ABSENTES
  ) {
    context.log('withdrawn.skipped', {
      reason: 'salve de 404',
      gone: report.gone.length,
      requested: report.detailsRequested,
    });
    return [];
  }

  for (const detail of report.gone) {
    context.log('withdrawn.gone', {
      ref: detail.sourceRef,
      url: detail.url,
      status: detail.status,
    });
  }
  return report.gone.map((detail) => detail.sourceRef);
}

/**
 * Raccourci pour les sources qui appellent `enrichNewListings` directement :
 * les annonces à rendre, débarrassées des parties, et les parties elles-mêmes.
 * Une annonce retirée ne doit pas être rendue AUSSI comme en ligne — la fiche
 * serait réécrite active juste avant qu'on ne l'éteigne.
 */
export function withdrawnAfterEnrich(
  context: ScrapeContext,
  enriched: EnrichResult,
  stopReason: StopReason,
): { readonly listings: readonly RawListing[]; readonly withdrawnRefs: readonly string[] } {
  const withdrawnRefs = withdrawnRefsFrom(context, enriched, stopReason);
  if (withdrawnRefs.length === 0) return { listings: enriched.listings, withdrawnRefs };
  const parties = new Set(withdrawnRefs);
  return {
    listings: enriched.listings.filter((listing) => !parties.has(listing.sourceRef)),
    withdrawnRefs,
  };
}
