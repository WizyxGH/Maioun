/**
 * Source : Agence du Centre (agenceducentrenice.com) — agence niçoise sur la
 * plateforme La Boîte Immo/Hektor (§47), inventaire du 2026-08-17.
 *
 * robots.txt vérifié le 2026-08-17 : permissif (Allow: /), sitemap déclaré.
 * ~5 fiches de location sur la liste au moment de l'étude.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agenceDuCentreScraper = makeHektorScraper({
  id: 'agence-du-centre',
  name: 'Agence du Centre',
  domain: 'agenceducentrenice.com',
  // Pas de /favicon.ico ici : le site declare son icone ailleurs (§17).
  logo: 'https://www.agenceducentrenice.com/images/favicon.png',
  listUrls: ['https://www.agenceducentrenice.com/location/1'],
});
