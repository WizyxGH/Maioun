/**
 * Page des notifications (§29).
 *
 * RIEN QU'UN HISTORIQUE (décision utilisateur du 2026-09-04). La page a porté
 * successivement deux interrupteurs, puis un seul, puis plus aucun : le
 * réglage « être prévenu, ou non » a rejoint les Paramètres, avec les autres
 * réglages. Ce qu'on vient chercher ici, c'est ce qui est passé — les
 * annonces signalées, datées, consultables même si l'on a raté l'alerte.
 *
 * L'interrupteur vit désormais dans « Paramètres → Notifications », avec le
 * détail par famille d'alertes.
 */

import { useRef, useState } from 'react';
import { Check } from './icons.js';
import { Button } from '@/components/ui/button.js';
import type { ListingView } from '../types.js';
import { ALERT_LABELS, alertEventOf, type AlertEvent } from '../alert-kind.js';
import { formatArea, formatDay, formatPostalAddress, formatPrice, formatTime } from '../format.js';
import {
  isUnreadAlert,
  readDismissedAlerts,
  notificationsSupported,
  writeDismissedAlerts,
} from '../notifications.js';

/** Au-delà, le glissement vaut décision : la ligne est écartée. */
const DISMISS_MIN_PX = 80;

/** Profondeur de l'historique. Au-delà, une annonce n'est plus d'actualité. */
const HISTORY_DAYS = 30;

interface NotificationsPanelProps {
  readonly listings: readonly ListingView[];
  readonly nowMs: number;
  readonly onOpen: (id: string) => void;
  /**
   * Instant de la visite PRÉCÉDENTE : ce qui est arrivé après est « non lu ».
   *
   * Figé par l'appelant à l'ouverture de la page, et non recalculé ici : sans
   * cela, arriver sur l'historique marquerait tout comme lu dans la seconde,
   * et les repères disparaîtraient sous les yeux.
   */
  readonly seenAtMs: number;
  /**
   * Efface les repères « non lue », sans rien ouvrir ni écarter.
   *
   * DISTINCT D'ÉCARTER, et c'est ce qui justifie un bouton séparé du
   * glissement : écarter range la ligne hors de l'historique, marquer comme lu
   * la laisse en place. On veut souvent le second sans le premier — douze
   * alertes qu'on a vues et qu'on garde sous la main.
   */
  readonly onMarkAllRead?: () => void;
}

/**
 * Une ligne d'historique.
 *
 * Le prix et la ville ne suffisaient pas à reconnaître l'annonce parmi vingt :
 * la vignette la resitue d'un coup d'œil, l'adresse dit OÙ, et la source dit à
 * qui l'on aura affaire. Sans photo, un cadre neutre — on n'invente rien (§17).
 */
function HistoryRow({
  listing,
  event,
  unread,
  onOpen,
  onDismiss,
}: {
  readonly listing: ListingView;
  readonly event: AlertEvent;
  readonly unread: boolean;
  readonly onOpen: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}): React.JSX.Element {
  // Abscisse du doigt au début du geste. Une `ref` : elle change à chaque
  // touche et ne doit déclencher aucun rendu.
  const swipeFrom = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const photo = listing.imageUrls[0];
  const place = formatPostalAddress({
    address: listing.address.value,
    postalCode: listing.postalCode.value,
    city: listing.city.value,
    district: listing.district.value,
  });
  // La ligne s'efface à mesure qu'on la pousse : le geste dit ce qu'il fera
  // avant qu'on le relâche.
  const fade = Math.max(0.25, 1 - Math.abs(offset) / (DISMISS_MIN_PX * 2));

  return (
    <button
      type="button"
      onClick={() => onOpen(listing.id)}
      // Le glissement LATÉRAL écarte la ligne ; le vertical reste à la page,
      // sans quoi on ne pourrait plus faire défiler l'historique au doigt.
      style={{ touchAction: 'pan-y', transform: `translateX(${offset}px)`, opacity: fade }}
      onTouchStart={(event) => {
        swipeFrom.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchMove={(event) => {
        const from = swipeFrom.current;
        if (from === null) return;
        setOffset((event.touches[0]?.clientX ?? from) - from);
      }}
      onTouchEnd={() => {
        swipeFrom.current = null;
        if (Math.abs(offset) >= DISMISS_MIN_PX) onDismiss(listing.id);
        setOffset(0);
      }}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left transition-[background-color,border-color,transform,opacity] duration-150 hover:bg-muted ${
        unread ? 'border-primary/60 bg-primary/5' : 'border-border'
      }`}
    >
      {photo !== undefined ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-14 shrink-0 rounded-lg bg-muted object-cover"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
        />
      ) : (
        <span aria-hidden="true" className="size-14 shrink-0 rounded-lg bg-muted" />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {unread && (
            <span
              aria-label="Non lue"
              title="Non lue"
              className="size-2 shrink-0 self-center rounded-full bg-primary"
            />
          )}
          <strong className="font-semibold">{formatPrice(listing.price.value)}</strong>
          <span className="text-sm text-muted-foreground">{formatArea(listing.area.value)}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatTime(event.at)}
          </span>
        </span>
        {/* POURQUOI CETTE ANNONCE A SONNÉ. Sans cela, un rappel de candidature et
          une annonce proche des critères se lisaient comme une nouveauté —
          alors que la notification, elle, le disait. */}
        <span className="block truncate text-xs font-medium text-primary">
          {ALERT_LABELS[event.kind]}
        </span>
        {/* LA SOURCE A QUITTÉ CETTE LIGNE. Elle n'aide pas à décider s'il faut
          ouvrir : on choisit un logement, pas un site. Elle reste sur la fiche,
          où l'on vient précisément pour savoir d'où vient l'annonce. */}
        <span className="block truncate text-sm">{place}</span>
      </span>
    </button>
  );
}

export function NotificationsPanel({
  listings,
  nowMs,
  onOpen,
  seenAtMs,
  onMarkAllRead,
}: NotificationsPanelProps): React.JSX.Element {
  // Lignes écartées d'un glissement. Persisté : ranger une alerte ne doit pas
  // se défaire au premier rechargement.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(readDismissedAlerts);
  const dismiss = (id: string): void =>
    setDismissed((current) => {
      const next = new Set(current).add(id);
      writeDismissedAlerts(next);
      return next;
    });
  // HISTORIQUE : les annonces réellement signalées, datées par la collecte.
  // Auparavant cette section comparait la liste courante à une mémoire du
  // navigateur — perdue au premier nettoyage, vide sur un autre appareil, et
  // muette au tout premier passage. La date vient maintenant de la base, donc
  // l'historique est le même partout.
  //
  // Les annonces sans date sont celles notifiées avant que l'horodatage
  // n'existe : on ne les invente pas (§17). Celles devenues louées ou
  // inactives ne sont plus rapatriées et sortent donc de l'historique — c'est
  // le prix à payer pour ne coûter AUCUNE lecture Turso de plus.
  const horizon = nowMs - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  /**
   * TROIS FAMILLES, ET NON UNE. L'historique ne retenait que `notifiedAt` :
   * « un favori n'est plus disponible » et « pas encore candidaté »
   * s'horodatent ailleurs et n'y apparaissaient jamais. C'est l'événement le
   * plus récent qui date et classe chaque ligne.
   */
  const history = listings
    .map((listing) => ({ listing, event: alertEventOf(listing) }))
    .filter(
      (entry): entry is { listing: ListingView; event: AlertEvent } =>
        entry.event !== null &&
        !dismissed.has(entry.listing.id) &&
        Date.parse(entry.event.at) >= horizon,
    )
    .sort((a, b) => Date.parse(b.event.at) - Date.parse(a.event.at));

  // Regroupement par jour, l'ordre des annonces étant déjà décroissant.
  const days: { label: string; items: { listing: ListingView; event: AlertEvent }[] }[] = [];
  for (const entry of history) {
    const label = formatDay(entry.event.at, nowMs);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(entry);
    else days.push({ label, items: [entry] });
  }

  const unread = history.filter(({ listing }) => isUnreadAlert(listing, seenAtMs)).length;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">Notifications</h2>
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-muted-foreground text-sm font-semibold">
            {history.length > 0 ? `Historique (${history.length})` : 'Historique'}
          </h3>
          {/* ABSENT QUAND IL N'A RIEN À FAIRE, plutôt qu'éteint.
            Il est resté un temps grisé, pour qu'on sache qu'il existe. Mais un
            bouton éteint occupe la place et l'œil sans rien offrir : on le lit,
            on comprend qu'il ne sert pas, et on recommence à chaque visite.
            L'en-tête dit déjà combien d'alertes sont en attente — quand il n'y
            a rien à marquer, le silence est la bonne réponse.

            Le décompte reste annoncé aux lecteurs d'écran : « Tout marquer comme
            lu » seul ne dit pas combien. */}
          {unread > 0 && onMarkAllRead !== undefined && (
            <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
              <Check aria-hidden="true" className="size-4" />
              Tout marquer comme lu
              <span className="sr-only">{` (${unread} non lues)`}</span>
            </Button>
          )}
        </div>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune alerte sur les {HISTORY_DAYS} derniers jours. Les annonces signalées
            s’afficheront ici, datées — même si vous avez manqué la notification.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {days.map((day) => (
              <div key={day.label}>
                <h4 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {day.label}
                </h4>
                <ul className="flex flex-col gap-1.5">
                  {day.items.map(({ listing, event }) => (
                    <li key={listing.id}>
                      <HistoryRow
                        listing={listing}
                        event={event}
                        unread={isUnreadAlert(listing, seenAtMs)}
                        onOpen={onOpen}
                        onDismiss={dismiss}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {!notificationsSupported() && (
        <p className="text-sm text-muted-foreground">
          Ce navigateur ne gère pas les notifications. La liste des nouveautés reste consultable
          ci-dessus.
        </p>
      )}
    </section>
  );
}
