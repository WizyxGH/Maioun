/**
 * Menu déroulant à choix unique — un `select` natif, harmonisé.
 *
 * Les six menus de l'interface s'étaient écrits séparément : trois bordures,
 * quatre remplissages, un anneau de focus sur un seul d'entre eux. Les classes
 * viennent maintenant de `ui/field.ts`, partagé avec `Input` (§39, §65).
 *
 * IL RESTE NATIF : le contrôle du système ouvre le sélecteur du téléphone, se
 * navigue au clavier et se lit par les lecteurs d'écran. `appearance-none`
 * obligerait à redessiner le chevron dans un conteneur, donc à changer la mise
 * en page de chaque appelant, pour un gain décoratif.
 *
 * Pour plusieurs choix, voir `MultiSelect`, dont le déclencheur reprend ces
 * variantes.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';
import { FIELD_BASE, FIELD_SIZES } from './field.js';

// `cursor-pointer` en plus du socle : un menu s'ouvre d'un clic.
const selectVariants = cva(`cursor-pointer ${FIELD_BASE}`, {
  variants: { size: FIELD_SIZES },
  defaultVariants: { size: 'default' },
});

/**
 * `size` est omis des attributs HTML : sur un `select` c'est le nombre de
 * lignes visibles, et l'intersecter avec nos variantes donnerait `never`.
 */
interface SelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof selectVariants> {}

export function Select({ className, size, ...props }: SelectProps): React.JSX.Element {
  return <select className={cn(selectVariants({ size }), className)} {...props} />;
}

export { selectVariants };
