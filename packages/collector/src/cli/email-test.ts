/**
 * Commande `pnpm email:test` — l'alerte e-mail telle qu'elle partirait.
 *
 * Sans option, RIEN N'EST ENVOYÉ : le message est composé à partir des annonces
 * du compte et affiché, avec l'état de la configuration. `--send` l'envoie une
 * fois à l'adresse vérifiée du compte (ou à `--to=`), sans marquer aucune
 * annonce comme signalée : c'est un essai, pas une alerte.
 *
 * Sert à valider une clé Resend AVANT de la déposer en secret : la collecte,
 * elle, ne dit qu'elle a été refusée qu'après coup, dans son journal.
 */

import { SEARCH_CRITERIA_SETTING } from '@maioun/shared';
import { loadDotEnv, loadPublicConfig, publicSiteUrl, withStoredCriteria } from '../config.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabaseFromEnv } from '../db/client.js';
import { createRepository, toNotifiable, type NotifiableListing } from '../db/repository.js';
import { composeAlertEmail } from '../notify/email-alerts.js';
import { dropRedundantNotifications } from '../notify/redundancy.js';
import { mailerConfigured, sendEmailResult } from '../notify/mailer.js';

/** Une clé Resend fait « re_ » suivi d'une trentaine de caractères. */
const MIN_KEY_LENGTH = 20;

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  loadDotEnv();
  const send = process.argv.includes('--send');
  const mailer = {
    EMAIL_API_KEY: process.env['EMAIL_API_KEY'],
    EMAIL_FROM: process.env['EMAIL_FROM'],
  };
  const key = mailer.EMAIL_API_KEY?.trim() ?? '';

  console.log('Configuration');
  console.log(`  EMAIL_FROM    ${mailer.EMAIL_FROM ?? '— manquant'}`);
  console.log(
    `  EMAIL_API_KEY ${key === '' ? '— manquante' : `${key.slice(0, 3)}… (${key.length} caractères)`}`,
  );
  if (key !== '' && key.length < MIN_KEY_LENGTH) {
    console.log('  ⚠ clé trop courte pour être une clé Resend : tronquée ou provisoire');
  }

  const db = openDatabaseFromEnv();
  const repository = createRepository(db);
  const [userId] = await repository.scorableUsers();
  if (userId === undefined) throw new Error('Aucun compte en base.');

  const to = option('to') ?? (await repository.verifiedEmailFor(userId));
  console.log(`  Destinataire  ${to ?? '— aucune adresse vérifiée sur le compte'}`);

  // Les annonces en attente, avec les critères et le filtre des doublons de la
  // collecte ; déjà toutes signalées, les meilleures du moment.
  const criteria = withStoredCriteria(
    loadPublicConfig(),
    await repository.readSettingFor(userId, SEARCH_CRITERIA_SETTING),
  ).criteria;
  let listings: readonly NotifiableListing[] = dropRedundantNotifications(
    await repository.pendingNotifications(userId, 0, criteria),
    await repository.directListingSpecKeys(),
  );
  console.log(`  En attente    ${listings.length} annonce(s) pas encore signalée(s)`);
  if (listings.length === 0) listings = await bestListings(db, userId);

  const siteUrl = publicSiteUrl() ?? '';
  const { subject, text, html } = composeAlertEmail({
    listings,
    siteUrl,
    heading: 'Nouvelles annonces',
  });
  console.log(`\nObjet : ${subject}\n\n${text}\n`);
  // Dans `data/`, ignoré par git : le message porte de vraies annonces.
  const preview = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../data/email-preview.html',
  );
  mkdirSync(dirname(preview), { recursive: true });
  writeFileSync(preview, html);
  console.log(`Rendu HTML : ${preview}\n`);

  if (!send) {
    console.log('Aperçu seulement. `pnpm email:test --send` pour l’envoyer.');
    return;
  }
  if (!mailerConfigured(mailer)) throw new Error('EMAIL_API_KEY et EMAIL_FROM sont requis.');
  if (to === null)
    throw new Error('Pas de destinataire : vérifiez l’adresse du compte ou passez --to=.');

  const outcome = await sendEmailResult(mailer, { to, subject: `[Essai] ${subject}`, text, html });
  console.log(
    outcome === 'sent'
      ? `✓ Envoyé à ${to}.`
      : `✗ Non envoyé (${outcome}) — la raison donnée par Resend est au-dessus.`,
  );
  if (outcome !== 'sent') process.exitCode = 1;
}

/** Les trois annonces actives les plus prioritaires du compte, signalées ou non. */
async function bestListings(
  db: ReturnType<typeof openDatabaseFromEnv>,
  userId: string,
): Promise<NotifiableListing[]> {
  const result = await db.execute({
    sql: `SELECT listings.id, listings.title, listings.price, listings.area, listings.rooms,
                 listings.city, listings.postal_code, sc.action_priority, listings.payload
          FROM listings
          JOIN listing_user_score AS sc ON sc.listing_id = listings.id AND sc.user_id = ?
          WHERE sc.matches_criteria = 1 AND listings.lifecycle = 'active' AND listings.rented = 0
          ORDER BY sc.action_priority DESC
          LIMIT 3`,
    args: [userId],
  });
  return result.rows.map((row) => toNotifiable(row as Record<string, unknown>));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
