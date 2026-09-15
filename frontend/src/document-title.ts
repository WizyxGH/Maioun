/**
 * Le titre de l'onglet, écran par écran.
 *
 * L'application gardait « Maïoun — locations à Nice » partout. Un lecteur
 * d'écran annonce ce titre à chaque changement de page : sans lui, rien ne dit
 * qu'on a quitté la liste pour une fiche. C'est aussi ce que montrent
 * l'historique, les favoris du navigateur et les onglets ouverts.
 */

import { useEffect } from 'react';
import type { Route, View } from './router.js';
import type { ListingView } from './types.js';
import { formatPrice, formatPropertyType } from './format.js';

const SITE = 'Maïoun';

const LABELS: Readonly<Record<View, string>> = {
  home: 'Accueil',
  list: 'Recherche',
  detail: 'Annonce',
  stats: 'Statistiques',
  profile: 'Paramètres',
  tenant: 'Profil locataire',
  documents: 'Dossier',
  reference: 'Points de référence',
  saved: 'Recherches enregistrées',
  notifications: 'Notifications',
  access: 'Accès',
  plan: 'Abonnement',
  theme: 'Apparence',
  sources: 'Sources',
  source: 'Source',
  agencies: 'Agences',
  agency: 'Agence',
  alerts: 'Alertes des portails',
  login: 'Connexion',
  forgot: 'Mot de passe oublié',
  reset: 'Nouveau mot de passe',
  signup: 'Créer un compte',
  confirm: 'Confirmation de l’adresse',
  shared: 'Recherche partagée',
  onboarding: 'Bienvenue',
};

export function documentTitle(
  view: View,
  context: {
    /** Pour une fiche : ce qui la nomme, déjà mis en forme (« Studio · 650 € »). */
    readonly listing?: string | null;
    readonly agency?: string | null;
    readonly favoritesOnly?: boolean;
  } = {},
): string {
  if (view === 'home') return `${SITE} — locations à Nice`;
  const label =
    view === 'detail' && context.listing
      ? context.listing
      : view === 'agency' && context.agency
        ? context.agency
        : view === 'list' && context.favoritesOnly === true
          ? 'Favoris'
          : LABELS[view];
  return `${label} — ${SITE}`;
}

/** « Studio · Libération · 650 € » : ce qui nomme une annonce dans un onglet. */
export function listingTitle(listing: ListingView): string {
  return [
    formatPropertyType(listing.propertyType.value),
    listing.district?.value ?? null,
    listing.price.value === null ? null : formatPrice(listing.price.value),
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

/** Tient `document.title` à jour avec l'écran affiché. */
export function useDocumentTitle(route: Route, selected: ListingView | null): void {
  const title = documentTitle(route.view, {
    listing: selected === null ? null : listingTitle(selected),
    agency: route.view === 'agency' ? (route.id ?? null) : null,
    favoritesOnly: route.view === 'list' && route.favoritesOnly === true,
  });
  useEffect(() => {
    document.title = title;
  }, [title]);
}
