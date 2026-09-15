/**
 * Envoi du formulaire d'agence : ce qu'il lit, ce qu'il coche, ce qu'il refuse.
 * Gabarits anonymisés relevés le 2026-09-15 ; aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  agencyFormSupported,
  detectCaptcha,
  parseConsentBoxes,
  runAgencyForm,
  validateFields,
  type AgencyFormFields,
  type AgencyFormRequest,
} from './agency-form.js';

const FIXTURES = join(import.meta.dirname, '../../../../tests/fixtures/contact');
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

const ORPI_PAGE = fixture('orpi-annonce.html');
const PAGE_URL =
  'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-00000000-0000-4000-8000-000000000101/';
const ACTION =
  'https://www.orpi.com/annonce-appartement-t1-nice-06000-00000000-0000-4000-8000-000000000101/contact/rent?formId=request_or_send_contact_form&isAside=0';

const FIELDS: AgencyFormFields = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'contact@example.invalid',
  phone: '06 00 00 00 12',
  message: 'Bonjour, votre annonce m’intéresse.',
};

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** Un faux réseau : robots.txt, la page, puis la réponse au POST. */
function fakeNetwork(options: {
  readonly robots?: string;
  readonly page?: string;
  readonly post?: () => Response;
}): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/robots.txt')) {
      return Promise.resolve(new Response(options.robots ?? 'User-agent: *\nDisallow: /login*'));
    }
    if (init?.method === 'POST') {
      return Promise.resolve(options.post?.() ?? Response.json({ success: true }));
    }
    return Promise.resolve(
      new Response(options.page ?? ORPI_PAGE, {
        headers: { 'Set-Cookie': 'ORPIFRSESS21=abc; path=/; HttpOnly' },
      }),
    );
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function request(overrides: Partial<AgencyFormRequest> = {}): AgencyFormRequest {
  return {
    sourceId: 'orpi',
    pageUrl: PAGE_URL,
    fields: FIELDS,
    acceptedConsents: [],
    mode: 'send',
    userAgent: 'MaiounBot/0.1 (+https://example.invalid)',
    ...overrides,
  };
}

const posts = (calls: Call[]): Call[] => calls.filter((call) => call.init?.method === 'POST');

describe('sources prises en charge', () => {
  it('Orpi seulement : les deux autres sont gardées par un CAPTCHA', () => {
    expect(agencyFormSupported('orpi')).toBe(true);
    expect(agencyFormSupported('partners-immo')).toBe(false);
    expect(agencyFormSupported('mediterranee-immo')).toBe(false);
    expect(agencyFormSupported('toString')).toBe(false);
  });

  it('reconnaît les CAPTCHA des pages écartées, et aucun chez Orpi', () => {
    expect(detectCaptcha(fixture('partners-immo-annonce.html'))).toBe('reCAPTCHA');
    expect(detectCaptcha(fixture('mediterranee-immo-annonce.html'))).toBe('reCAPTCHA');
    expect(detectCaptcha(ORPI_PAGE)).toBeNull();
  });
});

describe('parseConsentBoxes', () => {
  it('lit les deux cases Orpi comme facultatives, avec la phrase qui leur donne sens', () => {
    const boxes = parseConsentBoxes(ORPI_PAGE);
    expect(boxes.map((box) => box.name)).toEqual([
      'request_or_send_contact_form[allowAgencyCall]',
      'request_or_send_contact_form[allowOrpiMailing]',
    ]);
    expect(boxes.every((box) => !box.required)).toBe(true);
    expect(boxes[0]?.label).toContain('prospection commerciale');
    expect(boxes[0]?.label).toContain('Par téléphone');
  });

  it('repère une case obligatoire', () => {
    const boxes = parseConsentBoxes(
      '<input type="checkbox" id="r" name="rgpd" required><label for="r">J’accepte</label>',
    );
    expect(boxes).toEqual([{ name: 'rgpd', label: 'J’accepte', required: true }]);
  });
});

describe('validateFields', () => {
  it('exige nom, adresse valide et message', () => {
    expect(validateFields(FIELDS)).toBeNull();
    expect(validateFields({ ...FIELDS, lastName: ' ' })).not.toBeNull();
    expect(validateFields({ ...FIELDS, email: 'pas-une-adresse' })).not.toBeNull();
    expect(validateFields({ ...FIELDS, message: '' })).not.toBeNull();
  });
});

describe('runAgencyForm — aperçu', () => {
  it('lit le formulaire sans rien poster, et ne coche aucune case facultative', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    const outcome = await runAgencyForm(request({ mode: 'preview', fetchImpl }));
    expect(posts(calls)).toHaveLength(0);
    expect(outcome.status).toBe('preview');
    if (outcome.status !== 'preview') return;
    expect(outcome.preview.host).toBe('www.orpi.com');
    expect(outcome.preview.consents.every((consent) => !consent.ticked)).toBe(true);
  });
});

describe('runAgencyForm — envoi', () => {
  it('poste à l’action lue sur la page, avec les champs et le jeton de session', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    const outcome = await runAgencyForm(request({ fetchImpl }));
    expect(outcome.status).toBe('sent');

    const [post] = posts(calls);
    expect(post?.url).toBe(ACTION);
    const headers = post?.init?.headers as Record<string, string>;
    expect(headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(headers['User-Agent']).toContain('MaiounBot');
    expect(headers['Cookie']).toBe('ORPIFRSESS21=abc');

    const body = new URLSearchParams(String(post?.init?.body));
    expect(body.get('request_or_send_contact_form[firstName]')).toBe('Alex');
    expect(body.get('request_or_send_contact_form[email]')).toBe('contact@example.invalid');
    expect(body.get('request_or_send_contact_form[phone]')).toBe('06 00 00 00 12');
    expect(body.get('request_or_send_contact_form[agency]')).toBe('agence-exemple');
    // Le piège à robots reste vide, comme chez un humain.
    expect(body.get('request_or_send_contact_form[email2]')).toBe('');
  });

  it('ne coche JAMAIS les cases de prospection, même si on les lui passe', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    await runAgencyForm(
      request({
        fetchImpl,
        acceptedConsents: [
          'request_or_send_contact_form[allowAgencyCall]',
          'request_or_send_contact_form[allowOrpiMailing]',
        ],
      }),
    );
    const body = new URLSearchParams(String(posts(calls)[0]?.init?.body));
    expect(body.has('request_or_send_contact_form[allowAgencyCall]')).toBe(false);
    expect(body.has('request_or_send_contact_form[allowOrpiMailing]')).toBe(false);
  });

  it('refuse si une case obligatoire apparue n’a pas été acceptée', async () => {
    const page = ORPI_PAGE.replace(
      '<p class="text-center mt-sm">',
      '<input type="checkbox" id="rgpd" name="request_or_send_contact_form[rgpd]" required="required" /><label for="rgpd">J’accepte le traitement</label><p class="text-center mt-sm">',
    );
    const refused = fakeNetwork({ page });
    const outcome = await runAgencyForm(request({ fetchImpl: refused.fetchImpl }));
    expect(outcome.status).toBe('invalid');
    expect(posts(refused.calls)).toHaveLength(0);

    const accepted = fakeNetwork({ page });
    await runAgencyForm(
      request({
        fetchImpl: accepted.fetchImpl,
        acceptedConsents: ['request_or_send_contact_form[rgpd]'],
      }),
    );
    const body = new URLSearchParams(String(posts(accepted.calls)[0]?.init?.body));
    expect(body.get('request_or_send_contact_form[rgpd]')).toBe('1');
  });

  it('dit le refus d’Orpi avec ses messages', async () => {
    const { fetchImpl } = fakeNetwork({
      post: () =>
        Response.json(
          { success: false, errors: [{ origin: 'x', message: 'Ce champ est requis.' }] },
          { status: 400 },
        ),
    });
    const outcome = await runAgencyForm(request({ fetchImpl }));
    expect(outcome).toMatchObject({ status: 'rejected', errors: ['Ce champ est requis.'] });
  });

  it('ne prétend pas envoyé ce qu’une page HTML ou une redirection ne confirme pas', async () => {
    const html = fakeNetwork({ post: () => new Response('<html></html>', { status: 200 }) });
    expect((await runAgencyForm(request({ fetchImpl: html.fetchImpl }))).status).toBe('uncertain');
    const redirect = fakeNetwork({ post: () => new Response(null, { status: 302 }) });
    expect((await runAgencyForm(request({ fetchImpl: redirect.fetchImpl }))).status).toBe(
      'uncertain',
    );
  });

  it('s’abstient quand robots.txt interdit le chemin du formulaire', async () => {
    const { fetchImpl, calls } = fakeNetwork({ robots: 'User-agent: *\nDisallow: /*/contact/' });
    const outcome = await runAgencyForm(request({ fetchImpl }));
    expect(outcome.status).toBe('unavailable');
    expect(posts(calls)).toHaveLength(0);
  });

  it('s’abstient quand un CAPTCHA apparaît sur la page', async () => {
    const page = ORPI_PAGE.replace('</form>', '<div class="g-recaptcha"></div></form>');
    const { fetchImpl, calls } = fakeNetwork({ page });
    expect((await runAgencyForm(request({ fetchImpl }))).status).toBe('unavailable');
    expect(posts(calls)).toHaveLength(0);
  });

  it('refuse une adresse hors du site de la source, sans rien demander', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    const outcome = await runAgencyForm(
      request({ fetchImpl, pageUrl: 'https://agence.example.invalid/annonce' }),
    );
    expect(outcome.status).toBe('invalid');
    expect(calls).toHaveLength(0);
  });

  it('refuse les sources à CAPTCHA sans toucher au réseau', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    const outcome = await runAgencyForm(
      request({ fetchImpl, sourceId: 'partners-immo', pageUrl: 'https://partners-immo.fr/fr/x' }),
    );
    expect(outcome).toMatchObject({ status: 'unavailable' });
    expect(calls).toHaveLength(0);
  });

  it('refuse un téléphone qu’Orpi rejetterait', async () => {
    const { fetchImpl, calls } = fakeNetwork({});
    const outcome = await runAgencyForm(request({ fetchImpl, fields: { ...FIELDS, phone: '12' } }));
    expect(outcome.status).toBe('invalid');
    expect(posts(calls)).toHaveLength(0);
  });
});
