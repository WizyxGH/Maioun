/**
 * La liste en deux temps : de quoi remplir l'écran, puis le reste.
 *
 * Les 500 annonces arrivent en deux à trois secondes sur un téléphone ; les
 * cinquante premières, dans le même ordre, suffisent à l'écran d'ouverture. On
 * les affiche, et la liste complète les remplace dès qu'elle arrive.
 *
 * SEULEMENT QUAND RIEN N'EST AFFICHÉ pour ces paramètres. Un rechargement au
 * retour sur l'application ramènerait sinon la liste à cinquante lignes sous
 * les yeux de qui l'avait déjà fait défiler.
 */

import type { ListingsResponse } from './types.js';

/** Ce qu'il faut pour remplir un écran, et un peu plus pour défiler. */
export const FIRST_PAGE = 50;

/**
 * @param fetchPage  `undefined` = la liste entière.
 * @param onStage    Reçoit chaque réponse ; `false` = elle est périmée (les
 *                   paramètres ont changé entre-temps), on s'arrête là.
 * @param quick      `true` si rien n'est encore affiché pour ces paramètres.
 */
export async function loadInStages(
  fetchPage: (limit: number | undefined) => Promise<ListingsResponse>,
  onStage: (response: ListingsResponse) => boolean,
  quick: boolean,
): Promise<void> {
  if (quick) {
    const first = await fetchPage(FIRST_PAGE);
    if (!onStage(first)) return;
    // Tout tenait dans la première page : la redemander ne changerait rien.
    if (first.listings.length >= first.total) return;
  }
  onStage(await fetchPage(undefined));
}
