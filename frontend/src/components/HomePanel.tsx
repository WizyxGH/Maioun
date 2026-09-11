/**
 * Accueil : un point de situation, pas une liste de plus.
 *
 * L'accueil était la liste des annonces — la même que l'onglet Recherche, au
 * filtre près. Ouvrir l'application posait donc une question à laquelle on
 * venait rarement répondre d'emblée (« que contient tout le stock ? ») plutôt
 * que celle qu'on se pose vraiment : QU'EST-CE QUI A BOUGÉ, ET QU'AI-JE À
 * FAIRE ?
 *
 * D'où trois étages, dans cet ordre :
 *
 *   1. ce qui est arrivé depuis la dernière visite — c'est périssable ;
 *   2. ce qui attend une action de votre part — un logement se prend en
 *      appelant, pas en consultant ;
 *   3. de quoi repartir : la recherche en cours et les recherches gardées.
 *
 * Chaque chiffre est cliquable et mène à ce qu'il compte. Un nombre sur lequel
 * on ne peut pas agir n'est qu'une décoration.
 */

import type { ListingView, SourceStateView } from '../types.js';
import { NICE_RENT_REFERENCE, RENT_REFERENCE_SOURCE, RENT_REFERENCE_YEAR } from '@maioun/shared';
import type { SavedSearch } from '../saved-searches.js';
import { describeSearch } from '../saved-searches.js';
import { formatAge, formatArea, formatCity, formatPrice, formatSourceName } from '../format.js';
import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { ItemButton, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { cn } from '@/lib/utils.js';
import { ArrowRight, Bell, Bookmark, Heart, PhoneCall, Search, TriangleAlert } from './icons.js';

/** Au-delà, une annonce n'est plus une nouveauté. */
const FRESH_HOURS = 48;

/** Priorité à partir de laquelle l'annonce mérite un appel aujourd'hui. */
const HOT_PRIORITY = 85;

interface HomePanelProps {
  readonly listings: readonly ListingView[];
  readonly sources: readonly SourceStateView[];
  readonly savedSearches: readonly SavedSearch[];
  readonly nowMs: number;
  /** Instant de la visite précédente : ce qui a été signalé après est nouveau. */
  readonly seenAtMs: number;
  readonly profileComplete: boolean;
  readonly onOpenListing: (id: string) => void;
  readonly onOpenSearch: () => void;
  readonly onOpenFavorites: () => void;
  readonly onOpenAlerts: () => void;
  readonly onOpenSavedSearches: () => void;
  readonly onOpenProfile: () => void;
  readonly onApplySearch: (search: SavedSearch) => void;
}

/** Un chiffre et ce qu'il compte, cliquable. */
function StatTile({
  label,
  value,
  Icon,
  onClick,
  accent = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly Icon: typeof Heart;
  readonly onClick: () => void;
  readonly accent?: boolean;
}): React.JSX.Element {
  return (
    <ItemButton
      onClick={onClick}
      className={cn('flex-col items-start gap-0.5', accent && 'border-hot')}
    >
      <Icon
        aria-hidden="true"
        className={`size-4 ${accent ? 'text-hot' : 'text-muted-foreground'}`}
      />
      <span className="text-xl leading-tight font-bold">{value}</span>
      <span className="text-muted-foreground text-[0.8rem] leading-tight">{label}</span>
    </ItemButton>
  );
}

/** Une ligne d'annonce compacte : de quoi la reconnaître, et rien de plus. */
function MiniRow({
  listing,
  onOpen,
}: {
  readonly listing: ListingView;
  readonly onOpen: (id: string) => void;
}): React.JSX.Element {
  const sources = [...new Set(listing.occurrences.map((occurrence) => occurrence.sourceId))];
  const photo = listing.imageUrls.find((url) => url.startsWith('https://'));
  return (
    <ItemButton size="sm" onClick={() => onOpen(listing.id)}>
      {photo === undefined ? (
        <span aria-hidden="true" className="bg-muted size-12 shrink-0 rounded-lg" />
      ) : (
        <img
          src={photo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="bg-muted size-12 shrink-0 rounded-lg object-cover"
        />
      )}
      <ItemContent>
        <span className="flex items-baseline gap-2">
          <strong>{formatPrice(listing.price.value)}</strong>
          <span className="text-muted-foreground text-sm">{formatArea(listing.area.value)}</span>
        </span>
        <ItemDescription className="truncate">
          {formatCity(listing.city.value)} · {sources.map(formatSourceName).join(', ')}
        </ItemDescription>
      </ItemContent>
      <ArrowRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
    </ItemButton>
  );
}

/** Une tâche en attente : ce qu'elle compte, ce qu'elle veut dire, où elle mène. */
function ChoreRow({
  Icon,
  iconClassName = 'text-muted-foreground',
  title,
  description,
  onClick,
  className,
  truncate = false,
}: {
  readonly Icon: typeof Heart;
  readonly iconClassName?: string;
  readonly title: React.ReactNode;
  readonly description: React.ReactNode;
  readonly onClick: () => void;
  readonly className?: string;
  /** Texte libre (le nom d'une recherche) : une ligne, coupée. */
  readonly truncate?: boolean;
}): React.JSX.Element {
  return (
    <ItemButton onClick={onClick} className={className}>
      <Icon aria-hidden="true" className={cn('size-5 shrink-0', iconClassName)} />
      <ItemContent>
        <ItemTitle className={cn(truncate && 'truncate')}>{title}</ItemTitle>
        <ItemDescription className={cn(truncate && 'truncate')}>{description}</ItemDescription>
      </ItemContent>
      <ArrowRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
    </ItemButton>
  );
}

export function HomePanel({
  listings,
  sources,
  savedSearches,
  nowMs,
  seenAtMs,
  profileComplete,
  onOpenListing,
  onOpenSearch,
  onOpenFavorites,
  onOpenAlerts,
  onOpenSavedSearches,
  onOpenProfile,
  onApplySearch,
}: HomePanelProps): React.JSX.Element {
  const active = listings.filter((listing) => listing.lifecycle === 'active');

  /**
   * Nouveautés : signalées depuis la dernière visite, ou apparues dans les
   * deux derniers jours si l'on n'avait encore jamais ouvert la page.
   *
   * CE N'EST PAS LE MÊME ENSEMBLE QUE L'HISTORIQUE, et le lien ne doit donc
   * pas le laisser croire. Ici on retombe sur la date de DÉCOUVERTE quand
   * l'annonce n'a jamais été signalée — sans quoi la section serait vide pour
   * qui n'a pas activé les notifications. L'historique, lui, ne liste que de
   * vraies alertes envoyées. Une annonce peut donc paraître ici sans s'y
   * trouver.
   */
  const freshFrom = Math.max(seenAtMs, nowMs - FRESH_HOURS * 60 * 60 * 1000);
  const fresh = active
    .filter((listing) => Date.parse(listing.notifiedAt ?? listing.firstSeenAt) >= freshFrom)
    .sort(
      (a, b) =>
        Date.parse(b.notifiedAt ?? b.firstSeenAt) - Date.parse(a.notifiedAt ?? a.firstSeenAt),
    );

  // À FAIRE : ce qui attend un geste. Une annonce « à contacter » n'a pas
  // encore été appelée ; un favori laissé en « nouvelle » non plus.
  const toCall = active.filter(
    (listing) =>
      listing.actionPriority >= HOT_PRIORITY &&
      listing.tracking === 'new' &&
      listing.archived !== true,
  );
  const favorites = active.filter((listing) => listing.favorite === true);
  const favoritesUntouched = favorites.filter((listing) => listing.tracking === 'new');
  const ailing = sources.filter((source) => source.health !== 'healthy');

  const hasChores = toCall.length > 0 || favoritesUntouched.length > 0 || !profileComplete;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. CE QUI A BOUGÉ. En tête parce que c'est périssable : une annonce
        de deux jours est souvent déjà louée. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Nouveautés</h2>
          {fresh.length > 0 && (
            <Button variant="link" size="inline" onClick={onOpenAlerts} className="text-sm">
              Historique des alertes
            </Button>
          )}
        </div>
        {fresh.length === 0 ? (
          <Card className="text-muted-foreground text-[0.92rem]">
            Rien de neuf depuis votre dernier passage. Les annonces signalées s’affichent ici, et
            l’historique complet est dans les notifications.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {fresh.slice(0, 4).map((listing, rank) => (
              <li
                key={listing.id}
                className="rf-rise"
                style={{ '--rf-delay': `${rank * 30}ms` } as React.CSSProperties}
              >
                <MiniRow listing={listing} onOpen={onOpenListing} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. CE QUI ATTEND UN GESTE. Un logement se prend en appelant. */}
      {hasChores && (
        <section>
          <h2 className="mb-2 text-lg font-bold">À faire</h2>
          <ul className="flex flex-col gap-2">
            {toCall.length > 0 && (
              <li>
                <ChoreRow
                  Icon={PhoneCall}
                  iconClassName="text-hot"
                  className="border-hot"
                  title={`${toCall.length} annonce${toCall.length > 1 ? 's' : ''} à contacter`}
                  description="Priorité haute, jamais appelées."
                  onClick={onOpenSearch}
                />
              </li>
            )}
            {favoritesUntouched.length > 0 && (
              <li>
                <ChoreRow
                  Icon={Heart}
                  title={`${favoritesUntouched.length} favori${favoritesUntouched.length > 1 ? 's' : ''} sans suite`}
                  description="Retenus, mais pas encore contactés."
                  onClick={onOpenFavorites}
                />
              </li>
            )}
            {!profileComplete && (
              <li>
                <ChoreRow
                  Icon={TriangleAlert}
                  iconClassName="text-medium"
                  title="Compléter le profil locataire"
                  description="Sans lui, aucun message de contact ne peut être préparé."
                  onClick={onOpenProfile}
                />
              </li>
            )}
          </ul>
        </section>
      )}

      {/* 3. DE QUOI REPARTIR. */}
      <section>
        <h2 className="mb-2 text-lg font-bold">Votre recherche</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="dans vos critères"
            value={active.length}
            Icon={Search}
            onClick={onOpenSearch}
          />
          <StatTile
            label="à contacter"
            value={toCall.length}
            Icon={PhoneCall}
            onClick={onOpenSearch}
            accent={toCall.length > 0}
          />
          <StatTile
            label="favoris"
            value={favorites.length}
            Icon={Heart}
            onClick={onOpenFavorites}
          />
          <StatTile
            label="signalées récemment"
            value={fresh.length}
            Icon={Bell}
            onClick={onOpenAlerts}
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Recherches enregistrées</h2>
          <Button variant="link" size="inline" onClick={onOpenSavedSearches} className="text-sm">
            {savedSearches.length > 0 ? 'Toutes' : 'En enregistrer une'}
          </Button>
        </div>
        {savedSearches.length === 0 ? (
          <Card className="text-muted-foreground text-[0.92rem]">
            Aucune pour l’instant. Réglez vos critères dans la recherche, puis «&nbsp;Enregistrer
            cette recherche&nbsp;» — vous la rappellerez d’un geste.
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {savedSearches.slice(0, 3).map((search) => (
              <li key={search.id}>
                <ChoreRow
                  Icon={Bookmark}
                  title={search.name}
                  description={describeSearch(search)}
                  onClick={() => onApplySearch(search)}
                  truncate
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* LE REPÈRE DU MARCHÉ, ET D'OÙ IL VIENT. Sans lui, « 700 € pour 25 m² »
        ne se juge que par comparaison avec les autres annonces du site — donc
        avec un marché qu'on observe déjà à travers un filtre. Ce chiffre-là est
        indépendant : l'État le publie chaque année à partir de toutes les
        annonces déposées en France, et nous ne faisons que le citer.

        La fourchette compte autant que la valeur : un loyer au m² qui varie
        du simple au double sur une même commune dit qu'un chiffre unique ne
        décide de rien à lui seul. */}
      <section>
        <h2 className="mb-2 text-lg font-bold">Repère de loyer</h2>
        <Card className="text-[0.92rem]">
          <p>
            À Nice, un studio ou deux-pièces se loue autour de{' '}
            <strong>{NICE_RENT_REFERENCE.small.perSqm.toFixed(1).replace('.', ',')} €/m²</strong>{' '}
            charges comprises, un trois-pièces ou plus{' '}
            {NICE_RENT_REFERENCE.large.perSqm.toFixed(1).replace('.', ',')} €/m².
          </p>
          <p className="text-muted-foreground mt-1 text-[0.82rem]">
            Fourchette pour les petites surfaces :{' '}
            {NICE_RENT_REFERENCE.small.low.toFixed(1).replace('.', ',')} à{' '}
            {NICE_RENT_REFERENCE.small.high.toFixed(1).replace('.', ',')} €/m². Loyers d’annonce
            observés,{' '}
            <a
              href={RENT_REFERENCE_SOURCE}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline"
            >
              Carte des loyers {RENT_REFERENCE_YEAR}
            </a>{' '}
            — {NICE_RENT_REFERENCE.all.observations.toLocaleString('fr-FR')} annonces.
          </p>
        </Card>
      </section>

      {/* La santé des sources ne s'affiche QUE si elle cloche : « tout va
        bien » n'apprend rien, et occuperait la place d'une annonce. */}
      {ailing.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Collecte</h2>
          <Card className="flex items-center gap-3">
            <TriangleAlert aria-hidden="true" className="text-medium size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-[0.92rem]">
              {ailing.length} source{ailing.length > 1 ? 's' : ''} ne répond
              {ailing.length > 1 ? 'ent' : ''} plus normalement — moins d’annonces arrivent.
            </span>
            <Badge variant="warning">{formatAge(ailing[0]?.lastRunAt ?? null, nowMs)}</Badge>
          </Card>
        </section>
      )}
    </div>
  );
}
