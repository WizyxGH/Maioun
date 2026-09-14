/**
 * Source : Carletta Immobilier — voir `parser.ts`.
 *
 * Une requête de sitemap par passage, puis les fiches des annonces nouvelles.
 * robots.txt vérifié le 2026-09-14 : n'interdit que /Templates/, /.inc/,
 * /stats/, /admin/, /scripts/, quelques pages et les tris `CRIT_TRI` ; le
 * sitemap est déclaré. 11 locations à Nice au relevé (10 appartements, un
 * garage).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { SITEMAP_URL, parseDetail, parseSitemap } from './parser.js';

const MAX_DETAILS = 8;

export const CARLETTA_DESCRIPTOR: SourceDescriptor = {
  id: 'carletta',
  name: 'Carletta Immobilier',
  domain: 'carletta.fr',
  kind: 'localAgency',
  method: 'sitemap',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/ftp/sitemap-fr.xml', '/location/*'],
  notes:
    'Site Bexter (windows-1252). robots.txt vérifié le 2026-09-14 : admin, ' +
    'scripts et tris CRIT_TRI interdits. Sitemap → fiches /location/…/{réf}.htm ; ' +
    'loyer CC, provision, dépôt et honoraires lus en toutes lettres sur la fiche.',
};

export const carlettaScraper: Scraper = {
  descriptor: CARLETTA_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: CARLETTA_DESCRIPTOR.id,
      listUrls: [SITEMAP_URL],
      parseList: (body) => parseSitemap(body),
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    }),
};
