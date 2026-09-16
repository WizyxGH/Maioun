/**
 * Ce que devient la liste déjà chargée quand la fiche complète arrive.
 *
 * DEUX SURPRISES À ABSORBER, et elles ont la même origine : la liste que le
 * navigateur tient à l'écran date d'avant la dernière collecte.
 *
 *   - L'IDENTIFIANT A CHANGÉ. Deux annonces reconnues comme une seule ne
 *     laissent qu'un groupe, sous le nom de la plus anciennement connue ;
 *     l'autre ligne disparaît. La carte garde l'ancien nom, l'API sert la fiche
 *     sous le nouveau. Sans ce remplacement, l'écran redemandait sans fin une
 *     fiche qu'il ne reconnaissait jamais.
 *   - L'ANNONCE N'EXISTE PLUS DU TOUT. Elle doit alors quitter la liste : tant
 *     qu'elle y reste, les décomptes — « 1 à vérifier », le compteur d'une
 *     recherche enregistrée — annoncent une fiche que plus rien n'ouvre.
 */

import type { ListingView } from './types.js';

/**
 * Range la fiche complète à la place de celle qu'on avait demandée.
 *
 * @param askedId l'identifiant demandé, qui peut différer de celui rendu.
 * @param keep ce que l'écran vient d'appliquer et que la base ignore encore —
 *   un favori posé une seconde plus tôt, par exemple.
 */
export function replaceListing(
  listings: readonly ListingView[],
  askedId: string,
  full: ListingView,
  keep: (previous: ListingView | undefined) => Partial<ListingView> = () => ({}),
): ListingView[] {
  const previous = listings.find((listing) => listing.id === askedId);
  const entry = { ...full, ...keep(previous) };
  const next: ListingView[] = [];
  let placed = false;
  for (const listing of listings) {
    // L'ancien nom et le nouveau peuvent être tous deux présents : une seule
    // entrée survit, à la place de la première rencontrée.
    if (listing.id === askedId || listing.id === full.id) {
      if (!placed) {
        next.push(entry);
        placed = true;
      }
      continue;
    }
    next.push(listing);
  }
  // Fiche ouverte par son adresse, sans passer par la liste : elle s'ajoute.
  if (!placed) next.push(entry);
  return next;
}

/** Retire une annonce que l'API ne sert plus ; les décomptes la lâchent avec. */
export function forgetListing(listings: readonly ListingView[], id: string): ListingView[] {
  return listings.filter((listing) => listing.id !== id);
}
