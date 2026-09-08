/**
 * Application (§36, §39).
 *
 * Pas de routeur, pas de gestionnaire d'état : trois vues et un `useState`
 * suffisent. §39 et §65 demandent explicitement de limiter les dépendances —
 * ajouter react-router ici coûterait 15 ko pour naviguer entre trois écrans.
 *
 * STRUCTURE UX : toutes les vues partagent la même coquille (`Shell`) — un
 * en-tête persistant avec la navigation par onglets — pour que l'utilisateur
 * sache toujours où il est et comment revenir. La liste met en avant les
 * annonces à contacter MAINTENANT (§36 : classement par action, pas par prix).
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { TenantProfile } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import type { ListingView, SortMode, SourceStateView, TrackingStatus } from './types.js';
import {
  ApiError,
  fetchAgencies,
  fetchAgency,
  fetchFilters,
  fetchListing,
  fetchListings,
  fetchCurrentUser,
  fetchChangelogSeen,
  fetchOnboardingDone,
  fetchSavedSearches,
  fetchAlerts,
  fetchSources,
  isDemoMode,
  isUnconfigured,
  requiresLogin,
  markViewed,
  setArchived,
  recordContact,
  saveFilters,
  markChangelogSeen,
  markOnboardingDone,
  saveSavedSearches,
  savedSearchesAvailable,
  setFavorite,
  updateTracking,
  fetchTenantProfile,
  saveTenantProfile,
  clearTenantProfile,
} from './api/client.js';
import { clearProfile, loadProfile, saveProfile } from './profile.js';
import { AFFINITY_BOOST, computeAffinity } from './affinity.js';
import { formatSourceName } from './format.js';
import { markAlertsSeen, readAlertsSeenAt, unreadAlertCount } from './notifications.js';
import { Button } from '@/components/ui/button.js';
import { Select } from '@/components/ui/select.js';
import { ListingCard } from './components/ListingCard.js';
import { ListingDetail } from './components/ListingDetail.js';
import { HomePanel } from './components/HomePanel.js';
import { LoginScreen } from './components/LoginScreen.js';
import { latestEntryId, unseenEntries, type ChangelogEntry } from './changelog.js';
import {
  newSearchId,
  suggestName,
  toQuickFilters,
  toSavedView,
  type SavedSearch,
} from './saved-searches.js';
import {
  ArrowLeft,
  Bell,
  Flame,
  List,
  Map,
  Search,
  SlidersHorizontal,
} from './components/icons.js';
import { SortFilterModal } from './components/SortFilterModal.js';
import { BottomNav, type BottomTab } from './components/BottomNav.js';
import {
  ListingDetailSkeleton,
  ListingListSkeleton,
  MapSkeleton,
  RowsSkeleton,
} from './components/Skeletons.js';
import type { AgencySummary } from './api/client.js';
import { SettingsLinks } from './components/SettingsLinks.js';
import { ProfileSummary } from './components/ProfileSummary.js';
import {
  QuickFilters,
  DEFAULT_QUICK_FILTERS,
  hasActiveQuickFilters,
  matchesQuickFilters,
  type QuickFilterValues,
} from './components/QuickFilters.js';
import { matchesSearch } from './search.js';
import { useNewListingAlerts } from './use-new-listing-alerts.js';
import { readViewState, writeViewState } from './view-state.js';
import type { View } from './router.js';
import { useRoute } from './use-route.js';
import { useWideScreen } from './use-wide-screen.js';
import { mergeToasts, ToastStack, type Toast } from './components/ToastStack.js';
import { Input } from '@/components/ui/input.js';

/**
 * LES ÉCRANS SECONDAIRES NE PARTENT PLUS AVEC LA PREMIÈRE PAGE. Ils étaient
 * tous importés d'emblée : ouvrir la liste téléchargeait aussi les
 * statistiques, le dossier, les sources, la création de compte — vingt écrans
 * qu'on ne visite pas, sur un téléphone en 4G.
 *
 * `Shell` porte la frontière de chargement, une seule fois pour tous : chaque
 * écran arrive à son ouverture, derrière le squelette habituel.
 */
const DocumentsSection = lazy(() =>
  import('./components/DocumentsSection.js').then((m) => ({ default: m.DocumentsSection })),
);
const AccessPanel = lazy(() =>
  import('./components/AccessPanel.js').then((m) => ({ default: m.AccessPanel })),
);
const ReferencePointsSection = lazy(() =>
  import('./components/ReferencePointsSection.js').then((m) => ({
    default: m.ReferencePointsSection,
  })),
);
const NotificationSettingsPanel = lazy(() =>
  import('./components/NotificationSettingsPanel.js').then((m) => ({
    default: m.NotificationSettingsPanel,
  })),
);
const ThemePanel = lazy(() =>
  import('./components/ThemePanel.js').then((m) => ({ default: m.ThemePanel })),
);
const ProfileForm = lazy(() =>
  import('./components/ProfileForm.js').then((m) => ({ default: m.ProfileForm })),
);
const SourcesPanel = lazy(() =>
  import('./components/SourcesPanel.js').then((m) => ({ default: m.SourcesPanel })),
);
const SavedSearchesPanel = lazy(() =>
  import('./components/SavedSearchesPanel.js').then((m) => ({ default: m.SavedSearchesPanel })),
);
const ForgotPassword = lazy(() =>
  import('./components/ForgotPassword.js').then((m) => ({ default: m.ForgotPassword })),
);
const ResetPassword = lazy(() =>
  import('./components/ResetPassword.js').then((m) => ({ default: m.ResetPassword })),
);
const SignupScreen = lazy(() =>
  import('./components/SignupScreen.js').then((m) => ({ default: m.SignupScreen })),
);
const ConfirmEmail = lazy(() =>
  import('./components/ConfirmEmail.js').then((m) => ({ default: m.ConfirmEmail })),
);
const SharedSearch = lazy(() =>
  import('./components/SharedSearch.js').then((m) => ({ default: m.SharedSearch })),
);
const UnconfiguredScreen = lazy(() =>
  import('./components/UnconfiguredScreen.js').then((m) => ({ default: m.UnconfiguredScreen })),
);
const ChangelogModal = lazy(() =>
  import('./components/ChangelogModal.js').then((m) => ({ default: m.ChangelogModal })),
);
const OnboardingPanel = lazy(() =>
  import('./components/OnboardingPanel.js').then((m) => ({ default: m.OnboardingPanel })),
);
const SourcePanel = lazy(() =>
  import('./components/SourcePanel.js').then((m) => ({ default: m.SourcePanel })),
);
const StatsPanel = lazy(() =>
  import('./components/StatsPanel.js').then((m) => ({ default: m.StatsPanel })),
);
const NotificationsPanel = lazy(() =>
  import('./components/NotificationsPanel.js').then((m) => ({ default: m.NotificationsPanel })),
);
const AgenciesPanel = lazy(() =>
  import('./components/AgenciesPanel.js').then((m) => ({ default: m.AgenciesPanel })),
);
const AgencyPanel = lazy(() =>
  import('./components/AgenciesPanel.js').then((m) => ({ default: m.AgencyPanel })),
);

// Leaflet n'entre dans le bundle que si la vue carte est ouverte (§65).
const MapView = lazy(() => import('./components/MapView.js'));

/**
 * Ce qu'un onglet peut viser. « favoris » n'est PAS une vue : c'est la liste
 * assortie d'un filtre. Lui donner une vue à part aurait créé une seconde
 * source de vérité à côté de `favoritesOnly`, que la modale règle aussi.
 */
type NavTarget = View | 'favorites';

/** Seuil de mise en avant : au-delà, l'annonce mérite un contact immédiat. */
const HOT_PRIORITY = 85;

/**
 * Options de tri de la liste (§36). L'ordre définit celui du menu.
 *
 * « LE PLUS PROCHE » CLASSE PAR DURÉE DE TRAJET vers vos adresses de référence,
 * et non par kilomètres : la distance n'est délibérément pas publiée (§26 —
 * couplée aux coordonnées d'une annonce, elle permettrait de retrouver votre
 * domicile). C'est de toute façon la durée qui décide, pas les kilomètres.
 */
const SORT_OPTIONS: readonly { value: SortMode; label: string }[] = [
  { value: 'priority', label: 'Priorité d’action' },
  { value: 'recent', label: 'Plus récentes' },
  { value: 'price', label: 'Loyer croissant' },
  { value: 'closest', label: 'Le plus proche' },
  { value: 'area', label: 'Surface décroissante' },
];

/**
 * Coquille commune : en-tête persistant + navigation par onglets.
 * L'onglet actif est souligné — l'utilisateur sait toujours où il est.
 */
function Shell({
  view,
  favoritesOnly,
  onNavigate,
  unreadAlerts = 0,
  bottomTab,
  onBottomSelect,
  children,
}: {
  readonly view: View;
  readonly favoritesOnly: boolean;
  readonly onNavigate: (target: NavTarget) => void;
  /** Alertes reçues depuis la dernière visite de la page Notifications. */
  readonly unreadAlerts?: number;
  /** Onglet bas actif, ou `null` hors des quatre destinations. */
  readonly bottomTab?: BottomTab | null;
  readonly onBottomSelect?: (tab: BottomTab) => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  // LES MÊMES QUATRE DESTINATIONS QUE LA BARRE BASSE, dans le même ordre.
  // Le haut d'écran en portait cinq et la barre basse quatre, avec des noms
  // différents pour la même page : passer du téléphone à l'ordinateur
  // demandait de réapprendre la navigation. « Stats » a rejoint les
  // Paramètres, où vivent déjà les écrans qu'on consulte une fois par mois.
  const tabs: readonly { key: NavTarget; label: string }[] = [
    { key: 'home', label: 'Accueil' },
    { key: 'list', label: 'Recherche' },
    { key: 'favorites', label: 'Favoris' },
    // « Paramètres » et non « Profil » : cet écran ne porte plus le formulaire
    // mais les chemins vers lui, le dossier, les alertes et les sources.
    { key: 'profile', label: 'Paramètres' },
  ];
  // La fiche appartient à l'univers « Recherche » ; le filtre favoris prime.
  const active: NavTarget =
    view === 'list' || view === 'detail' ? (favoritesOnly ? 'favorites' : 'list') : view;

  // La liste s'élargit sur grand écran pour afficher les cartes en grille ; les
  // autres vues (fiche, profil, stats) restent en colonne étroite, plus lisible.
  const wide = view === 'list';
  return (
    <main
      className={`mx-auto px-3 py-4 pb-12 sm:px-4 sm:py-6 sm:pb-16 ${
        wide ? 'max-w-[720px] lg:max-w-[1120px]' : 'max-w-[720px]'
      }`}
    >
      <header className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Maïoun</h1>
          <div className="flex items-center gap-2">
            {/* Seule entrée vers les notifications : ce n'est pas un onglet.
              Régler ses alertes n'est pas un endroit où l'on navigue, c'est un
              aparté dont on revient — la page s'ouvre donc par-dessus, sans la
              barre d'onglets, et se referme par « Retour ». */}
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              aria-label={
                unreadAlerts > 0
                  ? `Notifications, ${unreadAlerts} non lue${unreadAlerts > 1 ? 's' : ''}`
                  : 'Notifications'
              }
              className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell aria-hidden="true" className="size-4" />
              {/* Pastille des alertes non lues : sans elle, rien ne distinguait
                une cloche qui a quelque chose à dire d'une cloche muette — il
                fallait ouvrir la page pour le savoir. */}
              {unreadAlerts > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-1.5 flex min-w-4.5 items-center justify-center rounded-full bg-hot px-1 text-[0.65rem] leading-4.5 font-bold text-white"
                >
                  {unreadAlerts > 9 ? '9+' : unreadAlerts}
                </span>
              )}
            </button>
          </div>
        </div>
        <nav
          // La barre ne défile qu'en HORIZONTAL :
          //  - `touch-pan-x` cantonne le geste tactile à cet axe, sinon un
          //    glissement vertical y est capté et fait rebondir la barre ;
          //  - `overscroll-contain` empêche ce rebond de se propager à la page ;
          //  - `select-none` évite de sélectionner le libellé en glissant.
          // Masqués sur MOBILE : la barre basse les remplace, et une rangée
          // coulissante dont la moitié vit hors de l'écran ne se découvre pas.
          className="mt-3 hidden touch-pan-x gap-1 overflow-x-auto overscroll-contain border-b border-border select-none sm:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Navigation principale"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onNavigate(tab.key)}
              aria-current={active === tab.key ? 'page' : undefined}
              className={`-mb-px min-h-11 shrink-0 cursor-pointer border-b-2 px-3 text-[0.95rem] whitespace-nowrap transition-colors ${
                active === tab.key
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      {/* Fondue au changement de vue, relancée par la `key` : sans elle, passer
        de la liste à une fiche remplaçait l'écran d'un coup, sans qu'on sache
        si c'était la même page qui avait changé ou une autre qui s'était
        ouverte. Un glissement latéral, lui, aurait suggéré une direction que
        la navigation n'a pas. */}
      {/* La frontière de chargement des écrans différés, posée UNE FOIS pour
        tous : chacun traverse ce `Shell`. Le squelette est celui des listes,
        déjà employé pendant que les annonces arrivent. */}
      <div key={view} className="rf-fade">
        <Suspense fallback={<RowsSkeleton rows={4} />}>{children}</Suspense>
      </div>
      {/* `pb-20` sur mobile : sans cela, la barre fixe recouvre la fin de la
        liste et le dernier élément reste inatteignable. */}
      {onBottomSelect !== undefined && (
        <>
          <div aria-hidden="true" className="h-20 sm:hidden" />
          <BottomNav active={bottomTab ?? null} onSelect={onBottomSelect} />
        </>
      )}
    </main>
  );
}

/**
 * `true` si l'affichage S'ÉCARTE de son état d'ouverture — ce qui rend le
 * bouton « Réinitialiser » utile. Hors du composant : ce n'est qu'un calcul,
 * et l'y laisser alourdissait `App` au-delà de la complexité tolérée.
 */
function isDefaultView(view: {
  readonly sort: SortMode;
  readonly quickFilters: QuickFilterValues;
  readonly sourceCount: number;
  readonly search: string;
  readonly toggles: readonly boolean[];
}): boolean {
  return (
    view.sort !== 'priority' ||
    hasActiveQuickFilters(view.quickFilters) ||
    view.sourceCount > 0 ||
    view.search !== '' ||
    view.toggles.some(Boolean)
  );
}

/**
 * Nombre de réglages qui écartent l'affichage de son état d'ouverture — c'est
 * la pastille du bouton « Filtres ». Hors du composant : ce n'est
 * qu'un décompte, et l'y laisser alourdissait `App` sans rien apprendre.
 */
/**
 * `true` si un réglage DU NAVIGATEUR restreint la liste.
 *
 * IL EN MANQUAIT LA MOITIÉ. On ne regardait que les pilules et les sources ; la
 * recherche et « masquer les annonces à vérifier » vident pourtant la liste
 * tout autant. L'écran disait alors « aucune annonce ne correspond à vos
 * critères » — donc accusait la collecte — pour un mot resté dans la barre de
 * recherche. Et ce mot SURVIT au rechargement : rouvrir le site n'y changeait
 * rien.
 *
 * Hors du composant, comme `countActiveSettings` : ce n'est qu'un calcul, et
 * l'y laisser poussait `App` au-delà de la complexité tolérée.
 */
export function anyClientFilter(view: {
  readonly quickFilters: QuickFilterValues;
  readonly selectedSources: ReadonlySet<string>;
  readonly search: string;
  readonly hideUncertain: boolean;
}): boolean {
  return (
    hasActiveQuickFilters(view.quickFilters) ||
    view.selectedSources.size > 0 ||
    view.search.trim() !== '' ||
    view.hideUncertain
  );
}

/**
 * Au-delà, on considère que la vérification de session n'aboutira pas.
 *
 * Dix secondes : bien plus qu'il n'en faut sur un réseau lent, bien moins que
 * la patience de quelqu'un devant une page blanche.
 */
const SESSION_TIMEOUT_MS = 10_000;

/**
 * L'attente de la vérification de session.
 *
 * RIEN PENDANT UNE SECONDE, puis un mot. Le cas courant se règle en deux
 * cents millisecondes : y afficher un indicateur le ferait clignoter à chaque
 * ouverture, ce qui est pire que le silence. Passé une seconde, le silence
 * devient une page blanche, et une page blanche ne dit pas si l'on attend, si
 * l'on est déconnecté, ou si tout est cassé.
 */
function SessionPending(): React.JSX.Element {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1000);
    return () => window.clearTimeout(timer);
  }, []);
  if (!slow) return <></>;
  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-4">
      <p className="text-muted-foreground text-center text-sm">Connexion en cours…</p>
    </main>
  );
}

function countActiveSettings(view: {
  readonly sort: SortMode;
  readonly sourceCount: number;
  readonly toggles: readonly boolean[];
}): number {
  return (
    view.toggles.filter(Boolean).length +
    (view.sort === 'priority' ? 0 : 1) +
    (view.sourceCount === 0 ? 0 : 1)
  );
}

/**
 * Onglet bas correspondant à la vue courante, ou `null` hors des quatre
 * destinations. Hors du composant : ce n'est qu'une correspondance, et l'y
 * laisser alourdissait `App` au-delà de la complexité tolérée.
 */
function bottomTabFor(
  view: View,
  favoritesOnly: boolean,
  sortFilterOpen: boolean,
): BottomTab | null {
  // La modale ouverte, c'est « Recherche » qui est actif : l'onglet doit
  // refléter ce que l'utilisateur regarde, modale comprise.
  if (sortFilterOpen) return 'search';
  if (view === 'home') return 'home';
  // La LISTE est la recherche, et non l'accueil : celui-ci est devenu un point
  // de situation. L'onglet doit dire où l'on est, pas où l'on était.
  if (view === 'list' || view === 'detail') return favoritesOnly ? 'favorites' : 'search';
  if (view === 'profile' || view === 'tenant' || view === 'documents' || view === 'saved') {
    return 'settings';
  }
  return null;
}

/**
 * Le retour vers les Paramètres, depuis un de leurs sous-écrans.
 *
 * Quatre copies mot pour mot. Aucune ne pouvait diverger sans qu'on s'en
 * aperçoive — mais la cinquième, oui.
 */
function BackToSettings({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  return (
    <Button variant="ghost" className="mb-2" onClick={onBack}>
      <ArrowLeft aria-hidden="true" className="size-4" /> Retour
    </Button>
  );
}

/**
 * Les RÉSULTATS d'une recherche : le chargement, le vide, et les deux mises
 * en page possibles.
 *
 * Extrait d'`App`, qui portait tout : la coquille, la navigation, une
 * douzaine d'écrans secondaires ET ce bloc-ci. Le fichier passait le seuil de
 * complexité toléré, et surtout on ne trouvait plus rien dedans.
 *
 * DEUX MISES EN PAGE, une seule décision : au-dessus de 1024 px, les annonces
 * et le plan tiennent côte à côte — c'est le parti d'Airbnb, et il vaut ici
 * pour la même raison : chercher un logement, c'est comparer un loyer À un
 * endroit. En dessous, la place manque et la bascule Liste/Carte reprend son
 * sens.
 */
function SearchResults({
  loading,
  filtered,
  ranked,
  hot,
  rest,
  split,
  favoritesOnly,
  emptyBecauseFiltered,
  onResetFilters,
  nowMs,
  affinity,
  onOpen,
  onFavorite,
}: {
  readonly loading: boolean;
  readonly filtered: readonly ListingView[];
  readonly ranked: readonly ListingView[];
  readonly hot: readonly ListingView[];
  readonly rest: readonly ListingView[];
  /** `true` = annonces et plan côte à côte ; `false` = la liste seule. */
  readonly split: boolean;
  readonly favoritesOnly: boolean;
  /** `true` si le vide vient d'un filtre, et non d'un inventaire vide. */
  readonly emptyBecauseFiltered: boolean;
  /** Remet tri, filtres, sources et recherche à zéro. */
  readonly onResetFilters?: () => void;
  readonly nowMs: number;
  readonly affinity: { active: boolean; scores: ReadonlyMap<string, number> };
  readonly onOpen: (id: string) => void;
  readonly onFavorite: (id: string, favorite: boolean) => void;
}): React.JSX.Element {
  return loading ? (
    <ListingListSkeleton />
  ) : filtered.length === 0 ? (
    <div className="py-8 text-center">
      <p className="text-muted-foreground">
        {favoritesOnly
          ? 'Aucun favori. Touchez le cœur d’une annonce pour la retrouver ici.'
          : emptyBecauseFiltered
            ? 'Aucune annonce ne correspond à ces filtres.'
            : 'Aucune annonce ne correspond à vos critères pour l’instant.'}
      </p>
      {/* UNE SORTIE, ET IL N'Y EN AVAIT AUCUNE. Un filtre qui vide la liste
        laissait devant une page vide sans rien à faire : le terme de recherche
        et la sélection de sources SURVIVENT au rechargement, si bien qu'une
        lettre tapée par erreur suffisait à condamner l'écran — rouvrir le site
        n'y changeait rien, et le message accusait les critères. */}
      {emptyBecauseFiltered && !favoritesOnly && onResetFilters !== undefined && (
        <Button variant="outline" className="mt-3" onClick={onResetFilters}>
          Réinitialiser les filtres
        </Button>
      )}
    </div>
  ) : split ? (
    <>
      {/* DEUX COLONNES SUR GRAND ÉCRAN, façon Airbnb : les cartes à
        gauche, la carte à droite. La bascule Liste/Carte échangeait
        l'une contre l'autre — on perdait les faits en regardant les
        positions, et les positions en lisant les faits, alors que
        l'écran a la place pour les deux. Sur téléphone il ne l'a pas :
        la carte y reste seule, et la bascule garde tout son sens.

        La carte COLLE au défilement (`sticky`) et la colonne de gauche
        défile sous elle : c'est ce qui fait tenir la comparaison —
        faire défiler cent annonces en gardant le plan sous les yeux. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-4">
        {/* `space-y-3` et NON `flex flex-col` : dans une colonne flex à
          hauteur bornée, les enfants se COMPRIMENT pour tenir, et les
          cartes se réduisaient à quelques pixels de haut. Un empilement
          ordinaire les laisse à leur taille et fait défiler le reste. */}
        <div className="hidden max-h-[calc(100vh-10rem)] space-y-3 overflow-y-auto pr-2 lg:block">
          {ranked.map((listing, rank) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              nowMs={nowMs}
              rank={rank}
              onOpen={onOpen}
              onFavorite={(favorite) => onFavorite(listing.id, favorite)}
              affinity={affinity.active ? affinity.scores.get(listing.id) : undefined}
            />
          ))}
        </div>
        <div className="lg:sticky lg:top-4">
          <Suspense fallback={<MapSkeleton />}>
            <MapView listings={ranked} onOpen={onOpen} />
          </Suspense>
        </div>
      </div>
    </>
  ) : (
    <>
      {hot.length > 0 && (
        <section aria-labelledby="hot-title" className="mb-6">
          <h2 id="hot-title" className="mb-2 flex items-center gap-1.5 text-lg font-bold">
            <Flame aria-hidden="true" className="size-4" /> À contacter maintenant
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {hot.map((listing, rank) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                nowMs={nowMs}
                rank={rank}
                onOpen={onOpen}
                onFavorite={(favorite) => onFavorite(listing.id, favorite)}
                affinity={affinity.active ? affinity.scores.get(listing.id) : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-title">
        {hot.length > 0 && (
          <h2 id="all-title" className="mb-2 text-lg font-bold text-muted-foreground">
            Toutes les annonces <span className="text-sm font-normal">({ranked.length})</span>
          </h2>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {rest.map((listing, rank) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              nowMs={nowMs}
              rank={rank}
              onOpen={onOpen}
              onFavorite={(favorite) => onFavorite(listing.id, favorite)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * Ce qui, dans une fiche affichée, vient de VOS gestes et non de la base.
 *
 * Quand on recharge une annonce depuis Turso pour en obtenir la description et
 * les scores détaillés, la réponse porte l'état tel qu'il était en base — pas
 * celui que l'écran vient d'appliquer de façon optimiste. Sans ce report, un
 * favori posé une seconde plus tôt se serait défait sous les yeux.
 */
function userState(listing: ListingView): Partial<ListingView> {
  return {
    favorite: listing.favorite,
    archived: listing.archived,
    tracking: listing.tracking,
    viewed: listing.viewed,
  };
}

/**
 * Le filet de chargement des écrans différés, posé AU-DESSUS de tout.
 *
 * Il ne suffit pas de l'avoir dans `Shell` : plusieurs écrans — connexion,
 * inscription, recherche partagée, installation non configurée — se rendent
 * hors de lui. Sans frontière au-dessus, React ne rend rien du tout pendant
 * leur chargement, et la page reste blanche.
 */
export function App(): React.JSX.Element {
  return (
    <Suspense fallback={<RowsSkeleton rows={4} />}>
      <AppView />
    </Suspense>
  );
}

function AppView(): React.JSX.Element {
  const [listings, setListings] = useState<readonly ListingView[]>([]);
  const [sources, setSources] = useState<readonly SourceStateView[]>([]);
  /**
   * L'ÉCRAN VIENT DE L'ADRESSE, et non d'un `useState`.
   *
   * C'est ce qui rend le bouton « Précédent » utilisable — il refermait le site
   * au lieu de refermer une fiche —, permet de coller le lien d'une annonce, et
   * fait qu'un rafraîchissement revient là où l'on était.
   */
  const { route, go, replace, back } = useRoute();
  const view = route.view;
  const [savedSearches, setSavedSearches] = useState<readonly SavedSearch[]>([]);
  // L'annuaire des agences et la fiche ouverte. Chargés à la demande : ils
  // demandent une agrégation en base que la liste ne transporte pas (§30).
  const [agencies, setAgencies] = useState<readonly AgencySummary[]>([]);
  const [agencyDetail, setAgencyDetail] = useState<{
    agency: AgencySummary;
    listings: readonly ListingView[];
  } | null>(null);
  // Qui est connecté. `undefined` = on ne sait pas encore : montrer l'écran de
  // connexion à ce moment-là le ferait clignoter chez quelqu'un qui a déjà une
  // session valide.
  const [currentUser, setCurrentUser] = useState<string | null | undefined>(
    requiresLogin() ? undefined : 'moi',
  );
  // Ce que l'écran courant regarde : l'adresse le porte, on n'en garde pas de
  // copie. Une seconde source de vérité se serait désynchronisée au premier
  // retour arrière.
  const selectedId = view === 'detail' ? (route.id ?? null) : null;
  const selectedSourceId = view === 'source' || view === 'agency' ? (route.id ?? null) : null;

  /**
   * Les écrans qui regardent quelque chose. `setView('detail')` doit alors
   * garder l'identifiant courant : sans cela, deux appels enchaînés — « ouvre
   * cette annonce », puis « va sur la fiche » — aboutiraient à une fiche vide.
   */
  const setView = (next: View): void =>
    go((current) =>
      next === 'detail' || next === 'source' || next === 'agency'
        ? { view: next, ...(current.id !== undefined ? { id: current.id } : {}) }
        : { view: next },
    );

  const setSelectedId = (id: string | null): void =>
    go(id === null ? { view: 'list', favoritesOnly } : { view: 'detail', id });

  const setSelectedSourceId = (id: string | null): void =>
    go(id === null ? { view: 'sources' } : { view: 'source', id });
  // Réglages d'AFFICHAGE restaurés depuis ce navigateur : ils ne survivaient
  // pas à un rafraîchissement, et il fallait les refaire plusieurs fois par
  // jour. Lus une seule fois, à l'initialisation des états.
  const [restored] = useState(readViewState);
  const [sort, setSort] = useState<SortMode>(restored.sort);
  const [sortFilterOpen, setSortFilterOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [search, setSearch] = useState(restored.search);
  const [hideUncertain, setHideUncertain] = useState(restored.hideUncertain);
  const [showArchived, setShowArchived] = useState(restored.showArchived);
  /**
   * L'ADRESSE FAIT FOI sur la liste : `/favoris` ouvre les favoris, `/recherche`
   * tout le reste. Ailleurs — dans les paramètres, sur une fiche — c'est le
   * dernier choix mémorisé qui reprend, faute d'adresse pour le dire.
   */
  const [favoritesOnly, setFavoritesOnly] = useState(
    route.view === 'list' ? route.favoritesOnly === true : restored.favoritesOnly,
  );
  // Filtre par source : ensemble vide = toutes les sources affichées. Une
  // annonce passe si l'une de ses occurrences vient d'une source sélectionnée.
  const [selectedSources, setSelectedSources] = useState<ReadonlySet<string>>(
    restored.selectedSources,
  );
  // Filtres rapides façon SeLoger (budget, surface, pièces, type) : affinent la
  // liste déjà chargée, sans toucher aux critères de collecte (§66).
  const [quickFilters, setQuickFilters] = useState<QuickFilterValues>(restored.quickFilters);
  // Liste ⇄ Carte : deux façons de parcourir les mêmes annonces (§36, §39).
  const [displayMode, setDisplayMode] = useState<'list' | 'map'>(restored.displayMode);
  // Au-dessus de 1024 px, annonces et plan tiennent ensemble : la vue
  // partagée s'impose, et la bascule n'a plus lieu d'être.
  const wideScreen = useWideScreen();
  const [profile, setProfile] = useState<TenantProfile | null>(() => loadProfile());

  /**
   * Enregistre le profil DES DEUX CÔTÉS : le navigateur pour l'afficher tout
   * de suite, le compte pour le retrouver ailleurs.
   *
   * IL NE VIVAIT QUE DANS LE NAVIGATEUR, et se perdait donc à chaque
   * changement d'appareil — ou au premier nettoyage. L'échec réseau n'est PAS
   * remonté : le profil est déjà écrit localement, il n'est pas perdu, et une
   * erreur rouge sur un formulaire qu'on vient de valider ferait croire le
   * contraire. La prochaine sauvegarde rattrapera.
   */
  const rememberProfile = (next: TenantProfile): void => {
    saveProfile(next);
    setProfile(next);
    void saveTenantProfile(next).catch(() => undefined);
  };

  const forgetProfile = (): void => {
    clearProfile();
    setProfile(null);
    void clearTenantProfile().catch(() => undefined);
  };
  const [onboardingDone, setOnboardingDone] = useState<boolean | undefined>(undefined);
  /** Nouveautés publiées depuis la dernière visite. Vide = rien à annoncer. */
  const [news, setNews] = useState<readonly ChangelogEntry[]>([]);
  /**
   * L'historique des alertes, chargé à part.
   *
   * Il se construisait à partir de la liste courante, qui écarte les annonces
   * hors critères : une détection qui s'améliore effaçait alors des alertes bel
   * et bien parties. Sur cent seize signalées, trente-deux restaient visibles.
   */
  const [alerts, setAlerts] = useState<readonly ListingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * UNE FICHE OUVERTE PAR SON ADRESSE.
   *
   * L'écran de fiche ne s'affichait que si l'annonce était DÉJÀ dans la liste
   * chargée. Ouvrir `/annonce/…` directement — un lien collé, un
   * rafraîchissement, une notification — ne rendait donc rien du tout : pas un
   * message, pas un fond, un écran noir. On va la chercher.
   */
  useEffect(() => {
    if (view !== 'detail' || selectedId === null) return;
    // TANT QU'ON NE SAIT PAS QUI DEMANDE, ON NE DEMANDE RIEN. La vérification de
    // session est en vol au premier rendu : partir chercher la fiche tout de
    // suite pouvait rendre un 401, dont la reprise ci-dessous écrase l'adresse
    // par celle de la liste. Le lien de la notification était alors perdu avant
    // même que l'écran de connexion ait paru, et revenir dessus ne ramenait plus
    // à l'annonce.
    if (currentUser === undefined || currentUser === null) return;
    // UNE FICHE ALLÉGÉE NE SUFFIT PAS. La liste transporte des annonces sans
    // description ni détail des scores ; s'en contenter ici affichait une
    // description absente et faisait tomber tout le rendu — page blanche.
    if (listings.some((listing) => listing.id === selectedId && listing.partial !== true)) return;

    let cancelled = false;
    void fetchListing(selectedId)
      .then((full) => {
        if (cancelled) return;
        // REMPLACER, et non ajouter : la version allégée est déjà là quand la
        // liste est arrivée la première. Deux entrées de même identifiant, et
        // c'est la plus pauvre — la première trouvée — qui s'affiche.
        setListings((current) =>
          current.some((listing) => listing.id === full.id)
            ? current.map((listing) => (listing.id === full.id ? full : listing))
            : [...current, full],
        );
      })
      .catch(() => {
        // Annonce introuvable ou réseau coupé : on retourne à la liste plutôt
        // que de laisser un squelette tourner indéfiniment.
        if (cancelled) return;
        setError('Cette annonce est introuvable.');
        go({ view: 'list', favoritesOnly });
      });
    return () => {
      cancelled = true;
    };
  }, [view, selectedId, listings, go, favoritesOnly, currentUser]);

  // L'annuaire n'est demandé qu'en arrivant dessus : c'est une agrégation en
  // base, inutile à qui ne l'ouvre jamais (§30).
  useEffect(() => {
    if (view !== 'agencies') return;
    void fetchAgencies()
      .then(setAgencies)
      .catch(() => setError('L’annuaire des agences n’a pas pu être chargé'));
  }, [view]);

  useEffect(() => {
    if (view !== 'agency' || selectedSourceId === null) return;
    setAgencyDetail(null);
    void fetchAgency(selectedSourceId)
      .then(setAgencyDetail)
      .catch(() => setError('Cette agence n’a pas pu être chargée'));
  }, [view, selectedSourceId]);

  // Le drapeau « favoris » se change aussi depuis la modale de filtres. Il doit
  // alors se lire dans la barre d'adresse — mais sans empiler d'entrée : passer
  // de la liste aux favoris n'est pas un voyage dont on revient.
  useEffect(() => {
    if (view !== 'list') return;
    replace({ view: 'list', favoritesOnly });
  }, [view, favoritesOnly, replace]);

  // Instant de rendu, figé par chargement : évite que chaque carte recalcule
  // « il y a X min » à partir d'une horloge légèrement différente.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Pastille de la cloche. `alertsSeenAt` s'amorce à l'instant du premier
  // lancement : compter tout l'historique afficherait « 90 » à quelqu'un qui
  // n'a rien manqué.
  const [alertsSeenAt, setAlertsSeenAt] = useState(() => readAlertsSeenAt(Date.now()));
  // Instant de la visite PRÉCÉDENTE, figé à l'ouverture de la page. Sans lui,
  // marquer les alertes comme vues effacerait les repères « non lue » dans la
  // seconde où on arrive dessus.
  const [alertsViewedFrom, setAlertsViewedFrom] = useState(alertsSeenAt);
  // Bandeaux d'alerte affichés DANS la page : la notification navigateur ne se
  // voit pas quand l'onglet a le focus, et pas du tout sans permission.
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  // Affinité : apprend de vos consultations/suivis/archivages pour remonter les
  // annonces qui vous ressemblent (§33). Hook placé AVANT tout return
  // conditionnel (règle des hooks). Recalculée quand la liste change.
  const affinity = useMemo(() => computeAffinity(listings), [listings]);

  // Mémorise les réglages d'affichage à chaque changement. Un effet plutôt
  // qu'une écriture dans chaque setter : neuf points d'écriture auraient fini
  // par diverger, et un oubli ne se voit pas.
  //
  // DIFFÉRÉ d'un tiers de seconde : `localStorage` écrit de façon synchrone, et
  // sérialiser tout l'état à chaque caractère tapé dans la recherche bloquait
  // le fil principal pour rien. Une écriture par pause de saisie suffit.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeViewState({
        sort,
        quickFilters,
        selectedSources,
        search,
        hideUncertain,
        showArchived,
        favoritesOnly,
        displayMode,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    sort,
    quickFilters,
    selectedSources,
    search,
    hideUncertain,
    showArchived,
    favoritesOnly,
    displayMode,
  ]);
  const unreadAlerts = useMemo(
    () => unreadAlertCount(listings, alertsSeenAt),
    [listings, alertsSeenAt],
  );

  // Dérivations d'affichage MÉMOÏSÉES : elles filtrent et trient des centaines
  // d'annonces. Sans mémoïsation, tout serait recalculé à chaque rendu — donc à
  // chaque frappe dans un filtre. Placées avant tout return conditionnel (règle
  // des hooks). Chacune ne se recalcule que si ses entrées changent.
  const availableSources = useMemo(
    () =>
      [...new Set(listings.flatMap((l) => l.occurrences.map((o) => o.sourceId)))].sort((a, b) =>
        formatSourceName(a).localeCompare(formatSourceName(b)),
      ),
    [listings],
  );
  const availableTypes = useMemo(
    () =>
      [...new Set(listings.map((l) => l.propertyType.value))].filter((t) => t !== 'unknown').sort(),
    [listings],
  );
  // Filtre par source (§13), puis filtres rapides (budget/surface/pièces/type),
  // puis la recherche libre.
  const filtered = useMemo(() => {
    const bySource =
      selectedSources.size === 0
        ? listings
        : listings.filter((l) => l.occurrences.some((o) => selectedSources.has(o.sourceId)));
    // Les champs AFFICHENT vos critères, mais ne filtrent qu'une fois modifiés.
    // Les appliquer d'emblée aurait ré-exclu aussitôt les annonces demandées par
    // la bascule « hors critères » — deux réglages qui se contredisent.
    const byQuick = hasActiveQuickFilters(quickFilters)
      ? bySource.filter((l) => matchesQuickFilters(l, quickFilters))
      : bySource;
    const bySearch = byQuick.filter((l) => matchesSearch(l, search));
    // « À vérifier » = disparue de sa source depuis plusieurs collectes. On peut
    // les masquer pour ne garder que ce qui est encore publié (§33).
    return hideUncertain ? bySearch.filter((l) => l.lifecycle !== 'possiblyInactive') : bySearch;
  }, [listings, selectedSources, quickFilters, search, hideUncertain]);
  // §36 : en tri par priorité, on classe par priorité d'action AJUSTÉE de
  // l'affinité — les annonces proches de vos préférences remontent.
  const ranked = useMemo(
    () =>
      sort === 'priority'
        ? [...filtered].sort(
            (a, b) =>
              b.actionPriority +
              (affinity.scores.get(b.id) ?? 0) * AFFINITY_BOOST -
              (a.actionPriority + (affinity.scores.get(a.id) ?? 0) * AFFINITY_BOOST),
          )
        : filtered,
    [filtered, sort, affinity],
  );
  // La section « à contacter maintenant » reste fondée sur l'urgence réelle.
  // Pas de section « à contacter maintenant » dans les FAVORIS : on y vient
  // revoir ce qu'on a retenu, pas se faire hiérarchiser sa propre sélection.
  const grouped = sort === 'priority' && !favoritesOnly;
  const hot = useMemo(
    () => (grouped ? ranked.filter((l) => l.actionPriority >= HOT_PRIORITY) : []),
    [ranked, grouped],
  );
  const rest = useMemo(
    () => (grouped ? ranked.filter((l) => l.actionPriority < HOT_PRIORITY) : ranked),
    [ranked, grouped],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchListings({
        sort,
        includeArchived: showArchived,
        favoritesOnly,
      });
      setListings(response.listings);
      setNowMs(Date.now());
    } catch (caught) {
      // UNE SESSION EXPIRÉE N'EST PAS UNE PANNE : on renvoie à la connexion au
      // lieu d'afficher un message rouge devant une liste vide, que rien ne
      // permettrait de faire disparaître.
      if (caught instanceof ApiError && caught.status === 401) {
        setCurrentUser(null);
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [sort, showArchived, favoritesOnly]);

  /**
   * QUI EST CONNECTÉ — et une limite de patience.
   *
   * Tant que la réponse n'est pas là, l'écran ne montre RIEN : ni connexion, ni
   * application, parce qu'afficher l'une puis l'autre ferait clignoter la page
   * chez qui a déjà une session. C'est juste, mais cela veut dire qu'une
   * requête qui n'aboutit jamais laisse une PAGE BLANCHE définitive, sans un
   * mot et sans recours — et `fetch` ne rend pas la main tout seul : un réseau
   * qui accepte la connexion puis se tait fait attendre indéfiniment.
   *
   * Au bout de dix secondes, on tranche donc pour « pas connecté ». L'écran de
   * connexion s'affiche, et une session valide sera retrouvée au premier essai.
   * Se tromper coûte un mot de passe à ressaisir ; ne rien trancher coûte une
   * application inutilisable.
   */
  useEffect(() => {
    if (!requiresLogin()) return undefined;
    let settled = false;
    const decide = (user: string | null): void => {
      if (settled) return;
      settled = true;
      setCurrentUser(user);
    };
    const giveUp = window.setTimeout(() => decide(null), SESSION_TIMEOUT_MS);
    void fetchCurrentUser()
      .then(decide)
      .catch(() => decide(null));
    return () => window.clearTimeout(giveUp);
  }, []);

  useEffect(() => {
    // Rien à charger tant qu'on ne sait pas qui regarde : la requête partirait
    // sans cookie et reviendrait « connexion requise ».
    if (currentUser === undefined || currentUser === null) return;
    void load();
  }, [load, currentUser]);

  /**
   * Le PREMIER PARCOURS, une seule fois par compte.
   *
   * `undefined` tant qu'on ne sait pas : afficher l'accueil pendant la lecture
   * le ferait clignoter chez quelqu'un qui l'a déjà vu. En cas d'échec on
   * considère qu'il a été fait — mieux vaut ne pas le montrer que le montrer à
   * chaque chargement sans pouvoir le refermer.
   */
  // L'historique ne se charge qu'en OUVRANT l'écran : c'est une consultation
  // occasionnelle, pas une donnée dont la liste a besoin (§30).
  useEffect(() => {
    if (view !== 'alerts' || currentUser === undefined || currentUser === null) return;
    void fetchAlerts()
      .then(setAlerts)
      .catch(() => undefined);
  }, [view, currentUser]);

  /**
   * Consulter l'historique, c'est avoir vu les alertes : la pastille tombe.
   * Les LIGNES, elles, gardent leur repère « non lue » — d'où l'instant
   * précédent, mis de côté avant d'être écrasé.
   *
   * CECI VIVAIT DANS `navigate`, et n'attrapait donc que le clic sur la
   * cloche. Arriver par l'adresse directe — un lien reçu, un onglet rouvert,
   * un simple rechargement — laissait la pastille allumée sur une page qu'on
   * était pourtant en train de lire. La VUE est ce qui compte, pas le chemin
   * emprunté pour l'atteindre.
   *
   * `alertsSeenAt` est délibérément hors des dépendances : cet effet l'écrit,
   * et le relire le relancerait sans fin.
   */
  useEffect(() => {
    if (view !== 'alerts') return;
    setAlertsViewedFrom(alertsSeenAt);
    const seenAt = Date.now();
    markAlertsSeen(seenAt);
    setAlertsSeenAt(seenAt);
  }, [view]);

  /**
   * Le profil locataire suit le COMPTE, et non l'appareil.
   *
   * Trois cas, et le troisième est celui qui compte : la base a un profil, on
   * le prend ; elle n'en a pas mais le navigateur si, on le lui donne — c'est
   * la reprise silencieuse des profils saisis avant que cette synchronisation
   * n'existe ; ni l'un ni l'autre, il n'y a rien à faire.
   *
   * UN ÉCHEC NE VIDE RIEN. Rendre `null` sur une requête ratée effacerait à
   * l'écran un profil parfaitement valide, resté dans le navigateur.
   */
  useEffect(() => {
    if (currentUser === undefined || currentUser === null) return;
    void fetchTenantProfile()
      .then((stored) => {
        if (stored !== null) {
          saveProfile(stored);
          setProfile(stored);
          return;
        }
        const local = loadProfile();
        if (local !== null) void saveTenantProfile(local).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser === undefined || currentUser === null) return;
    void fetchOnboardingDone()
      .then(setOnboardingDone)
      .catch(() => setOnboardingDone(true));
    // Le repère de lecture des nouveautés. Un échec ne montre rien : une
    // fenêtre qui s'ouvre parce qu'une requête a échoué serait pire que le
    // silence.
    void fetchChangelogSeen()
      .then((seen) => setNews(unseenEntries(seen)))
      .catch(() => undefined);
  }, [currentUser]);

  // Recherches enregistrées et santé des sources : deux lectures, une fois par
  // session, dont l'accueil a besoin dès son ouverture. Un échec n'est pas une
  // erreur d'écran — on affiche simplement une liste vide (§69).
  useEffect(() => {
    void fetchSavedSearches()
      .then(setSavedSearches)
      .catch(() => undefined);
    void fetchSources()
      .then((response) => setSources(response.sources))
      .catch(() => undefined);
  }, []);

  // Intentions venues d'une NOTIFICATION (§29). Le service worker ne peut pas
  // écrire en base — les identifiants de connexion vivent dans le stockage de
  // la page — il transmet donc l'action par l'URL, et c'est ici qu'on l'exécute.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const favori = params.get('favori');
    const listing = params.get('listing');
    if (favori === null && listing === null) return;

    // L'URL est nettoyée tout de suite : un rechargement ne doit pas rejouer
    // l'action, et le lien reste partageable.
    window.history.replaceState({}, '', window.location.pathname);
    if (favori !== null) {
      void setFavorite(favori, true).catch(() => {
        setError('Le favori n’a pas pu être enregistré');
      });
      setListings((current) =>
        current.map((l) => (l.id === favori ? { ...l, favorite: true } : l)),
      );
    }
    const target = listing ?? favori;
    if (target !== null) {
      setSelectedId(target);
      setView('detail');
    }
  }, []);

  // Ouvre une fiche et la marque « consultée » (§37). En `useCallback` car
  // partagée par le rendu ET le sondage de notifications (hook ci-dessous).
  const openListing = useCallback((id: string): void => {
    setSelectedId(id);
    setView('detail');
    // Optimiste : on met à jour l'affichage tout de suite, l'API suit.
    setListings((current) =>
      current.map((listing) => (listing.id === id ? { ...listing, viewed: true } : listing)),
    );
    void markViewed(id).catch(() => {
      /* l'échec réseau n'empêche pas de consulter la fiche */
    });
    // LA FICHE COMPLÈTE, à l'ouverture seulement. La liste ne transporte ni
    // description, ni coordonnées, ni détail des scores — c'est ce qui la rend
    // légère (six méga-octets de moins). On les demande ici, pour UNE annonce,
    // au moment où elles servent (§30). L'échec n'est pas bloquant : la fiche
    // s'affiche avec ce que la liste en savait.
    void fetchListing(id)
      .then((full) =>
        setListings((current) =>
          current.map((listing) =>
            listing.id === id ? { ...full, viewed: true, ...userState(listing) } : listing,
          ),
        ),
      )
      .catch(() => {
        /* fiche non rechargée : celle de la liste reste affichée */
      });
  }, []);

  // §29 : bandeaux dans la page + notifications navigateur, site ouvert.
  const handleFresh = useCallback(
    (fresh: readonly ListingView[]): void => setToasts((current) => mergeToasts(current, fresh)),
    [],
  );
  useNewListingAlerts({ onFresh: handleFresh, onOpen: openListing });

  /**
   * Efface les repères « non lue » de l'historique, d'un geste.
   *
   * TROIS ÉTATS À ALIGNER, faute de quoi la page se contredit : la mémoire
   * durable, la pastille de la cloche, et le repère des lignes affichées. Le
   * dernier vaut l'instant de la visite PRÉCÉDENTE — c'est ce qui laisse les
   * repères visibles pendant qu'on parcourt la page —, et c'est précisément
   * celui qu'il faut avancer ici.
   *
   * La mémoire durable est réécrite même quand elle vaut déjà « maintenant » :
   * on peut arriver sur cette page par son adresse directe, sans passer par la
   * cloche qui la met à jour.
   */
  const markAllAlertsRead = (): void => {
    const now = Date.now();
    markAlertsSeen(now);
    setAlertsSeenAt(now);
    setAlertsViewedFrom(now);
  };

  const dismissToast = useCallback((id: string): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const navigate = (next: NavTarget): void => {
    if (next === 'favorites') {
      setFavoritesOnly(true);
      setSelectedId(null);
      setView('list');
      return;
    }
    if (next === 'sources') {
      void openSources();
      return;
    }
    if (next === 'list') {
      setSelectedId(null);
      // Sans cela, on resterait coincé dans les favoris : la barre qui porte
      // la bascule est masquée là-bas.
      setFavoritesOnly(false);
    }
    setView(next);
  };

  const openSources = async (): Promise<void> => {
    try {
      const response = await fetchSources();
      setSources(response.sources);
      setView('sources');
    } catch {
      setError('Impossible de charger l’état des sources');
    }
  };

  /**
   * Ouvre la fiche d'une source. L'état d'exécution est chargé au passage
   * quand il manque — venir depuis une annonce ne l'a pas fait charger — mais
   * son échec n'empêche rien : les annonces, elles, sont déjà là.
   */
  const openSource = async (sourceId: string): Promise<void> => {
    setSelectedSourceId(sourceId);
    setView('source');
    if (sources.length > 0) return;
    try {
      const response = await fetchSources();
      setSources(response.sources);
    } catch {
      // La fiche reste lisible sans l'encart « Collecte » (§69).
    }
  };

  /**
   * L'annonce affichée par l'écran de fiche — la COMPLÈTE, ou rien.
   *
   * Retenir la version allégée de la liste faisait tomber le rendu : elle n'a
   * ni description ni détail des scores, et l'écran les affiche tous les deux.
   * Tant que la complète n'est pas arrivée, on montre le squelette — quelques
   * centaines de millisecondes, contre une page blanche définitive.
   */
  const selected =
    listings.find((listing) => listing.id === selectedId && listing.partial !== true) ?? null;

  // DÉCLARÉ ICI, avec les autres actions sur une annonce, et non plus après le
  // rendu de la liste : la vue FICHE sort du composant par un `return` anticipé,
  // si bien que la déclaration qui suivait n'était jamais atteinte. Le cœur de
  // la fiche capturait alors une liaison non initialisée, et le clic levait une
  // `ReferenceError` au lieu d'enregistrer le favori.
  const handleFavorite = async (id: string, favorite: boolean): Promise<void> => {
    // Optimiste ; si on n'affiche que les favoris, retirer un favori le fait
    // disparaître de la liste.
    setListings((current) =>
      !favorite && favoritesOnly
        ? current.filter((listing) => listing.id !== id)
        : current.map((listing) => (listing.id === id ? { ...listing, favorite } : listing)),
    );
    try {
      await setFavorite(id, favorite);
    } catch {
      setError('Le favori n’a pas pu être enregistré');
    }
  };

  const handleArchive = async (id: string, archived: boolean): Promise<void> => {
    // Optimiste : si on archive et qu'on ne montre pas les archivées, l'annonce
    // disparaît de la liste ; sinon on met simplement à jour son état.
    setListings((current) =>
      archived && !showArchived
        ? current.filter((listing) => listing.id !== id)
        : current.map((listing) => (listing.id === id ? { ...listing, archived } : listing)),
    );
    // Archiver depuis la fiche renvoie à la liste : l'annonce n'y est plus.
    if (view === 'detail' && archived) setView('list');
    try {
      await setArchived(id, archived);
    } catch {
      setError('L’archivage n’a pas pu être enregistré');
    }
  };
  const handleTrackingChange = async (status: TrackingStatus): Promise<void> => {
    if (selected === null) return;
    setListings((current) =>
      current.map((listing) =>
        listing.id === selected.id ? { ...listing, tracking: status } : listing,
      ),
    );
    try {
      await updateTracking(selected.id, status);
    } catch {
      setError('Le statut n’a pas pu être enregistré');
    }
  };

  const handleContactRecorded = async (
    channel: string,
    message: string,
    documents: readonly string[],
  ): Promise<void> => {
    if (selected === null) return;
    const sourceId = selected.occurrences[0]?.sourceId ?? 'unknown';
    setListings((current) =>
      current.map((listing) =>
        listing.id === selected.id ? { ...listing, tracking: 'contacted' as const } : listing,
      ),
    );
    try {
      await recordContact(selected.id, { channel, message, sourceId, documents });
    } catch {
      setError('Le contact n’a pas pu être enregistré');
    }
  };

  // Onglet bas actif. « Favoris » n'est pas une vue mais la liste filtrée :
  // le même état sert au réglage de la modale, et deux sources de vérité
  // auraient fini par diverger.
  const bottomTab = bottomTabFor(view, favoritesOnly, sortFilterOpen);

  const selectBottomTab = (tab: BottomTab): void => {
    if (tab === 'search') {
      // « Recherche » OUVRE LA RECHERCHE, et non le menu de tri. Le geste
      // ouvrait une modale par-dessus la page qu'on quittait : on demandait à
      // voir des annonces, on obtenait un panneau de réglages.
      setFavoritesOnly(false);
      setSortFilterOpen(false);
      setView('list');
      return;
    }
    if (tab === 'settings') return setView('profile');
    if (tab === 'home') {
      setFavoritesOnly(false);
      setView('home');
      return;
    }
    // Favoris : la même liste, filtrée.
    setFavoritesOnly(true);
    setView('list');
  };

  /** Rappelle une recherche enregistrée : critères, affinage et tri. */
  const applySavedSearch = async (saved: SavedSearch): Promise<void> => {
    setQuickFilters(toQuickFilters(saved.view));
    setSelectedSources(new Set(saved.view.sources ?? []));
    setSort(saved.view.sort ?? 'priority');
    setSearch(saved.view.search ?? '');
    setFavoritesOnly(false);
    setView('list');
    try {
      // Les critères repartent en base : ils décident de ce que la PROCHAINE
      // collecte ramènera, pas seulement de ce qu'on regarde aujourd'hui.
      await saveFilters(saved.criteria);
      await load();
    } catch {
      setError('Les critères de cette recherche n’ont pas pu être appliqués');
    }
  };

  /**
   * Range une recherche REÇUE parmi les siennes, sans rien appliquer.
   *
   * Le bon geste quand le lien arrive au milieu de sa propre recherche : on ne
   * veut pas perdre ses critères, mais on ne veut pas non plus perdre le lien.
   */
  const storeSharedSearch = async (shared: SavedSearch): Promise<void> => {
    const next = [shared, ...savedSearches];
    setSavedSearches(next);
    try {
      await saveSavedSearches(next);
    } catch {
      setError('La recherche partagée n’a pas pu être enregistrée');
    }
  };

  /** Enregistre l'état courant de la recherche sous un nom. */
  const saveCurrentSearch = async (name: string): Promise<void> => {
    try {
      const criteria = await fetchFilters();
      const entry: SavedSearch = {
        id: newSearchId(),
        name,
        createdAt: new Date().toISOString(),
        criteria,
        view: toSavedView(quickFilters, { sources: selectedSources, sort, search }),
      };
      const next = [entry, ...savedSearches];
      await saveSavedSearches(next);
      setSavedSearches(next);
    } catch {
      setError('La recherche n’a pas pu être enregistrée');
    }
  };

  /** Renomme une recherche. Le nom est la seule chose qu'on relit vraiment. */
  const renameSavedSearch = async (id: string, name: string): Promise<void> => {
    const next = savedSearches.map((saved) => (saved.id === id ? { ...saved, name } : saved));
    setSavedSearches(next);
    try {
      await saveSavedSearches(next);
    } catch {
      setError('Le nouveau nom n’a pas pu être enregistré');
    }
  };

  /**
   * Remplace les réglages d'une recherche par CEUX DE L'ÉCRAN, son nom gardé.
   *
   * IL N'Y AVAIT AUCUN MOYEN DE CORRIGER UNE RECHERCHE. Créer, rappeler,
   * renommer, supprimer existaient ; modifier, non. Il fallait la rejouer,
   * changer les filtres, réenregistrer — ce qui créait une SECONDE carte,
   * `saveCurrentSearch` posant toujours un identifiant neuf même à nom égal —,
   * puis supprimer l'ancienne en la distinguant de la nouvelle par un nom
   * identique. On s'y trompe, et on supprime la mauvaise.
   *
   * La date de création NE BOUGE PAS : « Enregistrée il y a trois semaines »
   * dit depuis quand cette recherche accompagne, pas quand on a corrigé une
   * borne de loyer.
   */
  const updateSavedSearch = async (id: string): Promise<void> => {
    try {
      const criteria = await fetchFilters();
      const next = savedSearches.map((saved) =>
        saved.id === id
          ? {
              ...saved,
              criteria,
              view: toSavedView(quickFilters, { sources: selectedSources, sort, search }),
            }
          : saved,
      );
      setSavedSearches(next);
      await saveSavedSearches(next);
    } catch {
      setError('La recherche n’a pas pu être mise à jour');
    }
  };

  const deleteSavedSearch = async (id: string): Promise<void> => {
    const next = savedSearches.filter((saved) => saved.id !== id);
    setSavedSearches(next);
    try {
      await saveSavedSearches(next);
    } catch {
      setError('La suppression n’a pas pu être enregistrée');
    }
  };

  /**
   * Combien d'annonces DÉJÀ CHARGÉES une recherche enregistrée laisserait
   * passer.
   *
   * Approximation assumée : on n'applique que l'affinage, pas les critères de
   * collecte — ceux-ci décident de ce qui a été RAMENÉ, et l'appliquer
   * demanderait de recharger depuis la base pour chaque recherche affichée
   * (§30). Le chiffre reste un ordre de grandeur utile pour reconnaître sa
   * recherche, et le libellé ne promet rien de plus.
   */
  const countForSearch = (saved: SavedSearch): number => {
    const quick = toQuickFilters(saved.view);
    const sources = new Set(saved.view.sources ?? []);
    return listings.filter((listing) => {
      if (listing.lifecycle !== 'active') return false;
      if (!matchesQuickFilters(listing, quick)) return false;
      if (sources.size === 0) return true;
      return listing.occurrences.some((one) => sources.has(one.sourceId));
    }).length;
  };

  // Les bandeaux d'alerte flottent AU-DESSUS de la vue courante, quelle qu'elle
  // soit : une annonce trouvée pendant qu'on lit une fiche doit se voir aussi.
  // D'où ce fragment répété aux trois sorties du composant.
  const dismissNews = (): void => {
    setNews([]);
    const latest = latestEntryId();
    if (latest !== null) void markChangelogSeen(latest).catch(() => undefined);
  };

  const overlay = (
    <>
      <ToastStack toasts={toasts} onOpen={openListing} onDismiss={dismissToast} />
      {/* Les nouveautés flottent au-dessus de la vue courante, comme les
        bandeaux d'alerte : elles ne remplacent pas l'écran demandé. */}
      <ChangelogModal entries={news} onClose={dismissNews} />
    </>
  );

  /**
   * CE QUI PASSE AVANT L'APPLICATION.
   *
   * Trois écrans se succèdent avant qu'il y ait quoi que ce soit à naviguer :
   * on ne sait pas encore qui regarde, personne n'est connecté, ou le compte
   * vient d'être créé. Aucun ne porte de coquille ni d'onglets — proposer
   * d'aller ailleurs pendant qu'on demande un mot de passe ou qu'on présente
   * deux réglages reviendrait à ne rien demander du tout.
   *
   * Regroupés ici plutôt qu'en trois sorties anticipées : le corps d'`App`
   * dépassait sinon le seuil de complexité, et ces trois-là forment une seule
   * question — « peut-on afficher l'application ? ».
   */
  /**
   * Ce qu'il se passe une fois la session ouverte, quel qu'en soit le chemin.
   *
   * `'inconnu'` est posé AVANT la relecture pour que l'application apparaisse
   * tout de suite : attendre `/api/me` laisserait l'écran de connexion à
   * l'image un instant de plus, juste après l'avoir validé.
   */
  const enterSession = (): void => {
    setCurrentUser('inconnu');
    void fetchCurrentUser()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  };

  const entranceScreen = (): React.JSX.Element | null => {
    // AVANT TOUT LE RESTE : sans adresse d'API, il n'y a rien à charger et rien
    // à connecter. L'application se croyait connectée et affichait une liste
    // vide, ce qui se lit « aucune annonce ne correspond » au lieu de « rien
    // n'est branché ».
    if (isUnconfigured()) return <UnconfiguredScreen />;

    // LE LIEN DE RÉINITIALISATION PASSE AVANT LA SESSION, et il le faut : on
    // arrive dessus précisément parce qu'on ne peut pas se connecter. Attendre
    // la réponse de `/api/me` pour l'afficher renverrait vers l'écran de
    // connexion, c'est-à-dire vers le mur qu'on essaie de contourner.
    if (view === 'reset') {
      return <ResetPassword token={route.id ?? ''} onDone={() => replace({ view: 'home' })} />;
    }

    // MÊME RAISON POUR LA CONFIRMATION D'ADRESSE : on suit ce lien depuis sa
    // boîte, souvent sur un autre appareil que celui de l'inscription. Exiger
    // une session ici bloquerait la moitié des gens sur l'écran de connexion,
    // pour un geste qui n'en a pas besoin — le jeton suffit à dire quelle
    // adresse est confirmée.
    if (view === 'confirm') {
      return <ConfirmEmail token={route.id ?? ''} onDone={() => replace({ view: 'home' })} />;
    }

    /**
     * UNE RECHERCHE PARTAGÉE PASSE APRÈS LA SESSION, contrairement aux deux
     * écrans ci-dessus. Ceux-là existent précisément pour qui ne peut pas se
     * connecter ; celle-ci, au contraire, ÉCRIT dans un compte — il faut donc
     * savoir lequel. Reçue déconnecté, on voit d'abord l'écran de connexion,
     * et l'adresse est retrouvée ensuite : le lien n'est pas perdu.
     */
    if (view === 'shared' && currentUser !== null && currentUser !== undefined) {
      return (
        <SharedSearch
          token={route.id ?? ''}
          onApply={(shared) => {
            replace({ view: 'list' });
            void applySavedSearch(shared);
          }}
          onSave={(shared) => {
            replace({ view: 'saved' });
            void storeSharedSearch(shared);
          }}
          onCancel={() => replace({ view: 'home' })}
        />
      );
    }

    // Un instant blanc vaut mieux qu'un écran de connexion qui clignote chez
    // quelqu'un déjà connecté. Passé une seconde, en revanche, le blanc n'est
    // plus une transition : il faut dire qu'il se passe quelque chose.
    if (currentUser === undefined) return <SessionPending />;

    if (currentUser === null) {
      if (view === 'forgot') {
        return <ForgotPassword onBack={() => replace({ view: 'home' })} />;
      }
      // L'INSCRIPTION OUVRE DÉJÀ LA SESSION : le serveur pose le cookie avec
      // le compte. On relit donc `/api/me` exactement comme après une
      // connexion, plutôt que de renvoyer vers l'écran de connexion pour y
      // retaper ce qu'on vient de saisir.
      if (view === 'signup') {
        return (
          <SignupScreen
            onBack={() => replace({ view: 'home' })}
            onSignedIn={() => {
              replace({ view: 'home' });
              enterSession();
            }}
          />
        );
      }
      return (
        <LoginScreen
          onForgot={() => go({ view: 'forgot' })}
          onSignup={() => go({ view: 'signup' })}
          onSignedIn={enterSession}
        />
      );
    }

    if (onboardingDone === false) {
      return (
        <OnboardingPanel
          profile={profile}
          onSaveProfile={rememberProfile}
          onFinish={() => {
            setOnboardingDone(true);
            // L'écran se referme tout de suite ; la marque part en base
            // derrière. Attendre le réseau pour retirer un écran qu'on vient de
            // terminer donnerait l'impression d'un bouton qui ne répond pas.
            void markOnboardingDone().catch(() => undefined);
            // Et on pose le repère des nouveautés : quelqu'un qui découvre
            // l'application n'a rien à rattraper. Sans cela, la modale des
            // nouveautés s'ouvrirait dans la seconde suivant son accueil.
            const latest = latestEntryId();
            if (latest !== null) void markChangelogSeen(latest).catch(() => undefined);
          }}
        />
      );
    }

    return null;
  };

  const entrance = entranceScreen();
  if (entrance !== null) return entrance;

  /**
   * LES SIX PROPS QUE TOUS LES ÉCRANS PASSENT À L'IDENTIQUE.
   *
   * Elles étaient recopiées seize fois. Rien ne cassait — c'est bien le
   * problème : ajouter un écran demandait de les recopier justes, et un
   * `unreadAlerts` oublié n'aurait produit qu'une pastille muette, sans erreur
   * ni test rouge. Un seul objet rend l'oubli impossible.
   */
  const shell = {
    view,
    favoritesOnly,
    onNavigate: navigate,
    unreadAlerts,
    bottomTab,
    onBottomSelect: selectBottomTab,
  };

  /**
   * Les sous-écrans des PARAMÈTRES, sortis de `secondaryView`.
   *
   * Celle-ci passait le seuil de complexité toléré : vingt branches, dont
   * six qui font toutes la même chose — une coquille, un panneau, un retour
   * vers la liste des réglages. Les réunir dit ce qu'elles ont en commun.
   */
  const settingsView = (): React.JSX.Element | null => {
    // PARAMÈTRES : rien que des chemins. Le profil locataire et les pièces du
    // dossier occupaient tout le premier écran — huit champs et une liste de
    // fichiers pour deux réglages qu'on touche une fois. Ils ont maintenant
    // leur page, comme les autres.
    if (view === 'profile') {
      return (
        <Shell {...shell}>
          <h1 className="mb-4 text-xl font-bold">Paramètres</h1>
          {/* L'INTERRUPTEUR DES ALERTES VIVAIT ICI, seul de son espèce au
              milieu de liens. Il est passé derrière « Notifications », qui porte
              aussi le détail par famille d'alertes.

              `navigate` et non `setView` : certaines vues doivent CHARGER leurs
              données avant d'apparaître (les sources, notamment). */}
          <SettingsLinks
            onNavigate={(key) => navigate(key as View)}
            onSignedOut={() => {
              // La session n'existe plus : `currentUser` à `null` ramène
              // l'écran de connexion.
              setCurrentUser(null);
              replace({ view: 'home' });
            }}
          />
        </Shell>
      );
    }
    if (view === 'documents') {
      return (
        <Shell {...shell}>
          <BackToSettings onBack={() => setView('profile')} />
          <DocumentsSection profile={profile} />
        </Shell>
      );
    }
    if (view === 'access') {
      return (
        <Shell {...shell}>
          <BackToSettings onBack={() => setView('profile')} />
          <AccessPanel />
        </Shell>
      );
    }
    if (view === 'notifications') {
      return (
        <Shell {...shell}>
          <NotificationSettingsPanel onBack={() => setView('profile')} />
        </Shell>
      );
    }
    if (view === 'theme') {
      return (
        <Shell {...shell}>
          <ThemePanel onBack={() => setView('profile')} />
        </Shell>
      );
    }
    return null;
  };

  // Vues « secondaires » (plein écran), regroupées hors du corps principal pour
  // garder App lisible : chacune rend sa coquille ou `null` si non concernée.
  const secondaryView = (): React.JSX.Element | null => {
    if (view === 'home') {
      return (
        <Shell {...shell}>
          <HomePanel
            listings={listings}
            sources={sources}
            savedSearches={savedSearches}
            nowMs={nowMs}
            seenAtMs={alertsViewedFrom}
            profileComplete={profile !== null}
            onOpenListing={openListing}
            onOpenSearch={() => {
              setFavoritesOnly(false);
              setView('list');
            }}
            onOpenFavorites={() => {
              setFavoritesOnly(true);
              setView('list');
            }}
            onOpenAlerts={() => navigate('alerts')}
            onOpenSavedSearches={() => setView('saved')}
            onOpenProfile={() => {
              setEditingProfile(true);
              setView('tenant');
            }}
            onApplySearch={(saved) => void applySavedSearch(saved)}
          />
        </Shell>
      );
    }
    if (view === 'alerts') {
      return (
        <main className="mx-auto max-w-[720px] px-3 py-4 pb-12 sm:px-4 sm:py-6 sm:pb-16">
          <Button variant="ghost" className="mb-2" onClick={() => setView('home')}>
            <ArrowLeft aria-hidden="true" className="size-4" /> Retour
          </Button>
          <NotificationsPanel
            listings={alerts}
            nowMs={nowMs}
            onOpen={openListing}
            seenAtMs={alertsViewedFrom}
            onMarkAllRead={markAllAlertsRead}
          />
        </main>
      );
    }
    const settings = settingsView();
    if (settings !== null) return settings;

    if (view === 'agencies') {
      return (
        <Shell {...shell}>
          {agencies.length === 0 && loading ? (
            <RowsSkeleton />
          ) : (
            <AgenciesPanel
              agencies={agencies}
              onBack={() => setView('profile')}
              onOpen={(name) => go({ view: 'agency', id: name })}
            />
          )}
        </Shell>
      );
    }
    if (view === 'agency') {
      return (
        <Shell {...shell}>
          {agencyDetail === null ? (
            <RowsSkeleton />
          ) : (
            <AgencyPanel
              agency={agencyDetail.agency}
              listings={agencyDetail.listings}
              nowMs={nowMs}
              onBack={() => setView('agencies')}
              onOpenListing={(id) => setSelectedId(id)}
              onFavorite={(id, favorite) => void handleFavorite(id, favorite)}
            />
          )}
        </Shell>
      );
    }
    if (view === 'reference') {
      return (
        <Shell {...shell}>
          <BackToSettings onBack={() => setView('profile')} />
          <ReferencePointsSection />
        </Shell>
      );
    }
    if (view === 'saved') {
      return (
        <Shell {...shell}>
          <SavedSearchesPanel
            searches={savedSearches}
            nowMs={nowMs}
            available={savedSearchesAvailable()}
            countFor={countForSearch}
            onBack={() => setView('profile')}
            onApply={(saved) => void applySavedSearch(saved)}
            onDelete={(id) => void deleteSavedSearch(id)}
            onRename={(id, name) => void renameSavedSearch(id, name)}
            onUpdate={(id) => void updateSavedSearch(id)}
            onSaveCurrent={(name) => void saveCurrentSearch(name)}
            suggestion={suggestName(
              {
                cities: [...MVP_CRITERIA.cities],
                maxPrice: MVP_CRITERIA.maxPrice,
                minArea: MVP_CRITERIA.minArea,
              },
              quickFilters,
            )}
          />
        </Shell>
      );
    }
    if (view === 'tenant') {
      return (
        <Shell {...shell}>
          {/* `back` et non « aller aux paramètres » : on arrive ici depuis les
            paramètres OU depuis une annonce qu'on s'apprêtait à contacter, et
            c'est l'historique qui sait laquelle des deux. */}
          <Button
            variant="ghost"
            className="mb-2"
            onClick={() => {
              setEditingProfile(false);
              back();
            }}
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Retour
          </Button>
          {/* Le formulaire ne s'ouvre QUE pour modifier — huit champs dépliés
            en permanence, pour un profil qu'on remplit une fois, occupaient
            l'écran sans rien apprendre. SAUF quand il n'y a rien à résumer :
            un profil vide n'affichait qu'une phrase et un bouton « Renseigner
            mon profil », soit un écran entier pour un clic. On ouvre alors
            directement le formulaire. */}
          {editingProfile || profile === null ? (
            <ProfileForm
              initial={profile}
              onSave={(next) => {
                rememberProfile(next);
                setEditingProfile(false);
                // On revient d'où l'on venait : le profil n'est presque jamais
                // une fin en soi, il sert à écrire un message.
                back();
              }}
              onCancel={() => {
                setEditingProfile(false);
                back();
              }}
              onClear={() => {
                forgetProfile();
                setEditingProfile(false);
              }}
            />
          ) : (
            <ProfileSummary profile={profile} onEdit={() => setEditingProfile(true)} />
          )}
        </Shell>
      );
    }
    if (view === 'sources') {
      return (
        <Shell {...shell}>
          <SourcesPanel
            sources={sources}
            nowMs={nowMs}
            onBack={() => setView('profile')}
            onOpenSource={(sourceId) => void openSource(sourceId)}
          />
        </Shell>
      );
    }
    if (view === 'source' && selectedSourceId !== null) {
      return (
        <Shell {...shell}>
          <SourcePanel
            sourceId={selectedSourceId}
            state={sources.find((one) => one.sourceId === selectedSourceId) ?? null}
            listings={listings}
            nowMs={nowMs}
            onBack={() => setView('sources')}
            onSelect={openListing}
            onFavorite={(id, favorite) => void handleFavorite(id, favorite)}
          />
        </Shell>
      );
    }
    if (view === 'stats') {
      return (
        <Shell {...shell}>
          {/* SEUL ÉCRAN DES PARAMÈTRES SANS RETOUR : on y entrait par la liste
            des réglages et l'on ne pouvait en ressortir que par la barre
            d'onglets du bas, qui n'y ramène pas. */}
          <BackToSettings onBack={() => setView('profile')} />
          <StatsPanel />
        </Shell>
      );
    }
    if (view === 'detail') {
      return (
        <Shell {...shell}>
          {selected === null ? (
            <ListingDetailSkeleton />
          ) : (
            <ListingDetail
              listing={selected}
              profile={profile}
              nowMs={nowMs}
              onBack={() => setView('list')}
              onArchive={(archived) => void handleArchive(selected.id, archived)}
              onFavorite={(favorite) => void handleFavorite(selected.id, favorite)}
              onTrackingChange={(status) => void handleTrackingChange(status)}
              onContactRecorded={(channel, message, documents) =>
                void handleContactRecorded(channel, message, documents)
              }
              onOpenSource={(sourceId) => void openSource(sourceId)}
              onConfigureProfile={() => {
                // Venir de « Configurer mon profil », c'est vouloir le remplir :
                // le résumé ferait faire un clic de plus pour rien.
                setEditingProfile(true);
                setView('tenant');
              }}
            />
          )}
        </Shell>
      );
    }
    return null;
  };

  const secondary = secondaryView();
  if (secondary !== null) {
    return (
      <>
        {secondary}
        {overlay}
      </>
    );
  }

  // Deux compteurs distincts pour la liste : les annonces encore actives, et
  // celles qui ont disparu de leur source (affichées, mais à vérifier).
  const activeCount = filtered.filter((l) => l.lifecycle === 'active').length;
  const uncertainCount = filtered.filter((l) => l.lifecycle === 'possiblyInactive').length;
  // RÉINITIALISATION. « Par défaut » = le tri par priorité, les critères de
  // recherche dans les champs, aucune bascule, toutes les sources — c'est-à-dire
  // exactement l'écran d'ouverture. La recherche textuelle en fait partie : la
  // laisser en place après un « Réinitialiser » surprendrait.
  const somethingChanged = isDefaultView({
    sort,
    quickFilters,
    sourceCount: selectedSources.size,
    search,
    toggles: [favoritesOnly, showArchived, hideUncertain],
  });

  const resetSortAndFilters = (): void => {
    setSort('priority');
    setQuickFilters(DEFAULT_QUICK_FILTERS);
    setSelectedSources(new Set());
    setSearch('');
    setFavoritesOnly(false);
    setShowArchived(false);
    setHideUncertain(false);
  };

  const toolbarBadge = countActiveSettings({
    sort,
    sourceCount: selectedSources.size,
    toggles: [favoritesOnly, showArchived, hideUncertain],
  });

  const toggleSource = (sourceId: string): void =>
    setSelectedSources((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });

  return (
    <Shell
      view={view}
      favoritesOnly={favoritesOnly}
      onNavigate={navigate}
      unreadAlerts={unreadAlerts}
      bottomTab={bottomTab}
      onBottomSelect={selectBottomTab}
    >
      {isDemoMode() && (
        <p
          className="my-2 rounded-xl border border-border bg-primary/10 px-3 py-2 text-[0.85rem]"
          role="status"
        >
          Mode démonstration — données fictives. Définissez <code>VITE_API_URL</code> pour vous
          connecter à vos données.
        </p>
      )}

      {/* FAVORIS : rien que les cartes. Chercher, trier ou filtrer une liste
        qu'on a soi-même constituée n'a pas de sens — on y vient pour revoir ce
        qu'on a retenu, pas pour l'explorer. La barre entière disparaît donc,
        recherche comprise. */}
      {favoritesOnly ? (
        <header className="my-3 flex items-baseline gap-2">
          <h2 className="text-lg font-bold">Favoris</h2>
          {/* Le compteur est un repère, pas un sous-titre : il se lit à droite,
            comme celui de la liste principale — y compris sur téléphone. */}
          <span className="ml-auto text-sm font-semibold text-muted-foreground">
            {filtered.length} annonce{filtered.length > 1 ? 's' : ''}
          </span>
        </header>
      ) : (
        <div
          className="my-3 flex flex-col gap-2 text-sm"
          role="group"
          aria-label="Barre de filtres"
        >
          {/* Recherche et réglages occupent leur PROPRE RANGÉE, à toute largeur.
          La bascule et le compteur ne passaient dessous que par un repli de
          mobile ; sur grand écran tout s'alignait sur une seule ligne, et la
          recherche s'y trouvait comprimée entre des commandes sans rapport.
          Deux rangées explicites valent mieux qu'un `flex-wrap` dont le
          résultat dépend de la largeur. */}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher (quartier, rue, agence…)"
                aria-label="Rechercher une annonce"
                // 16 px (`text-base`) sur mobile : en dessous, iOS zoome
                // automatiquement à la mise au point et désaligne la page.
                className="w-full rounded-full pr-3 pl-9 text-base sm:min-h-9 sm:py-1.5 sm:text-sm"
              />
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>

            {/* LE TRI N'EST PLUS ICI. Il vivait dans cette modale, en tête d'une
              liste de filtres : on l'ouvrait pour changer d'ordre, ce qui
              obligeait à refermer pour voir le résultat. C'est un geste
              fréquent et sans conséquence — il a sa place à l'air libre, sous
              la barre de recherche. La modale ne garde que ce qui RESTREINT.
              Le libellé disparaît sur mobile : l'icône et la pastille
              suffisent, et la recherche gagne la place. */}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              aria-label="Filtres"
              onClick={() => setSortFilterOpen(true)}
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Filtres</span>
              {toolbarBadge > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                  {toolbarBadge}
                </span>
              )}
            </Button>
          </div>

          {/* Seconde rangée : bascule de vue et tri à gauche, compteur à droite. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* LE TRI À L'AIR LIBRE. Un `select` natif : c'est un choix unique
              parmi quatre, et le contrôle du système reste le plus sûr au doigt
              (§39, §65). L'intitulé est visuellement caché mais lu par les
              lecteurs d'écran — à l'œil, la valeur choisie se suffit. */}
            <label htmlFor="sort-select" className="sr-only">
              Trier par
            </label>
            <Select
              id="sort-select"
              size="sm"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="shrink-0"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            {/* Bascule Liste ⇄ Carte, SUR PETIT ÉCRAN SEULEMENT. Au-dessus de
              1024 px les deux s'affichent côte à côte : il n'y a plus rien à
              choisir, et un bouton qui ne change rien est pire qu'absent. */}
            <div
              className="inline-flex rounded-lg border border-border p-0.5 lg:hidden"
              role="group"
            >
              <button
                type="button"
                onClick={() => setDisplayMode('list')}
                aria-pressed={displayMode === 'list'}
                className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium transition-colors ${
                  displayMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List aria-hidden="true" className="size-4" /> Liste
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('map')}
                aria-pressed={displayMode === 'map'}
                className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium transition-colors ${
                  displayMode === 'map'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Map aria-hidden="true" className="size-4" /> Carte
              </button>
            </div>

            {/* Compteur de résultats, poussé à droite (repère façon SeLoger).
            Il distingue les annonces ACTIVES de celles disparues de leur source :
            un total unique laissait croire à deux fois plus d'opportunités, et
            divergeait du compteur de l'onglet Statistiques (§33, §17). */}
            {!loading && (
              <span className="ml-auto font-semibold text-muted-foreground" aria-live="polite">
                {activeCount} résultat{activeCount > 1 ? 's' : ''}
                {uncertainCount > 0 && (
                  <span className="font-normal"> · {uncertainCount} à vérifier</span>
                )}
              </span>
            )}
          </div>

          <SortFilterModal
            open={sortFilterOpen}
            onClose={() => setSortFilterOpen(false)}
            toggles={[
              ['Masquer les annonces à vérifier', hideUncertain, setHideUncertain],
              ['Favoris uniquement', favoritesOnly, setFavoritesOnly],
              ['Annonces archivées', showArchived, setShowArchived],
            ]}
            quickFilters={quickFilters}
            onQuickFiltersChange={setQuickFilters}
            availableTypes={availableTypes}
            sources={availableSources}
            selectedSources={selectedSources}
            onToggleSource={toggleSource}
            onClearSources={() => setSelectedSources(new Set())}
            resultCount={filtered.length}
            dirty={somethingChanged}
            onReset={resetSortAndFilters}
            onCriteriaSaved={() => void load()}
          />

          {/* Rangée des filtres rapides. */}
          <QuickFilters values={quickFilters} onChange={setQuickFilters} />
        </div>
      )}

      {error !== null && (
        <p className="rounded-xl border border-bad px-3 py-2 text-bad" role="alert">
          {error}
        </p>
      )}

      <SearchResults
        loading={loading}
        filtered={filtered}
        ranked={ranked}
        hot={hot}
        rest={rest}
        split={displayMode === 'map' || wideScreen}
        favoritesOnly={favoritesOnly}
        emptyBecauseFiltered={anyClientFilter({
          quickFilters,
          selectedSources,
          search,
          hideUncertain,
        })}
        onResetFilters={resetSortAndFilters}
        nowMs={nowMs}
        affinity={affinity}
        onOpen={openListing}
        onFavorite={(id, favorite) => void handleFavorite(id, favorite)}
      />
      {overlay}
    </Shell>
  );
}
