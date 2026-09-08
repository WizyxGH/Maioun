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
  const panel = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  /**
   * LE FOCUS N'ENTRE QU'À L'OUVERTURE, et il a fallu l'isoler ici.
   *
   * Il vivait dans l'effet ci-dessus, qui dépend d'`onCancel` — une fonction
   * recréée à chaque rendu par l'appelant. Chaque frappe dans un champ du
   * dialogue provoquait donc un rendu, l'effet rejouait, et le panneau
   * REPRENAIT le focus : on tapait un caractère et l'on était éjecté du champ.
   * Impossible de saisir une adresse ou un mot de passe.
   *
   * Ne dépendre que d'`open` suffit : on ne veut ce geste qu'une fois, quand le
   * dialogue paraît, pour que la tabulation ne continue pas derrière lui sur
   * une page qu'on ne peut plus utiliser.
   */
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="rf-fade fixed inset-0 z-[2100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {/* UN FORMULAIRE, ET NON UN SIMPLE PANNEAU. Les dialogues qui demandent
        un mot de passe le posaient hors de tout `form` : le navigateur s'en
        plaignait (« Password field is not contained in a form »), les
        gestionnaires de mots de passe ne savaient pas quoi enregistrer, et la
        touche Entrée ne validait rien — il fallait viser le bouton. */}
      <form
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onSubmit={(event) => {
          event.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
        className="rf-rise flex w-full flex-col gap-3 rounded-t-2xl border border-border bg-card p-5 shadow-xl outline-none sm:max-w-md sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="text-[0.9rem] text-muted-foreground">{description}</div>
        {children}
        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button type="submit" variant={variant} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
