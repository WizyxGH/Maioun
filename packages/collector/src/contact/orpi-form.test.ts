/**
 * Ce module prépare un envoi vers un tiers au nom de quelqu'un : ses tests
 * portent surtout sur ce qu'il REFUSE d'envoyer, et sur ce qu'il ne coche pas.
 *
 * Le gabarit est relevé tel quel sur une page Orpi du 2026-09-10. Aucun accès
 * réseau (§59).
 */

import { describe, expect, it, vi } from 'vitest';
import type { TenantProfile } from '@maioun/shared';
import { buildSubmission, NO_CONSENT, parseContactForm, submitContactForm } from './orpi-form.js';

const PAGE_URL =
  'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-ad494cb2-88d1-4b57-8198-193062720e4c/';

/**
 * Les TROIS formulaires de la page, dans l'ordre où elle les écrit : la
 * colonne, celui du corps, la modale. Ils ne diffèrent que par leur préfixe.
 *
 * L'action ne se déduit PAS de l'URL : la page est
 * `/annonce-location-appartement-…`, l'action `/annonce-appartement-…`.
 */
const PAGE = `
<form name="request_or_send_contact_form_aside" method="post"
      action="/annonce-appartement-t1-nice-06000-ad494cb2/contact/rent?formId=request_or_send_contact_form_aside&amp;isAside=1">
  <input name="request_or_send_contact_form_aside[firstName]" />
</form>
<form name="request_or_send_contact_form" method="post"
      action="/annonce-appartement-t1-nice-06000-ad494cb2/contact/rent?formId=request_or_send_contact_form&amp;isAside=0">
  <input name="request_or_send_contact_form[firstName]" />
  <textarea name="request_or_send_contact_form[message]"></textarea>
  <input type="checkbox" name="request_or_send_contact_form[allowAgencyCall]" value="1" />
  <input type="checkbox" name="request_or_send_contact_form[allowOrpiMailing]" value="1" />
</form>
<form name="dialog_request_or_send_contact_form" method="post"
      action="/annonce-appartement-t1-nice-06000-ad494cb2/contact/rent?formId=dialog_request_or_send_contact_form&amp;isAside=0">
  <input name="dialog_request_or_send_contact_form[firstName]" />
</form>`;

const PROFIL: TenantProfile = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'alex@example.invalid',
  phone: '06 00 00 00 12',
  situation: 'cdi',
  monthlyIncome: 2400,
  guarantors: [],
  moveInDate: null,
};

describe('parseContactForm', () => {
  it('retient le formulaire du CORPS, pas celui de la colonne', () => {
    // Les trois sont identiques ; c'est celui-là que la page montre sans qu'on
    // ait rien ouvert.
    expect(parseContactForm(PAGE, PAGE_URL)?.prefix).toBe('request_or_send_contact_form');
  });

  it('lit l’action plutôt que de la reconstruire', () => {
    // La page est `/annonce-location-appartement-…`, l'action
    // `/annonce-appartement-…` : le segment « location- » disparaît. Le
    // déduire marcherait aujourd'hui et casserait au premier changement.
    expect(parseContactForm(PAGE, PAGE_URL)?.action).toBe(
      'https://www.orpi.com/annonce-appartement-t1-nice-06000-ad494cb2/contact/rent?formId=request_or_send_contact_form&isAside=0',
    );
  });

  it('rend null sur une page sans formulaire de contact', () => {
    // L'annonce n'est alors pas contactable par ce canal, et on ne l'invente pas.
    expect(parseContactForm('<html><body>rien</body></html>', PAGE_URL)).toBeNull();
  });
});

describe('buildSubmission', () => {
  const form = parseContactForm(PAGE, PAGE_URL);
  if (form === null) throw new Error('formulaire introuvable dans le gabarit');

  it('remplit les champs sous leur préfixe', () => {
    const body = buildSubmission(form, PROFIL, 'Bonjour, votre annonce m’intéresse.');
    expect(body?.get('request_or_send_contact_form[firstName]')).toBe('Alex');
    expect(body?.get('request_or_send_contact_form[lastName]')).toBe('Dupont');
    expect(body?.get('request_or_send_contact_form[message]')).toContain('m’intéresse');
  });

  it('recopie l’adresse dans le champ de confirmation', () => {
    // `email2` est une confirmation, pas un second contact : une divergence
    // fait refuser le formulaire.
    const body = buildSubmission(form, PROFIL, 'Bonjour.');
    expect(body?.get('request_or_send_contact_form[email2]')).toBe(
      body?.get('request_or_send_contact_form[email]'),
    );
  });

  it('NE COCHE AUCUN CONSENTEMENT par défaut', () => {
    // Les cocher reviendrait à consentir au nom de l'utilisateur — et pour la
    // seconde, à l'abonner à une liste qu'il n'a pas demandée.
    const body = buildSubmission(form, PROFIL, 'Bonjour.');
    expect(body?.has('request_or_send_contact_form[allowAgencyCall]')).toBe(false);
    expect(body?.has('request_or_send_contact_form[allowOrpiMailing]')).toBe(false);
  });

  it('n’envoie une case QUE si elle est cochée', () => {
    // C'est ainsi qu'un navigateur se comporte ; la poser à « 0 » vaudrait
    // consentement dans certains cadres.
    const body = buildSubmission(form, PROFIL, 'Bonjour.', {
      allowAgencyCall: true,
      allowOrpiMailing: false,
    });
    expect(body?.get('request_or_send_contact_form[allowAgencyCall]')).toBe('1');
    expect(body?.has('request_or_send_contact_form[allowOrpiMailing]')).toBe(false);
  });

  it('refuse un profil ou un message incomplet', () => {
    // On ne poste pas un formulaire à trous pour se le voir refuser.
    expect(buildSubmission(form, { ...PROFIL, lastName: '  ' }, 'Bonjour.')).toBeNull();
    expect(buildSubmission(form, { ...PROFIL, email: '' }, 'Bonjour.')).toBeNull();
    expect(buildSubmission(form, PROFIL, '   ')).toBeNull();
  });
});

describe('submitContactForm', () => {
  const form = { action: 'https://www.orpi.com/x/contact/rent', prefix: 'f' };
  const body = new URLSearchParams({ 'f[firstName]': 'Alex' });

  it('tient une redirection pour un succès', async () => {
    // 302 est la réponse normale d'un formulaire Symfony accepté.
    const fetchImpl = vi.fn(() => Promise.resolve({ status: 302 } as Response));
    const outcome = await submitContactForm(form, body, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });
    expect(outcome).toEqual({ ok: true });
  });

  it('tient un 200 pour un ÉCHEC', async () => {
    // Un 200 signifie le plus souvent que la page est réaffichée AVEC ses
    // erreurs de validation : annoncer un envoi serait mentir (§17).
    const fetchImpl = vi.fn(() => Promise.resolve({ status: 200 } as Response));
    const outcome = await submitContactForm(form, body, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });
    expect(outcome.ok).toBe(false);
  });

  it('rend compte d’une panne sans lever', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('réseau coupé')));
    const outcome = await submitContactForm(form, body, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });
    expect(outcome).toEqual({ ok: false, reason: 'réseau coupé' });
  });

  it('annonce qui l’on est', async () => {
    // On s'identifie ici comme partout : c'est la première règle du projet
    // envers les sources (§10).
    const vu: RequestInit[] = [];
    const fetchImpl = (_url: unknown, init?: RequestInit): Promise<Response> => {
      if (init !== undefined) vu.push(init);
      return Promise.resolve({ status: 302 } as Response);
    };
    await submitContactForm(form, body, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1 (+https://example.invalid)',
    });
    const entetes = vu[0]?.headers as Record<string, string> | undefined;
    expect(entetes?.['User-Agent']).toContain('MaiounBot');
  });

  it('ne coche rien de plus que ce qu’on lui donne', () => {
    expect(NO_CONSENT).toEqual({ allowAgencyCall: false, allowOrpiMailing: false });
  });
});
