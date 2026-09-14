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
