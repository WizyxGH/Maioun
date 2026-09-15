/**
 * POST /api/contact/submit : session exigée, quota par compte, sources
 * fermées, et rien de posté sans `confirm: true`. Réseau et base simulés.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@libsql/client/web';

vi.mock('@libsql/client/web', () => ({
  createClient: () => ({
    execute: () => Promise.resolve({ rows: [] }),
    batch: () => Promise.resolve([]),
  }),
}));

// Même double que dans index.test.ts : sans session, tout ce qui n'est pas le
// catalogue est refusé.
vi.mock('@maioun/collector/server/routes', () => ({
  route: (
    _db: unknown,
    _request: unknown,
    _url: unknown,
    _segments: readonly string[],
    _cors: unknown,
    userId: string | null,
  ) => new Response('{}', { status: userId === null ? 401 : 404 }),
}));
vi.mock('@maioun/collector/notify/mailer', () => ({
  mailerConfigured: () => false,
  sendEmail: () => Promise.resolve(false),
  sendEmailResult: () => Promise.resolve('unconfigured'),
}));

const { default: worker } = await import('./index.js');
const { contactSubmitRoute, CONTACT_SUBMIT_LIMIT } = await import('./contact-submit.js');

const PAGE = readFileSync(
  join(import.meta.dirname, '../../../tests/fixtures/contact/orpi-annonce.html'),
  'utf8',
);
const SOURCE_URL =
  'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-00000000-0000-4000-8000-000000000101/';

const FIELDS = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'contact@example.invalid',
  phone: '06 00 00 00 12',
  message: 'Bonjour, votre annonce m’intéresse.',
};

let sourceId: string | null = 'orpi';
let rateCount = 0;
const statements: string[] = [];

const db = {
  execute: (statement: { sql: string; args?: unknown[] }) => {
    statements.push(statement.sql);
    if (statement.sql.includes('FROM occurrences')) {
      return Promise.resolve({ rows: sourceId === null ? [] : [{ source_id: sourceId }] });
    }
    if (statement.sql.startsWith('SELECT count')) {
      return Promise.resolve({
        rows: rateCount === 0 ? [] : [{ count: rateCount, window_start: new Date().toISOString() }],
      });
    }
    return Promise.resolve({ rows: [] });
  },
} as unknown as Client;

const posted: string[] = [];
const fetchImpl = vi.fn((input: unknown, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/robots.txt')) return Promise.resolve(new Response('User-agent: *'));
  if (init?.method === 'POST') {
    posted.push(url);
    return Promise.resolve(Response.json({ success: true }));
  }
  return Promise.resolve(new Response(PAGE));
}) as unknown as typeof fetch;

function submit(body: unknown): Promise<Response> {
  return contactSubmitRoute(
    db,
    new Request('https://api.invalid/api/contact/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {},
    'compte-1',
    'MaiounBot/0.1',
    fetchImpl,
  );
}

beforeEach(() => {
  sourceId = 'orpi';
  rateCount = 0;
  statements.length = 0;
  posted.length = 0;
});

describe('POST /api/contact/submit', () => {
  it('exige une session', async () => {
    const response = await worker.fetch(
      new Request('https://api.invalid/api/contact/submit', {
        method: 'POST',
        headers: { Origin: 'https://site.invalid', 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: 'l1', sourceUrl: SOURCE_URL, confirm: true }),
      }),
      {
        TURSO_DATABASE_URL: 'libsql://exemple.invalid',
        TURSO_AUTH_TOKEN: 'jeton',
        SESSION_SECRET: 'valeur-de-test-sans-portee', // secret-scan-ignore
        ALLOWED_ORIGIN: 'https://site.invalid',
      } as unknown as Parameters<typeof worker.fetch>[1],
    );
    expect(response.status).toBe(401);
  });

  it('ne poste RIEN sans le drapeau de confirmation : il rend l’aperçu', async () => {
    const response = await submit({ listingId: 'l1', sourceUrl: SOURCE_URL, fields: FIELDS });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('preview');
    expect(posted).toHaveLength(0);
  });

  it('poste avec la confirmation, et le dit', async () => {
    const response = await submit({
      listingId: 'l1',
      sourceUrl: SOURCE_URL,
      fields: FIELDS,
      confirm: true,
    });
    expect(await response.json()).toMatchObject({ status: 'sent' });
    expect(posted).toHaveLength(1);
  });

  it('refuse une source non prise en charge, sans toucher au réseau', async () => {
    sourceId = 'partners-immo';
    const response = await submit({
      listingId: 'l1',
      sourceUrl: 'https://partners-immo.fr/fr/propriete/x',
      fields: FIELDS,
      confirm: true,
    });
    expect(response.status).toBe(422);
    const urls = vi.mocked(fetchImpl).mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes('partners-immo'))).toBe(false);
    expect(posted).toHaveLength(0);
  });

  it('refuse une adresse qui n’est pas une occurrence de l’annonce', async () => {
    sourceId = null;
    const response = await submit({
      listingId: 'l1',
      sourceUrl: 'https://www.orpi.com/autre/',
      fields: FIELDS,
      confirm: true,
    });
    expect(response.status).toBe(404);
    expect(posted).toHaveLength(0);
  });

  it('applique le quota par compte', async () => {
    rateCount = CONTACT_SUBMIT_LIMIT.limit;
    const response = await submit({
      listingId: 'l1',
      sourceUrl: SOURCE_URL,
      fields: FIELDS,
      confirm: true,
    });
    expect(response.status).toBe(429);
    expect(posted).toHaveLength(0);
  });

  it('refuse des champs incomplets avant de consommer le quota', async () => {
    const response = await submit({
      listingId: 'l1',
      sourceUrl: SOURCE_URL,
      fields: { ...FIELDS, email: '' },
      confirm: true,
    });
    expect(response.status).toBe(400);
    expect(statements.some((sql) => sql.includes('rate_limits'))).toBe(false);
  });
});
