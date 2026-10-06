/**
 * Source : Street Immobilier — voir `parser.ts`.
 *
 * Une requête par passage : la liste porte tout ce que la fiche dirait, sauf
 * la description.
 *
 * robots.txt relevé (archive du 2025-07-13, le serveur refusant la connexion
 * depuis la machine de développement) : seul `/40425681` est fermé. La page de
 * liste a été relevée sur l'archive du 2026-06-06 ; le premier passage réel se
 * lit dans le journal de la collecte.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseList } from './parser.js';

export const STREET_IMMOBILIER_DESCRIPTOR: SourceDescriptor = {
  id: 'street-immobilier',
  name: 'Street Immobilier',
  domain: 'street-immobilier.com',
  logo: 'https://street-immobilier.com/elements/img/logo.png',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 }),
  enabled: true,
  allowedPaths: ['/location/nice-06/*'],
  notes:
    'Genesites / Partagimmo. Liste /location/nice-06/1/0 : rue, commune, surface, pièces, ' +
    'étage, loyer CC, référence, photo, téléphone. Fiches non lues (seule la description y ' +
    'ajouterait). robots.txt : seul /40425681 fermé.',
};

export const streetImmobilierScraper: Scraper = {
  descriptor: STREET_IMMOBILIER_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: STREET_IMMOBILIER_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: () => null,
      maxDetails: 0,
    }),
};
