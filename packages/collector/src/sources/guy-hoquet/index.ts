/**
 * Source : Guy Hoquet (réseau d'agences), site national guy-hoquet.com.
 *
 * Une page SEO par commune cible, rendue serveur, puis les fiches des annonces
 * nouvelles. robots.txt vérifié le 2026-09-15 : il ferme la recherche
 * (/biens/search-*, /transaction-location) mais pas /location/*. 1 location
 * dans la zone au relevé (Nice, agence Nice Gambetta).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URLS, isEmptyList, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const GUY_HOQUET_DESCRIPTOR: SourceDescriptor = {
  id: 'guy-hoquet',
  name: 'Guy Hoquet',
  domain: 'guy-hoquet.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  // Stock très mince dans la zone : le rythme d'une agence locale suffit.
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: LIST_URLS.length + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/location/annonces-*', '/location/*'],
  notes:
    'robots.txt vérifié le 2026-09-15 : interdits /biens/search-properties, ' +
    '/biens/search-localization, /transaction-location, /contacts/* et les ' +
    'modales ; /location/* reste ouvert. La recherche est en JavaScript, mais ' +
    'chaque commune a une page SEO /location/annonces-{commune}-{cp} rendue ' +
    'serveur (cartes .resultat-item, bandeau « Aucun résultat... »). Un slug ' +
    'inconnu redirige vers /biens/result, sans carte. Une vingtaine de cartes ' +
    'par page : seule la première est lue, le stock de la zone tient sur une.',
};

export const guyHoquetScraper: Scraper = {
  descriptor: GUY_HOQUET_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: GUY_HOQUET_DESCRIPTOR.id,
      listUrls: LIST_URLS,
      parseList: (body) => parseList(body),
      isEmptyList,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
