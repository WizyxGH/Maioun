/**
 * Bloc repliable shadcn/ui, sur `<details>` : il s'ouvre au clavier comme à
 * la souris, sans script.
 *
 * Groupe NOMMÉ (`group/collapsible`) : un bloc imbriqué dans un autre ne
 * tourne pas le chevron de son parent.
 */

import { cn } from '@/lib/utils.js';
import { ChevronDown } from '../icons.js';

export function Collapsible({
  className,
  ...props
}: React.DetailsHTMLAttributes<HTMLDetailsElement>): React.JSX.Element {
  return (
    <details data-slot="collapsible" className={cn('group/collapsible', className)} {...props} />
  );
}

export function CollapsibleTrigger({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>): React.JSX.Element {
  return (
    <summary
      data-slot="collapsible-trigger"
      className={cn(
        'inline-flex cursor-pointer list-none items-center gap-1 hover:text-foreground [&::-webkit-details-marker]:hidden',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform group-open/collapsible:rotate-180"
      />
    </summary>
  );
}
