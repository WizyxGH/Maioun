/**
 * Source : Cot'Ouest Immobilier (cotouest-immobilier.com) — 203 avenue de la
 * Californie, 06200 Nice. Groupe de trois agences de Nice ouest (Californie /
 * Promenade des Anglais, Napoléon III / Fabron, Cagnes-sur-Mer), qui publient
 * leur parc sur un seul site. Plateforme Twimmo, voir `../twimmo/` et le
 * complément d'habillage dans `parser.ts`.
 *
 * robots.txt vérifié le 2026-09-16 : aucune règle `User-agent: *`, donc rien
 * d'interdit à notre collecteur ; les seuls refus visent des aspirateurs de
 * sites nommément désignés (HTTrack, WebZIP, Teleport, wget, Scrapy…). 3
 * locations publiées au relevé, dont 2 dans le périmètre (Nice 06200) ; la
 * troisième est une saisonnière à la semaine en Corse, que la fiche fait
 * écarter faute de loyer mensuel.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { runListAndDetails } from '../shared/list-and-details.js';
import { makeTwimmoDescriptor, twimmoListUrl } from '../twimmo/scraper.js';
import { parseCotOuestDetail, parseCotOuestList } from './parser.js';

const CONFIG = {
  id: 'cot-ouest',
  name: "Cot'Ouest Immobilier",
  siteUrl: 'https://www.cotouest-immobilier.com',
  maxDetails: 6,
  agencyContact: {
    phone: '04 92 09 77 20', // secret-scan-ignore
    email: 'info@cotouest-immobilier.com', // secret-scan-ignore
    address: { street: '203 avenue de la Californie', postalCode: '06200', city: 'Nice' },
  },
  notes:
    'Site Twimmo en habillage « templateC », rendu serveur. robots.txt vérifié ' +
    'le 2026-09-16 : pas de règle générale, seuls des aspirateurs nommés sont ' +
    'refusés. Liste /toutes-locations.html (une page) : ses cartes portent ' +
    'commune, quartier et position GPS en attributs `data-*`. Les fiches ' +
    '…-{réf}.html donnent les montants en phrases engendrées, mais ni ville ni ' +
    'code postal — celui-ci ne vit que dans la méta description.',
} as const;

export const COT_OUEST_DESCRIPTOR: SourceDescriptor = makeTwimmoDescriptor(CONFIG);

export const cotOuestScraper: Scraper = {
  descriptor: COT_OUEST_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: COT_OUEST_DESCRIPTOR.id,
      listUrls: [twimmoListUrl(CONFIG)],
      parseList: (body, url) => parseCotOuestList(body, url, CONFIG.name),
      parseDetail: (html) => parseCotOuestDetail(html),
      maxDetails: CONFIG.maxDetails,
    }),
};
