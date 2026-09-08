/**
 * Source : Oréa Immobilier (orea-immobilier.fr) — agence niçoise sur la
 * plateforme Apimo/Cello (§47).
 *
 * LA PLUS GROSSE PRISE DEPUIS FNAIM. Sondée le 2026-09-08 avec
 * `scripts/probe-agency.mjs` : robots.txt permissif (seul `/app_dev.php` est
 * interdit), signature Apimo confirmée, et 216 locations dans les communes
 * cibles au sitemap — quatre fois le volume d'Acropolis, qui tourne sur
 * exactement le même lecteur.
 *
 * Le plafond de reprise est relevé en conséquence : à vingt-cinq fiches par
 * passage, deux cents annonces mettraient une semaine à entrer.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../agence-victoire/index.js';

export const oreaScraper = makeApimoScraper({
  id: 'orea',
  name: 'Oréa Immobilier',
  domain: 'orea-immobilier.fr',
  sitemapUrl: 'https://www.orea-immobilier.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  maxDetailsBackfill: 40,
});
