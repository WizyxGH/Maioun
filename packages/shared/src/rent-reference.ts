/**
 * Le loyer de référence au mètre carré, tel que l'État le publie.
 *
 * LE REPÈRE ÉTAIT UN NOMBRE ÉCRIT À LA MAIN : 20 €/m², posé au début du projet
 * et jamais revu. Il sert pourtant à décider quelles annonces sont « trop belles
 * pour être vraies » — et un repère faux déclasse de vraies affaires ou laisse
 * passer de vraies arnaques.
 *
 * D'OÙ VIENNENT CES CHIFFRES. De la « Carte des loyers », publiée chaque année
 * sur data.gouv.fr par la DHUP et l'ANIL à partir des annonces réellement
 * déposées — 71 615 observations pour Nice en 2025. Ce sont des loyers
 * D'ANNONCE, charges comprises, hors meublé de tourisme : exactement la même
 * matière que celle qu'on collecte, ce qui rend la comparaison honnête.
 *
 * LA TAILLE CHANGE TOUT, et c'est ce qu'un nombre unique effaçait. Un studio se
 * loue 22,74 €/m² à Nice, un trois-pièces 19,73 : quinze pour cent d'écart. Le
 * projet cherche des petites surfaces — un repère calé sur la moyenne toutes
 * tailles confondues faisait paraître suspect ce qui est simplement petit.
 *
 * ON NE RECOPIE PAS LE FICHIER ENTIER. Il couvre 35 000 communes ; le projet en
 * regarde une. Les valeurs sont donc figées ici, avec leur année et leur
 * fourchette, et se remplacent à la main quand le millésime change — une fois
 * par an, ce qui ne justifie ni téléchargement ni cache.
 */

/** Un indicateur de la Carte des loyers, avec ce qui permet d'en douter. */
export interface RentReference {
  /** Loyer mensuel d'annonce au m², charges comprises. */
  readonly perSqm: number;
  /** Bornes de l'intervalle de confiance publié. */
  readonly low: number;
  readonly high: number;
  /** Nombre d'annonces observées sur la commune. */
  readonly observations: number;
}

/** Millésime des valeurs ci-dessous. À changer AVEC elles, jamais seul. */
export const RENT_REFERENCE_YEAR = 2025;

/** L'adresse du jeu de données, pour que le chiffre affiché soit vérifiable. */
export const RENT_REFERENCE_SOURCE =
  'https://www.data.gouv.fr/datasets/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025';

/**
 * Nice, appartements, millésime 2025.
 *
 * `small` couvre les 1 et 2 pièces, `large` les 3 pièces et plus, `all` les
 * deux ensemble — c'est le découpage du jeu de données, et non le nôtre.
 */
export const NICE_RENT_REFERENCE: {
  readonly all: RentReference;
  readonly small: RentReference;
  readonly large: RentReference;
} = {
  all: { perSqm: 20.43, low: 15.44, high: 27.04, observations: 71_615 },
  small: { perSqm: 22.74, low: 17.75, high: 29.14, observations: 50_285 },
  large: { perSqm: 19.73, low: 13.9, high: 28.01, observations: 21_293 },
};

/**
 * Le repère qui convient à un logement de `rooms` pièces.
 *
 * `null` — nombre de pièces inconnu — rend la valeur toutes tailles : c'est le
 * seul cas où l'on ne sait pas trancher, et la moyenne y est le moindre mal.
 */
export function referenceRentPerSqm(rooms: number | null): number {
  if (rooms === null) return NICE_RENT_REFERENCE.all.perSqm;
  return rooms <= 2 ? NICE_RENT_REFERENCE.small.perSqm : NICE_RENT_REFERENCE.large.perSqm;
}
