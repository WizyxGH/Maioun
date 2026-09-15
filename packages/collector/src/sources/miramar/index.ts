/**
 * Source : Miramar Real Estate (miramarimmo.com) — 7/13 boulevard Franck
 * Pilatte, 06300 Nice. WordPress/Elementor, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune interdiction. Grille des locations
 * vide au relevé (12 ventes publiées) : suivie en attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const MIRAMAR_DESCRIPTOR: SourceDescriptor = {
  id: 'miramar',
  name: AGENCY_NAME,
  domain: 'miramarimmo.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/locations/', '/biens/*'],
  agencyContact: {
    phone: '04 93 56 66 05', // secret-scan-ignore
    email: 'contact@miramarimmo.com', // secret-scan-ignore
    address: { street: '7/13 boulevard Franck Pilatte', postalCode: '06300', city: 'Nice' },
  },
  notes:
    'WordPress + Elementor Pro (thème maison), rendu serveur. robots.txt ' +
    'vérifié le 2026-09-15 : aucune interdiction. Grille /locations/ (cartes ' +
    'e-loop-item-{id}, transaction en classe), fiches /biens/{slug}/ à ' +
    'intertitres « Libellé : valeur ».',
};

export const miramarScraper: Scraper = {
  descriptor: MIRAMAR_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: MIRAMAR_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
