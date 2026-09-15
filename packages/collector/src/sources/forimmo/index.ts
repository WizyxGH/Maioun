/**
 * Source : Forimmo (forimmo.fr) — 31 ter rue Barla, 06300 Nice. Site ICS au
 * gabarit `resultat.php`, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : aucune règle. 8 locations au relevé, dont
 * 3 appartements à Nice ; parking à Cagnes, commerces et Menton écartés au
 * scoring.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const FORIMMO_DESCRIPTOR: SourceDescriptor = {
  id: 'forimmo',
  name: 'Forimmo',
  domain: 'forimmo.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/resultat.php', '/location-*-fiche-*.html'],
  agencyContact: {
    email: 'location@forimmo.fr', // secret-scan-ignore
    address: { street: '31 ter rue Barla', postalCode: '06300', city: 'Nice' },
  },
  notes:
    'Site ICS au gabarit resultat.php (sans JSON embarqué, hors adaptateur ics). ' +
    'robots.txt vérifié le 2026-09-15 : aucune règle. La liste donne type, ' +
    'commune, pièces, surface, loyer et description ; la fiche ajoute code ' +
    'postal, charges, honoraires, dépôt et photos.',
};

export const forimmoScraper: Scraper = {
  descriptor: FORIMMO_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: FORIMMO_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html, listing) => parseDetail(html, listing),
      maxDetails: MAX_DETAILS,
    }),
};
