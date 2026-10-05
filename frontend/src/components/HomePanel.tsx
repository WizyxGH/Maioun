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
import {
  awaitsContact,
  NICE_RENT_REFERENCE,
  PRIORITY_HOT,
  RENT_REFERENCE_SOURCE,
  RENT_REFERENCE_YEAR,
} from '@maioun/shared';
import { archiveReasonOf } from '../availability.js';
import type { SavedSearch } from '../saved-searches.js';
import { SearchSummary } from './SearchSummary.js';
import { ListingCard } from './ListingCard.js';
import { formatAge } from '../format.js';
import { Badge } from '@/components/ui/badge.js';
import { Card } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { ItemButton, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item.js';
import { cn } from '@/lib/utils.js';
import { useCountUp } from '../use-count-up.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { ArrowRight, Bell, Bookmark, Heart, PhoneCall, Search, TriangleAlert } from './icons.js';

/** Au-delà, une annonce n'est plus une nouveauté. */
const FRESH_HOURS = 48;

interface HomePanelProps {
  readonly listings: readonly ListingView[];
  /**
   * Nombre d'annonces DANS LES CRITÈRES DU COMPTE.
   *
   * Ni les filtres d'affichage ni la pagination ne doivent y entrer : la tuile
   * annonce ce que le compte a trouvé, pas ce que ce navigateur achargé. C'est
   * ce qui la faisait diverger d'un appareil à l'autre — 98 sur un téléphone,
   * 115 sur un ordinateur, pour le même compte.
   */
  readonly criteriaCount: number;
  /**
   * `true` quand le compte affiché est en dessous de la vérité : une recherche
   * dépasse le plafond du serveur, ou l'une d'elles n'a pas répondu.
   *
   * ON LE DIT PLUTÔT QUE DE LAISSER CROIRE. Un compteur faux en bas ne se voit
   * pas — il fait simplement décider qu'il n'y a rien à voir, et c'est
   * précisément la faute qu'un compteur doit éviter.
   */
  readonly criteriaCountApproximatif?: boolean;
  /** `true` tant que la première liste n'est pas arrivée : on ne montre pas de zéros. */
  readonly loading?: boolean;
  readonly sources: readonly SourceStateView[];
  readonly savedSearches: readonly SavedSearch[];
  readonly nowMs: number;
  /** Instant de la visite précédente : ce qui a été signalé après est nouveau. */
  readonly seenAtMs: number;
  readonly profileComplete: boolean;
  readonly onOpenListing: (id: string) => void;
  readonly onOpenSearch: () => void;
  /** Le registre des démarches : ce qui est parti, et depuis quand. */
  readonly onOpenExchanges: () => void;
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
  suffixe,
}: {
  readonly label: string;
  readonly value: number;
  readonly Icon: typeof Heart;
  readonly onClick: () => void;
  readonly accent?: boolean;
  /**
   * `+` : le chiffre est un PLANCHER, pas une mesure.
   *
   * Une recherche enregistrée qui dépasse le plafond du serveur est tronquée :
   * le compte s'arrête là où nos identifiants s'arrêtent. Écrire « 180+ » le
   * dit sans parler de plafond — un mot que personne ne voudrait lire sur une
   * tuile, et qui n'explique rien de ce qui se passe.
   *
   * LE SIGNE VA DANS LE NOM ACCESSIBLE. « 180+ dans vos critères » se lit, et se
   * fait entendre ; « 180 dans vos critères » serait faux sans que rien ne le
   * dise.
   */
  readonly suffixe?: string;
}): React.JSX.Element {
  // Nommé : l'aller-retour vers la liste ne redéroule pas les mêmes chiffres.
  const affiche = useCountUp(value, `accueil:${label}`);
  return (
    <ItemButton
      onClick={onClick}
      aria-label={`${value}${suffixe ?? ''} ${label}`}
      className={cn('flex-col items-start gap-0.5', accent && 'border-hot')}
    >
      <Icon
        aria-hidden="true"
        className={`size-4 ${accent ? 'text-hot' : 'text-muted-foreground'}`}
      />
      {/* Le chiffre monte jusqu'à sa valeur ; le bouton, lui, porte la valeur
        FINALE en nom accessible — sinon un lecteur d'écran annoncerait chaque
        image de l'animation. */}
      <span aria-hidden="true" className="text-xl leading-tight font-bold tabular-nums">
        {affiche}
        {suffixe}
      </span>
      <span aria-hidden="true" className="text-muted-foreground text-[0.8rem] leading-tight">
        {label}
      </span>
    </ItemButton>
  );
}

/** Une ligne d'annonce compacte : de quoi la reconnaître, et rien de plus. */
/**
 * LES ANNONCES EN CARTES, QU'ON FAIT DÉFILER DU POUCE.
 *
 * L'accueil n'offrait que des lignes compactes : le loyer, la surface, une
 * vignette grosse comme un timbre. On ne décidait rien avec ça, on ouvrait la
 * liste. La carte, elle, porte la photo, les scores et le geste — autant la
 * mettre là où l'on regarde en premier.
 *
 * EN CSS, SANS LIBRAIRIE : `scroll-snap` suffit, et rend au clavier, à la
 * molette et au doigt ce qu'un carrousel maison rend mal. Pas de flèches non
 * plus : elles ne servent qu'à la souris, et le débordement se voit puisque la
 * carte suivante dépasse volontairement du bord.
 *
 * SANS MARGE NÉGATIVE, malgré l'envie de coller au bord de l'écran : elle
 * élargirait le conteneur au-delà de la page, et c'est exactement le
 * débordement horizontal que les scénarios interdisent.
 */
function Carrousel({
  listings,
  nowMs,
  onOpen,
  etiquette,
}: {
  readonly listings: readonly ListingView[];
  readonly nowMs: number;
  readonly onOpen: (id: string) => void;
  readonly etiquette: string;
}): React.JSX.Element {
  return (
    <ul
      aria-label={etiquette}
      className="rf-rail flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
    >
      {listings.map((listing, rank) => (
        <li
          key={listing.id}
          // La carte ne rétrécit pas : elle garde sa largeur et l'on défile.
          // 86 % sur téléphone pour que la suivante DÉPASSE du bord — c'est ce
          // qui dit qu'il y en a d'autres, sans avoir à l'écrire.
          className="w-[86%] max-w-[330px] shrink-0 snap-start sm:w-[330px]"
        >
          <ListingCard listing={listing} nowMs={nowMs} rank={rank} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

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

/**
 * Le message d'absence de nouveauté.
 *
 * « Aucune nouveauté depuis votre dernière visite (il y a 6 h) » se lisait
 * comme une promesse — il n'y en a pas eu depuis 6 h — alors que la section
 * vide signifie seulement : rien n'est arrivé APRÈS la dernière visite. Les
 * annonces des deux derniers jours y sont déjà : le texte mentait donc dès
 * qu'une annonce était arrivée avant la visite et après la fenêtre.
 *
 * On dit ce qui est vrai, et on propose la seule chose utile quand il reste des
 * annonces fraîches mais déjà vues.
 */
function noFreshMessage(nowMs: number, seenAtMs: number, recentCount: number): string {
  const depuis = Math.max(0, Math.round((nowMs - seenAtMs) / 60000));
  const ilYA =
    depuis >= 120
      ? `il y a ${Math.round(depuis / 60)} h`
      : depuis >= 2
        ? `il y a ${depuis} min`
        : 'à l’instant';
  if (recentCount > 0) {
    return `Rien de nouveau depuis votre dernière visite (${ilYA}), mais ${recentCount} annonce${recentCount > 1 ? 's' : ''} ${recentCount > 1 ? 'sont' : 'est'} arrivée${recentCount > 1 ? 's' : ''} depuis.`;
  }
  return `Aucune nouveauté depuis votre dernière visite (${ilYA}).`;
}

export function HomePanel({
  listings,
  criteriaCount,
  criteriaCountApproximatif = false,
  loading = false,
  sources,
  savedSearches,
  nowMs,
  seenAtMs,
  profileComplete,
  onOpenListing,
  onOpenSearch,
  onOpenExchanges,
  onOpenFavorites,
  onOpenAlerts,
  onOpenSavedSearches,
  onOpenProfile,
  onApplySearch,
}: HomePanelProps): React.JSX.Element {
  /**
   * SANS LES ARCHIVÉES, quoi qu'affiche la liste. Les compteurs de cet écran
   * sont des choses À FAIRE : une annonce mise de côté — à la main, ou parce
   * qu'elle est louée, retirée ou fermée aux candidatures — n'en est pas une.
   * Ils suivaient la bascule « afficher les archivées », qui est un réglage
   * d'AFFICHAGE : l'activer gonflait le nombre d'annonces à contacter.
   */
  const active = listings.filter(
    (listing) => listing.lifecycle === 'active' && archiveReasonOf(listing) === null,
  );

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
  // Les annonces de la fenêtre de deux jours, vues ou non : c'est ce qui
  // permet au message de ne pas laisser croire que le gisement est vide.
  const recentSince = nowMs - FRESH_HOURS * 60 * 60 * 1000;
  const recentCount = active.filter(
    (listing) => Date.parse(listing.firstSeenAt) >= recentSince,
  ).length;

  // À FAIRE : ce qui attend un geste. Une annonce « à contacter » n'a pas
  // encore été appelée ; un favori laissé en « nouvelle » non plus.
  const toCall = active.filter(
    (listing) => listing.actionPriority >= PRIORITY_HOT && awaitsContact(listing.tracking),
  );
  const awaitingReply = active.filter((listing) => listing.tracking === 'contacted');
  const favorites = active.filter((listing) => listing.favorite === true);
  const favoritesUntouched = favorites.filter((listing) => listing.tracking === 'new');
  const ailing = sources.filter((source) => source.health !== 'healthy');

  const hasChores =
    toCall.length > 0 ||
    awaitingReply.length > 0 ||
    favoritesUntouched.length > 0 ||
    !profileComplete;

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
        {fresh.length > 0 ? (
          <Carrousel
            listings={fresh.slice(0, 8)}
            nowMs={nowMs}
            onOpen={onOpenListing}
            etiquette="Nouveautés depuis votre dernier passage"
          />
        ) : (
          <p className="text-muted-foreground text-[0.92rem]">
            {seenAtMs > 0
              ? noFreshMessage(nowMs, seenAtMs, recentCount)
              : 'Aucune nouveauté pour le moment.'}
          </p>
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
            {awaitingReply.length > 0 && (
              <li>
                <ChoreRow
                  Icon={Bell}
                  title={`${awaitingReply.length} réponse${awaitingReply.length > 1 ? 's' : ''} en attente`}
                  description="Contactées, sans réponse enregistrée."
                  // VERS LE REGISTRE, et non vers la recherche : la question
                  // qu'on se pose ici est « laquelle attend depuis le plus
                  // longtemps ? », et la liste des annonces n'y répond pas.
                  onClick={onOpenExchanges}
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
        {/* PAS DE ZÉROS EN ATTENDANT. Les tuiles affichaient « 0 dans vos
          critères » le temps que la liste arrive : un chiffre faux, présenté
          comme les vrais, puis un saut. La silhouette tient leur place. */}
        {loading && listings.length === 0 ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Chargement de vos compteurs"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[5.25rem] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {/* LE COMPTE DU COMPTE, PAS CELUI DE LA LISTE : la tuile annonce ce
            que la recherche TROUVE, pas ce que ce navigateur a en mémoire sous
            ses filtres d'affichage. */}
            <StatTile
              label="dans vos critères"
              value={criteriaCount}
              Icon={Search}
              onClick={onOpenSearch}
              {...(criteriaCountApproximatif ? { suffixe: '+' } : {})}
            />
            <StatTile
              label="à contacter"
              value={toCall.length}
              Icon={PhoneCall}
              onClick={onOpenSearch}
              accent={toCall.length > 0}
            />
            <StatTile
              label="réponses en attente"
              value={awaitingReply.length}
              Icon={Bell}
              onClick={onOpenSearch}
              accent={awaitingReply.length > 0}
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
        )}
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
                  description={<SearchSummary search={search} className="text-[0.82rem]" />}
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
