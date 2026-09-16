/**
 * Source : BEP Logement — première AGENCE LOCALE du projet (§3), sur la
 * plateforme Apimo/Cello. Depuis la généralisation (§47), ce n'est plus qu'une
 * instance de l'adaptateur générique `sources/apimo` : toute la logique de
 * collecte (sitemap → fiches nouvelles) y vit, partagée avec les autres
 * agences Apimo (D'Azur…).
 *
 * robots.txt vérifié le 2026-08-15 : permissif (seul /app_dev.php interdit),
 * sitemap déclaré. Communes cibles : Nice et sa continuité urbaine.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { portalCommuneSlugs } from '../shared/communes.js';

export const bepScraper = makeApimoScraper({
  id: 'bep',
  name: 'BEP Logement',
  domain: 'bep-logement.com',
  // MÊME MAISON QUE `bep-abonnes` : le bulletin abonnés publie le même stock,
  // avec d'autres références et d'autres photos (§14).
  operator: 'bep-logement',
  sitemapUrl: 'https://bep-logement.com/sitemap.xml',
  // Falicon déborde le périmètre : l'agence y publie, et une commune limitrophe
  // de Nice vaut d'être lue. Les cinq écartées le sont par héritage de la liste
  // recopiée, sans raison consignée — l'en-tête ci-dessus annonce pourtant le
  // périmètre entier. Le filtre porte sur un sitemap déjà téléchargé.
  citySlugs: [
    ...portalCommuneSlugs({
      omit: ['villeneuve-loubet', 'cap-d-ail', 'carros', 'contes', 'colomars'],
    }),
    'falicon',
  ],
});
