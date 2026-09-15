/**
 * Source : Imodirect (annonces.imodirect.com) — gestionnaire locatif en ligne,
 * sans agence physique ; publie ses locations de Nice sur son propre site. Voir
 * `parser.ts`.
 *
 * Une requête de liste par passage (toute la France sur une page), puis les
 * fiches nouvelles de la zone seulement. robots.txt vérifié le 2026-09-15 :
 * `User-agent: *` autorisé (Content-Signal search=yes, ai-train=no) ; seuls
 * /account/, /manage/, /partial/, /file/, /imoagent/, /demandes/, /locataire/
 * sont interdits. 2 locations à Nice au relevé, sur ≈ 270 en France.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetail, parseList } from './parser.js';

const MAX_DETAILS = 6;

export const IMODIRECT_DESCRIPTOR: SourceDescriptor = {
  id: 'imodirect',
  name: 'Imodirect',
  domain: 'annonces.imodirect.com',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/annonces', '/annonces/annonceview/*'],
  agencyContact: {
    phone: '09 80 80 01 91', // secret-scan-ignore
  },
  notes:
    'Gestionnaire en ligne national, rendu serveur. robots.txt vérifié le ' +
    '2026-09-15. Liste /annonces (France entière, une page) filtrée sur les codes ' +
    'postaux de la zone ; fiches /annonces/annonceview/{id}/{slug}. Pas de dépôt ' +
    'de garantie publié.',
};

export const imodirectScraper: Scraper = {
  descriptor: IMODIRECT_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: IMODIRECT_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseList(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
