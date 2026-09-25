/**
 * Source : Arthurimmo — agence de Nice du réseau. Voir `parser.ts` et
 * `docs/sources-enquetes.md` pour l'étude.
 *
 * UNE PAGE DE LISTE, PUIS UNE FICHE PAR ANNONCE. La liste ne porte rien
 * d'exploitable hormis les adresses des fiches ; tout le reste est sur
 * celles-ci. Sept locations relevées le 2026-09-09, donc huit requêtes pour
 * l'inventaire entier.
 *
 * Les fiches passent par la mémoire commune : une fiche lue n'est relue qu'au
 * bout d'une semaine, et le stock collecté quand seul l'en-tête était lu — sa
 * description coupée à 150 caractères — se complète de lui-même.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, linkOf, parseDetail, parseList } from './parser.js';

/**
 * Fiches visitées par exécution.
 *
 * Le stock niçois tient en une dizaine de biens : une première collecte est
 * couverte d'un seul passage, et il n'en reste ensuite qu'une à chaque parution.
 */
const MAX_DETAILS = 12;

export const ARTHURIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'arthurimmo',
  name: 'Arthurimmo.com Nice',
  domain: 'arthurimmo.com',
  kind: 'agencyNetwork',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('agencyNetwork'),
  budget: budgetFor('agencyNetwork', {
    maxPagesPerRun: 1 + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  allowedPaths: ['/recherche,basic.htm', '/annonces/location/*'],
  notes:
    'robots.txt vérifié le 2026-09-14 : « User-agent: * » n’interdit rien. Le ' +
    'fichier bloque nommément Claudebot, Bytespider et barkrowler — des robots ' +
    'd’entraînement d’IA, pas un agent de recherche personnel qui s’annonce. ' +
    'Seule la page de recherche liste les biens ; les chemins nus rendent zéro. ' +
    'Loyer, surface et pièces viennent du titre social de chaque fiche, composé ' +
    'par le site dans un ordre invariable ; la description entière, du bloc ' +
    '« Détails de l’annonce » (l’en-tête la coupe).',
};

export const arthurimmoScraper: Scraper = {
  descriptor: ARTHURIMMO_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: ARTHURIMMO_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html, listing) => parseDetail(html, linkOf(listing)),
      maxDetails: MAX_DETAILS,
    }),
};
