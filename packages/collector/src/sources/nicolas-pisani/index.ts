/**
 * Source : Nicolas Pisani Real Estate — une seule source pour le groupe (Nicolas
 * Pisani Real Estate Agents, Nicolas Pisani & Laurent Romor, Nicolas Pisani &
 * Associés), qui publie sur le même site. Voir `parser.ts`.
 *
 * Une requête de liste par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-15 : formulaires, PDF, API et pages vitrine
 * interdits ; la liste des locations et les fiches /fr/detail-location/ sont
 * permises. 8 locations à l'année au relevé (5 400 à 25 000 €/mois, Nice,
 * Beaulieu, Villefranche, Saint-Jean-Cap-Ferrat, Cap-d'Ail), dont 3 « Nous
 * contacter » écartées ; le saisonnier (sous-domaine dédié et cartes `cat-3`)
 * n'est pas lu.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { AGENCY_NAME, LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 8;

export const NICOLAS_PISANI_DESCRIPTOR: SourceDescriptor = {
  id: 'nicolas-pisani',
  name: AGENCY_NAME,
  domain: 'nicolaspisani.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/fr/locations-villas-appartements-exceptionnel.cfm', '/fr/detail-location/*'],
  agencyContact: {
    phone: '04 93 01 42 74', // secret-scan-ignore
    email: 'contact@np-lr.com', // secret-scan-ignore
    address: { street: '1 rue Paul Doumer', postalCode: '06310', city: 'Beaulieu-sur-Mer' },
  },
  notes:
    'Site Webflow sur données Apimo, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15 : formulaires, PDF et API interdits. Liste ?cc=2 (location à ' +
    'l’année, cartes cat-2 ; le saisonnier cat-3 affiche aussi « / Mois »), ' +
    'fiches /fr/detail-location/{type}/{id}-{slug}.cfm ; DPE déduit des valeurs.',
};

export const nicolasPisaniScraper: Scraper = {
  descriptor: NICOLAS_PISANI_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: NICOLAS_PISANI_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
