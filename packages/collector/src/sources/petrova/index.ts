/**
 * Source : Petrova Investissement Immobilier (petrovainvestissement.com) —
 * agence niçoise sur la plateforme Apimo/Cello (§47).
 *
 * Demandée par son nom. Elle figurait déjà dans nos relevés comme une enseigne
 * que le résolveur d'agences ne savait rattacher à aucune source : les portails
 * la nommaient, nous ne la lisions pas.
 *
 * Vérifié le 2026-09-22 : `robots.txt` n'interdit que `/app_dev.php` et déclare
 * son sitemap ; signature « Design by Apimo™ » en pied de page ; les fiches
 * portent la forme attendue `/fr/propriete/location+appartement+nice+…+<réf>`.
 * Douze locations au sitemap, toutes à Nice, et dix sur la page de recherche.
 *
 * SON SITEMAP TRAÎNE DU VIEUX : les entrées s'échelonnent de décembre 2024 à
 * septembre 2026, et les références qu'il porte ne sont pas celles qu'affiche
 * la page de recherche. `maxEntryAgeDays` écarte donc ce qui a plus de six
 * mois plutôt que de dépenser le budget de pages en 404.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const petrovaScraper = makeApimoScraper({
  id: 'petrova',
  name: 'Petrova Investissement Immobilier',
  domain: 'petrovainvestissement.com',
  agencyContact: {
    address: { street: '5 bis quai Rauba Capeu', postalCode: '06300', city: 'Nice' },
  },
  sitemapUrl: 'https://petrovainvestissement.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  maxEntryAgeDays: 180,
});
