/**
 * Source : Azurimmo (azurimmo06.net) — Le Stanesco, 170 boulevard Napoléon III,
 * 06200 Nice. Site maison (Foxy Emy) : voir `parser.ts`.
 *
 * Une requête de recherche par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : absent (404), rien d'interdit. 1 location
 * à Nice au relevé (studio meublé étudiant), contre une vingtaine de ventes :
 * un filet à faible rendement.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 5;

export const AZURIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'azurimmo',
  name: 'Azurimmo',
  domain: 'azurimmo06.net',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/nos-biens-en-vente-ou-location/*', '/biens/*'],
  agencyContact: {
    phone: '04 93 07 62 37', // secret-scan-ignore
    email: 'contact@azurimmo06.net', // secret-scan-ignore
    address: { street: '170 boulevard Napoléon III', postalCode: '06200', city: 'Nice' },
  },
  notes:
    'Site maison (Foxy Emy), rendu serveur. robots.txt absent au 2026-09-15. ' +
    'Recherche ?category=location, fiches /biens/location-{type}-{n}piece-' +
    '{commune}-{cp}-{id} : loyer charges comprises en titre, charges, dépôt ' +
    'et honoraires dans « Informations légales ».',
};

export const azurimmoScraper: Scraper = {
  descriptor: AZURIMMO_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: AZURIMMO_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html, listing) => parseDetail(html, listing),
      maxDetails: MAX_DETAILS,
    }),
};
