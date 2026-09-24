/**
 * Le jeton de session gardé par la page, en plus du cookie.
 *
 * LE COOKIE NE TIENT PAS PARTOUT. Il est posé par l'API, sur un autre domaine
 * que le site : c'est un cookie tiers. Brave le range dans un stockage
 * éphémère, effacé quand on ferme les onglets du site ; Safari le refuse. On se
 * retrouvait déconnecté à chaque réouverture.
 *
 * Le stockage LOCAL du site, lui, est conservé par tous. L'API y remet le jeton
 * (en-tête `X-Session-Token`) ; la page le renvoie en `Authorization`. Le
 * cookie reste envoyé : les navigateurs qui le gardent n'y perdent rien.
 *
 * LISIBLE PAR LA PAGE, MAIS INUTILE AILLEURS. Le jeton est lié à la clé
 * d'appareil (`session-key.ts`), que personne ne peut extraire : chaque
 * requête la prouve par une signature, et l'API refuse le jeton sans elle.
 */

import { forgetSessionKey, proofHeaders } from './session-key.js';
import { SESSION_TOKEN_HEADER } from '@maioun/shared';

const KEY = 'maioun.session';
const HEADER = SESSION_TOKEN_HEADER;

/** Le stockage peut être refusé (navigation privée stricte) : on fait sans. */
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * `true` si ce navigateur détient un jeton de session.
 *
 * Ne dit PAS qu'il est encore valable — seul l'API le sait. Il sert à savoir
 * si une requête partira signée, donc si la réponse sera celle d'un compte :
 * cela suffit à lancer la liste sans attendre de savoir QUI regarde.
 */
export function hasSessionToken(): boolean {
  return read() !== null;
}

/** Le jeton seul, que l'API ne reconnaît plus (expiré, compte supprimé). */
export function dropSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
}

/** Déconnexion : le jeton ET la clé qui le liait. */
export async function clearSessionToken(): Promise<void> {
  dropSessionToken();
  await forgetSessionKey();
}

/**
 * `fetch` vers l'API : cookie, jeton, preuve de la clé — et le jeton renouvelé
 * quand la réponse en porte un. Tous les appels authentifiés passent par ici.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = read();
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(await proofHeaders(init.method ?? 'GET', url))) {
    headers.set(name, value);
  }
  if (token !== null && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers, credentials: 'include' });
  const renewed = response.headers.get(HEADER);
  if (renewed !== null && renewed !== '') {
    try {
      localStorage.setItem(KEY, renewed);
    } catch {
      /* le cookie fera ce qu'il peut */
    }
  }
  return response;
}
