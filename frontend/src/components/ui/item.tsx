/**
 * Rangée shadcn/ui : un média, un titre, une précision, une action à droite.
 *
 * `ItemButton` quand la rangée entière mène quelque part. Les pièces internes
 * sont des `span` : un `div` n'a pas sa place dans un bouton.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.js';

const itemVariants = cva('flex w-full items-center gap-3 rounded-xl text-left transition-colors', {
  variants: {
    variant: {
      default: '',
      outline: 'border border-border',
    },
    size: {
      default: 'p-3',
      sm: 'p-2.5',
    },
  },
  defaultVariants: { variant: 'outline', size: 'default' },
});

const INTERACTIVE =
  'cursor-pointer hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type ItemVariantProps = VariantProps<typeof itemVariants>;

export function Item({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & ItemVariantProps): React.JSX.Element {
  return (
    <div data-slot="item" className={cn(itemVariants({ variant, size }), className)} {...props} />
  );
}

export function ItemButton({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & ItemVariantProps): React.JSX.Element {
  return (
    <button
      data-slot="item"
      type={type}
      className={cn(itemVariants({ variant, size }), INTERACTIVE, className)}
      {...props}
    />
  );
}

export function ItemContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span data-slot="item-content" className={cn('min-w-0 flex-1', className)} {...props} />;
}

export function ItemTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span data-slot="item-title" className={cn('block font-medium', className)} {...props} />;
}

export function ItemDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span
      data-slot="item-description"
      className={cn('block text-[0.82rem] text-muted-foreground', className)}
      {...props}
    />
  );
}
