/**
 * Source : Gestion Cassini (gestioncassini.com) — agence niçoise indépendante
 * (12 rue François Guisol, 06300 Nice), sur la plateforme Apimo/Cello.
 * Demandée par l'utilisateur.
 *
 * Instance de l'adaptateur générique `sources/apimo` (§47) : même robots.txt
 * permissif (seul /app_dev.php interdit), même sitemap, mêmes fiches JSON-LD
 * que BEP et D'Azur. Vérifié le 2026-08-16 — beaucoup de locations à Nice, avec
 * l'adresse dans l'URL de la fiche.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { portalCommuneSlugs } from '../shared/communes.js';

export const gestionCassiniScraper = makeApimoScraper({
  id: 'gestion-cassini',
  name: 'Gestion Cassini',
  domain: 'gestioncassini.com',
  agencyContact: {
    address: { street: '12 rue François Guisol', postalCode: '06300', city: 'Nice' },
  },
  sitemapUrl: 'https://www.gestioncassini.com/sitemap.xml',
  // Les trois communes écartées le sont par héritage de la liste recopiée,
  // sans raison consignée. Le filtre porte sur un sitemap déjà téléchargé :
  // les rouvrir ne coûterait aucune requête.
  citySlugs: portalCommuneSlugs({
    omit: ['villeneuve-loubet', 'saint-andre-de-la-roche', 'colomars'],
  }),
});
