/**
 * Source : Immobilière Tichadou (tichadou.fr) — 2 rue du Congrès, 06000 Nice.
 * Étude et pièges dans `parser.ts`.
 *
 * DEUX LECTURES, ET LA SECONDE VAUT LE DÉTOUR. La page de résultats embarque
 * son propre tableau d'annonces, description entière comprise ; la fiche, elle,
 * apporte le tableau « Informations détaillées » — charges, honoraires, dépôt
 * de garantie, étage, ascenseur, balcons, quartier —, l'étiquette énergie et
 * CINQ FOIS PLUS DE PHOTOS, en pleine taille plutôt qu'en « moyennes ».
 *
 * Quatre locations au relevé du 2026-09-23, toutes à Nice : les quatre fiches
 * tiennent donc dans un passage, et rien n'oblige à les relire ensuite.
 */

import type { Scraper, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { LIST_URL, parseDetailPage, parseListPage } from './parser.js';

/** Le stock tient en quatre annonces ; la marge couvre une belle saison. */
const MAX_DETAILS = 12;

export const TICHADOU_DESCRIPTOR: SourceDescriptor = {
  id: 'tichadou',
  name: 'Immobilière Tichadou',
  domain: 'tichadou.fr',
  kind: 'localAgency',
  method: 'html',
  priority: 2,
  schedule: scheduleFor('localAgency'),
  budget: budgetFor('localAgency', { maxPagesPerRun: 1 + MAX_DETAILS }),
  enabled: true,
  allowedPaths: ['/resultats*', '/location-*'],
  agencyContact: {
    phone: '04 93 16 78 26', // secret-scan-ignore
    address: { street: '2 rue du Congrès', postalCode: '06000', city: 'Nice' },
  },
  notes:
    'robots.txt vérifié le 2026-09-23 : « Allow: / », sitemap déclaré. Site ICS, ' +
    'mais au gabarit à tableau JavaScript embarqué (var properties) et non au ' +
    'gabarit resultat.php des autres sources ICS : la liste porte titre, loyer, ' +
    'lien, photo et description entière. La fiche ajoute le tableau des ' +
    'informations détaillées (charges, honoraires, dépôt, étage, ascenseur, ' +
    'balcons, quartier), l’étiquette énergie encodée dans le nom de l’image ' +
    'dpe.ics.fr, et la galerie entière en pleine taille.',
};

export const tichadouScraper: Scraper = {
  descriptor: TICHADOU_DESCRIPTOR,
  run: (context) =>
    runListAndDetails(context, {
      sourceId: TICHADOU_DESCRIPTOR.id,
      listUrls: [LIST_URL],
      parseList: (body) => parseListPage(body).listings,
      parseDetail: (html) => parseDetailPage(html),
      maxDetails: MAX_DETAILS,
    }),
};
