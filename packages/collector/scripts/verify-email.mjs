/**
 * Confirmer À LA MAIN l'adresse d'un compte (§26) — À LANCER EN LOCAL.
 *
 *   node --env-file=../../.env packages/collector/scripts/verify-email.mjs <adresse>
 *
 * POURQUOI CET OUTIL EXISTE. L'adresse d'un compte se prouve normalement en
 * suivant un lien envoyé par e-mail. Ce chemin suppose que l'envoi fonctionne —
 * or il peut être en panne pour une raison qui n'a rien à voir avec le compte :
 * le 2026-09-08, une clé d'API invalide faisait refuser tous les messages. Le
 * compte restait alors non confirmé, donc sans « mot de passe oublié » et sans
 * alertes par e-mail, pour une panne dont il n'était pas responsable.
 *
 * CE N'EST PAS UN CONTOURNEMENT, c'est une preuve par un autre chemin. Le
 * script REFUSE de confirmer une adresse quelconque : il n'accepte que celle
 * qui est exactement la boîte lue par le collecteur (`IMAP_USER`), dont le mot
 * de passe d'application a été fourni par son propriétaire. Savoir lire une
 * boîte prouve qu'on la contrôle — au moins autant qu'un clic sur un lien.
 *
 * Il ne tourne que depuis la machine qui détient le `.env`, jamais depuis le
 * site : rien dans l'application ne l'expose.
 */

import { createClient } from '@libsql/client';

/**
 * UN POINT FINAL COPIÉ AVEC LA PHRASE. Une consigne se termine par un point, et
 * l'adresse collée depuis cette consigne le ramène avec elle : le script
 * refusait alors une adresse juste, sans laisser voir qu'il ne s'en fallait que
 * d'un caractère. Aucune adresse ne finit légitimement par un point.
 */
const cible = (process.argv[2] ?? '').trim().replace(/\.+$/, '').toLowerCase();
const imap = (process.env['IMAP_USER'] ?? '').trim().toLowerCase();

if (cible === '') {
  console.error('Usage : node --env-file=../../.env scripts/verify-email.mjs <adresse>');
  process.exit(1);
}
if (imap === '') {
  console.error('IMAP_USER absent : aucune preuve indépendante, on ne confirme rien.');
  process.exit(1);
}
if (cible !== imap) {
  console.error(
    // ON MONTRE CE QU'ON A COMPARÉ. « Ce n'est pas la bonne adresse » sans dire
    // laquelle on a reçue laisse chercher longtemps une faute d'un caractère.
    `Refusé : « ${cible} » n’est pas la boîte lue par le collecteur.\n` +
      'Ce script ne confirme que celle-là, dont nous avons la preuve — pas une autre.',
  );
  process.exit(1);
}

const url = process.env['TURSO_DATABASE_URL'];
const authToken = process.env['TURSO_AUTH_TOKEN'];
if (url === undefined) {
  console.error('TURSO_DATABASE_URL absent.');
  process.exit(1);
}

const db = createClient(authToken === undefined ? { url } : { url, authToken });

const avant = await db.execute({
  sql: 'SELECT id, email_verified FROM users WHERE lower(email) = ?',
  args: [cible],
});
if (avant.rows.length !== 1) {
  console.error(`Aucun compte unique sur cette adresse (${avant.rows.length} trouvé(s)).`);
  process.exit(1);
}

const compte = String(avant.rows[0]['id']);
if (Number(avant.rows[0]['email_verified']) === 1) {
  console.log(`Le compte « ${compte} » a déjà une adresse confirmée. Rien à faire.`);
  process.exit(0);
}

await db.execute({
  sql: 'UPDATE users SET email_verified = 1 WHERE lower(email) = ?',
  args: [cible],
});

const apres = await db.execute({
  sql: 'SELECT email_verified FROM users WHERE lower(email) = ?',
  args: [cible],
});
console.log(
  `Compte « ${compte} » : adresse confirmée (${Number(apres.rows[0]['email_verified'])}).`,
);
console.log('« Mot de passe oublié » et les alertes par e-mail sont désormais possibles.');
