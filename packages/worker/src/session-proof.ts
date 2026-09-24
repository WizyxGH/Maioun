/**
 * La preuve qu'une requête vient de l'appareil qui a ouvert la session.
 *
 * LE JETON SEUL NE SUFFIT PLUS. La page garde un jeton de session là où son
 * JavaScript peut le lire (le cookie tiers ne tient pas sur Brave ni Safari) :
 * une faille dans le site suffirait à le copier. Il est donc LIÉ à une clé
 * ECDSA que le navigateur a créée non exportable — le code de la page peut
 * s'en servir pour signer, jamais la lire. Le jeton porte l'empreinte de la
 * clé ; chaque requête porte la clé publique et une signature de
 * « MÉTHODE chemin heure ». Copié ailleurs, le jeton ne signe rien.
 *
 * C'est le principe de DPoP (RFC 9449), sans son format JWT : l'API émet déjà
 * ses propres jetons signés.
 */

// Nommés dans `@maioun/shared` : la page les envoie, le Worker et le serveur
// local les autorisent. Trois copies avaient divergé.
import { SESSION_KEY_HEADER, SESSION_PROOF_HEADER, SESSION_TIME_HEADER } from '@maioun/shared';

export const KEY_HEADER = SESSION_KEY_HEADER;
export const PROOF_HEADER = SESSION_PROOF_HEADER;
export const TIME_HEADER = SESSION_TIME_HEADER;

/** Écart d'horloge toléré, et durée pendant laquelle une preuve reste valable. */
const MAX_SKEW_MS = 5 * 60_000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Ce que la page signe. Identique des deux côtés, octet pour octet. */
export function proofMessage(method: string, url: string, time: string): string {
  const parsed = new URL(url);
  return `${method.toUpperCase()} ${parsed.pathname}${parsed.search} ${time}`;
}

interface PublicJwk {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
}

function parseKey(header: string): PublicJwk | null {
  try {
    const jwk = JSON.parse(new TextDecoder().decode(fromBase64Url(header))) as Record<
      string,
      unknown
    >;
    if (jwk['kty'] !== 'EC' || jwk['crv'] !== 'P-256') return null;
    if (typeof jwk['x'] !== 'string' || typeof jwk['y'] !== 'string') return null;
    return { kty: 'EC', crv: 'P-256', x: jwk['x'], y: jwk['y'] };
  } catch {
    return null;
  }
}

/** Empreinte RFC 7638 : SHA-256 des membres requis, dans l'ordre alphabétique. */
async function thumbprint(jwk: PublicJwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonical));
  return toBase64Url(new Uint8Array(digest));
}

/**
 * L'empreinte de la clé qui a signé cette requête, ou `null` si la preuve
 * manque, a expiré, ou ne vérifie pas.
 */
export async function provenKey(request: Request, nowMs: number): Promise<string | null> {
  const keyHeader = request.headers.get(KEY_HEADER);
  const proof = request.headers.get(PROOF_HEADER);
  const time = request.headers.get(TIME_HEADER);
  if (keyHeader === null || proof === null || time === null) return null;

  const signedAt = Number(time);
  if (!Number.isFinite(signedAt) || Math.abs(nowMs - signedAt) > MAX_SKEW_MS) return null;

  const jwk = parseKey(keyHeader);
  if (jwk === null) return null;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { ...jwk, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64Url(proof) as unknown as BufferSource,
      encoder.encode(proofMessage(request.method, request.url, time)),
    );
    return valid ? await thumbprint(jwk) : null;
  } catch {
    return null;
  }
}
