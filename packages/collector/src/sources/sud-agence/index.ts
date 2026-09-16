/**
 * Source : Sud Agence (sudagence.fr) — 25 rue Arson, 06300 Nice. Plateforme
 * La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-16 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). La liste
 * annonce 10 biens, tous à Nice, sur une seule page : 7 logements, 2
 * stationnements, et une fiche retirée que la liste montre encore (son adresse
 * redirige vers l'accueil, et le sitemap ne la porte plus). Pas d'autre
 * rubrique de location résidentielle : « Location Immobilier Professionnel »
 * est un filtre de locaux, et les secteurs Perpignan, Toulouse et Var sont hors
 * zone. Le sitemap préfixe TOUTES les fiches de `/vente/`, locations comprises :
 * inutilisable ici, comme sur le reste de la plateforme.
 *
 * Ce que le site ne publie pas : date de parution, coordonnées du bien, et le
 * DPE, servi en image sous /admin (interdit par robots) — laissés inconnus.
 * Demandée par l'utilisateur.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const sudAgenceScraper = makeHektorScraper({
  id: 'sud-agence',
  name: 'Sud Agence',
  domain: 'sudagence.fr',
  logo: 'https://www.sudagence.fr/images/favicon.png',
  agencyContact: {
    phone: '04 93 89 42 08', // secret-scan-ignore
    email: 'sudagence.immo@orange.fr', // secret-scan-ignore
    address: { street: '25 rue Arson', postalCode: '06300', city: 'Nice' },
  },
  listUrls: ['https://www.sudagence.fr/location/1'],
});
