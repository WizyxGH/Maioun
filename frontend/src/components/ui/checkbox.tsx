/**
 * Case à cocher et bouton radio, à l'apparence shadcn/ui.
 *
 * L'ÉLÉMENT RESTE NATIF : clavier, formulaire et étiquette `<label>` marchent
 * sans script, comme le veut le projet. Seul le dessin change — la coche est
 * posée par-dessus, visible quand la case l'est.
 */

import { cn } from '@/lib/utils.js';
import { Check } from '../icons.js';

const BOX =
  'peer size-5 shrink-0 cursor-pointer appearance-none border border-input bg-card p-0 transition-colors checked:border-primary checked:bg-primary hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

type NativeProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Checkbox({ className, ...props }: NativeProps): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <input type="checkbox" data-slot="checkbox" className={cn(BOX, 'rounded-md')} {...props} />
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto size-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}

export function Radio({ className, ...props }: NativeProps): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <input
        type="radio"
        data-slot="radio-group-item"
        className={cn(BOX, 'rounded-full checked:bg-card')}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto size-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}
