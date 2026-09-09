/**
 * Ce module ouvre un accès payant sur la foi d'un appel dont l'adresse est
 * publique : ses tests sont des tests de sécurité, pas de comportement.
 *
 * ON SIGNE POUR DE VRAI. Les signatures de ces scénarios sont calculées avec
 * WebCrypto, comme le fait Stripe. Un double qui répondrait « signature
 * correcte » ne prouverait rien — c'est précisément ce qu'on éprouve.
 */

import { describe, expect, it } from 'vitest';
import { subscriptionChange, verifyStripeEvent } from './stripe-webhook.js';

// Faux, et l'analyseur de secrets a raison de le demander : la marque
// `whsec_` est celle d'un vrai secret de webhook Stripe.
const SECRET = 'whsec_exemple_de_secret_de_webhook'; // secret-scan-ignore
const NOW = Date.parse('2026-09-09T10:00:00.000Z');

/** Le HMAC-SHA256 hexadécimal, comme le calcule Stripe. */
async function sign(secret: string, payload: string): Promise<string> {
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

/** L'en-tête `Stripe-Signature` d'un appel authentique. */
async function header(body: string, { secret = SECRET, atMs = NOW } = {}): Promise<string> {
  const timestamp = Math.floor(atMs / 1000);
  return `t=${timestamp},v1=${await sign(secret, `${timestamp}.${body}`)}`;
}

const EVENT = JSON.stringify({
  type: 'customer.subscription.updated',
  data: {
    object: {
      customer: 'cus_ABC123',
      status: 'active',
      current_period_end: Math.floor(Date.parse('2026-10-09T10:00:00.000Z') / 1000),
    },
  },
});

describe('vérification de la signature', () => {
  it('accepte un appel authentique', async () => {
    const event = await verifyStripeEvent(EVENT, await header(EVENT), SECRET, NOW);
    expect(event).not.toBeNull();
    expect(event?.['type']).toBe('customer.subscription.updated');
  });

  it('refuse un corps modifié après signature', async () => {
    // Le scénario qui compte : la signature est authentique, mais elle ne
    // couvre pas ce corps-là. C'est exactement ce que ferait un intercepteur
    // qui rejoue un appel en changeant le statut.
    const signature = await header(EVENT);
    const falsifie = EVENT.replace('"active"', '"trialing"');
    expect(await verifyStripeEvent(falsifie, signature, SECRET, NOW)).toBeNull();
  });

  it('refuse une signature calculée avec un autre secret', async () => {
    const signature = await header(EVENT, { secret: 'whsec_celui_du_voisin' }); // secret-scan-ignore
    expect(await verifyStripeEvent(EVENT, signature, SECRET, NOW)).toBeNull();
  });

  it('refuse un appel sans en-tête de signature', async () => {
    expect(await verifyStripeEvent(EVENT, null, SECRET, NOW)).toBeNull();
  });

  it('refuse tout quand aucun secret n’est configuré', async () => {
    // Sans secret, on ne SAIT PAS vérifier : accepter reviendrait à publier une
    // porte ouverte le jour d'un déploiement incomplet.
    expect(await verifyStripeEvent(EVENT, await header(EVENT), '', NOW)).toBeNull();
  });

  it('refuse un appel authentique mais trop vieux', async () => {
    // Rejeu : la signature est parfaite, l'appel l'était aussi — il y a une
    // heure. Sans l'horodatage, « abonnement actif » se renverrait chaque mois.
    const signature = await header(EVENT, { atMs: NOW - 3_600_000 });
    expect(await verifyStripeEvent(EVENT, signature, SECRET, NOW)).toBeNull();
  });

  it('refuse un appel horodaté dans le futur', async () => {
    const signature = await header(EVENT, { atMs: NOW + 3_600_000 });
    expect(await verifyStripeEvent(EVENT, signature, SECRET, NOW)).toBeNull();
  });

  it('refuse un horodatage illisible', async () => {
    const signature = `t=hier,v1=${await sign(SECRET, `hier.${EVENT}`)}`;
    expect(await verifyStripeEvent(EVENT, signature, SECRET, NOW)).toBeNull();
  });

  it('accepte quand UNE des signatures correspond', async () => {
    // Pendant une rotation de secret, Stripe envoie les deux.
    const timestamp = Math.floor(NOW / 1000);
    const ancienne = await sign('whsec_ancien', `${timestamp}.${EVENT}`); // secret-scan-ignore
    const nouvelle = await sign(SECRET, `${timestamp}.${EVENT}`);
    const signature = `t=${timestamp},v1=${ancienne},v1=${nouvelle}`;
    expect(await verifyStripeEvent(EVENT, signature, SECRET, NOW)).not.toBeNull();
  });

  it('refuse un corps signé mais illisible', async () => {
    const body = 'ceci n’est pas du JSON';
    expect(await verifyStripeEvent(body, await header(body), SECRET, NOW)).toBeNull();
  });
});

describe('lecture de l’événement', () => {
  const change = (type: string, object: Record<string, unknown>) =>
    subscriptionChange({ type, data: { object } });

  it('retient le client, l’état et la fin de période', () => {
    expect(
      change('customer.subscription.created', {
        customer: 'cus_ABC123',
        status: 'trialing',
        current_period_end: Math.floor(Date.parse('2026-10-09T10:00:00.000Z') / 1000),
      }),
    ).toEqual({
      customerId: 'cus_ABC123',
      status: 'trialing',
      until: '2026-10-09T10:00:00.000Z',
    });
  });

  it('efface la date d’un abonnement supprimé', () => {
    // Stripe envoie encore une période sur `deleted`. La garder laisserait
    // l'accès ouvert jusqu'à la fin du mois d'un abonnement qui n'existe plus.
    expect(
      change('customer.subscription.deleted', {
        customer: 'cus_ABC123',
        status: 'canceled',
        current_period_end: Math.floor(Date.parse('2026-10-09T10:00:00.000Z') / 1000),
      })?.until,
    ).toBeNull();
  });

  it('ignore un événement qui ne concerne pas l’abonnement', () => {
    expect(change('invoice.paid', { customer: 'cus_ABC123', status: 'paid' })).toBeNull();
  });

  it('ignore un objet sans client', () => {
    expect(change('customer.subscription.updated', { status: 'active' })).toBeNull();
  });
});
