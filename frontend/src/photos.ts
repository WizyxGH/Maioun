/**
 * Photos affichables, et photos seulement atteignables par un lien.
 *
 * LE PROBLÈME. Le bulletin abonné de BEP publie ses photos sur des serveurs
 * qui ne parlent QUE le http (`beptransaction.com`, `abonnes.beplogement.com`
 * — vérifié le 2026-09-04 : aucun des deux ne répond en https). Le site, lui,
 * est servi en https par GitHub Pages, et tout navigateur bloque une image
 * http sur une page https. Les 325 photos du bulletin étaient donc collectées,
 * stockées, passées au carrousel… et jamais affichées : le `onError` les
 * retirait une à une, l'annonce finissait sans image, sans que rien ne dise
 * pourquoi.
 *
 * CE QU'ON EN FAISAIT, ET POURQUOI ÇA A CHANGÉ. On se contentait de distinguer
 * ce que la page peut MONTRER de ce qu'elle ne peut qu'OUVRIR, en proposant un
 * lien pour le second : pas de proxy, au nom du §11. Mais un lien n'est pas une
 * photo. Sur une liste, on regarde des images ; ouvrir un onglet par cliché
 * pour juger d'un logement, personne ne le fait. Les 325 photos du bulletin
 * restaient donc invisibles en pratique, et les annonces BEP — celles d'un
 * accès PAYÉ — s'affichaient sans une image quand les autres en avaient dix.
 *
 * Elles passent désormais par le RELAIS du Worker (`photo-relay.ts`), qui va
 * les chercher en http côté serveur et les rend en https. Cela ne contrevient
 * pas au §11 : rien n'est téléchargé ni réhébergé, l'octet traverse et n'est
 * conservé nulle part — seul le cache de Cloudflare, devant l'origine, en garde
 * une copie temporaire.
 *
 * C'EST LE WORKER QUI DÉCIDE, PAS CE FICHIER. On relaie toute URL http sans
 * tenir ici une seconde liste d'hôtes autorisés : deux listes divergent, et
 * celle du navigateur ne protège personne puisqu'elle est modifiable. Le Worker
 * refuse ce qui n'est pas sur la sienne, l'image échoue, et le `onError` la
 * retire — exactement le comportement d'avant pour ces cas-là.
 *
 * Le partage dépend de la page elle-même : servie en http (mode auto-hébergé
 * local), elle affiche parfaitement une image http, et le relais est inutile.
 */

import { API_URL } from './api/client.js';

/** Photos d'une annonce, réparties selon ce que la page peut en faire. */
export interface PhotoSplit {
  /** Affichables telles quelles dans une balise `<img>`. */
  readonly embeddable: readonly string[];
  /**
   * Bloquées par le navigateur si on tentait de les afficher, mais parfaitement
   * ouvrables dans un onglet.
   */
  readonly linkOnly: readonly string[];
}

/** `true` si la page courante est servie en https (donc contenu mixte bloqué). */
function pageIsSecure(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:';
}

/**
 * Répartit les photos d'une annonce.
 *
 * @param urls  URLs telles que la source les publie.
 */
export function splitPhotos(urls: readonly string[]): PhotoSplit {
  if (!pageIsSecure()) return { embeddable: urls, linkOnly: [] };
  const embeddable: string[] = [];
  const linkOnly: string[] = [];
  for (const url of urls) {
    if (!url.startsWith('http://')) {
      embeddable.push(url);
      continue;
    }
    const relayed = relayedPhoto(url);
    // Sans Worker configuré (démo, développement sans API), il n'y a personne
    // pour relayer : la photo reste seulement ouvrable, comme avant.
    if (relayed === null) linkOnly.push(url);
    else embeddable.push(relayed);
  }
  return { embeddable, linkOnly };
}

/**
 * L'URL de la même photo, servie en https par le Worker.
 *
 * `null` quand aucune API n'est configurée — il n'y a alors rien pour relayer,
 * et prétendre le contraire produirait une image qui ne charge jamais.
 *
 * L'URL d'origine part en paramètre, encodée : c'est le Worker qui vérifie
 * qu'elle est relayable, et lui seul.
 */
export function relayedPhoto(url: string): string | null {
  if (API_URL === '') return null;
  return `${API_URL.replace(/\/$/, '')}/api/photo?url=${encodeURIComponent(url)}`;
}
