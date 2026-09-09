/**
 * Vérifier un jeton d'identité Google (§26).
 *
 * CE MODULE EST UNE FRONTIÈRE DE SÉCURITÉ. Ce qu'il accepte ouvre une session
 * au nom de quelqu'un. Il ne fait donc confiance à RIEN de ce qu'il reçoit : le
 * jeton arrive du navigateur, c'est-à-dire de la partie du système sur laquelle
 * nous n'avons aucune prise.
 *
 * PAS DE REDIRECTION OAUTH, et c'est délibéré. Google Identity Services rend un
 * jeton d'identité directement dans la page ; celle-ci le POSTe ici. Le
 * détour classique — rediriger vers Google, revenir avec un code, l'échanger —
 * ferait traverser deux fois une frontière de domaine, alors que le site et
 * l'API sont DÉJÀ sur deux domaines distincts et que le cookie de session y
 * survit tout juste (`SameSite=None; Partitioned`). Une redirection de plus,
 * c'était un troisième aller-retour à faire tenir dans cet équilibre.
 *
 * LES QUATRE VÉRIFICATIONS, ET LEUR ORDRE D'IMPORTANCE :
 *
 *   1. LA SIGNATURE, contre les clés publiques que Google publie. Sans elle,
 *      n'importe qui forge un jeton disant ce qu'il veut ;
 *   2. `aud`, l'application DESTINATAIRE. C'est la vérification qu'on oublie,
 *      et c'est la plus traître : un jeton parfaitement signé par Google, émis
 *      pour une AUTRE application, resterait valide ici. N'importe quel site
 *      tiers utilisant Google pourrait alors rejouer les jetons de ses propres
 *      visiteurs pour entrer dans leurs comptes Maïoun ;
 *   3. `iss`, l'émetteur, et `exp`, l'expiration ;
 *   4. `email_verified` — Google laisse exister des comptes dont l'adresse
 *      n'est pas prouvée. Rattacher un compte existant sur une adresse non
 *      vérifiée le livrerait à qui la déclare.
 *
 * ON NE LIT QUE CE QU'ON VÉRIFIE. La charge utile n'est décodée qu'APRÈS que
 * la signature ait été validée : décoder d'abord pour « juste regarder le
 * `kid` » est justement la façon dont on finit par croire un champ non signé.
 * Seul l'en-tête est lu avant, et rien qu'il contient ne sert de décision —
 * il ne sert qu'à choisir laquelle des clés de Google essayer.
 */

/** Les clés publiques de Google, au format JWK. */
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Les deux formes que prend l'émetteur dans les jetons Google. */
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Tolérance d'horloge, dans les deux sens.
 *
 * Les horloges dérivent. Refuser un jeton émis « dans deux secondes » pour
 * cette seule raison produirait des échecs de connexion inexplicables, sans
 * rien protéger — la signature, elle, reste exigée.
 */
const CLOCK_SKEW_MS = 60_000;

/** Ce qu'on retient d'un jeton reconnu. Rien de plus (§26). */
export interface GoogleIdentity {
  /** Identifiant STABLE du compte Google. C'est lui qui fait le lien. */
  readonly sub: string;
  readonly email: string;
  readonly name: string | null;
}

interface JsonWebKey_ {
  readonly kid?: string;
  readonly alg?: string;
  readonly kty?: string;
  readonly n?: string;
  readonly e?: string;
  readonly use?: string;
}

/**
 * Les clés de Google, gardées le temps qu'elles valent.
 *
 * Google les fait tourner ; on les redemande quand elles expirent, et aussi
 * quand un `kid` inconnu se présente — c'est le signe d'une rotation qu'on
 * n'avait pas vue passer.
 */
let cachedKeys: { readonly keys: readonly JsonWebKey_[]; readonly until: number } | null = null;

/** Vide le cache. Réservé aux tests, pour qu'ils ne s'influencent pas. */
export function resetGoogleKeyCache(): void {
  cachedKeys = null;
}

async function googleKeys(
  nowMs: number,
  doFetch: typeof fetch,
  force: boolean,
): Promise<readonly JsonWebKey_[]> {
  if (!force && cachedKeys !== null && cachedKeys.until > nowMs) return cachedKeys.keys;

  const response = await doFetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`clés Google indisponibles (${response.status})`);
  const body = (await response.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as JsonWebKey_[]) : [];

  // On suit la durée que Google annonce, sans dépasser une heure : garder une
  // clé plus longtemps qu'il ne le dit reviendrait à accepter un jeton signé
  // par une clé qu'il a retirée.
  const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
  const seconds = Math.min(3_600, Math.max(60, Number(maxAge ?? 3_600)));
  cachedKeys = { keys, until: nowMs + seconds * 1_000 };
  return keys;
}

/** Décode un segment `base64url` en octets. */
function fromBase64Url(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Décode un segment `base64url` en objet JSON. `null` si ce n'en est pas un. */
function jsonSegment(segment: string | undefined): Record<string, unknown> | null {
  if (segment === undefined) return null;
  try {
    const text = new TextDecoder().decode(fromBase64Url(segment));
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Vrai si la signature du jeton est celle d'une des clés fournies. */
async function signatureMatches(
  keys: readonly JsonWebKey_[],
  kid: string,
  signed: string,
  signature: Uint8Array,
): Promise<boolean> {
  const jwk = keys.find((key) => key.kid === kid);
  // Un `kid` absent de la liste n'est pas un échec de signature : c'est une
  // clé qu'on ne connaît pas encore. L'appelant redemandera la liste.
  if (jwk === undefined || jwk.kty !== 'RSA') return false;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n ?? '', e: jwk.e ?? '', alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return false;
  }

  return await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature as unknown as BufferSource,
    new TextEncoder().encode(signed) as unknown as BufferSource,
  );
}

/**
 * L'identité portée par un jeton Google, ou `null` s'il n'est pas digne de foi.
 *
 * `null` POUR TOUTES LES RAISONS À LA FOIS, et c'est voulu : signature fausse,
 * mauvaise application, jeton périmé, adresse non vérifiée. Dire laquelle
 * n'aiderait que celui qui cherche laquelle contourner (§26).
 *
 * @param credential le jeton, tel que la page l'a reçu de Google.
 * @param clientId   NOTRE identifiant d'application. Sans lui, rien n'est
 *                   accepté : un `aud` qu'on ne compare à rien ne protège rien.
 */
export async function verifyGoogleToken(
  credential: string,
  clientId: string,
  nowMs: number,
  fetchImpl?: typeof fetch,
): Promise<GoogleIdentity | null> {
  if (clientId === '') return null;

  const parts = credential.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  const header = jsonSegment(rawHeader);
  // RS256 UNIQUEMENT. Accepter l'algorithme que le jeton s'attribue est la
  // faille classique des JWT : `alg: none` ferait passer un jeton sans
  // signature, et `HS256` inviterait à vérifier avec une clé PUBLIQUE prise
  // pour un secret partagé.
  if (header === null || header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') {
    return null;
  }

  const doFetch = fetchImpl ?? fetch;
  const signed = `${rawHeader}.${rawPayload}`;
  const signature = fromBase64Url(rawSignature);

  let verified = false;
  try {
    verified = await signatureMatches(
      await googleKeys(nowMs, doFetch, false),
      header['kid'],
      signed,
      signature,
    );
    // Une clé inconnue vaut une rotation manquée : on redemande la liste, une
    // seule fois. Sans cela, chaque rotation de Google couperait les
    // connexions jusqu'à l'expiration du cache.
    if (!verified) {
      verified = await signatureMatches(
        await googleKeys(nowMs, doFetch, true),
        header['kid'],
        signed,
        signature,
      );
    }
  } catch {
    return null;
  }
  if (!verified) return null;

  // À PARTIR D'ICI SEULEMENT, la charge utile veut dire quelque chose.
  const payload = jsonSegment(rawPayload);
  if (payload === null) return null;

  if (typeof payload['iss'] !== 'string' || !ISSUERS.has(payload['iss'])) return null;
  // LA VÉRIFICATION QU'ON OUBLIE. Voir l'en-tête du module.
  if (payload['aud'] !== clientId) return null;

  const exp = payload['exp'];
  if (typeof exp !== 'number' || exp * 1_000 + CLOCK_SKEW_MS < nowMs) return null;
  const iat = payload['iat'];
  if (typeof iat === 'number' && iat * 1_000 - CLOCK_SKEW_MS > nowMs) return null;

  const sub = payload['sub'];
  const email = payload['email'];
  if (typeof sub !== 'string' || sub === '') return null;
  if (typeof email !== 'string' || email === '') return null;
  // Google laisse exister des comptes dont l'adresse n'est pas prouvée : c'est
  // sur elle qu'on rattache un compte existant, elle doit donc être sûre.
  if (payload['email_verified'] !== true) return null;

  const name = payload['name'];
  return {
    sub,
    email: email.trim().toLowerCase(),
    name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
  };
}
