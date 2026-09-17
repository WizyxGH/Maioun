/**
 * Source : Giletta Immobilier (giletta-properties.com) — agence niçoise sur la
 * plateforme La Boîte Immo/Hektor. Meilleur volume unitaire de l'inventaire :
 * beaucoup de locations étudiantes exclusives, écartées par le filtre étudiant,
 * et des parkings, écartés par le scoring.
 *
 * robots.txt vérifié le 2026-08-17 : permissif (Allow: /), sitemap déclaré.
 *
 * TROIS PAGES ÉCRITES À LA MAIN POUR SIX PAGES PUBLIÉES. Dénombrement du
 * 2026-09-17 : le site porte 53 locations sur six pages de dix, le descripteur
 * en déclarait trois — 23 annonces n'avaient jamais été vues, le plus gros trou
 * de la plateforme. La pagination est désormais suivie par l'adaptateur
 * générique : la première page suffit à la déclarer.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const gilettaScraper = makeHektorScraper({
  id: 'giletta',
  name: 'Giletta Immobilier',
  domain: 'giletta-properties.com',
  // Agence unique, coordonnées du pied de page (relevé du 2026-09-15).
  agencyContact: {
    phone: '04 93 16 26 12', // secret-scan-ignore
    email: 'info@giletta-properties.com', // secret-scan-ignore
    address: { street: '1 rue Maurice Jaubert', postalCode: '06000', city: 'Nice' },
  },
  // Pas de /favicon.ico ici : le site declare son icone ailleurs.
  logo: 'https://www.giletta-properties.com/images/favicon.png',
  listUrls: ['https://www.giletta-properties.com/location/1'],
});
