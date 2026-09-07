/**
 * Champ de saisie — texte, nombre, date.
 *
 * La modale de filtres portait deux styles de champ dans le même écran, sans
 * anneau de focus ni l'un ni l'autre, alors que le menu posé entre eux en avait
 * un. Le socle vient de `ui/field.ts`, partagé avec `Select`.
 *
 * Les cases à cocher n'en relèvent pas : le contrôle natif est déjà à la bonne
 * taille et sait dire son état (§39, §65).
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';
import { FIELD_BASE, FIELD_SIZES } from './field.js';

const inputVariants = cva(FIELD_BASE, {
  variants: { size: FIELD_SIZES },
  defaultVariants: { size: 'default' },
});

/**
 * `size` est omis des attributs HTML : sur un `input` c'est une largeur en
 * caractères, et l'intersecter avec nos variantes donnerait `never`. La largeur
 * se règle en classe.
 */
interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export function Input({ className, size, ...props }: InputProps): React.JSX.Element {
  return <input className={cn(inputVariants({ size }), className)} {...props} />;
}

export { inputVariants };
