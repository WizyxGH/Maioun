/**
 * Source : Immobilière Victor Hugo (immobilierevictorhugo.fr) — 15 boulevard
 * Victor Hugo, 06000 Nice. Plateforme Apimo : adaptateur générique
 * `../apimo/`.
 *
 * Vérifié le 2026-09-18 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 *
 * Le sitemap garde 60 locations niçoises, mais il n’est jamais purgé : 47
 * datent de 2021 à 2024 et le plafond d’âge les écarte à bon droit. Les 13
 * vivantes sont bien toutes collectées. Les fiches de Menton sont hors
 * périmètre.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const victorHugoScraper = makeApimoScraper({
  id: 'victor-hugo',
  name: 'Immobilière Victor Hugo',
  domain: 'immobilierevictorhugo.fr',
  agencyContact: {
    address: { street: '15 boulevard Victor Hugo', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://immobilierevictorhugo.fr/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://immobilierevictorhugo.fr/fr/locations'],
});
