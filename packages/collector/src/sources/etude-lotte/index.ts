/**
 * Source : Étude Lotte (etudelotte.com) — 36 avenue Paul Arène, 06000 Nice.
 * Plateforme Apimo : adaptateur générique `../apimo/`.
 *
 * Vérifié le 2026-09-14 : robots.txt n’interdit que /app_dev.php, sitemap
 * déclaré, fiches `/fr/propriete/location+…`.
 *
 * SON SITEMAP OUBLIE CE QUI VIENT D'ARRIVER, d'où la page de liste en plus.
 * Relevé du 2026-09-23, parti d'une annonce reçue par Jinka : la référence
 * 7229516 figure sur sa page de locations et pas au sitemap — elle ne nous
 * était parvenue que par Bien'ici et par une alerte e-mail, plus tard et
 * amputée de ce que le portail coupe.
 *
 * ET SES VINGT-DEUX FICHES SONT BIEN VIVANTES : toutes répondent 200, alors
 * que sa page n'en affiche que deux. Lire la page SEULE en aurait fait perdre
 * vingt. Les deux vues sont incomplètes, chacune dans l'autre sens.
 */

import { makeApimoScraper } from '../apimo/scraper.js';
import { NICE_AREA_SLUGS } from '../shared/communes.js';

export const etudeLotteScraper = makeApimoScraper({
  id: 'etude-lotte',
  name: 'Étude Lotte',
  domain: 'etudelotte.com',
  // Pied de page du 2026-09-15 : téléphone public, aucune adresse e-mail.
  agencyContact: {
    phone: '04 92 10 10 25', // secret-scan-ignore
    address: { street: '36 avenue Paul Arène', postalCode: '06000', city: 'Nice' },
  },
  sitemapUrl: 'https://etudelotte.com/sitemap.xml',
  citySlugs: NICE_AREA_SLUGS,
  listUrls: ['https://etudelotte.com/fr/locations'],
});
