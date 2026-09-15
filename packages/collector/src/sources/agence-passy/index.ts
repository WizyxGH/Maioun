/**
 * Source : Agence Passy (agencepassy.com) — 4 place Franklin, 06000 Nice.
 * Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 4 fiches (logements et garages), sans commune dans l’URL : elle vient du
 * libellé « La ville de … » de la fiche.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const agencePassyScraper = makeHektorScraper({
  id: 'agence-passy',
  name: 'Agence Passy',
  domain: 'agencepassy.com',
  agencyContact: { address: { street: '4 place Franklin', postalCode: '06000', city: 'Nice' } },
  logo: 'https://www.agencepassy.com/favicon.png',
  listUrls: ['https://www.agencepassy.com/a-louer/1'],
});
