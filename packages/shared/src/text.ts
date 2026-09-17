/**
 * Formes canoniques d'un texte — décodage, espaces, forme comparable.
 *
 * CES TROIS FONCTIONS VIVAIENT DANS LE COLLECTEUR, et le site ne pouvait pas
 * les importer. Elles sont remontées ici parce que le rapprochement des noms
 * d'agence, lui aussi remonté, s'appuie dessus : une règle partagée par deux
 * écrans ne peut pas reposer sur une normalisation qui n'existe que d'un côté.
 *
 * Le collecteur les réexporte depuis `normalization/text.ts`, où ses quatre-
 * vingts parseurs vont les chercher : rien n'a changé pour eux.
 */

/** Entités HTML rencontrées en pratique sur les sites immobiliers. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&bull;': '•',
  '&euro;': '€',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&agrave;': 'à',
  '&ccedil;': 'ç',
  '&ocirc;': 'ô',
  '&sup2;': '²',
};

/**
 * Espaces à traiter comme des espaces ordinaires :
 * U+00A0 insécable, U+202F fine insécable, U+2009 fine, U+2007 numérique.
 *
 * Ils sont écrits par leur code plutôt que littéralement : dans un fichier
 * source, ces caractères sont visuellement indiscernables d'une espace
 * ordinaire, ce qui rendrait la ligne impossible à relire ou à modifier
 * sûrement — et c'est aussi ce que signale la règle `no-irregular-whitespace`.
 */
export const EXOTIC_SPACES = /[\u00a0\u202f\u2009\u2007\t]/g;

/** Remplace les entités HTML courantes et les entités numériques. */
export function decodeEntities(input: string): string {
  let output = input;
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    output = output.split(entity).join(replacement);
  }
  return output.replace(/&#(\d+);/g, (_match, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 10)),
  );
}

/**
 * Forme canonique d'un texte extrait du HTML : entités décodées, espaces
 * exotiques ramenés à l'espace simple, espaces multiples réduits, bords rognés.
 */
export function cleanText(input: string | null | undefined): string {
  if (input == null) return '';
  return decodeEntities(input).replace(EXOTIC_SPACES, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Forme comparable d'un texte : minuscules, sans accent, sans ponctuation.
 * Utilisée pour comparer des villes et des titres lors du dédoublonnage, et
 * pour rapprocher deux graphies d'un même nom d'agence.
 *
 * @example
 * comparable('Nice — Cimiez') === 'nice cimiez'
 */
export function comparable(input: string | null | undefined): string {
  return (
    cleanText(input)
      .toLowerCase()
      .normalize('NFD')
      // Supprime les diacritiques laissés par la décomposition NFD.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
