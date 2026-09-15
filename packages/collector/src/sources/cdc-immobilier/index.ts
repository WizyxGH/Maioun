/**
 * Source : CDC Immobilier (cdcimmobilier.com) — 2 place Wilson, 06000 Nice.
 * Même gabarit Apimo classique qu'Agence Castel : parseur partagé dans
 * `../agence-castel/parser.ts`.
 *
 * Une requête de recherche par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : identique à celui d'Agence Castel (/q/*,
 * formulaires, /diagnostic/* interdits). Aucune location au relevé : suivie en
 * attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { listUrl, parseDetail, parseList, type ApimoClassicSite } from '../agence-castel/parser.js';

const MAX_DETAILS = 8;

export const CDC_IMMOBILIER: ApimoClassicSite = {
  agencyName: 'CDC Immobilier',
  origin: 'https://www.cdcimmobilier.com',
};

export const CDC_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'cdc-immobilier',
  name: CDC_IMMOBILIER.agencyName,
  domain: 'cdcimmobilier.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/recherche/*'],
  agencyContact: {
    phone: '04 89 15 88 89', // secret-scan-ignore
    email: 'contact@cdcimmobilier.com', // secret-scan-ignore
    address: { street: '2 place Wilson', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'Site Apimo « classique » (free10). robots.txt vérifié le 2026-09-15 : ' +
    '/diagnostic/* et formulaires interdits. Recherche /fr/recherche/?nature=2, ' +
    'fiches /fr/recherche/{slug}-{cp}-{id} ; parseur d’Agence Castel.',
};

export const cdcImmobilierScraper: Scraper = {
  descriptor: CDC_IMMOBILIER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: CDC_IMMOBILIER_DESCRIPTOR.id,
      listUrls: [listUrl(CDC_IMMOBILIER)],
      parseList: (body) => parseList(body, CDC_IMMOBILIER),
      parseDetail: (html, listing) => parseDetail(html, listing, CDC_IMMOBILIER),
      maxDetails: MAX_DETAILS,
    }),
};
