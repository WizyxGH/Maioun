/**
 * Le texte d'un message, et la part qui est VRAIMENT de l'expéditeur.
 *
 * Dans un fil, le message d'origine revient recopié en bas. Il contient NOS
 * propres mots — la demande de visite qu'on a envoyée, la référence qu'on a
 * citée — et ne prouve donc rien de ce que l'agence répond. On sépare les deux :
 * la citation sert encore à SAVOIR DE QUELLE ANNONCE on parle, jamais à conclure
 * ce que l'agence a dit.
 */

import * as cheerio from 'cheerio';
import { cleanMultiline } from '../normalization/text.js';

/** Un corps qui contient des balises est lu comme du HTML. */
const RESSEMBLE_A_DU_HTML = /<(?:br|p|div|table|td|tr|span|a|blockquote|html|body)\b/i;

/** Conteneurs de citation propres aux clients courants. */
const CITATION_HTML = 'blockquote, .gmail_quote, .moz-cite-prefix, .yahoo_quoted, #divRplyFwdMsg';

/** Marqueurs de début de citation en texte brut, ligne par ligne. */
const DEBUT_CITATION: readonly RegExp[] = [
  /^>/,
  /^le\s.{3,}\s?a\s+écrit\s*:?\s*$/i,
  /^on\s.{3,}\swrote\s*:?\s*$/i,
  /^-{2,}\s*message d(?:'|’)origine\s*-{2,}/i,
  /^-{2,}\s*original message\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^de\s*:\s/i,
  /^from\s*:\s/i,
  /^envoyé\s*:\s/i,
];

/** Rend le texte lisible d'un corps HTML ou brut. */
function enTexte(corps: string, sansCitations: boolean): string {
  if (!RESSEMBLE_A_DU_HTML.test(corps)) return cleanMultiline(corps);
  const $ = cheerio.load(corps);
  $('style, script, head, title').remove();
  if (sansCitations) $(CITATION_HTML).remove();
  $('br').replaceWith('\n');
  $('p, div, tr, li, h1, h2, h3, h4').append('\n');
  return cleanMultiline($.root().text());
}

/** Coupe au premier marqueur de citation en texte brut. */
function couperALaCitation(texte: string): string {
  const lignes = texte.split('\n');
  const coupe = lignes.findIndex((ligne) =>
    DEBUT_CITATION.some((motif) => motif.test(ligne.trim())),
  );
  return (coupe === -1 ? lignes : lignes.slice(0, coupe)).join('\n').trim();
}

/** Les deux lectures d'un même corps. */
export interface TextesDuMessage {
  /** Tout, citation comprise — sert à identifier l'annonce. */
  readonly complet: string;
  /** Ce que l'expéditeur a écrit lui-même — seul à prouver une intention. */
  readonly nouveau: string;
}

export function textesDuMessage(corps: string | null | undefined): TextesDuMessage {
  if (corps == null || corps.trim() === '') return { complet: '', nouveau: '' };
  return {
    complet: enTexte(corps, false),
    nouveau: couperALaCitation(enTexte(corps, true)),
  };
}
