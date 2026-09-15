/**
 * Source : Agence Castel (agencecastel.com, en http seulement) — 25 rue
 * Bonaparte, 06300 Nice. Gabarit Apimo classique, voir `parser.ts`.
 *
 * Une requête de recherche par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : /q/*, impressions, formulaires, /diagnostic/*
 * et ?order= interdits ; la recherche et les fiches sont permises. Aucune
 * location au relevé (15 ventes) : l'agence est suivie en attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCE_CASTEL, listUrl, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const AGENCE_CASTEL_DESCRIPTOR: SourceDescriptor = {
  id: 'agence-castel',
  name: AGENCE_CASTEL.agencyName,
  domain: 'agencecastel.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/recherche/*'],
  agencyContact: {
    phone: '06 03 18 99 64', // secret-scan-ignore
    email: 'info@agencecastel.com', // secret-scan-ignore
    address: { street: '25 rue Bonaparte', postalCode: '06300', city: 'Nice' },
  },
  notes:
    'Site Apimo « classique » (free10), http seulement. robots.txt vérifié le ' +
    '2026-09-15 : /diagnostic/* et formulaires interdits. Recherche ' +
    '/fr/recherche/?nature=2 (location), fiches /fr/recherche/{slug}-{cp}-{id} ; ' +
    'DPE déduit des valeurs portées par l’adresse des images, sans les charger.',
};

export const agenceCastelScraper: Scraper = {
  descriptor: AGENCE_CASTEL_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: AGENCE_CASTEL_DESCRIPTOR.id,
      listUrls: [listUrl(AGENCE_CASTEL)],
      parseList: (body) => parseList(body, AGENCE_CASTEL),
      parseDetail: (html, listing) => parseDetail(html, listing, AGENCE_CASTEL),
      maxDetails: MAX_DETAILS,
    }),
};
