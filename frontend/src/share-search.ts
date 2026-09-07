/**
 * Partager une recherche par un lien (§39).
 *
 * ON NE POUVAIT PAS. Les recherches enregistrées vivent dans les réglages du
 * compte, et aucune adresse ne les portait : montrer la sienne à quelqu'un
 * demandait de lui dicter sept réglages, qu'il retapait de travers.
 *
 * TOUT EST DANS LE LIEN, rien en base. Un partage n'écrit RIEN chez celui qui
 * partage — pas de table de liens, pas d'identifiant à faire vivre, pas de
 * page à servir plus tard : le lien porte la recherche elle-même. Il continue
 * donc de fonctionner sans nous, et rien ne fuit d'un compte à l'autre.
 *
 * CE QUI VOYAGE, ET CE QUI NE VOYAGE PAS. La recherche : budget, surface,
 * commune, quartiers, exclusions, tri, sources retenues, texte cherché. Rien
 * d'autre — ni le nom du compte, ni ses favoris, ni son profil, ni ses
 * adresses de référence. Un lien de recherche ne dit pas qui l'a écrit.
 *
 * BASE64URL, ET NON UN CHAMP DE REQUÊTE PAR RÉGLAGE. Une adresse avec quinze
 * paramètres se coupe en deux dans un message, se réencode dans un client mail
 * et arrive brisée. Un jeton d'un seul tenant survit au copier-coller.
 */

import type { SavedSearch } from './saved-searches.js';

/** Ce que le lien transporte : un nom, les critères, l'affinage. */
type SharedPayload = Pick<SavedSearch, 'name' | 'criteria' | 'view'>;

/**
 * Longueur au-delà de laquelle on refuse de décoder.
 *
 * Un lien légitime pèse quelques centaines de caractères. Ce plafond ne
 * protège pas d'un attaquant — il n'y a rien à attaquer, tout est local — mais
 * d'une adresse tronquée ou bricolée qu'on tenterait d'analyser sans fin.
 */
const MAX_TOKEN = 4000;

/** Octets → base64url, sans remplissage : `+/=` ne survivent pas à une URL. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): Uint8Array {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/**
 * Le jeton à glisser dans un lien.
 *
 * L'ENCODAGE PASSE PAR UTF-8, et il le faut : `btoa` refuse tout caractère
 * au-delà de 255, et un nom de recherche français en porte au premier accent.
 */
export function encodeSearch(search: SharedPayload): string {
  const payload: SharedPayload = {
    name: search.name,
    criteria: search.criteria,
    view: search.view,
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * Le contenu d'un jeton, ou `null` s'il n'en est pas un.
 *
 * NE LÈVE JAMAIS (§69). Un lien tronqué, réécrit par un client mail ou
 * simplement inventé est une chose banale ; l'écran doit pouvoir dire « ce
 * lien n'est pas lisible » plutôt que tomber.
 *
 * ON VÉRIFIE LA FORME, pas seulement le décodage : un JSON valide n'est pas
 * une recherche. Sans ce contrôle, un objet quelconque irait s'écrire dans les
 * critères du destinataire, où il resterait à demeure.
 */
export function decodeSearch(token: string): SharedPayload | null {
  if (token === '' || token.length > MAX_TOKEN) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(token));
    const parsed = JSON.parse(json) as Partial<SharedPayload>;
    const { criteria, view } = parsed;
    if (criteria === undefined || view === undefined) return null;
    if (typeof criteria.maxPrice !== 'number' || typeof criteria.minArea !== 'number') return null;
    if (!Array.isArray(criteria.cities)) return null;
    return {
      name:
        typeof parsed.name === 'string' && parsed.name !== '' ? parsed.name : 'Recherche partagée',
      criteria,
      view,
    };
  } catch {
    return null;
  }
}
