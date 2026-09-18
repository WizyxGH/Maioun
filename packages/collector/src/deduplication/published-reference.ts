/**
 * LA RÉFÉRENCE QUE L'AGENCE ÉCRIT DANS LE TEXTE DE SON ANNONCE.
 *
 * Un portail ne recopie pas toujours la référence dans un champ : Paru Vendu
 * n'en publie aucun pour les annonces de BEP, et l'annonce du site de l'agence
 * n'a donc rien à quoi se rattacher. Les deux fiches restaient séparées alors
 * que le même numéro — « Référence de l'annonce : 0603744 » — figure en toutes
 * lettres dans les deux descriptions, mot pour mot recopiées l'une de l'autre.
 *
 * ON LIT, ON NE FABRIQUE PAS. Seul un numéro que l'annonce ANNONCE comme sa
 * référence est retenu ; rien n'est déduit d'un prix, d'une surface ou d'une
 * URL.
 *
 * DEUX PIÈGES, tous deux mesurés sur l'inventaire :
 *
 *   * « année de référence 2021 » — la mention réglementaire du diagnostic
 *     énergétique, présente dans des centaines de descriptions. Elle
 *     rapprochait un quatre-pièces de 79 m² d'un deux-pièces de 45 m².
 *   * « RÉFRIGÉRATEUR », « REFAIT À NEUF » — « réf » au début d'un mot. D'où
 *     la frontière de mot devant, et l'exigence d'un chiffre derrière.
 */

import { comparable } from '@maioun/shared';

/**
 * « réf », « réf. », « référence », éventuellement suivi de ce qu'elle
 * désigne, puis la valeur : un chiffre au moins, et rien qu'un identifiant.
 */
const REFERENCE_IN_TEXT =
  /(?<![\p{L}])r[ée]f(?:[ée]rence)?s?\.?\s*(?:de\s+l['’\u2019]\s*annonce|du\s+bien|de\s+l['’\u2019]\s*agence|annonce|interne|dossier|mandat)?\s*(?:[:n°#]|-)?\s*([\p{L}\d][\p{L}\d._/-]{3,19})/giu;

/** Le millésime d'un diagnostic, jamais une référence d'annonce. */
const YEAR = /^(19|20)\d{2}$/;

/** Un identifiant plus court que cela ne distingue rien de sûr dans un texte. */
const MIN_LENGTH = 5;

/**
 * Les références qu'une description énonce, en forme comparable.
 *
 * Plus exigeant que la référence d'un CHAMP : ici la valeur est arrachée à une
 * phrase, et une erreur de lecture rapproche deux logements réels. D'où le
 * seuil de longueur, plus haut qu'ailleurs, et le rejet des millésimes.
 */
export function referencesInText(description: string | null): readonly string[] {
  if (description === null) return [];
  const found = new Set<string>();
  for (const match of description.matchAll(REFERENCE_IN_TEXT)) {
    const raw = match[1];
    if (raw === undefined || YEAR.test(raw)) continue;
    const key = comparable(raw);
    if (key.length >= MIN_LENGTH && /\d/.test(key)) found.add(key);
  }
  return [...found];
}
