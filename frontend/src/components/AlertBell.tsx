/**
 * La cloche des notifications et sa pastille de non-lues.
 *
 * SEULE ENTRÉE VERS LES NOTIFICATIONS, et ce n'est pas un onglet : régler ses
 * alertes n'est pas un endroit où l'on navigue, c'est un aparté dont on
 * revient.
 *
 * Elle vivait dans le corps de `Shell`, au milieu de l'en-tête, et rien ne
 * pouvait l'éprouver sans monter l'application entière avec des annonces
 * notifiées — c'est ainsi que sa pastille a porté l'orange des annonces
 * urgentes pendant des semaines sans que personne ne le voie.
 */

import { alertBadgeLabel } from '../notifications.js';
import { Bell } from './icons.js';

export function AlertBell({
  unread,
  onOpen,
}: {
  /** Alertes reçues depuis la dernière visite de la page Notifications. */
  readonly unread: number;
  readonly onOpen: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'
      }
      className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
    >
      <Bell aria-hidden="true" className="size-4" />
      {/* Pastille des alertes non lues : sans elle, rien ne distinguait une
        cloche qui a quelque chose à dire d'une cloche muette — il fallait
        ouvrir la page pour le savoir.
        ROUGE, et non l'orange des annonces à contacter : elle ne dit pas
        « urgent à traiter », elle dit « non lu ». */}
      {unread > 0 && (
        <span
          data-testid="alert-badge"
          aria-hidden="true"
          className="bg-notify text-notify-foreground absolute -top-1.5 -right-1.5 flex min-w-4.5 items-center justify-center rounded-full px-1 text-[0.65rem] leading-4.5 font-bold"
        >
          {/* « 99+ » et non « 9+ » — le plafond et sa mesure vivent dans
            `notifications.ts`, avec le reste du décompte. */}
          {alertBadgeLabel(unread)}
        </span>
      )}
    </button>
  );
}
