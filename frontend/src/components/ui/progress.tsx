/** Barre de progression shadcn/ui, sur 100. */

import { cn } from '@/lib/utils.js';

export function Progress({
  value,
  className,
  indicatorClassName,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  readonly value: number;
  /** Couleur de la partie remplie — `bg-primary` par défaut. */
  readonly indicatorClassName?: string;
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-300',
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
