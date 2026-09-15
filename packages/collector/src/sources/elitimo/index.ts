/**
 * Source : Elitimo (elitimo.com) — 7 rue de Rivoli, 06000 Nice. Site Twimmo,
 * voir `../twimmo/`.
 *
 * robots.txt vérifié le 2026-09-15 : seul /*.php est interdit. 4 locations au
 * relevé (Nice ×3, Villeneuve-Loubet).
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { makeTwimmoScraper } from '../twimmo/scraper.js';

export const elitimoScraper: Scraper = makeTwimmoScraper({
  id: 'elitimo',
  name: 'Elitimo',
  siteUrl: 'https://www.elitimo.com',
  agencyContact: {
    phone: '04 93 87 28 33', // secret-scan-ignore
    email: 'contact@elitimo.com', // secret-scan-ignore
    address: { street: '7 rue de Rivoli', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'Site Twimmo, rendu serveur. robots.txt vérifié le 2026-09-15 : seul /*.php ' +
    'interdit. Liste /toutes-locations.html (une page), fiches …-{réf}.html aux ' +
    'montants en phrases engendrées.',
});

export const ELITIMO_DESCRIPTOR: SourceDescriptor = elitimoScraper.descriptor;
