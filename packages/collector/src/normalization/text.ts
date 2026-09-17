/**
 * Utilitaires de texte partagés par tous les parsers.
 *
 * Les sites français utilisent une variété déconcertante d'espaces (insécable,
 * fine insécable, tabulation) et d'entités HTML. Tout parser commence donc par
 * ramener son entrée à une forme canonique, sans quoi les expressions
 * régulières échouent de façon imprévisible selon la source.
 */

/**
 * Décodage, espaces exotiques et forme comparable vivent maintenant dans
 * `@maioun/shared` : le rapprochement des noms d'agence, désormais partagé avec
 * le site, s'appuie dessus — et le site ne peut rien importer du collecteur.
 * Réexportés ici pour que les parseurs les trouvent où ils ont toujours été.
 */
import { EXOTIC_SPACES, cleanText, comparable, decodeEntities } from '@maioun/shared';

export { cleanText, comparable, decodeEntities } from '@maioun/shared';

/**
 * Forme canonique d'un TEXTE LONG — la description d'une annonce.
 *
 * Identique à `cleanText`, à ceci près que les RETOURS À LA LIGNE sont
 * conservés. Une description d'agence est écrite en paragraphes : « Rue
 * Smolett, tout proche du port. ⏎ Salle de douche neuve. ⏎ Libre de suite. »
 * L'aplatir en une seule ligne, comme le fait `cleanText`, rendait la fiche
 * illisible — et supprimait le seul indice de structure dont dispose
 * l'extraction d'adresse.
 *
 * Les espaces à l'intérieur d'une ligne sont réduits, les lignes vides
 * multiples ramenées à une seule : on garde la structure, pas le bruit.
 */
export function cleanMultiline(input: string | null | undefined): string {
  if (input == null) return '';
  return (
    decodeEntities(input)
      // `<br>` resté en toutes lettres dans le texte d'une source.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(EXOTIC_SPACES, ' ')
      .replace(/\r\n?/g, '\n')
      // Espaces multiples À L'INTÉRIEUR d'une ligne uniquement.
      .replace(/[^\S\n]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Variante identifiant : `Nice Centre` → `nice-centre`. */
export function slugify(input: string): string {
  return comparable(input).replace(/\s+/g, '-');
}

/**
 * Découpe un texte en mots significatifs, en écartant les mots vides français.
 * Sert au calcul de similarité des titres et descriptions (§14).
 */
const STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'ce',
  'ces',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'et',
  'il',
  'la',
  'le',
  'les',
  'ne',
  'ou',
  'par',
  'pas',
  'pour',
  'que',
  'qui',
  'sa',
  'se',
  'ses',
  'son',
  'sur',
  'un',
  'une',
  'sont',
  'est',
  'plus',
  'tres',
  'chez',
]);

/** Un mot suivi d'une ellipse : « uniquemen... », « étud… ». */
const WORD_BEFORE_ELLIPSIS = /(\p{L}+)(?:\.{2,}|…)/gu;

/**
 * Complète les mots coupés par une ellipse, en forme `comparable`.
 *
 * Les aperçus de liste tronquent au caractère : « STUDIO ETUDIANT uniquemen... ».
 * Un motif qui attend « uniquement » n'y voit plus rien. Le mot coupé est
 * remplacé par le premier mot du vocabulaire qu'il commence — et seulement
 * s'il en garde assez de lettres pour ne pas être ambigu (« uni » pourrait
 * être « université »).
 */
export function completeTruncatedWords(
  input: string | null | undefined,
  vocabulary: readonly string[],
  minPrefix = 4,
): string {
  const completed = cleanText(input).replace(WORD_BEFORE_ELLIPSIS, (whole, word: string) => {
    const stem = comparable(word);
    if (stem.length < minPrefix) return whole;
    const full = vocabulary.find((one) => one.length > stem.length && one.startsWith(stem));
    return full === undefined ? whole : `${full} `;
  });
  return comparable(completed);
}

export function tokenize(input: string | null | undefined): string[] {
  return comparable(input)
    .split(' ')
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}
