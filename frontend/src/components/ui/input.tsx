/**
 * Champ de saisie — texte, nombre, date.
 *
 * POURQUOI IL EXISTE. La modale de filtres portait DEUX styles de champ, dans
 * le même écran : le budget et la surface en `w-24 border-border`, alignés à
 * gauche ; le trajet et la date d'emménagement en `w-28 border-input bg-card`,
 * alignés à droite. Aucun des deux n'avait d'anneau de focus, alors que le menu
 * déroulant posé entre eux en avait un. Ce n'était pas un choix : les deux
 * familles ont été écrites à des moments différents.
 *
 * IL PARTAGE SON SOCLE AVEC `Select` (`ui/field.ts`) : un champ et un menu se
 * posent dans les mêmes lignes, ils doivent s'y ressembler exactement.
 *
 * LES CASES À COCHER N'EN RELÈVENT PAS. Une case n'a ni bordure à harmoniser ni
 * hauteur de ligne : le contrôle natif est déjà à la bonne taille et sait dire
 * son état. Le projet les laisse telles quelles (§39, §65).
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';
import { FIELD_BASE, FIELD_SIZES } from './field.js';

const inputVariants = cva(FIELD_BASE, {
  variants: { size: FIELD_SIZES },
  defaultVariants: { size: 'default' },
});

/**
 * `size` est OMIS des attributs HTML à dessein : sur un `input`, l'attribut
 * natif est une largeur en caractères (un entier). L'intersecter avec nos
 * variantes donnerait `never`, et le composant deviendrait inappelable. La
 * largeur se règle en classe, comme partout ailleurs dans le projet.
 */
interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export function Input({ className, size, ...props }: InputProps): React.JSX.Element {
  return <input className={cn(inputVariants({ size }), className)} {...props} />;
}

export { inputVariants };
