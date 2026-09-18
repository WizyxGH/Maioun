/**
 * LES SOURCES DONT LA COUVERTURE NE PEUT PAS ATTEINDRE 100 %, ET POURQUOI.
 *
 * Une agence qui diffuse sur les portails ce qu'elle ne publie pas chez elle
 * n'est pas un défaut de notre côté : nous lisons tout ce que son site porte,
 * et il n'en porte pas plus. Compter ces annonces comme un trou rend l'objectif
 * de 100 % inatteignable par construction, et l'indicateur cesse d'être lu.
 *
 * LE CONSTAT EXISTAIT DÉJÀ, EN PROSE, dans l'en-tête de chaque adaptateur : il
 * fallait le relire à la main, et personne ne le faisait — d'où le même écart
 * recompté chaque semaine. Il est ici sous une forme que le relevé sait lire,
 * avec sa date et la mesure qui l'a établi.
 *
 * CE N'EST PAS UNE PERTE : ce stock nous arrive quand même, par Bien'ici, la
 * FNAIM ou Paru Vendu. C'est une couverture par un autre chemin, plus tardive
 * et amputée de ce que le portail coupe, mais réelle. La ligne le dit.
 *
 * ON N'Y INSCRIT RIEN SANS MESURE. Le verdict se relit : un total annoncé par
 * le site, un sitemap dénombré, et l'absence des annonces vues ailleurs. Une
 * source simplement cassée n'a rien à faire ici — elle se répare.
 */

/** Ce qui met une partie du stock hors de notre portée. */
export type OutOfReachReason =
  /** L'agence diffuse sur les portails ce qu'elle ne publie pas sur son site. */
  | 'publishesElsewhere'
  /** Le `robots.txt` du site ferme la partie qui porterait le reste. */
  | 'robots'
  /** Le site répond, mais derrière un pare-feu qui refuse les robots. */
  | 'antiBot';

export interface OutOfReachSource {
  readonly id: string;
  readonly reason: OutOfReachReason;
  /** Date du relevé qui a établi le verdict. */
  readonly checkedOn: string;
  /** Ce que la mesure a montré, en une ligne. */
  readonly measured: string;
  /** Par où le stock nous arrive tout de même, quand il nous arrive. */
  readonly reachedBy: readonly string[];
}

/**
 * Le registre, source par source.
 *
 * Il reste court, et c'est voulu : y ranger une source coûte une mesure, et
 * l'en sortir n'en coûte aucune — il suffit que le site se remette à publier.
 */
export const OUT_OF_REACH: readonly OutOfReachSource[] = [
  {
    id: 'igti',
    reason: 'publishesElsewhere',
    checkedOn: '2026-09-17',
    measured:
      'Le site porte 15 locations sur deux pages, que l’adaptateur rend toutes ; ' +
      'son sitemap de 277 fiches n’en connaît pas d’autre. Les annonces vues ' +
      'sous son nom ailleurs (Saint-Siagre, Bottero, Cernuschi, Vismara, Frémont, ' +
      'Schuman) ne figurent nulle part sur immobilieregti.com.',
    reachedBy: ['orpi', 'bienici'],
  },
  {
    id: 'agir',
    reason: 'publishesElsewhere',
    checkedOn: '2026-09-17',
    measured:
      'Le site titre lui-même « 2 annonces de logements à louer », sans seconde ' +
      'page, et le sitemap n’en référence pas d’autre. Les deux locaux de ' +
      '/location-pro/ ne sont pas des logements.',
    reachedBy: ['bienici', 'fnaim'],
  },
];

/** Le verdict consigné pour cette source, ou `null` si elle n'en a pas. */
export function outOfReach(sourceId: string): OutOfReachSource | null {
  return OUT_OF_REACH.find((one) => one.id === sourceId) ?? null;
}
