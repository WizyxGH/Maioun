/**
 * Source : ImmoJeune (immojeune.com) — voir l'étude dans `docs/sources-enquetes.md`.
 *
 * UN PORTAIL DE PARTICULIERS DONT LE CONTACT EST GRATUIT, ce qui manquait.
 * LocService apporte déjà du particulier, mais vend la mise en relation ;
 * PAP, qui n'en vendait pas, reste fermé par son pare-feu. Ici le bailleur
 * dépose gratuitement, et le candidat postule par un formulaire, sans péage.
 *
 * LE PORTAIL EST ÉTUDIANT, PAS LES ANNONCES — et c'est la question qui décide
 * de son intérêt, l'utilisateur n'étant pas étudiant. Relevé le 2026-09-16 :
 * les fiches sont des studios et des deux-pièces ordinaires, décrits sans
 * condition d'étudiant, et le formulaire de candidature propose « Salarié » et
 * « Autres » à côté des statuts étudiants. La rubrique s'appelle
 * `location-etudiant` parce que c'est le métier du site, pas parce que le bail
 * l'exige : on ne pose donc AUCUN drapeau « réservé aux étudiants » depuis la
 * source, et on laisse la détection par le texte trancher annonce par annonce
 * — elle sait déjà distinguer « bail étudiant » de « idéal étudiant ».
 *
 * LES RÉSIDENCES ÉTUDIANTES, ELLES, SONT ÉCARTÉES À LA LECTURE : un exploitant,
 * un loyer « à partir de », l'accès réservé aux étudiants. Voir `parser.ts`.
 *
 * LA RUBRIQUE « PARTICULIER » PLUTÔT QUE LA LISTE ENTIÈRE. La liste de toutes
 * les annonces d'une commune range les résidences d'abord, les agences
 * ensuite, les particuliers en dernier : il faut six pages pour atteindre ce
 * qu'on vient chercher. La rubrique `/location-particulier/` les donne en
 * quatre pages — et c'est aussi là que les liens sont en clair, les cartes
 * d'agences étant presque toutes obfusquées — voir `parser.ts`.
 */

import type { Scraper, ScrapeContext, ScrapeResult, SourceDescriptor } from '@maioun/shared';
import { budgetFor, scheduleFor } from '../../core/budgets.js';
import { portalCommunes } from '../shared/communes.js';
import { runListAndDetails } from '../shared/list-and-details.js';
import { isEmptyList, parseDetail, parseListPage, SITE } from './parser.js';

/**
 * Pages lues pour Nice, la seule commune qui en remplisse plus d'une.
 * Relevé le 2026-09-16 : quatre pages de douze cartes, la cinquième vide.
 * Cinq laissent la place de grandir sans jamais couper l'inventaire en deux.
 */
const PAGES_NICE = 5;

/**
 * Communes du périmètre absentes du portail, par slug canonique.
 *
 * Cap-d'Ail répond 404 (vérifié le 2026-09-16) là où les douze autres rendent
 * une page, fût-elle vide. La demander à chaque passage ne ferait qu'ajouter
 * un avertissement par passage à une source par ailleurs saine.
 */
const ABSENTES = ['cap-d-ail'] as const;

/**
 * Les listes à lire : une par commune, et la pagination de Nice.
 *
 * Le portail écrit la commune suivie de son DÉPARTEMENT — « nice-06 »,
 * « cagnes-sur-mer-06 » — et non de son code postal. Les deux premiers
 * chiffres du code postal donnent l'un à partir de l'autre, sans qu'aucune
 * liste n'ait à être recopiée ici.
 */
export function listUrls(): readonly string[] {
  const urls: string[] = [];
  for (const commune of portalCommunes({ omit: ABSENTES })) {
    const slug = `${commune.name}-${commune.postalCode.slice(0, 2)}`;
    urls.push(`${SITE}/location-particulier/${slug}.html`);
    if (commune.commune !== 'nice') continue;
    for (let page = 2; page <= PAGES_NICE; page += 1) {
      urls.push(`${SITE}/location-particulier/${slug}/${page}`);
    }
  }
  return urls;
}

/**
 * Fiches lues par passage.
 *
 * La carte donne déjà le loyer, la surface, le type, la commune et la nature
 * du bailleur ; la fiche ajoute la description entière, l'adresse, les
 * charges, le dépôt, les diagnostics et la disponibilité. Une quinzaine couvre
 * largement ce qui paraît entre deux passages sur une trentaine d'annonces.
 */
const MAX_DETAILS = 15;

export const IMMOJEUNE_DESCRIPTOR: SourceDescriptor = {
  id: 'immojeune',
  name: 'ImmoJeune',
  domain: 'immojeune.com',
  kind: 'portal',
  method: 'html',
  // Du particulier joignable sans frais : la denrée rare de cet inventaire.
  priority: 1,
  schedule: scheduleFor('portal'),
  budget: budgetFor('portal', {
    maxPagesPerRun: 16 + MAX_DETAILS,
    delayBetweenRequestsMs: 3_000,
  }),
  enabled: true,
  /**
   * PAS DE `landlord` SUR LA SOURCE : le portail publie les deux, et chaque
   * carte le dit d'elle-même. Une valeur ici servirait de défaut à ce que
   * l'annonce n'aurait pas déclaré — or ici elle le déclare toujours.
   */
  allowedPaths: ['/location-particulier/*', '/location-etudiant/*', '/colocation/*'],
  notes:
    'robots.txt vérifié le 2026-09-16 : ne ferme que /user/* et le brouilleur ' +
    "d'adresses de Cloudflare ; les listes et les fiches sont ouvertes, et le " +
    'sitemap les déclare. Cartes `.card` dans `#resultsajax`, douze par page, ' +
    'pagination `/{n}`. Le premier badge donne PARTICULIER ou AGENCE. Contact ' +
    'gratuit, par formulaire de candidature. Les cartes dont le lien est ' +
    'obfusqué (`span.obflink`) ne sont pas décodées. Une annonce partie ' +
    "redirige vers l'accueil en 200, jamais en 404. " +
    'TROIS CANDIDATURES PAR JOUR, ET PAS UNE DE PLUS : les CGV du portail ' +
    '(article 8.2, relues le 2026-09-17) disent « Chaque utilisateur peut ' +
    'candidater à 3 offres par jour », le déplafonnement étant vendu à part ' +
    '(offre « candidatures illimitées », sept jours, tacite reconduction). Rien ' +
    "n'est à brider ici : la candidature passe par un formulaire gardé par un " +
    'Turnstile Cloudflare, donc elle se fait à la main, et le collecteur ne ' +
    'candidate jamais. Le plafond compte pour le CONSEIL : un écran qui invite ' +
    'à candidater sur ImmoJeune doit dire combien il en reste pour la journée.',
};

export const immojeuneScraper: Scraper = {
  descriptor: IMMOJEUNE_DESCRIPTOR,

  async run(context: ScrapeContext): Promise<ScrapeResult> {
    return runListAndDetails(context, {
      sourceId: IMMOJEUNE_DESCRIPTOR.id,
      listUrls: listUrls(),
      parseList: parseListPage,
      isEmptyList,
      parseDetail: (html) => parseDetail(html),
      maxDetails: context.mode === 'backfill' ? 60 : MAX_DETAILS,
    });
  },
};
