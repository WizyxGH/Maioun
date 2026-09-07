/**
 * Le socle visuel des CHAMPS — celui que partagent `Input` et `Select`.
 *
 * POURQUOI IL EST À PART. Un champ de saisie et un menu déroulant sont deux
 * contrôles différents, mais ils se posent côte à côte dans les mêmes lignes et
 * doivent s'y ressembler exactement : même bordure, même arrondi, même hauteur,
 * même anneau de focus. Tant que chacun portait ses classes, ils divergeaient à
 * la première retouche — c'est ce qui est arrivé aux deux familles de la modale
 * de filtres, l'une en `border-border` et l'autre en `border-input`, dans le
 * même écran, à trois centimètres l'une de l'autre.
 *
 * Ce fichier n'exporte pas de composant : il n'y a rien à rendre ici, seulement
 * la source unique de ces classes.
 */

/**
 * `hover:border-primary` est l'affordance du bouton `outline` : elle dit qu'on
 * peut agir sur l'élément. `cursor-pointer` n'y est PAS — il appartient au
 * menu, qui s'ouvre d'un clic, et non au champ de saisie, où le curseur en
 * I dit mieux ce qui va se passer.
 */
export const FIELD_BASE =
  'rounded-lg border border-input bg-card text-foreground transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Les deux tailles du projet.
 *
 * `default` fait 44 px — la cible tactile (§36), celle de Button. La taille du
 * texte n'y est pas fixée : elle reste le 1 rem de la règle de base, pour qu'un
 * champ placé à côté d'un autre ait la même hauteur de caractères que lui.
 *
 * `sm` sert aux rangées denses, où le contrôle voisine des boutons `min-h-9`.
 */
export const FIELD_SIZES = {
  default: 'min-h-11 px-2.5 py-2',
  sm: 'min-h-9 px-2 py-1 text-sm',
} as const;
