/**
 * Menu déroulant à choix UNIQUE — un `select` natif, harmonisé.
 *
 * POURQUOI IL EXISTE. Les six menus de l'interface s'étaient écrits
 * séparément, et aucun ne ressemblait tout à fait aux autres : trois épaisseurs
 * de bordure (`border-input` ici, `border-border` là, la règle de base ailleurs),
 * quatre remplissages (`py-1`, `py-1.5`, `py-2`, les 8 px de la feuille de
 * style), deux tailles de texte, et un anneau de focus sur un seul d'entre eux.
 * Rien de tout cela n'était un choix : c'était la trace de l'ordre dans lequel
 * les écrans ont été écrits. Les classes viennent désormais de `ui/field.ts`,
 * socle partagé avec `Input` — un menu et un champ se posent dans les mêmes
 * lignes et doivent s'y ressembler (§39, §65).
 *
 * IL RESTE NATIF, et ce n'est pas un compromis. Le contrôle du système ouvre le
 * sélecteur du téléphone — la roue iOS, la liste plein écran d'Android —, se
 * navigue au clavier sans une ligne de code et se lit correctement par les
 * lecteurs d'écran. Aucun panneau scripté ne rend ces trois choses ensemble ;
 * `appearance-none` les garderait, mais nous obligerait à redessiner le chevron
 * dans un conteneur, donc à changer la mise en page de chaque appelant pour un
 * gain purement décoratif. La flèche reste celle du navigateur.
 *
 * POUR PLUSIEURS CHOIX, voir `MultiSelect` : il n'existe pas de `select`
 * multiple utilisable au doigt. Son déclencheur reprend les variantes définies
 * ici, pour qu'un menu à choix multiples ait l'air du frère de celui-ci.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';
import { FIELD_BASE, FIELD_SIZES } from './field.js';

// `cursor-pointer` s'ajoute au socle commun : un menu s'ouvre d'un clic, là où
// un champ de saisie reçoit le curseur en I.
const selectVariants = cva(`cursor-pointer ${FIELD_BASE}`, {
  variants: { size: FIELD_SIZES },
  defaultVariants: { size: 'default' },
});

/**
 * `size` est OMIS des attributs HTML à dessein. Sur un `select`, l'attribut
 * natif est le nombre de lignes visibles (un entier) ; l'intersecter avec nos
 * variantes donnerait `number & 'default' | 'sm'`, c'est-à-dire `never`, et le
 * composant deviendrait inappelable. Le projet n'affiche jamais de liste
 * dépliée en permanence — c'est précisément ce que `MultiSelect` a remplacé.
 */
interface SelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {}

export function Select({ className, size, ...props }: SelectProps): React.JSX.Element {
  return <select className={cn(selectVariants({ size }), className)} {...props} />;
}

export { selectVariants };
