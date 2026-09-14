/**
 * Source : Aurus Immobilier (aurusimmo.com) — 14 rue du Maréchal Joffre, 06310
 * Beaulieu-sur-Mer. Plateforme La Boîte Immo : adaptateur générique
 * `../hektor/`.
 *
 * Vérifié le 2026-09-14 : robots.txt standard de la plateforme (seuls /stats,
 * /phpmv2, /fonctions, /templates, /admin, /images/clients interdits).
 * 5 locations (Nice ×3, Beaulieu-sur-Mer, Roquebrune-Cap-Martin).
 *
 * Ni adresse ni carte sur les fiches : le quartier se lit dans le texte. Le
 * formulaire de contact est gardé par reCAPTCHA : pas d'envoi automatisé.
 */

import { makeHektorScraper } from '../hektor/scraper.js';

export const aurusScraper = makeHektorScraper({
  id: 'aurus',
  name: 'Aurus Immobilier',
  domain: 'aurusimmo.com',
  logo: 'https://www.aurusimmo.com/images/favicon.png',
  listUrls: ['https://www.aurusimmo.com/location/1'],
});
