/**
 * Le socle visuel partagé par `Input` et `Select`.
 *
 * Un champ et un menu se posent côte à côte dans les mêmes lignes : tant que
 * chacun portait ses classes, ils divergeaient à la première retouche — deux
 * bordures différentes cohabitaient dans la modale de filtres.
 */

/** `cursor-pointer` n'y est pas : il appartient au menu, pas au champ de saisie. */
export const FIELD_BASE =
  'rounded-lg border border-input bg-card text-foreground transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

/**
 * `default` fait 44 px, la cible tactile du projet (§36). La taille du texte
 * n'est pas fixée, pour qu'un champ garde celle de son voisin. `sm` sert aux
 * rangées denses, où le contrôle voisine des boutons `min-h-9`.
 */
export const FIELD_SIZES = {
  default: 'min-h-11 px-2.5 py-2',
  sm: 'min-h-9 px-2 py-1 text-sm',
} as const;
