/**
 * Source : Étude Lotte (etudelotte.com) — 36 avenue Paul Arène, 06000 Nice.
 * Plateforme Apimo, lue PAR SA PAGE DE LOCATIONS : `../apimo/list-scraper.ts`.
 *
 * SON SITEMAP MENTAIT DES DEUX CÔTÉS, et c'est ce qui a fait changer de
 * fabrique. Relevé du 2026-09-23 :
 *
 *   - il GARDE ce qui n'est plus en ligne : nous portions 22 annonces
 *     « vivantes » quand la page de l'agence n'en affichait que deux. Vingt et
 *     un fantômes, présentés comme du stock à visiter ;
 *   - il OUBLIE ce qui vient d'arriver : la référence 7229516 figure sur la
 *     page de locations et pas au sitemap. Elle ne nous est parvenue que par
 *     Bien'ici et par une alerte e-mail — donc plus tard, et amputée de ce que
 *     le portail coupe — alors que nous lisons ce site tous les jours.
 *
 * La page, elle, dit ce qui est en ligne aujourd'hui. C'est exactement le cas
 * pour lequel `list-scraper` a été écrit : « pour un sitemap qui garde les
 * locations disparues ».
 *
 * Vérifié le 2026-09-14, revérifié le 2026-09-23 : robots.txt n'interdit que
 * /app_dev.php.
 */

import { makeApimoListScraper } from '../apimo/list-scraper.js';

export const etudeLotteScraper = makeApimoListScraper({
  id: 'etude-lotte',
  name: 'Étude Lotte',
  domain: 'etudelotte.com',
  // Pied de page du 2026-09-15 : téléphone public, aucune adresse e-mail.
  agencyContact: {
    phone: '04 92 10 10 25', // secret-scan-ignore
    address: { street: '36 avenue Paul Arène', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://etudelotte.com/fr/locations'],
});
