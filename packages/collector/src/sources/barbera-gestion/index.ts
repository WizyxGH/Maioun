/**
 * Source : Barbera Gestion & Patrimoine (barbera-gestion.com) — 29 avenue Jean
 * Médecin, 06000 Nice. Site maison alimenté par Apimo : voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : tout est permis. 2 locations à Nice au
 * relevé (Le Port, Riquier), au milieu de 8 ventes.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const BARBERA_GESTION_DESCRIPTOR: SourceDescriptor = {
  id: 'barbera-gestion',
  name: 'Barbera Gestion & Patrimoine',
  domain: 'barbera-gestion.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/nos-biens-1', '/offre/*'],
  agencyContact: {
    phone: '04 83 93 73 10', // secret-scan-ignore
    email: 'contact@barbera-gestion.fr', // secret-scan-ignore
    address: { street: '29 avenue Jean Médecin', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'Site maison (29ter) alimenté par Apimo. robots.txt vérifié le 2026-09-15 : ' +
    'tout permis. Liste unique /nos-biens-1 (ventes et locations, carte ' +
    '« Location » retenue), fiches /offre/propriete-{n}-{apimo} : tableaux ' +
    '« Tarifs et frais » et « Pièces ».',
};

export const barberaGestionScraper: Scraper = {
  descriptor: BARBERA_GESTION_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: BARBERA_GESTION_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
