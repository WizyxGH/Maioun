/**
 * COMBIEN D'ANNONCES ONT VU LEUR FICHE LUE — le chiffre qui manquait.
 *
 * Plusieurs sources ne donnent, sur leur page de liste, qu'un avant-goût :
 * LocService coupe sa description à une centaine de caractères et ne dit ni
 * DPE, ni disponibilité, ni si le bailleur est un particulier — ce dernier
 * point étant pourtant la raison d'être de cette source-là. Tout cela n'arrive
 * qu'avec la fiche, lue par petits paquets pour ne pas tirer mille requêtes
 * d'un coup (`sources/shared/enrich.ts`).
 *
 * RIEN NE DISAIT OÙ EN ÉTAIT CE RATTRAPAGE. L'audit mesure ce que l'inventaire
 * ignore, champ par champ, mais un champ vide ne dit pas POURQUOI il l'est :
 * source muette, parseur à reprendre, ou simplement fiche pas encore lue. Les
 * deux premiers appellent du travail, le troisième de la patience — ou un
 * rattrapage (`--backfill`). Relevé du 2026-09-25 : 15 fiches lues sur 711
 * chez LocService, 30 sur 571 chez Bien'ici.
 *
 * CE RELEVÉ RAPPORTE, IL NE CONCLUT PAS. Une source sans aucune fiche lue n'est
 * pas forcément en panne : la FNAIM n'en lit aucune parce que son `robots.txt`
 * les interdit, et une alerte e-mail n'a pas de page à lire. Les deux cas se
 * ressemblent de l'extérieur, et c'est à qui lit de trancher.
 */

/** Ce que la base sait d'une source, du point de vue des fiches. */
export interface CouvertureSource {
  readonly sourceId: string;
  /** Annonces actives de cette source. */
  readonly actives: number;
  /** Celles dont la fiche a été lue une fois, fraîche ou non. */
  readonly lues: number;
  /** Parmi elles, celles dont la lecture date de plus d'une semaine. */
  readonly perimees: number;
}

/** Une source qu'il reste à rattraper, et de combien. */
export interface Retard extends CouvertureSource {
  /** Annonces dont la fiche n'a jamais été lue. */
  readonly aLire: number;
  /** Part des annonces dont la fiche a été lue, en pourcents entiers. */
  readonly part: number;
}

/**
 * En deçà, le chiffre ne dit rien : une source de trois annonces à 0 % de
 * fiches lues est un bruit, pas un retard.
 */
const MINIMUM_ANNONCES = 20;

export interface Couverture {
  /** Les sources qui ont lu au moins une fiche, et à qui il en reste. */
  readonly retards: readonly Retard[];
  /** Celles qui n'en ont jamais lu une seule — à la fois le choix et la panne. */
  readonly jamais: readonly string[];
}

/**
 * Range les sources en deux : celles qui rattrapent, celles qui n'ont rien lu.
 *
 * LES PLUS GROS RESTES D'ABORD, pas les plus mauvais pourcentages : rattraper
 * six cents fiches chez LocService vaut mieux que quinze chez une agence, même
 * si la seconde affiche un plus vilain chiffre.
 */
export function couvertureDesFiches(
  lignes: readonly CouvertureSource[],
  minimum = MINIMUM_ANNONCES,
): Couverture {
  const assezGrosses = lignes.filter((ligne) => ligne.actives >= minimum);
  const retards = assezGrosses
    .filter((ligne) => ligne.lues > 0 && ligne.lues < ligne.actives)
    .map((ligne) => ({
      ...ligne,
      aLire: ligne.actives - ligne.lues,
      part: Math.round((ligne.lues / ligne.actives) * 100),
    }))
    .sort((a, b) => b.aLire - a.aLire);
  const jamais = assezGrosses
    .filter((ligne) => ligne.lues === 0)
    .map((ligne) => ligne.sourceId)
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return { retards, jamais };
}
