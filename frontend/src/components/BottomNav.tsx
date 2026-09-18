/**
 * Barre de navigation basse, MOBILE UNIQUEMENT (§39).
 *
 * Les onglets du haut défilaient horizontalement : sur un téléphone, la moitié
 * d'entre eux vivait hors de l'écran, et rien ne disait qu'il fallait glisser
 * pour les atteindre. Quatre destinations fixes, au pouce, valent mieux qu'une
 * rangée coulissante.
 *
 * « Favoris » n'est pas une vue à part mais la liste filtrée : le même état
 * sert au réglage de la modale, sinon deux sources de vérité finiraient par
 * diverger.
 *
 * ELLE NE S'AFFICHE QUE SUR SES QUATRE DESTINATIONS. Elle suivait partout —
 * fiche d'annonce, fiche d'agence, réglages, écran d'une source — où elle
 * n'avait rien à désigner : quatre onglets dont aucun n'était l'écran courant,
 * et un « Retour » juste au-dessus qui, lui, savait où ramener. C'est
 * `TABS` qui décide, par sa table de destinations : une page ajoutée demain
 * n'aura pas la barre sans y être inscrite, au lieu de compter sur une liste
 * d'exceptions qu'il faudrait penser à tenir à jour.
 */

import { sameRoute, type Route } from '../router.js';
import { Heart, Home, Search, Settings, type IconComponent } from './icons.js';

export type BottomTab = 'home' | 'search' | 'favorites' | 'settings';

const TABS: readonly {
  readonly key: BottomTab;
  readonly label: string;
  readonly Icon: IconComponent;
  /** L'écran que cet onglet désigne — et le seul où la barre se montre. */
  readonly target: Route;
}[] = [
  { key: 'home', label: 'Accueil', Icon: Home, target: { view: 'home' } },
  { key: 'search', label: 'Recherche', Icon: Search, target: { view: 'list' } },
  {
    key: 'favorites',
    label: 'Favoris',
    Icon: Heart,
    target: { view: 'list', favoritesOnly: true },
  },
  { key: 'settings', label: 'Paramètres', Icon: Settings, target: { view: 'profile' } },
];

/**
 * L'onglet qui désigne cet écran, ou `null` s'il n'en est pas un — auquel cas
 * la barre ne s'affiche pas du tout.
 *
 * C'est la MÊME table qui allume un onglet et qui autorise la barre : on ne
 * peut donc pas se retrouver avec une barre dont aucun onglet ne correspond à
 * l'écran, ce qui était le cas sur une fiche ou dans un sous-écran des
 * réglages.
 */
export function bottomTabForRoute(route: Route): BottomTab | null {
  return TABS.find((tab) => sameRoute(tab.target, route))?.key ?? null;
}

export function BottomNav({
  active,
  onSelect,
}: {
  readonly active: BottomTab;
  readonly onSelect: (tab: BottomTab) => void;
}): React.JSX.Element {
  return (
    <nav
      aria-label="Navigation"
      // `pb-[env(safe-area-inset-bottom)]` : sur iPhone, la barre système
      // recouvrirait sinon la rangée d'icônes.
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="flex">
        {TABS.map(({ key, label, Icon }) => (
          <li key={key} className="flex-1">
            <button
              type="button"
              onClick={() => onSelect(key)}
              aria-current={active === key ? 'page' : undefined}
              className={`flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-0.5 transition-colors ${
                active === key ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {/* L'ONGLET ACTIF EST PLEIN. La couleur seule le distinguait, ce
                qui est peu sur une barre de quatre icônes grises — et rien du
                tout pour qui distingue mal les couleurs. La forme, elle, se
                voit du coin de l'œil. */}
              <Icon
                aria-hidden="true"
                weight={active === key ? 'fill' : 'regular'}
                className="size-5"
              />
              <span className="text-[0.68rem] font-medium">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
