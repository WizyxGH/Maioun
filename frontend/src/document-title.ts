/**
 * Le titre et les métadonnées de la page, écran par écran.
 *
 * L'application gardait « Maïoun — locations à Nice » partout. Un lecteur
 * d'écran annonce ce titre à chaque changement de page : sans lui, rien ne dit
 * qu'on a quitté la liste pour une fiche. C'est aussi ce que montrent
 * l'historique, les favoris du navigateur et les onglets ouverts.
 *
 * La description, l'aperçu de partage et l'adresse canonique suivent : un lien
 * copié depuis une fiche porte le nom et l'adresse de cette fiche, pas ceux de
 * l'accueil. Les robots qui n'exécutent pas le JavaScript voient toujours
 * l'aperçu d'accueil d'`index.html` — le site est statique.
 */

import { useEffect } from 'react';
import type { Route, View } from './router.js';
import type { ListingView } from './types.js';
import {
  formatArea,
  formatCity,
  formatDistrict,
  formatPrice,
  formatPropertyType,
  formatSourceName,
} from './format.js';

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

const DEFAULT_DESCRIPTION =
  'Les annonces de location de Nice, sans doublons, avec les alertes, le suivi des contacts et votre dossier.';

/** Ce que dit chaque écran de lui-même, quand il n'a rien de plus précis. */
const DESCRIPTIONS: Readonly<Partial<Record<View, string>>> = {
  home: DEFAULT_DESCRIPTION,
  list: 'Toutes les locations de Nice au même endroit, filtrées selon vos critères.',
  stats: 'Loyers, délais de location et évolution du marché locatif niçois.',
  sources: 'Les sites et agences que Maïoun lit, et leur état de collecte.',
  agencies: 'Les agences immobilières de Nice et leurs annonces de location.',
  saved: 'Vos recherches enregistrées et le nombre d’annonces de chacune.',
  alerts: 'Relier les alertes des portails à Maïoun en quelques clics.',
  login: 'Connexion à Maïoun.',
  signup: 'Créer un compte Maïoun, gratuit et sans publicité.',
  shared: 'Une recherche de location à Nice partagée depuis Maïoun.',
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

/** Au-delà, un aperçu de partage est coupé par les messageries. */
const DESCRIPTION_MAX = 160;

/** « Studio de 22 m² à louer à Nice, Libération, 650 € par mois. Lumineux… » */
export function listingDescription(listing: ListingView): string {
  const where = [
    listing.city.value === null ? null : formatCity(listing.city.value),
    listing.district?.value ? formatDistrict(listing.district.value) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const facts = [
    `${formatPropertyType(listing.propertyType.value)}${
      listing.area.value === null ? '' : ` de ${formatArea(listing.area.value)}`
    } à louer${where === '' ? '' : ` à ${where}`}`,
    listing.price.value === null ? null : `${formatPrice(listing.price.value)} par mois`,
  ]
    .filter(Boolean)
    .join(', ');
  const text = (listing.description?.value ?? '').replace(/\s+/g, ' ').trim();
  const full = text === '' ? `${facts}.` : `${facts}. ${text}`;
  return full.length <= DESCRIPTION_MAX ? full : `${full.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

export interface DocumentMeta {
  readonly title: string;
  readonly description: string;
  /** Photo propre à la page ; `null` garde l'image de partage du site. */
  readonly image: string | null;
}

export function documentMeta(route: Route, selected: ListingView | null): DocumentMeta {
  const title = documentTitle(route.view, {
    listing: selected === null ? null : listingTitle(selected),
    agency: route.view === 'agency' ? (route.id ?? null) : null,
    favoritesOnly: route.view === 'list' && route.favoritesOnly === true,
  });
  if (route.view === 'detail' && selected !== null) {
    return {
      title,
      description: listingDescription(selected),
      image: selected.imageUrls[0] ?? null,
    };
  }
  const description =
    route.view === 'agency' && route.id !== undefined
      ? `Les annonces de location de l’agence ${route.id} à Nice.`
      : route.view === 'source' && route.id !== undefined
        ? `Les annonces de location publiées par ${formatSourceName(route.id)}, lues par Maïoun.`
        : route.view === 'list' && route.favoritesOnly === true
          ? 'Vos annonces favorites.'
          : (DESCRIPTIONS[route.view] ?? DEFAULT_DESCRIPTION);
  return { title, description, image: null };
}

/** Pose la valeur d'une balise `<meta>` ou `<link>`, en la créant au besoin. */
function setTag(
  tag: 'meta' | 'link',
  key: string,
  keyValue: string,
  attribute: string,
  value: string,
): void {
  let element = document.head.querySelector<HTMLElement>(`${tag}[${key}="${keyValue}"]`);
  if (element === null) {
    element = document.createElement(tag);
    element.setAttribute(key, keyValue);
    document.head.append(element);
  }
  element.setAttribute(attribute, value);
}

/** Tient le titre, la description, l'aperçu de partage et l'adresse canonique à jour. */
export function useDocumentMeta(route: Route, selected: ListingView | null): void {
  const { title, description, image } = documentMeta(route, selected);
  const path = typeof window === 'undefined' ? '' : window.location.pathname;
  useEffect(() => {
    // L'image du site, notée une fois depuis index.html, sert de repli.
    const og = document.head.querySelector('meta[property="og:image"]');
    const siteImage = og?.getAttribute('data-site') ?? og?.getAttribute('content') ?? '';
    og?.setAttribute('data-site', siteImage);
    const url = `${window.location.origin}${window.location.pathname}`;

    document.title = title;
    setTag('meta', 'name', 'description', 'content', description);
    setTag('meta', 'property', 'og:title', 'content', title);
    setTag('meta', 'property', 'og:description', 'content', description);
    setTag('meta', 'property', 'og:url', 'content', url);
    setTag('meta', 'property', 'og:image', 'content', image ?? siteImage);
    setTag('meta', 'name', 'twitter:title', 'content', title);
    setTag('meta', 'name', 'twitter:description', 'content', description);
    setTag('meta', 'name', 'twitter:image', 'content', image ?? siteImage);
    setTag('link', 'rel', 'canonical', 'href', url);
  }, [title, description, image, path]);
}
