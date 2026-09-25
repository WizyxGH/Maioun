/**
 * Source : Appartager (appartager.com) — voir l'étude dans `parser.ts` et
 * `docs/sources-enquetes.md`.
 *
 * TROIS PAGES, ET AUCUN PARAMÈTRE. Le robots.txt interdit toutes les URL de
 * recherche paramétrées — elles portent toutes un `=` — mais la pagination
 * d'Appartager est un CHEMIN : `/colocations/nice`, puis `/colocations/nice/
 * page2`, `page3`. Aucune règle ne les vise, et c'est la seule voie qui donne
 * l'inventaire entier : la première page n'en montre que dix sur vingt-deux,
 * et s'arrêter là aurait perdu la moitié du stock sans rien signaler.
 */

import type { Scraper, ScrapeContext, ScrapeResult, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { isEmptyList, parseDetail, parseListPage } from './parser.js';

const LIST_URLS = [
  'https://www.appartager.com/colocations/nice',
  'https://www.appartager.com/colocations/nice/page2',
  'https://www.appartager.com/colocations/nice/page3',
] as const;

/**
 * Fiches visitées par passage. La carte ne dit RIEN de la durée : c'est la
 * fiche qui révèle « Locations à court terme acceptées » et « 3 mois
 * maximum ». On en lit donc assez pour couvrir le stock en deux passages.
 */
const MAX_DETAILS = 12;

export const APPARTAGER_DESCRIPTOR: SourceDescriptor = {
  id: 'appartager',
  name: 'Appartager',
  domain: 'appartager.com',
  kind: 'portal',
  method: 'html',
  // Derrière la priorité des portails généralistes : toutes ses annonces sont
  // des colocations, que ce compte exclut.
  priority: 2,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: LIST_URLS.length + MAX_DETAILS,
    maxListingsPerRun: 60,
    delayBetweenRequestsMs: 3_000,
  }),
  /**
   * TOUJOURS DE CÔTÉ, et cette fois avec les chiffres.
   *
   * CE QUI SE LOUE EST UNE CHAMBRE, MAIS LE TEXTE DÉCRIT CE QUI L'ABRITE.
   * Faute de champ dédié, la surface, les pièces et le type de bien se lisent
   * dans le titre et la description — or ceux-ci parlent du logement d'accueil.
   * Relevé du 2026-09-16 sur les 22 annonces niçoises : six reçoivent une
   * surface, dont quatre sont celle de l'appartement entier (« Super
   * appartement 88m2 » devient une chambre de 88 m² à 635 €) ; une hérite des
   * « 3 pièces » d'une villa ; deux passent en « appartement » alors qu'une
   * chambre est louée. Un 88 m² à 635 € traverse tous les filtres et ressort en
   * bonne affaire.
   *
   * CORRIGER CELA DEMANDE QUE LA NORMALISATION SACHE qu'un chiffre trouvé dans
   * le texte d'une colocation décrit le contenant, pas le bien loué — une règle
   * qui toucherait les colocations de toutes les sources. Ce compte les exclut
   * déjà : la source ne manque à personne en attendant.
   */
  enabled: false,
  allowedPaths: ['/colocations/nice', '/colocations/*/*/*'],
  /**
   * LE CONTACT EST PAYANT DÈS QUE L'ANNONCEUR NE PAIE PAS. Roomgo vend
   * l'abonnement Premium des deux côtés : quand l'annonceur l'a pris, la carte
   * affiche « Contacter gratuitement » ; sinon le message est « Upgrade to
   * Premium membership for unlimited contact access ». Le drapeau prévient
   * avant le clic, et le libellé de chaque carte est conservé annonce par
   * annonce dans `extra.contactStatus`.
   */
  paidContact: true,
  notes:
    'Roomgo Limited (ex-SpareRoom). Portail 100 % COLOCATION : chaque annonce ' +
    'est une chambre dans un logement partagé, et `flatShare` est déclaré vrai ' +
    'pour toutes — ce compte exclut les colocations (`excludeFlatShare`), ' +
    'elles ne paraîtront donc que si l’utilisateur lève ce filtre. robots.txt ' +
    'vérifié le 2026-09-16 : toutes les URL de recherche PARAMÉTRÉES sont ' +
    'interdites (min_rent, max_rent, sort_by, filter=showall, KW, lookup…), ' +
    'ainsi que /pro/*, /location/search.pl?*action=search, ' +
    '/location/shortlist.pl et /location/savesearch.pl ; la page de ville et ' +
    'sa pagination par CHEMIN (/colocations/nice/page2) ne sont visées par ' +
    'aucune règle, et sont les seules appelées, sans paramètre. Relevé du ' +
    '2026-09-16 : 22 annonces à Nice réparties 10 + 10 + 2 sur trois pages ; ' +
    'loyers mensuels de 400 à 850 €, quelques-uns donnés en FOURCHETTE ' +
    '(« €450 - €470 ») quand l’annonce propose plusieurs chambres. NI ' +
    'SURFACE, NI CHARGES, NI DÉPÔT ne sont publiés — ces champs restent ' +
    'absents. ATTENTION À LA SURFACE : faute de champ dédié, celle qui ' +
    's’affiche est lue dans le titre, et le titre d’une colocation décrit ' +
    'souvent le LOGEMENT D’ACCUEIL (« Super appartement 88m2 ») et non la ' +
    'chambre. Le type de bien, lui, reste « chambre » pour toutes. Durées ' +
    'mêlées : la fiche annonce « Locations à court terme acceptées » et une ' +
    '« Durée maximum » quand il y en a une ; elles sont reprises en tête de ' +
    'description. Contact via la messagerie du site, gratuit seulement quand ' +
    'l’annonceur est Membre Premium.',
};

export const appartagerScraper: Scraper = {
  descriptor: APPARTAGER_DESCRIPTOR,

  run(context: ScrapeContext): Promise<ScrapeResult> {
    return runListAndDetails(context, {
      sourceId: APPARTAGER_DESCRIPTOR.id,
      listUrls: LIST_URLS,
      parseList: (body, url) => parseListPage(body, url).listings,
      isEmptyList,
      parseDetail: (html) => parseDetail(html),
      maxDetails: MAX_DETAILS,
    });
  },
};
