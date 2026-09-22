/**
 * Source : Aequalis Immobilier (aequalis-immobilier.com) — Saint-Laurent-du-Var
 * et Nice. Site Twimmo, voir `../twimmo/`.
 *
 * Demandée par son nom. Vérifiée le 2026-09-22 : `robots.txt` ne contient
 * QUE des groupes nommés — Scrapy, wget, WebReaper et une vingtaine d'autres
 * aspirateurs —, et **aucun groupe `User-agent: *`**. Rien ne nous vise donc,
 * et le sitemap est déclaré.
 *
 * SON SITEMAP NE SERT À RIEN : trois URL, aucune fiche. C'est la liste Twimmo
 * standard `/toutes-locations.html` qui porte l'inventaire — quatre locations
 * au relevé, dont un studio à Nice Est, deux biens à Saint-Laurent-du-Var et
 * un garage, que la normalisation écarte d'elle-même.
 */

import type { Scraper } from '@maioun/shared';
import { makeTwimmoScraper } from '../twimmo/scraper.js';

export const aequalisScraper: Scraper = makeTwimmoScraper({
  id: 'aequalis',
  name: 'Aequalis Immobilier',
  siteUrl: 'https://www.aequalis-immobilier.com',
  notes:
    'Site Twimmo, rendu serveur. robots.txt vérifié le 2026-09-22 : aucun ' +
    'groupe « User-agent: * », seulement des aspirateurs nommés. Sitemap sans ' +
    'fiches (3 URL) ; l’inventaire vit sur /toutes-locations.html, 4 locations.',
});
