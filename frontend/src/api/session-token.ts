/**
 * Le jeton de session gardé par la page, en plus du cookie.
 *
 * LE COOKIE NE TIENT PAS PARTOUT. Il est posé par l'API, sur un autre domaine
 * que le site : c'est un cookie tiers. Brave le range dans un stockage
 * éphémère, effacé quand on ferme les onglets du site ; Safari le refuse. On se
 * retrouvait déconnecté à chaque réouverture.
 *
 * Le stockage LOCAL du site, lui, est conservé par tous. L'API y remet le jeton
 * (en-tête `X-Session-Token`) à la connexion et à chaque ouverture ; la page le
 * renvoie en `Authorization`. Le cookie reste envoyé : les navigateurs qui le
 * gardent n'y perdent rien.
 *
 * Accessible au JavaScript de la page, contrairement au cookie `HttpOnly` —
 * c'est le prix. Le jeton est signé, expire au bout de 30 jours d'inactivité,
 * et ne permet ni de changer le mot de passe ni de supprimer le compte, qui
 * redemandent tous deux le mot de passe.
 */

const KEY = 'maioun.session';
const HEADER = 'X-Session-Token';

/** Le stockage peut être refusé (navigation privée stricte) : on fait sans. */
function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à effacer */
  }
}

/**
 * `fetch` vers l'API : cookie ET jeton, et le jeton renouvelé quand la réponse
 * en porte un. Tous les appels authentifiés passent par ici.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = read();
  const headers = new Headers(init.headers);
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
