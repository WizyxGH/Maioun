/**
 * Source : D'Azur Immobilier (dazur.fr) — agence niçoise (Carré d'Or), sur la
 * plateforme Apimo/Cello. Demandée par l'utilisateur.
 *
 * Instance de l'adaptateur générique `sources/apimo` (§47) : même robots.txt
 * permissif (seul /app_dev.php interdit), même sitemap, mêmes fiches JSON-LD
 * que BEP. Vérifié le 2026-08-15.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { portalCommuneSlugs } from '../shared/communes.js';

export const dazurScraper = makeApimoScraper({
  id: 'dazur',
  name: "D'Azur Immobilier",
  domain: 'dazur.fr',
  sitemapUrl: 'https://dazur.fr/sitemap.xml',
  listUrls: ['https://dazur.fr/fr/location'],
  // Les communes écartées le sont par héritage de la liste recopiée, sans
  // raison consignée. Le filtre porte sur un sitemap déjà téléchargé : les
  // rouvrir ne coûterait aucune requête.
  citySlugs: portalCommuneSlugs({
    omit: ['villeneuve-loubet', 'saint-andre-de-la-roche', 'drap', 'carros', 'contes', 'colomars'],
  }),
});
