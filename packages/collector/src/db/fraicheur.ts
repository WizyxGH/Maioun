/**
 * DE QUAND DATENT CES DONNÉES — et non : de quand date ce fichier.
 *
 * Les outils locaux annonçaient la date de MODIFICATION du fichier. Or ouvrir
 * une base SQLite suffit à la rafraîchir : le 2026-09-25, `pnpm serve:local`
 * affichait « base du 25/09 11:36 » pour un contenu collecté la veille à 17 h,
 * simplement parce qu'il venait de l'ouvrir. La date la plus rassurante était
 * la moins vraie.
 *
 * C'est exactement ce que cet affichage doit empêcher : un chiffre de la veille
 * pris pour l'état du jour est pire que pas de chiffre du tout.
 *
 * ON LIT DONC LA DATE DANS LES DONNÉES : la plus récente collecte d'occurrence.
 * À défaut — base vide, table absente —, on retombe sur le fichier, mais on le
 * DIT, plutôt que de laisser croire.
 *
 * Une copie de cette règle vit dans `scripts/env.mjs`, pour les outils
 * d'enquête qui tournent sans compilation.
 */

/**
 * Ce qu'on affiche à côté d'un chiffre tiré d'une base locale.
 *
 * @param nom Ce qu'est cette base : « miroir de la production », par exemple.
 * @param derniereCollecte Le `scraped_at` le plus récent, ou `null`.
 * @param modifieLe Date de modification du fichier, en dernier recours.
 */
export function descriptionDeLaCopie(
  nom: string,
  derniereCollecte: string | null,
  modifieLe: Date,
): string {
  const quand = derniereCollecte === null ? null : new Date(derniereCollecte);
  if (quand !== null && !Number.isNaN(quand.getTime())) {
    return `${nom}, collectée le ${quand.toLocaleString('fr-FR')}`;
  }
  // « fichier » et non « collectée » : le mot dit que la date n'est pas celle
  // des données, et qu'elle ne prouve donc pas leur fraîcheur.
  return `${nom}, fichier du ${modifieLe.toLocaleString('fr-FR')} (contenu de date inconnue)`;
}

/** La requête qui donne cette date. Une seule ligne lue. */
export const SQL_DERNIERE_COLLECTE = 'SELECT MAX(scraped_at) AS quand FROM occurrences';
