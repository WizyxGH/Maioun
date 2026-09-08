/**
 * Zone de saisie multiligne.
 *
 * Même socle que `Input` : sans lui, un message de candidature posé sous des
 * champs harmonisés gardait la bordure du style global, sans anneau de focus.
 * La hauteur reste à l'appelant — elle dépend de ce qu'on y écrit.
 */

import { cn } from '@/lib/utils.js';
import { FIELD_BASE } from './field.js';

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps): React.JSX.Element {
  return <textarea className={cn(FIELD_BASE, 'px-2.5 py-2', className)} {...props} />;
}
