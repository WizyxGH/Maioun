/** Barre de progression shadcn/ui, sur 100. */

import { cn } from '@/lib/utils.js';

export function Progress({
  value,
  className,
  indicatorClassName,
  gradient,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  readonly value: number;
  /** Couleur de la partie remplie — `bg-primary` par défaut. */
  readonly indicatorClassName?: string;
  /**
   * LE REMPLI EST UN DÉGRADÉ ROUGE → VERT, étalé sur TOUTE la piste.
   *
   * Pas sur la partie remplie : un dégradé qui se comprime irait du rouge au
   * vert quelle que soit la note, et une annonce à 20 finirait verte. Étalé sur
   * la piste, le rempli ne montre que le morceau du spectre qu'il atteint —
   * rouge à 20, orange à 50, vert à 90. La couleur DIT la note, au lieu de la
   * décorer.
   */
  readonly gradient?: boolean;
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, value));
  // La largeur du dégradé rapportée à celle du rempli : `100 / (v/100)`. À 0 on
  // ne dessine rien, donc la division ne se pose pas.
  const etendue = clamped > 0 ? `${(10000 / clamped).toFixed(2)}%` : '100%';
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
          'h-full rounded-full transition-[width] duration-300',
          gradient === true ? 'bg-bad' : 'bg-primary',
          indicatorClassName,
        )}
        style={{
          width: `${clamped}%`,
          ...(gradient === true
            ? {
                backgroundImage:
                  'linear-gradient(to right, var(--color-bad), var(--color-medium), var(--color-good))',
                backgroundSize: `${etendue} 100%`,
                backgroundRepeat: 'no-repeat',
              }
            : {}),
        }}
      />
    </div>
  );
}
