/**
 * Source : CDS Gestion (cdsgestion.fr) — 51 boulevard Victor Hugo, 06000 Nice.
 * WordPress/RealHomes, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 (.fr et .com) : seuls /wp-login.php,
 * /wp-admin, /wp-includes et /wp-content hors uploads interdits. Aucune
 * location ouverte au relevé (les anciennes restent en ligne « Loué! ») :
 * suivie en attente.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const CDS_GESTION_DESCRIPTOR: SourceDescriptor = {
  id: 'cds-gestion',
  name: 'CDS Gestion',
  domain: 'cdsgestion.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/annonces-immobilieres/', '/property/*'],
  agencyContact: {
    phone: '04 93 53 45 58', // secret-scan-ignore
    email: 'contact@cdsgestion.com', // secret-scan-ignore
    address: { street: '51 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'WordPress, thème RealHomes, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : /wp-admin, /wp-includes, /wp-content hors uploads interdits. ' +
    'Recherche ?status=a-louer sur cdsgestion.fr, fiches /property/{slug}/ sur ' +
    'cdsgestion.com ; montants lus dans la description.',
};

export const cdsGestionScraper: Scraper = {
  descriptor: CDS_GESTION_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: CDS_GESTION_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
