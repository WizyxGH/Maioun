/**
 * CE MODULE ENVOIE À UN TIERS. C'est le seul du projet dans ce cas, et sa
 * conséquence n'est pas rattrapable : une demande partie ne se reprend pas.
 * Ses tests portent donc moins sur le succès que sur les refus — ce qu'il fait
 * quand la connexion échoue, quand le bulletin répond mal, et surtout ce qu'il
 * refuse d'affirmer.
 */

import { describe, expect, it, vi } from 'vitest';
import { bulletinRefFrom, sendBepRequest } from './bep-request.js';

const CREDENTIALS = { user: 'abonne', password: 'motdepasse' }; // secret-scan-ignore
const DEPS = (fetchImpl: typeof fetch) => ({
  credentials: CREDENTIALS,
  userAgent: 'MaiounBot/0.1 (+https://exemple.invalid)',
  fetchImpl,
});

/** Une réponse HTTP minimale, avec les en-têtes que le module lit. */
const reponse = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html' } });

describe('bulletinRefFrom', () => {
  it('lit l’identifiant de bulletin du lien de demande', () => {
    expect(bulletinRefFrom('http://abonnes.beplogement.com/w_demande.php?bullref=641119')).toBe(
      '641119',
    );
  });

  /**
   * UNE ANNONCE DÉJÀ DEMANDÉE N'A PLUS DE BOUTON : son lien pointe l'accueil du
   * bulletin. On ne devine alors aucun identifiant (§17) — et sans identifiant,
   * rien ne part.
   */
  it('ne devine rien quand le lien n’en porte pas', () => {
    expect(bulletinRefFrom('http://abonnes.beplogement.com/w_index_abonnes.php')).toBeNull();
    expect(bulletinRefFrom(null)).toBeNull();
  });
});

describe('sendBepRequest', () => {
  it('renonce quand la connexion est refusée', async () => {
    // Le formulaire de connexion encore présent = identifiants refusés. Poster
    // dans le vide laisserait croire à une demande envoyée.
    const fetchImpl = vi.fn(async () => reponse('<input name="abonpassword">'));
    const result = await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));
    expect(result).toEqual({ ok: false, reason: 'connexion refusée par le bulletin' });
  });

  it('signale un refus du bulletin', async () => {
    let appel = 0;
    const fetchImpl = vi.fn(async () => {
      appel += 1;
      if (appel <= 2) return reponse('<b>BULLETIN</b> connecté');
      return reponse('', 503);
    });
    const result = await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));
    expect(result).toEqual({ ok: false, reason: 'le bulletin a répondu 503' });
  });

  /**
   * LE SITE REND LA MÊME PAGE À TOUT POST : un 200 ne prouve rien. Le bouton de
   * CETTE annonce disparaît une fois la demande enregistrée — c'est la seule
   * preuve disponible, et on l'exige.
   */
  it('n’affirme pas un envoi que la page ne confirme pas', async () => {
    const fetchImpl = vi.fn(async () => reponse('connecté <a onclick="sendreq(641119)">'));
    const result = await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));
    expect(result).toEqual({
      ok: false,
      reason: 'la demande ne semble pas avoir été enregistrée',
    });
  });

  it('confirme quand le bouton de l’annonce a disparu', async () => {
    let appel = 0;
    const fetchImpl = vi.fn(async () => {
      appel += 1;
      // Connexion, puis page finale où seul un AUTRE bouton subsiste.
      return reponse(appel <= 2 ? 'connecté' : 'connecté <a onclick="sendreq(999999)">');
    });
    const result = await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));
    expect(result).toEqual({ ok: true });
  });

  it('ne lève jamais : une panne réseau est un refus, pas un plantage (§69)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('réseau coupé');
    });
    const result = await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));
    expect(result).toEqual({ ok: false, reason: 'réseau coupé' });
  });

  it('envoie les six champs du formulaire, et le bon identifiant', async () => {
    const corps: string[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (typeof init?.body === 'string') corps.push(init.body);
      return reponse('connecté');
    });
    await sendBepRequest('641119', DEPS(fetchImpl as unknown as typeof fetch));

    const demande = corps.find((one) => one.includes('demande='));
    expect(demande).toBeDefined();
    for (const champ of ['updt', 'addadate', 'references', 'demande', 'nbel', 'bullsel']) {
      expect(demande).toContain(`${champ}=`);
    }
    expect(demande).toContain('demande=641119');
  });
});
