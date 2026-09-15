/**
 * Source : Méditerranée Immo (mediterranee-immo.fr) — 20 avenue Valombrose,
 * Nice. Plateforme La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme. 4 locations à
 * Nice, studios et deux-pièces pour étudiants.
 *
 * Le pied de page porte la ligne, l'e-mail et l'adresse de l'agence (relevé du
 * 2026-09-15) : coordonnées professionnelles publiques, reprises à défaut de
 * celles de l'annonce.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const mediterraneeImmoScraper = makeHektorScraper({
  id: 'mediterranee-immo',
  name: 'Méditerranée Immo',
  domain: 'mediterranee-immo.fr',
  agencyContact: {
    phone: '06 72 81 84 23', // secret-scan-ignore
    email: 'mediterranee_immo@orange.fr', // secret-scan-ignore
    address: { street: '20 avenue Valombrose', postalCode: '06000', city: 'Nice' },
  },
  listUrls: ['https://www.mediterranee-immo.fr/location/1'],
});
