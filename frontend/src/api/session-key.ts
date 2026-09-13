/**
 * La clé d'appareil qui lie le jeton de session à ce navigateur.
 *
 * Créée NON EXPORTABLE : le navigateur la garde, la page peut signer avec, et
 * personne — ni ce code, ni un script injecté — ne peut la lire pour
 * l'emporter. Un jeton volé ne sert donc à rien ailleurs : l'API exige avec
 * lui une signature de cette clé (voir `packages/worker/src/session-proof.ts`).
 *
 * Rangée dans IndexedDB, qui conserve une `CryptoKey` telle quelle. Sans
 * IndexedDB (navigation privée stricte), pas de clé : la page ne reçoit alors
 * aucun jeton et s'en tient au cookie.
 */

const DB_NAME = 'maioun';
const STORE = 'keys';
const ID = 'session';

let cached: Promise<CryptoKeyPair | null> | null = null;
let publicKeyHeader: Promise<string> | null = null;

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error('IndexedDB indisponible'));
  });
}

function inStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openStore().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
      }),
  );
}

async function loadOrCreate(): Promise<CryptoKeyPair | null> {
  try {
    const stored = await inStore<CryptoKeyPair | undefined>('readonly', (s) => s.get(ID));
    if (stored !== undefined) return stored;
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    await inStore('readwrite', (s) => s.put(pair, ID));
    return pair;
  } catch {
    return null;
  }
}

function sessionKey(): Promise<CryptoKeyPair | null> {
  cached ??= loadOrCreate();
  return cached;
}

/** Oublie la clé : la prochaine connexion en créera une neuve. */
export async function forgetSessionKey(): Promise<void> {
  cached = null;
  publicKeyHeader = null;
  try {
    await inStore('readwrite', (s) => s.delete(ID));
  } catch {
    /* rien à oublier */
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const encoder = new TextEncoder();

/** Clé publique au format de l'en-tête : JWK réduit à ses membres, en base64url. */
export async function publicKeyValue(pair: CryptoKeyPair): Promise<string> {
  const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return base64Url(encoder.encode(JSON.stringify({ kty, crv, x, y })));
}

/**
 * Signe « MÉTHODE chemin heure » — le message que l'API vérifie, octet pour
 * octet. Séparé de la gestion de la clé pour être éprouvé contre l'API.
 */
export async function signProof(
  pair: CryptoKeyPair,
  method: string,
  url: string,
  time: string,
): Promise<Record<string, string>> {
  const parsed = new URL(url);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    encoder.encode(`${method.toUpperCase()} ${parsed.pathname}${parsed.search} ${time}`),
  );
  return {
    'X-Session-Key': await publicKeyValue(pair),
    'X-Session-Time': time,
    'X-Session-Proof': base64Url(new Uint8Array(signature)),
  };
}

/** Les en-têtes de preuve d'une requête. Vides si l'appareil n'a pas de clé. */
export async function proofHeaders(method: string, url: string): Promise<Record<string, string>> {
  const pair = await sessionKey();
  if (pair === null) return {};
  try {
    publicKeyHeader ??= publicKeyValue(pair);
    await publicKeyHeader;
    return await signProof(pair, method, url, String(Date.now()));
  } catch {
    return {};
  }
}
