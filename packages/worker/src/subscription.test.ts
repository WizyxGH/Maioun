/**
 * Ce que le Worker fait d'un appel de Stripe, et ce qu'il refuse d'en faire.
 *
 * La signature elle-même est éprouvée dans `stripe-webhook.test.ts` ; ici on
 * vérifie la SUITE : quelle ligne est écrite, laquelle ne l'est pas, et ce que
 * l'écran voit ensuite.
 */

import { describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client/web';
import { applyWebhook, planView, readSubscription, stripeConfigured } from './subscription.js';

type Row = Record<string, unknown>;

const NOW = Date.parse('2026-09-09T10:00:00.000Z');
const SECRET = 'whsec_exemple'; // secret-scan-ignore

/** Une base réduite à la table `users`, dont seules trois colonnes comptent. */
function fakeDb(users: Row[]): Client & { users: Row[] } {
  const run = (sql: string, args: unknown[]): { rows: Row[]; rowsAffected: number } => {
    if (sql.includes('SELECT subscription_status')) {
      return { rows: users.filter((user) => user['id'] === args[0]), rowsAffected: 0 };
    }
    if (sql.includes('UPDATE users SET stripe_customer_id')) {
      const found = users.find((user) => user['id'] === args[1]);
      if (found !== undefined) found['stripe_customer_id'] = args[0];
      return { rows: [], rowsAffected: found === undefined ? 0 : 1 };
    }
    if (sql.includes('SET subscription_status')) {
      const touched = users.filter((user) => user['stripe_customer_id'] === args[2]);
      for (const user of touched) {
        user['subscription_status'] = args[0];
        user['subscription_until'] = args[1];
      }
      return { rows: [], rowsAffected: touched.length };
    }
    throw new Error(`SQL non prévu par le double : ${sql}`);
  };

  const client = {
    users,
    execute: (statement: { sql: string; args: unknown[] }) =>
      Promise.resolve(run(statement.sql, statement.args)),
  };
  return client as unknown as Client & { users: Row[] };
}

/** L'en-tête `Stripe-Signature` d'un appel authentique. */
async function signed(body: string, atMs = NOW): Promise<string> {
  const timestamp = Math.floor(atMs / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

const CONFIG = { webhookSecret: SECRET };

const event = (type: string, object: Record<string, unknown>): string =>
  JSON.stringify({ type, data: { object } });

describe('applyWebhook', () => {
  it('lie le compte au client Stripe à la première session de paiement', async () => {
    // C'EST LE SEUL MOMENT OÙ LES DEUX MONDES SE VOIENT : après, Stripe ne
    // parle plus que de son client, jamais de notre identifiant de compte.
    const db = fakeDb([{ id: 'moi', stripe_customer_id: null }]);
    const body = event('checkout.session.completed', {
      client_reference_id: 'moi',
      customer: 'cus_ABC',
    });

    expect(await applyWebhook(db, body, await signed(body), CONFIG, NOW)).toBe('applied');
    expect(db.users[0]?.['stripe_customer_id']).toBe('cus_ABC');
  });

  it('enregistre l’état et la fin de période d’un abonnement', async () => {
    const db = fakeDb([{ id: 'moi', stripe_customer_id: 'cus_ABC' }]);
    const body = event('customer.subscription.updated', {
      customer: 'cus_ABC',
      status: 'active',
      current_period_end: Math.floor(Date.parse('2026-10-09T10:00:00.000Z') / 1000),
    });

    expect(await applyWebhook(db, body, await signed(body), CONFIG, NOW)).toBe('applied');
    expect(db.users[0]?.['subscription_status']).toBe('active');
    expect(db.users[0]?.['subscription_until']).toBe('2026-10-09T10:00:00.000Z');
  });

  it('n’écrit RIEN sur une signature refusée', async () => {
    // Le scénario contre lequel toute cette machinerie existe : n'importe qui
    // peut poster « cet utilisateur a payé » à une adresse publique.
    const db = fakeDb([{ id: 'moi', stripe_customer_id: 'cus_ABC' }]);
    const body = event('customer.subscription.updated', {
      customer: 'cus_ABC',
      status: 'active',
      current_period_end: Math.floor(Date.parse('2027-01-01T00:00:00.000Z') / 1000),
    });

    expect(await applyWebhook(db, body, 't=1,v1=00', CONFIG, NOW)).toBe('rejected');
    expect(db.users[0]?.['subscription_status']).toBeUndefined();
  });

  it('ignore un client inconnu de cette base plutôt que d’échouer', async () => {
    // Un même compte Stripe peut servir un autre site. Répondre en erreur ferait
    // réessayer Stripe indéfiniment sur un appel parfaitement valide.
    const db = fakeDb([{ id: 'moi', stripe_customer_id: 'cus_ABC' }]);
    const body = event('customer.subscription.updated', {
      customer: 'cus_AILLEURS',
      status: 'active',
      current_period_end: Math.floor(Date.parse('2026-10-09T10:00:00.000Z') / 1000),
    });

    expect(await applyWebhook(db, body, await signed(body), CONFIG, NOW)).toBe('ignored');
  });

  it('ignore un événement qui ne concerne pas l’abonnement', async () => {
    const db = fakeDb([{ id: 'moi', stripe_customer_id: 'cus_ABC' }]);
    const body = event('invoice.paid', { customer: 'cus_ABC' });
    expect(await applyWebhook(db, body, await signed(body), CONFIG, NOW)).toBe('ignored');
  });
});

describe('ce que l’écran voit', () => {
  it('lit l’abonnement du compte', async () => {
    const db = fakeDb([
      { id: 'moi', subscription_status: 'active', subscription_until: '2026-10-09T10:00:00.000Z' },
    ]);
    expect(await readSubscription(db, 'moi')).toEqual({
      status: 'active',
      until: '2026-10-09T10:00:00.000Z',
    });
  });

  it('rend « unconfigured » tant qu’aucune clé n’est branchée', async () => {
    // L'état du projet aujourd'hui : le péage est posé, la vente ne l'est pas.
    const db = fakeDb([{ id: 'moi' }]);
    expect(await planView(db, 'moi', {}, NOW)).toEqual({ plan: 'unconfigured', until: null });
  });

  it('n’encaisse qu’avec les TROIS réglages', () => {
    expect(stripeConfigured({ secretKey: 'sk_x', priceId: 'price_x', siteUrl: 'https://x' })).toBe(
      true,
    );
    // Un tarif manquant ouvrirait une page de paiement sans rien à payer.
    expect(stripeConfigured({ secretKey: 'sk_x', siteUrl: 'https://x' })).toBe(false);
    expect(stripeConfigured({ priceId: 'price_x', siteUrl: 'https://x' })).toBe(false);
    expect(stripeConfigured({ secretKey: 'sk_x', priceId: 'price_x' })).toBe(false);
  });
});
