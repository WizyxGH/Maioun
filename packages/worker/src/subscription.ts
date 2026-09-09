/**
 * L'abonnement, côté Worker : le lire, l'ouvrir, l'enregistrer.
 *
 * TROIS ROUTES, ET UNE SEULE EST PUBLIQUE. Lire son propre plan et ouvrir une
 * page de paiement demandent une session ; le webhook n'en a pas — c'est Stripe
 * qui appelle, pas un navigateur — et se défend par sa signature seule.
 *
 * RIEN NE MENT QUAND CE N'EST PAS CONFIGURÉ. Sans clé, la route de paiement
 * répond 501 et le dit, plutôt que d'ouvrir une page qui échouerait. C'est la
 * règle déjà suivie pour la connexion Google.
 */

import type { Client } from '@libsql/client/web';
import { planLabel, type PlanLabel, type SubscriptionState } from '@maioun/shared';
import { subscriptionChange, verifyStripeEvent } from './stripe-webhook.js';

/** Ce que le Worker doit connaître pour vendre. Tout est optionnel. */
export interface StripeConfig {
  readonly secretKey?: string | undefined;
  /** Identifiant du tarif chez Stripe (`price_…`). Sans lui, rien à vendre. */
  readonly priceId?: string | undefined;
  readonly webhookSecret?: string | undefined;
  /** Adresse du site, pour le retour après paiement. */
  readonly siteUrl?: string | undefined;
}

/** `true` si l'installation peut réellement encaisser. */
export function stripeConfigured(config: StripeConfig): boolean {
  return (
    (config.secretKey ?? '') !== '' &&
    (config.priceId ?? '') !== '' &&
    (config.siteUrl ?? '') !== ''
  );
}

/** L'état d'abonnement d'un compte, tel que la base le garde. */
export async function readSubscription(db: Client, userId: string): Promise<SubscriptionState> {
  const result = await db.execute({
    sql: 'SELECT subscription_status, subscription_until FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  });
  const row = result.rows[0];
  return {
    status: typeof row?.['subscription_status'] === 'string' ? row['subscription_status'] : null,
    until: typeof row?.['subscription_until'] === 'string' ? row['subscription_until'] : null,
  };
}

export interface PlanView {
  readonly plan: PlanLabel;
  readonly until: string | null;
}

/** Ce que l'écran affiche : un mot, et une date quand elle existe. */
export async function planView(
  db: Client,
  userId: string,
  config: StripeConfig,
  nowMs: number,
): Promise<PlanView> {
  const state = await readSubscription(db, userId);
  return { plan: planLabel(state, nowMs, stripeConfigured(config)), until: state.until };
}

/**
 * L'adresse de la page de paiement, chez Stripe.
 *
 * ON N'ENCAISSE PAS ICI. On demande à Stripe d'ouvrir une page, et l'on renvoie
 * son adresse : le numéro de carte ne traverse jamais ce code. C'est la raison
 * d'être du prestataire, pas une commodité.
 *
 * `client_reference_id` porte l'identifiant du compte : c'est ce qui permettra
 * au webhook de savoir QUI vient de payer, quand Stripe créera le client.
 *
 * @returns l'URL, ou `null` si Stripe refuse.
 */
export async function checkoutUrl(
  config: StripeConfig,
  userId: string,
  customerId: string | null,
  email: string | null,
): Promise<string | null> {
  const form = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': config.priceId ?? '',
    'line_items[0][quantity]': '1',
    client_reference_id: userId,
    success_url: `${config.siteUrl ?? ''}/#/compte?abonnement=ok`,
    cancel_url: `${config.siteUrl ?? ''}/#/compte?abonnement=annule`,
  });
  // Un client déjà connu évite un doublon chez Stripe ; sinon on lui souffle
  // l'adresse pour qu'il n'ait pas à la retaper.
  if (customerId !== null) form.set('customer', customerId);
  else if (email !== null) form.set('customer_email', email);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.secretKey ?? ''}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  if (!response.ok) return null;
  const session = (await response.json()) as { url?: unknown };
  return typeof session.url === 'string' ? session.url : null;
}

/** Ce qu'un appel de webhook a produit. */
export type WebhookOutcome = 'applied' | 'ignored' | 'rejected';

/**
 * Appliquer un appel de webhook.
 *
 * ON ÉCRIT PAR `stripe_customer_id`, PAS PAR COMPTE. Stripe ne connaît pas nos
 * identifiants une fois l'abonnement créé ; il connaît son client. La liaison
 * se fait à la première session de paiement, dont `client_reference_id` porte
 * le compte — c'est le seul moment où les deux mondes se voient.
 *
 * UN ÉVÉNEMENT INCONNU EST « ignored », PAS « rejected ». Stripe en envoie
 * beaucoup ; répondre en erreur ferait réessayer indéfiniment un appel
 * parfaitement valide.
 */
export async function applyWebhook(
  db: Client,
  rawBody: string,
  signatureHeader: string | null,
  config: StripeConfig,
  nowMs: number,
): Promise<WebhookOutcome> {
  const event = await verifyStripeEvent(
    rawBody,
    signatureHeader,
    config.webhookSecret ?? '',
    nowMs,
  );
  if (event === null) return 'rejected';

  // La liaison compte ↔ client, au moment où elle est possible.
  if (event['type'] === 'checkout.session.completed') {
    const object = (event['data'] as { object?: Record<string, unknown> } | undefined)?.object;
    const userId = object?.['client_reference_id'];
    const customerId = object?.['customer'];
    if (typeof userId !== 'string' || typeof customerId !== 'string') return 'ignored';
    await db.execute({
      sql: 'UPDATE users SET stripe_customer_id = ? WHERE id = ?',
      args: [customerId, userId],
    });
    return 'applied';
  }

  const change = subscriptionChange(event);
  if (change === null) return 'ignored';
  const written = await db.execute({
    sql: `UPDATE users
          SET subscription_status = ?, subscription_until = ?
          WHERE stripe_customer_id = ?`,
    args: [change.status, change.until, change.customerId],
  });
  // Aucune ligne touchée : le client est inconnu de cette base. Ce n'est pas une
  // erreur — un même compte Stripe peut servir un autre site — mais le dire
  // évite de croire l'abonnement enregistré.
  return written.rowsAffected > 0 ? 'applied' : 'ignored';
}
