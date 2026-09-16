/**
 * Lecture « libellé : valeur » dans le texte d'une fiche.
 *
 * Les sites d'agences à gabarit maison écrivent leurs chiffres en toutes
 * lettres — « Loyer charges comprises : 1 008 € / mois », « Dépôt de garantie
 * 830 € » — dans un balisage qui change d'un site à l'autre. Le texte aplati,
 * lui, garde l'ordre libellé → valeur.
 */

import type * as cheerio from 'cheerio';

/** Un montant en euros ; `\s` couvre aussi les espaces insécables des milliers. */
export const AMOUNT = String.raw`\d[\d\s.]*(?:,\d+)?\s*€`;

/** Un nombre décimal (surface, pièces). */
export const NUMBER = String.raw`\d+(?:[.,]\d+)?`;

/** Texte visible d'un fragment (document entier par défaut), espaces réduits. */
export function flatText($: cheerio.CheerioAPI, selector = 'body'): string {
  const node = $(selector).first().clone();
  node.find('script, style, noscript').remove();
  return node.text().replace(/\s+/g, ' ').trim();
}

/**
 * La valeur qui suit un libellé. `label` est une expression régulière en texte
 * (sans groupe capturant) ; les deux-points sont facultatifs.
 */
export function afterLabel(
  text: string,
  label: string,
  value: string = AMOUNT,
): string | undefined {
  const match = new RegExp(`(?:${label})\\s*:?\\s*(${value})`, 'i').exec(text);
  return match?.[1]?.trim();
}

/**
 * Le premier groupe capturé par `pattern`, sans la casse, rogné.
 *
 * `afterLabel` compose le motif pour vous ; celui-ci prend le motif entier,
 * pour les libellés que la composition ne sait pas écrire. Quatre parseurs en
 * gardaient une copie identique sous le nom `pick`.
 */
export function firstMatch(text: string, pattern: string): string | undefined {
  return new RegExp(pattern, 'i').exec(text)?.[1]?.trim();
}

/**
 * La première valeur NON VIDE dont le libellé correspond.
 *
 * Les parseurs qui rangent une fiche en `Map<libellé, valeur>` cherchent
 * ensuite par motif, parce que les libellés varient d'un bien à l'autre
 * (« loyer », « loyer CC », « loyer mensuel »). Une valeur vide ne compte pas :
 * le libellé seul y sert de case à cocher, pas de réponse.
 */
export function fieldMatching(
  fields: ReadonlyMap<string, string>,
  pattern: RegExp,
): string | undefined {
  return [...fields].find(([label, value]) => pattern.test(label) && value !== '')?.[1];
}

/**
 * Une étiquette énergétique, si c'en est une.
 *
 * Les sites écrivent aussi bien « C » que « NA », « Non communiqué », « Vierge »
 * ou une chaîne vide dans le même emplacement. Seule une lettre A–G est une
 * étiquette ; le reste est une NON-RÉPONSE, qu'il ne faut pas enregistrer comme
 * une note. La comparaison est SENSIBLE À LA CASSE, comme dans les huit
 * parseurs d'où elle vient : un « c » minuscule ne vient jamais d'une étiquette
 * officielle, et l'accepter ferait entrer les faux positifs que ce filtre écarte.
 */
export function energyLabel(value: string | undefined): string | undefined {
  return value !== undefined && /^[A-G]$/.test(value) ? value : undefined;
}

/**
 * Les deux étiquettes à poser dans `extra`, les non-réponses écartées.
 *
 * À étaler : `extra: { ...energyLabels(dpe, ges) }`. Une étiquette absente ne
 * pose pas sa clé — un `dpe: undefined` se lirait comme « mesuré, sans
 * résultat » là où la vérité est « pas de mesure publiée ».
 */
export function energyLabels(
  dpe: string | undefined,
  ges: string | undefined,
): { dpe?: string; ges?: string } {
  const validDpe = energyLabel(dpe);
  const validGes = energyLabel(ges);
  return {
    ...(validDpe !== undefined ? { dpe: validDpe } : {}),
    ...(validGes !== undefined ? { ges: validGes } : {}),
  };
}
