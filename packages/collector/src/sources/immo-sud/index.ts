/**
 * Source : Immo-Sud Nice (agenceimmosud.com) — agence niçoise sur la plateforme
 * La Boîte Immo/Hektor (§47). Repérée le 2026-08-24 via les e-mails de
 * confirmation SeLoger (agence contactée non encore couverte).
 *
 * Signature La Boîte Immo confirmée le 2026-08-24 (« Powered by La Boîte Immo »).
 *
 * `robots.txt` relu le 2026-09-25 : `Allow: /`, seuls `/stats`, `/phpmv2`,
 * `/fonctions`, `/templates`, `/admin` et `/images/clients` sont interdits.
 *
 * LA LISTE FILTRÉE NOUS CACHAIT LA MOITIÉ DU CATALOGUE. Elle visait
 * `/location/1-nice/appartement/1` — Nice ET appartement —, seule de toutes les
 * sources La Boîte Immo à filtrer par type. Mesuré le 2026-09-25 avec le
 * parseur du projet : la page filtrée rend 3 fiches, `/location/1` en rend 6.
 * Trois annonces invisibles, dont nous ne savions même pas qu'elles existaient.
 *
 * Ce n'est pas au scraper de choisir le périmètre : il lit ce que l'agence
 * publie, et ce sont les CRITÈRES qui écartent ensuite ce qui est hors zone ou
 * hors type. Filtrer à la collecte, c'est perdre sans trace.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const immoSudScraper = makeHektorScraper({
  id: 'immo-sud',
  name: 'Immo-Sud Nice',
  domain: 'agenceimmosud.com',
  // Pas de /favicon.ico ici : le site declare son icone ailleurs (§17).
  logo: 'https://www.agenceimmosud.com/images/favicon.png',
  listUrls: ['https://www.agenceimmosud.com/location/1'],
});
