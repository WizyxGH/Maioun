/**
 * QUAND LA BASE LÂCHE, CE QUE LE NAVIGATEUR REÇOIT.
 *
 * Rien n'entourait l'appel aux routes : une erreur Turso remontait en 500 nu,
 * SANS en-tête CORS. Le navigateur bloque alors la réponse, et l'écran affiche
 * « la connexion a échoué » — le diagnostic le plus trompeur possible, puisque
 * la connexion avait parfaitement abouti. Le 24 septembre 2026, c'est ce que
 * voyait l'utilisateur pendant que le quota de lectures était épuisé.
 */

import { describe, expect, it } from 'vitest';
import worker from './index.js';

const ENV = {
  TURSO_DATABASE_URL: 'libsql://exemple.invalid',
  TURSO_AUTH_TOKEN: 'jeton',
  SESSION_SECRET: 'secret-de-test',
} as const;

const demande = (): Request => new Request('https://api.invalid/api/listings');

describe('la panne de base, vue du navigateur', () => {
  /**
   * L'adresse est injoignable : `createClient` réussit, mais la première
   * requête échoue. C'est exactement la forme d'une base qui refuse.
   */
  it('répond avec des en-têtes CORS plutôt qu’une exception nue', async () => {
    const reponse = await worker.fetch(demande(), ENV);
    expect(reponse.status).toBeGreaterThanOrEqual(500);
    expect(reponse.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
  });

  it('rend du JSON lisible, jamais une trace de pile', async () => {
    const reponse = await worker.fetch(demande(), ENV);
    const corps = (await reponse.json()) as { error?: string };
    expect(typeof corps.error).toBe('string');
    expect(corps.error).not.toContain('at ');
  });
});
