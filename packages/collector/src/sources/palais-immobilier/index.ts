/**
 * Source : Palais Immobilier Côte d'Azur (palaisimmobilier.com) — réseau
 * d'agences niçoises sur la plateforme Apimo/Cello (§47).
 *
 * LA PLUS GROSSE SOURCE LOCALE DU PROJET à ce jour : 105 locations dans les
 * communes cibles au sitemap du 2026-09-04, devant fnaim.fr (~75 par passage).
 * Le réseau tient plusieurs bureaux — Vieux Nice, Nice Ouest — et publie
 * appartements, maisons, bureaux, caves et parkings ; le filtrage par type
 * reste celui du pipeline, on ne trie pas ici (§17).
 *
 * Vérifié le 2026-09-04 : robots.txt permissif (seul `/app_dev.php` interdit),
 * sitemap index → 2 196 URL, signature Apimo confirmée sur les fiches
 * `/fr/propriete/location+…`.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const palaisImmobilierScraper = makeApimoScraper({
  id: 'palais-immobilier',
  name: 'Palais Immobilier',
  domain: 'palaisimmobilier.com',
  sitemapUrl: 'https://palaisimmobilier.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  // SA PAGE PORTE TROIS ANNONCES QUE SON SITEMAP IGNORE (86776606, 86819657,
  // 87404415 au 2026-09-23). Le chemin n'est ni /fr/locations — qui ne rend
  // rien — ni la racine : c'est /fr/location-nice.
  listUrls: ['https://palaisimmobilier.com/fr/location-nice'],
  // Le volume justifie un budget de découverte plus large que le défaut : à
  // 20 fiches par passage, un stock de 105 mettrait cinq passages à entrer.
  maxDetailsBackfill: 40,
});
