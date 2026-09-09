/**
 * Vérifier qu'un appel de Stripe vient bien de Stripe.
 *
 * CE MODULE EST UNE FRONTIÈRE DE SÉCURITÉ. Ce qu'il accepte ouvre un accès
 * payant. L'adresse du webhook est publique — elle doit l'être, Stripe doit
 * pouvoir l'appeler — donc n'importe qui peut lui poster « cet utilisateur a
 * payé ». Seule la signature distingue les deux.
 *
 * COMMENT STRIPE SIGNE. L'en-tête `Stripe-Signature` porte un horodatage et
 * une ou plusieurs signatures : `t=1614556800,v1=5257a8…`. La signature est un
 * HMAC-SHA256 de `<horodatage>.<corps brut>` avec le secret du webhook.
 *
 * LE CORPS BRUT, ET RIEN D'AUTRE. Reformater le JSON avant de vérifier — même
 * un espace — casse la signature. On vérifie donc sur le texte reçu, puis on
 * analyse.
 *
 * L'HORODATAGE COMPTE AUTANT QUE LA SIGNATURE. Sans lui, un appel authentique
 * capté une fois pourrait être rejoué indéfiniment : « abonnement actif »,
 * renvoyé chaque mois par quelqu'un qui ne paie plus.
 */

/** Au-delà, l'appel est trop vieux pour être rejoué de bonne foi. */
const MAX_AGE_SECONDS = 300;

/** Comparaison à temps CONSTANT : un `===` fuit la position du premier écart. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Le HMAC-SHA256 de `payload`, en hexadécimal. */
async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * L'événement porté par un appel de webhook, ou `null` s'il n'est pas digne de
 * foi.
 *
 * `null` POUR TOUTES LES RAISONS À LA FOIS — signature fausse, horodatage
 * absent, appel trop vieux, corps illisible. Dire laquelle n'aiderait que celui
 * qui cherche laquelle contourner.
 */
export async function verifyStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number,
): Promise<Record<string, unknown> | null> {
  if (secret === '' || signatureHeader === null) return null;

  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [key, value] = part.trim().split('=');
    if (key === 't' && value !== undefined) timestamp = value;
    // Stripe envoie plusieurs `v1` pendant une rotation de secret : il suffit
    // qu'UNE corresponde.
    if (key === 'v1' && value !== undefined) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return null;

  const seconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(seconds)) return null;
  if (Math.abs(nowMs / 1000 - seconds) > MAX_AGE_SECONDS) return null;

  const expected = await hmac(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((candidate) => sameSignature(candidate, expected))) return null;

  try {
    const parsed: unknown = JSON.parse(rawBody);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Ce qu'on retient d'un événement d'abonnement. */
export interface SubscriptionChange {
  readonly customerId: string;
  readonly status: string;
  /** Fin de la période payée, en ISO. `null` si Stripe ne la donne pas. */
  readonly until: string | null;
}

/**
 * Les événements qui changent un droit d'accès.
 *
 * ON NE TRAITE QUE L'ABONNEMENT LUI-MÊME, pas les paiements. Un paiement réussi
 * ne dit pas jusqu'à quand le service est dû ; l'objet `subscription`, si — et
 * Stripe l'envoie à chaque changement, création comprise. Écouter les deux
 * ferait deux chemins qui peuvent se contredire.
 */
const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

/**
 * Le changement d'abonnement porté par un événement, ou `null` si l'événement
 * ne concerne pas un abonnement.
 */
export function subscriptionChange(event: Record<string, unknown>): SubscriptionChange | null {
  const type = event['type'];
  if (typeof type !== 'string' || !SUBSCRIPTION_EVENTS.has(type)) return null;

  const object = (event['data'] as { object?: Record<string, unknown> } | undefined)?.object;
  if (object === undefined) return null;

  const customerId = object['customer'];
  const status = object['status'];
  if (typeof customerId !== 'string' || typeof status !== 'string') return null;

  // Un abonnement supprimé n'ouvre plus rien, quelle que soit sa période : c'est
  // le seul cas où l'on ignore la date que Stripe envoie encore.
  const periodEnd = type === 'customer.subscription.deleted' ? null : object['current_period_end'];
  const until =
    typeof periodEnd === 'number' && Number.isFinite(periodEnd)
      ? new Date(periodEnd * 1000).toISOString()
      : null;

  return { customerId, status, until };
}
