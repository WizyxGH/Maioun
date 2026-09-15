/**
 * POST /api/contact/submit — envoyer le formulaire de l'agence pour le compte
 * connecté.
 *
 * Deux temps, et seul le second poste quoi que ce soit :
 *   - sans `confirm: true`, on lit le formulaire et on rend l'aperçu (hôte,
 *     cases à cocher) que la fenêtre de confirmation affiche ;
 *   - avec `confirm: true`, l'utilisateur a cliqué « Envoyer » : on poste.
 *
 * Le Worker le fait parce que le navigateur ne le peut pas (CORS). Il ne poste
 * que vers l'annonce d'une occurrence connue en base, jamais vers une adresse
 * choisie par l'appelant : la route ne doit pas servir de relais.
 */

import type { Client } from '@libsql/client/web';
import {
  agencyFormSupported,
  AGENCY_FORM_REFUSALS,
  runAgencyForm,
  validateFields,
  type AgencyFormFields,
} from '@maioun/collector/contact/agency-form';
import { allow, fingerprint, type RateLimit } from './rate-limit.js';

const HOUR = 3_600_000;

/** Dix envois par heure : largement de quoi candidater, trop peu pour arroser. */
export const CONTACT_SUBMIT_LIMIT: RateLimit = { limit: 10, windowMs: HOUR };
/** Chaque aperçu lit une page chez l'agence : on le borne aussi. */
export const CONTACT_PREVIEW_LIMIT: RateLimit = { limit: 30, windowMs: HOUR };

function json(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fieldsOf(value: unknown): AgencyFormFields {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    firstName: text(record['firstName']),
    lastName: text(record['lastName']),
    email: text(record['email']),
    phone: text(record['phone']),
    message: text(record['message']),
  };
}

export async function contactSubmitRoute(
  db: Client,
  request: Request,
  cors: Record<string, string>,
  userId: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, cors, 405);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const listingId = text(body?.['listingId']);
  const sourceUrl = text(body?.['sourceUrl']);
  if (listingId === '' || sourceUrl === '') {
    return json({ error: 'Annonce non précisée.' }, cors, 400);
  }
  const confirmed = body?.['confirm'] === true;
  const fields = fieldsOf(body?.['fields']);
  const acceptedConsents = Array.isArray(body?.['acceptedConsents'])
    ? (body['acceptedConsents'] as unknown[])
        .filter((name): name is string => typeof name === 'string')
        .slice(0, 10)
    : [];

  if (confirmed) {
    const problem = validateFields(fields);
    if (problem !== null) return json({ error: problem }, cors, 400);
  }

  const found = await db.execute({
    sql: 'SELECT source_id FROM occurrences WHERE group_id = ? AND source_url = ? LIMIT 1',
    args: [listingId, sourceUrl],
  });
  const sourceId = found.rows[0]?.['source_id'];
  if (typeof sourceId !== 'string') return json({ error: 'Annonce inconnue.' }, cors, 404);
  if (!agencyFormSupported(sourceId)) {
    return json(
      {
        error:
          AGENCY_FORM_REFUSALS[sourceId] ?? 'Envoi direct non pris en charge pour cette source.',
      },
      cors,
      422,
    );
  }

  // Par compte et non par adresse IP : c'est ce compte qui écrit aux agences.
  const kind = confirmed ? 'contactSubmit' : 'contactPreview';
  const bucket = `${kind}:${await fingerprint(kind, userId)}`;
  const limit = confirmed ? CONTACT_SUBMIT_LIMIT : CONTACT_PREVIEW_LIMIT;
  if (!(await allow(db, bucket, limit, Date.now()))) {
    return json({ error: 'Trop d’envois. Réessayez dans une heure.' }, cors, 429);
  }

  const outcome = await runAgencyForm({
    sourceId,
    pageUrl: sourceUrl,
    fields,
    acceptedConsents,
    mode: confirmed ? 'send' : 'preview',
    userAgent,
    fetchImpl,
  });
  if (outcome.status === 'invalid') return json({ error: outcome.message }, cors, 400);
  // La réponse de l'agence, quelle qu'elle soit, est un résultat : 200, et le
  // statut dit ce qui s'est passé.
  return json(outcome, cors);
}
