/**
 * La recherche partagée qu'un visiteur regarde, et le lien qu'il suit.
 *
 * DANS L'ONGLET SEULEMENT. Un visiteur n'a pas de compte où ranger des
 * critères : ils valent pour la session de navigation, puis s'effacent.
 *
 * Le stockage peut être refusé (navigation privée stricte, cookies bloqués) :
 * on continue alors sans mémoire plutôt que de tomber.
 */

import type { SavedSearch } from './saved-searches.js';
import { decodeSearch, encodeSearch } from './share-search.js';

const SEARCH_KEY = 'maioun.visitorSearch';
const TOKEN_KEY = 'maioun.pendingSharedToken';

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    // Sans stockage, la recherche vaut jusqu'au rechargement.
  }
}

/** Relue sous la forme du lien : la même vérification que pour un lien reçu. */
export function readVisitorSearch(): SavedSearch | null {
  const token = read(SEARCH_KEY);
  const shared = token === null ? null : decodeSearch(token);
  if (shared === null) return null;
  return { id: 'visiteur', createdAt: new Date(0).toISOString(), ...shared };
}

export function writeVisitorSearch(search: SavedSearch | null): void {
  write(SEARCH_KEY, search === null ? null : encodeSearch(search));
}

/** Le lien suivi avant de créer un compte, pour y revenir une fois connecté. */
export function readPendingSharedToken(): string | null {
  return read(TOKEN_KEY);
}

export function writePendingSharedToken(token: string | null): void {
  write(TOKEN_KEY, token);
}
