/**
 * Bannière shadcn/ui : ce qui demeure tant que la situation dure (une erreur,
 * un réglage manquant). Ce qui passe reste au Toast.
 *
 * Couleurs du thème (`bad`, `medium`, `good`) : une classe inconnue comme
 * `text-warning` s'affiche sans couleur, sans que rien ne le signale.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4.5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4.5 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        /** Une information : rien n'est cassé. */
        default: 'border-border bg-card text-card-foreground',
        /** Ce qui a échoué, ou ce qui empêche d'agir. */
        destructive: 'border-bad/40 bg-bad/10 text-bad',
        /** Ce qui mérite attention sans rien bloquer. */
        warning: 'border-medium/40 bg-medium/10 text-medium',
        /** Ce qui s'est bien passé, quand il faut le dire au-delà d'un instant. */
        success: 'border-good/40 bg-good/10 text-good',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

/**
 * `role` suit la gravité : une erreur ou un avertissement s'annonce aussitôt
 * (`alert`), une information attend son tour (`status`). Il reste modifiable.
 */
export function Alert({ className, variant, role, ...props }: AlertProps): React.JSX.Element {
  const annonce = variant === 'destructive' || variant === 'warning' ? 'alert' : 'status';
  return (
    <div
      data-slot="alert"
      role={role ?? annonce}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 min-h-4 font-medium tracking-tight', className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      data-slot="alert-description"
      // Un bloc, pas une grille : dans une grille, chaque `<code>` ou `<strong>`
      // du texte devient une case et passe à la ligne.
      className={cn('col-start-2 [&_p]:leading-relaxed [&_p+p]:mt-1', className)}
      {...props}
    />
  );
}
