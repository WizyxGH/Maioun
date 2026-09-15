/**
 * Source : Nestenn Nice Port - Riquier (immobilier-nice-port.nestenn.com) — 18
 * boulevard de Riquier, 06300 Nice. Agence du réseau Nestenn, logiciel
 * Immo-Facile, voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : n'interdit que /listing*, /?action=listing*,
 * /impressionbien-*, les DPE et les .xls/.doc — ni /louer ni les fiches. 3
 * locations à Nice au relevé.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const NESTENN_NICE_PORT_DESCRIPTOR: SourceDescriptor = {
  id: 'nestenn-nice-port',
  name: 'Nestenn Nice Port - Riquier',
  domain: 'immobilier-nice-port.nestenn.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  // /louer ne met en avant que 3 locations sur ~9, et la recherche complète
  // (/listing*) est interdite : une absence ne dit pas qu'une annonce est louée.
  oneShotListings: true,
  allowedPaths: ['/louer', '/*-ref-*'],
  agencyContact: {
    phone: '04 93 26 90 95', // secret-scan-ignore
    email: 'nice-port@nestenn.com', // secret-scan-ignore
    address: { street: '18 boulevard de Riquier', postalCode: '06300', city: 'Nice' },
  },
  notes:
    'Réseau Nestenn, logiciel Immo-Facile, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : /louer et les fiches …-ref-{id} autorisés (/listing* interdit, ' +
    'non utilisé). JSON-LD invalide : lecture du bloc #description.',
};

export const nestennNicePortScraper: Scraper = {
  descriptor: NESTENN_NICE_PORT_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: NESTENN_NICE_PORT_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html, listing) => parseDetail(html, listing.sourceRef),
      maxDetails: MAX_DETAILS,
    }),
};
