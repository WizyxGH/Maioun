/**
 * La photo d'une notification, quand la source la publie en `http`.
 *
 * LES ANNONCES BEP ARRIVAIENT SANS IMAGE, et c'est l'accès PAYÉ qui en
 * souffrait le plus. Leur bulletin publie ses clichés sur des serveurs qui ne
 * parlent que le `http` — `beptransaction.com`, `abonnes.beplogement.com`,
 * aucun des deux ne répond en `https`. Un service worker ne charge pas une
 * image `http` : la notification s'affichait donc nue, là où les autres
 * sources montrent une photo.
 *
 * LE RELAIS EXISTAIT DÉJÀ, pour l'écran. `frontend/src/photos.ts` fait
 * exactement cela depuis le navigateur : il fait passer l'URL par
 * `/api/photo?url=…`, que le Worker va chercher en `http` côté serveur et rend
 * en `https`. Les notifications, elles, étaient restées sur l'URL brute — le
 * correctif n'avait été appliqué qu'à moitié.
 *
 * C'EST LE WORKER QUI DÉCIDE, PAS CE FICHIER. On ne tient pas ici une seconde
 * liste d'hôtes autorisés : deux listes divergent. Le Worker refuse ce qui
 * n'est pas sur la sienne, et l'image manque alors — soit le comportement
 * d'aujourd'hui, pas pire.
 *
 * §11 : rien n'est téléchargé ni réhébergé. L'octet traverse.
 */

/** L'URL de l'API, ou `''` quand la collecte tourne sans Worker configuré. */
function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env['API_URL'] ?? '').trim().replace(/\/$/, '');
}

/**
 * Ce qu'on met dans le champ `image` d'une notification.
 *
 * Rend un objet vide plutôt que `{ image: undefined }` : le premier disparaît
 * de la charge utile, le second y met une clé sans valeur.
 */
export function imagePayload(url: string | undefined): { image?: string } {
  const image = notificationImage(url);
  return image === null ? {} : { image };
}

/**
 * L'adresse à laquelle la notification ira chercher la photo.
 *
 * `null` quand il n'y a rien à montrer — pas de photo, ou une photo `http`
 * sans Worker pour la relayer. Annoncer une image qui ne chargera pas ne rend
 * service à personne (§17).
 */
export function notificationImage(
  url: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (url === undefined || url === '') return null;
  if (!url.startsWith('http://')) return url;
  const api = apiUrl(env);
  if (api === '') return null;
  return `${api}/api/photo?url=${encodeURIComponent(url)}`;
}
