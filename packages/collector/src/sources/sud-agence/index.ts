/**
 * Source : Sud Agence (sudagence.fr) — 25 rue Arson, 06300 Nice. Plateforme
 * La Boîte Immo : adaptateur générique `../hektor/`.
 *
 * Vérifié le 2026-09-17 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits). La liste
 * annonce 9 biens, tous à Nice, sur une seule page : 7 logements et 2
 * stationnements — la fiche retirée qu'elle montrait encore la veille en est
 * partie. `/location_biens_nice/1` rend exactement les mêmes 9 ; le secteur
 * Perpignan/Var n'a aucune location, et « Location Immobilier Professionnel »
 * est un filtre de locaux. Le sitemap préfixe TOUTES les fiches de `/vente/`,
 * locations comprises : inutilisable ici, comme sur le reste de la plateforme.
 *
 * LE TITRE NE DIT PAS LE LOYER. Le montant qu'il porte est saisi à la main et
 * vieillit : la fiche 554 s'intitule « … 790€ » quand le loyer est descendu à
 * 750, et la 553 « … 1107€ » quand la case déclare 1 190. Le prix retenu est
 * toujours « Loyer CC* / mois », charges comprises, et la ligne « Charges
 * locatives » en est le détail — pas un supplément. Il arrive que la
 * description contredise la case ; elle n'est jamais préférée.
 *
 * Ce que le site ne publie pas : date de parution, coordonnées du bien, et le
 * DPE, servi en image sous /admin (interdit par robots) — laissés inconnus.
 * Le téléphone n'est que sur le bouton « Afficher le téléphone » de la fiche.
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
