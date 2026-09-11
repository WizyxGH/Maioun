/**
 * Bouton à deux états shadcn/ui (`Toggle`), et sa version groupée à choix
 * unique (`ToggleGroup`) — un sélecteur segmenté.
 *
 * `aria-pressed` porte l'état : la couleur le dit à l'œil, l'attribut aux
 * lecteurs d'écran.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const toggleVariants = cva(
  'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /** Pilule bordée : filtres qu'on cumule. */
        outline:
          'rounded-full border border-border px-3 text-foreground hover:border-primary aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary',
        /** Segment d'un groupe : l'état actif est plein. */
        segment:
          'rounded-md px-3 text-muted-foreground hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
);

interface ToggleProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>,
    VariantProps<typeof toggleVariants> {
  readonly pressed: boolean;
}

export function Toggle({
  className,
  variant,
  pressed,
  type = 'button',
  ...props
}: ToggleProps): React.JSX.Element {
  return (
    <button
      data-slot="toggle"
      type={type}
      aria-pressed={pressed}
      className={cn(toggleVariants({ variant }), className)}
      {...props}
    />
  );
}

export interface ToggleGroupItem<T extends string> {
  readonly value: T;
  readonly label: React.ReactNode;
}

export function ToggleGroup<T extends string>({
  value,
  onValueChange,
  items,
  className,
  'aria-label': ariaLabel,
}: {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly items: readonly ToggleGroupItem<T>[];
  readonly className?: string;
  readonly 'aria-label': string;
}): React.JSX.Element {
  return (
    <div
      data-slot="toggle-group"
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-lg border border-border p-0.5', className)}
    >
      {items.map((item) => (
        <Toggle
          key={item.value}
          variant="segment"
          pressed={value === item.value}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </Toggle>
      ))}
    </div>
  );
}
