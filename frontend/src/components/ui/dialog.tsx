/**
 * Modale de confirmation, à la manière shadcn/ui.
 *
 * SANS DÉPENDANCE. shadcn construit ses dialogues sur Radix ; le projet n'en a
 * pas, et l'ajouter pour deux confirmations coûterait plus cher que ces
 * quelques lignes. On en reprend l'apparence et surtout le COMPORTEMENT, que
 * les modales bricolées oublient : Échap referme, un clic sur le fond referme,
 * le focus part dans le dialogue, et `role="dialog"` + `aria-modal` disent aux
 * lecteurs d'écran que le reste de la page attend.
 *
 * `variant="destructive"` pour ce qui ne se rattrape pas : le bouton de
 * validation prend alors le rouge que le projet réserve à cela.
 */

import { useEffect, useRef } from 'react';
import { Button } from './button.js';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: React.ReactNode;
  /** Intitulé du bouton qui valide. Il doit dire CE QU'IL FAIT, pas « OK ». */
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly variant?: 'default' | 'destructive';
  /** Empêche la validation — mot de passe vide, envoi en cours. */
  readonly confirmDisabled?: boolean;
  /** Contenu supplémentaire : un champ à saisir avant de valider. */
  readonly children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  variant = 'default',
  confirmDisabled = false,
  children,
}: ConfirmDialogProps): React.JSX.Element | null {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    // Le focus entre dans le dialogue : sans cela, la tabulation continue
    // derrière lui, sur une page qu'on ne peut pourtant plus utiliser.
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="rf-fade fixed inset-0 z-[2100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="rf-rise flex w-full flex-col gap-3 rounded-t-2xl border border-border bg-card p-5 shadow-xl outline-none sm:max-w-md sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-[0.9rem] text-muted-foreground">{description}</div>
        {children}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
