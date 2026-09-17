/**
 * Ce qu'il faut savoir du bulletin abonné BEP pour s'y connecter.
 *
 * DEUX MODULES SE CONNECTENT AU MÊME COMPTE PAYÉ : le scraper, qui lit le
 * bulletin à chaque passage, et `contact/bep-request.ts`, qui y dépose une
 * demande d'informations. Chacun portait sa copie des adresses et du pot à
 * cookies. Le jour où BEP déplace sa page de connexion, une seule des deux
 * aurait été corrigée — et l'autre aurait continué à taper sur une adresse
 * morte, sur un abonnement dont l'accès peut être retiré.
 *
 * Ce module ne décrit QUE le site : ses adresses et la façon dont il pose ses
 * cookies. Il n'enchaîne aucune requête — les deux appelants n'ont ni le même
 * budget, ni les mêmes comptes à rendre.
 */

const BASE = 'http://abonnes.beplogement.com';

/** Le POST de connexion. Il rend directement la page authentifiée. */
export const BEP_LOGIN_URL = `${BASE}/w_login_abonnes.php`;

/** Le bulletin lui-même : lu en GET, et destinataire du POST de demande. */
export const BEP_INDEX_URL = `${BASE}/w_index_abonnes.php`;

/**
 * Range les cookies d'un en-tête `Set-Cookie` dans un pot.
 *
 * Indexé par NOM : le site réémet le cookie de session à chaque réponse, et
 * une simple concaténation aurait envoyé les deux valeurs successives.
 */
export function collectCookies(headers: Headers, jar: Map<string, string>): void {
  for (const raw of headers.getSetCookie?.() ?? []) {
    const pair = raw.split(';')[0]?.trim();
    if (pair !== undefined && pair.includes('=')) {
      jar.set(pair.slice(0, pair.indexOf('=')), pair);
    }
  }
}

/** Le pot à cookies tel qu'un navigateur le renverrait. */
export function cookieHeader(jar: ReadonlyMap<string, string>): string {
  return [...jar.values()].join('; ');
}
