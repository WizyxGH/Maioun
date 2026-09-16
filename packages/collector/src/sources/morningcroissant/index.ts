/**
 * Source : MorningCroissant (morningcroissant.fr) — voir l'étude dans
 * `parser.ts` et `docs/sources.md`.
 *
 * UNE SEULE ENTRÉE POUR TOUT LE PÉRIMÈTRE. La recherche « Nice » est un rayon,
 * pas une commune : au relevé du 2026-09-16, ses quatre-vingt-douze résultats
 * comprenaient Saint-Laurent-du-Var, Villefranche-sur-Mer et Beaulieu-sur-Mer.
 * Interroger les treize communes une par une aurait coûté treize fois plus de
 * requêtes pour les mêmes annonces.
 */

import type { Scraper, ScrapeContext, ScrapeResult, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { isEmptyList, parseDetail, parseListPage } from './parser.js';

/**
 * Les pages de résultats. Quatre suffisaient au 2026-09-16 (92 annonces, 24 par
 * page) ; une page vide n'est pas une erreur, la liste rétrécit avec le stock.
 */
const LIST_URLS = [
  'https://www.morningcroissant.fr/location/nice',
  'https://www.morningcroissant.fr/location/nice?page=2',
  'https://www.morningcroissant.fr/location/nice?page=3',
  'https://www.morningcroissant.fr/location/nice?page=4',
] as const;

/**
 * Fiches visitées par passage, pour les nouvelles seulement.
 *
 * La carte suffit à faire entrer une annonce ; la fiche n'ajoute que le
 * décompte des charges, le dépôt, les diagnostics et les durées de bail. Une
 * première collecte s'étale donc sur quelques cycles au lieu de tirer
 * quatre-vingt-douze requêtes d'un coup.
 */
const MAX_DETAILS = 12;

export const MORNINGCROISSANT_DESCRIPTOR: SourceDescriptor = {
  id: 'morningcroissant',
  name: 'MorningCroissant',
  domain: 'morningcroissant.fr',
  kind: 'portal',
  method: 'html',
  priority: 1,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: LIST_URLS.length + MAX_DETAILS,
    maxListingsPerRun: 120,
    delayBetweenRequestsMs: 3_000,
  }),
  /**
   * MISE DE CÔTÉ LE TEMPS DE LA VÉRIFIER, pas abandonnée.
   *
   * Un premier passage a rendu quatre annonces au même loyer et à la même
   * surface, sans photo ni adresse pour les distinguer : impossible de dire de
   * l'extérieur s'il s'agit de quatre studios d'une même résidence ou de la
   * même annonce republiée. Tant que la question n'est pas tranchée sur les
   * fiches, la source ne nourrit ni la liste ni les alertes. Le scraper et ses
   * tests restent prêts ; rouvrir tient dans ce booléen.
   */
  enabled: false,
  allowedPaths: ['/location/*', '/appartement/*'],
  /**
   * PAS DE `landlord` ICI, et c'est le point : la source ne publie pas QUE du
   * particulier. Elle dit annonce par annonce lequel des deux c'est, et le
   * parseur le transmet (`extra.landlord`). Un défaut de source écraserait
   * cette précision par une moyenne.
   */
  notes:
    'Place de marché de la location meublée et non meublée en MOYENNE et ' +
    'LONGUE durée — pas du meublé touristique : baux civils de date à date, ' +
    'mobilité (1 à 10 mois), étudiant (9 mois) et tacitement renouvelables ' +
    '(1 an meublé, 3 ans nu), DPE et GES sur chaque fiche. robots.txt vérifié ' +
    'le 2026-09-16 : /location/* et /appartement/* autorisés ; /search/ajax, ' +
    '/autocomplete, /appartement/reservation|request|pre-book, /login et ' +
    '/reservation interdits et jamais appelés. CGU du 5 février 2026 : aucune ' +
    'clause sur les robots ni sur l’extraction. Relevé du 2026-09-16 sur ' +
    '« Nice » (rayon, Saint-Laurent-du-Var et Villefranche-sur-Mer compris) : ' +
    '92 annonces, dont 48 de particuliers et 41 de loueurs professionnels, ' +
    '5 à 700 € ou moins, 16 à 900 € ou moins ; 91 logements entiers et ' +
    '1 chambre privée. LOYER AFFICHÉ CHARGES COMPRISES, la fiche le décompose. ' +
    'Le contact passe par la messagerie du site (compte gratuit) : ni ' +
    'téléphone ni e-mail publiés. Les frais de service du locataire sont ' +
    'OFFERTS pour un bail de moins d’un an et valent 8 à 12 € TTC par m² pour ' +
    'un bail d’un an ou trois ans ; le loueur paie 4,5 % TTC des loyers. ' +
    'La plateforme annonce accepter les dossiers en PÉRIODE D’ESSAI et ' +
    'garantit les loyers au bailleur — ce que refusent les agences sous ' +
    'assurance loyers impayés.',
};

export const morningcroissantScraper: Scraper = {
  descriptor: MORNINGCROISSANT_DESCRIPTOR,

  run(context: ScrapeContext): Promise<ScrapeResult> {
    return runListAndDetails(context, {
      sourceId: MORNINGCROISSANT_DESCRIPTOR.id,
      listUrls: LIST_URLS,
      parseList: (body, url) => parseListPage(body, url).listings,
      isEmptyList,
      parseDetail: (html, listing) => parseDetail(html, listing),
      maxDetails: MAX_DETAILS,
    });
  },
};
