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
  /**
   * LES PORTAILS LA REBAPTISENT, et l'annuaire en faisait trois agences :
   * Bien'ici écrit « BEP NICE » (48 annonces), ParuVendu « BEP LOGEMENT » (44)
   * et « BEP ANTIBES » (2), le bulletin abonnés « BEP Logement » (26). Deux de
   * ces lignes n'avaient ni logo ni adresse, faute de se rattacher ici.
   *
   * Relevé sur les annonces le 2026-09-25, pas deviné : « BEP » seul fait trois
   * lettres, et la règle de rapprochement refuse à juste titre d'en tirer quoi
   * que ce soit.
   */
  alsoKnownAs: ['BEP Nice', 'BEP Antibes'],
  // MÊME MAISON QUE `bep-abonnes` : le bulletin abonnés publie le même stock,
  // avec d'autres références et d'autres photos (§14).
  operator: 'bep-logement',
  sitemapUrl: 'https://bep-logement.com/sitemap.xml',
  /**
   * LE PÉRIMÈTRE ENTIER, plus Falicon.
   *
   * Cinq communes — Villeneuve-Loubet, Cap-d'Ail, Carros, Contes, Colomars —
   * étaient écartées par héritage d'une liste recopiée, sans raison consignée,
   * alors que l'en-tête ci-dessus annonce « Nice et sa continuité urbaine ».
   * Relevé du 2026-09-17 : BEP propose Villeneuve-Loubet dans son propre menu
   * de communes, et son F1 de 40 m² à 794 € y était en ligne sans que nous
   * l'ayons jamais lu.
   *
   * NE COÛTE RIEN QUAND CES COMMUNES SONT VIDES : le filtre s'applique à un
   * sitemap déjà téléchargé, et une commune sans annonce n'ajoute aucune
   * requête. Falicon déborde le périmètre, mais l'agence y publie et la commune
   * touche Nice.
   */
  citySlugs: [...portalCommuneSlugs(), 'falicon'],
  // SA PAGE D'ACCUEIL EST SA VITRINE DE LOCATIONS : cent fiches y figurent,
  // dont soixante-trois absentes de notre inventaire au 2026-09-23. Le
  // filtrage par commune écarte ensuite ce qui est hors périmètre — BEP
  // publie aussi pour Antibes.
  listUrls: ['https://bep-logement.com/fr/'],
});
