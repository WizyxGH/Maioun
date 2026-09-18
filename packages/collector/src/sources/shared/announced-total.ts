/**
 * CE QUE LE SITE DIT PUBLIER — le seul chiffre qui rende la couverture
 * vérifiable.
 *
 * Nous savions ce que nous avions enregistré ; nous ne savions pas ce que nous
 * avions manqué. Un trou de pagination a laissé vingt annonces d'une agence
 * hors de la base sans qu'aucun relevé ne s'en aperçoive : c'est l'utilisateur
 * qui est tombé dessus. Orpi et Century 21 comparaient déjà leur total annoncé
 * au nombre lu ; ce module en fait un outil commun à toutes les sources.
 *
 * LE SITE PARLE, ON L'ÉCOUTE. « 15 annonces trouvées », « 5 biens
 * disponibles », « 4 réponses », « 3 annonces » dans le titre de la page :
 * toutes ces formes ont été relevées telles quelles sur les sites que nous
 * lisons. Rien n'est déduit d'une pagination ni d'une hauteur de liste.
 *
 * DANS LE DOUTE, ON SE TAIT. Une page affiche souvent plusieurs nombres — le
 * numéro de page, le compte d'une carte, une revendication commerciale. Deux
 * chiffres qui se contredisent ne valent pas mieux qu'aucun : on répond `null`,
 * et la source reste « total non annoncé ». Un faux total ferait crier au trou
 * sur une source saine, et l'indicateur serait abandonné à la première fausse
 * alerte.
 */

import { decodeEntities } from '../../normalization/text.js';

/**
 * Un compteur explicite dans le texte visible : un nombre, le mot, et un mot
 * qui dit que ce nombre compte UNE LISTE.
 *
 * Sans ce dernier, « Page 1 Location… » et la carte « 2 Location meublée
 * 700 € » passaient pour des totaux. Les formes acceptées viennent toutes des
 * sites que nous lisons ; aucune n'est supposée. « réponses » et « résultats »
 * se suffisent : ces deux mots-là ne désignent qu'un décompte.
 */
const COUNTER =
  /(?<![\d.,])(\d{1,4})\s+(?:(?:annonces?|biens?|logements?|offres?)\s+(?:trouv[ée]e?s?|disponibles?|au total|correspondants?|immobili[èe]res?|immobiliers?)|r[ée]ponses?|r[ée]sultats?)(?=(.{0,12}))/giu;

/** Le titre de la page : là, « 3 annonces » ne peut pas être une carte. */
const TITLE = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i;

const COUNTER_IN_TITLE =
  /(?<![\d.,])(\d{1,4})\s+(?:annonces?|biens?|logements?|offres?|r[ée]ponses?|r[ée]sultats?)(?=(.{0,12}))/giu;

/** Ce qui, juste après le mot, dit que le nombre n'est pas un total. */
const NOT_A_TOTAL = /^\s*(?:par\s+page|\/\s*page|par\s+an|par\s+mois)/iu;

/** Au-delà, le chiffre parle du réseau ou du pays, pas de cette page. */
const TOO_MANY = 2000;

/** Le texte visible d'une page, scripts et balises retirés. */
function visibleText(html: string): string {
  return decodeEntities(
    html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ');
}

/**
 * Le total que la page ANNONCE, ou `null` si elle n'en annonce pas un seul.
 *
 * `null` couvre deux situations qu'il ne sert à rien de distinguer ici : la
 * page ne dit rien, ou elle dit deux choses différentes. Dans les deux cas nous
 * ne savons pas, et l'appelant doit se taire plutôt que conclure.
 */
export function announcedTotal(html: string): number | null {
  const found = new Set<number>();
  const collect = (text: string, pattern: RegExp): void => {
    for (const match of text.matchAll(pattern)) {
      const [, digits, after] = match;
      if (digits === undefined || NOT_A_TOTAL.test(after ?? '')) continue;
      const value = Number(digits);
      if (value <= TOO_MANY) found.add(value);
    }
  };
  collect(visibleText(html), COUNTER);
  const title = TITLE.exec(html);
  if (title?.[1] !== undefined) collect(visibleText(title[1]), COUNTER_IN_TITLE);
  return found.size === 1 ? ([...found][0] ?? null) : null;
}

/** Ce que la comparaison « annoncé / enregistré » permet de dire d'un passage. */
export type Coverage =
  /** Le site annonce un total, et nous en avons lu au moins autant. */
  | 'full'
  /** Le site annonce plus que ce que nous avons lu : c'est un trou. */
  | 'short'
  /** Le site n'annonce rien de lisible : la couverture reste indécidable. */
  | 'unknown';

/**
 * Ce que ce passage a couvert.
 *
 * PLUS QUE PRÉVU N'EST PAS UN DÉFAUT : un site qui annonce 9 et en montre 11 a
 * un compteur en retard, pas une annonce manquante. Seul le manque compte.
 */
export function coverageOf(announced: number | null, collected: number): Coverage {
  if (announced === null) return 'unknown';
  return collected >= announced ? 'full' : 'short';
}

/** Le début de la ligne d'avertissement qui porte le manque, pour la relire. */
export const SHORT_COVERAGE_WARNING = 'Couverture courte';

/** L'avertissement qu'une source émet quand elle lit moins que le site n'annonce. */
export function shortCoverageWarning(announced: number, collected: number): string {
  return `${SHORT_COVERAGE_WARNING} : le site annonce ${announced} annonce(s), nous en avons lu ${collected}.`;
}
