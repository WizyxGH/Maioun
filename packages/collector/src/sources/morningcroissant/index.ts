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
 * LA RÉFÉRENCE N'EST IMPRIMÉE QUE SUR LA FICHE — « Référence: 47156 » — et
 * c'est elle que le loueur reconnaît. À douze fiches par passage pour
 * quatre-vingt-douze annonces, quarante-quatre n'avaient encore jamais été
 * visitées (relevé du 2026-09-17) : elles restaient sans référence pendant
 * quatre cycles, soit plus d'une heure. Vingt-quatre absorbent ce retard en
 * deux passages au lieu de quatre.
 *
 * CE PLAFOND NE COÛTE QUE LE RATTRAPAGE : passé celui-ci, seules les annonces
 * NOUVELLES sont visitées, et ce site n'en publie pas vingt-quatre par
 * vingt minutes. Le passage coûte 4 pages de liste + 24 fiches à 3 s d'écart,
 * soit 84 secondes contre 48 auparavant — et 144 s si l'on voulait tout d'un
 * coup, ce qui n'achèterait qu'un cycle de plus.
 */
const MAX_DETAILS = 24;

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
   * ROUVERTE, les quatre pages de résultats du 2026-09-16 relues hors ligne.
   *
   * LES PHOTOS REMONTENT : 92 cartes sur 92 en portent, de 4 à 27 chacune. Le
   * premier passage n'en avait enregistré aucune parce que le parseur ne lisait
   * pas encore le carrousel des cartes. L'adresse, elle, reste absente : ce
   * site n'en publie nulle part, et on n'en fabrique pas.
   *
   * LES QUATRE ANNONCES AU MÊME LOYER NE SONT PAS DÉPARTAGEABLES, et on ne les
   * fusionne donc pas. Leurs vingt-deux photos sont bien le même fichier, mais
   * ce fichier vient de TROIS AUTRES logements du même bailleur : c'est un
   * fonds de résidence, pas l'empreinte d'un studio. Les fondre ferait
   * disparaître trois logements peut-être réels. Elles restent quatre fiches à
   * l'écran et ne sonnent qu'une fois (`notify/redundancy.ts`).
   */
  enabled: true,
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
