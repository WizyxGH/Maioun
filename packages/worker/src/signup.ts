/**
 * Créer un compte, confirmer son adresse, et le supprimer (§26, RGPD).
 *
 * LES COMPTES SE CRÉAIENT EN LIGNE DE COMMANDE, depuis la machine qui détient
 * le jeton de la base. Tenable pour un utilisateur, absurde dès qu'on vend le
 * service : personne ne peut s'inscrire.
 *
 * CE FICHIER NE SAIT NI ENVOYER UN E-MAIL NI LIRE UNE SESSION. Il valide,
 * écrit, rend le jeton à glisser dans un lien — et l'appelant s'en charge.
 * C'est ce qui le rend testable sans réseau (§59), comme `password-reset.ts`
 * dont il est le jumeau.
 *
 * L'ADRESSE EST L'IDENTIFIANT. On demandait EN PLUS un identifiant à inventer,
 * soumis à ses propres règles de forme et de disponibilité : une chose de plus
 * à trouver, à retenir et à retaper, pour distinguer des comptes que l'adresse
 * distinguait déjà — elle est unique, et c'est la seule des deux qu'on vérifie.
 * Trois des six refus possibles à l'inscription ne portaient que sur lui.
 *
 * La colonne `login` demeure, et la CONNEXION l'accepte toujours : les comptes
 * antérieurs en ont un et doivent pouvoir entrer avec. Elle n'est simplement
 * plus remplie pour les nouveaux.
 *
 * L'ADRESSE EST CONFIRMÉE, PAS SEULEMENT SAISIE. Une adresse saisie n'est
 * qu'une chaîne : rien ne dit qu'elle existe, ni qu'elle appartient à celui qui
 * la tape. C'est la confirmation par lien — et elle seule — qui empêche
 * réellement de s'inscrire avec l'adresse d'un autre, ou avec une adresse
 * inventée. Les listes de domaines jetables (`email-address.ts`) n'en sont que
 * le complément.
 *
 * LE COMPTE EST UTILISABLE AVANT CONFIRMATION, et c'est un choix. Bloquer
 * l'entrée jusqu'au clic sur le lien punit d'abord celui dont le message est
 * arrivé dans les indésirables, ou dont l'envoi n'est pas encore configuré. Ce
 * qui reste FERMÉ tant que l'adresse n'est pas prouvée, c'est la
 * réinitialisation de mot de passe : elle écrit à cette adresse, elle exige
 * donc qu'elle soit la bonne.
 */

import type { Client } from '@libsql/client/web';
import { hashPassword, verifyPassword } from './auth.js';
import { emailProblem, normalizeEmail, type EmailProblem } from './email-address.js';
import { hashToken, newToken } from './password-reset.js';

/** Durée de validité d'un lien de confirmation. */
const VALID_HOURS = 48;

/**
 * Longueur minimale d'un mot de passe. Huit caractères, comme à la
 * réinitialisation : les deux règles doivent coïncider, sinon on accepte à la
 * création ce qu'on refusera à la remise à zéro.
 */
const MIN_PASSWORD = 8;

export type SignupProblem = 'email-taken' | 'weak-password' | EmailProblem;

export interface NewAccount {
  readonly email: string;
  readonly password: string;
}

export interface CreatedAccount {
  readonly userId: string;
  /** Le jeton de confirmation en clair. Il n'existe qu'ici et dans le lien. */
  readonly token: string;
  readonly email: string;
}

/** Le message montré pour chaque refus, en clair et sans jargon. */
export function signupProblemMessage(problem: SignupProblem): string {
  switch (problem) {
    case 'email-taken':
      // ON NE DIT PAS « un compte existe déjà avec cette adresse » sur un
      // formulaire ouvert : ce serait un annuaire, interrogeable en boucle pour
      // savoir qui est inscrit. La phrase reste vraie et n'apprend rien.
      return 'Impossible de créer un compte avec cette adresse. Si elle est déjà la vôtre, utilisez « mot de passe oublié ».';
    case 'weak-password':
      return `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`;
    case 'disposable':
      return 'Les adresses jetables ne sont pas acceptées : sans adresse durable, vous ne pourriez pas récupérer votre compte.';
    case 'shape':
      return 'Cette adresse e-mail ne semble pas valide.';
  }
}

/**
 * Le message montré quand un changement d'adresse est refusé.
 *
 * `email-taken` peut se dire franchement ICI, contrairement à l'inscription :
 * il faut déjà être connecté pour l'obtenir, donc rien n'en fait un annuaire.
 */
export function changeEmailProblemMessage(problem: ChangeEmailProblem): string {
  switch (problem) {
    case 'wrong-password':
      return 'Mot de passe incorrect.';
    case 'email-taken':
      return 'Cette adresse est déjà utilisée par un autre compte.';
    case 'disposable':
      return 'Les adresses jetables ne sont pas acceptées : sans adresse durable, vous ne pourriez pas récupérer votre compte.';
    case 'shape':
      return 'Cette adresse e-mail ne semble pas valide.';
  }
}

/** Le corps du message de confirmation. */
export function confirmEmailBody(link: string): string {
  return [
    'Bienvenue sur Maïoun.',
    '',
    'Confirmez votre adresse en suivant ce lien :',
    link,
    '',
    `Le lien expire dans ${VALID_HOURS} heures.`,
    '',
    "Tant qu'elle n'est pas confirmée, votre adresse ne permet pas de",
    'réinitialiser votre mot de passe : nous ne pouvons écrire qu’à une adresse',
    'dont nous savons qu’elle est bien la vôtre.',
    '',
    "Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.",
    "Le compte créé n'a accès à rien qui vous appartienne, et sera supprimé.",
  ].join('\n');
}

/** L'adresse à laquelle le lien de confirmation mène. */
export function confirmLink(siteUrl: string, token: string): string {
  const base = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  return `${base}/confirm/${encodeURIComponent(token)}`;
}

/**
 * Crée un compte. Rend le problème rencontré, ou le compte créé.
 *
 * L'IDENTIFIANT ET L'ADRESSE SONT VÉRIFIÉS AVANT L'ÉCRITURE, mais c'est
 * l'INDEX UNIQUE qui tranche : entre la vérification et l'insertion, une autre
 * requête peut avoir pris la place. C'est rare et sans gravité — mais sans
 * l'index, ce serait deux comptes sur la même adresse, et « mot de passe
 * oublié » deviendrait ambigu pour toujours.
 */
export async function createAccount(
  db: Client,
  input: NewAccount,
  nowMs: number,
): Promise<{ ok: true; account: CreatedAccount } | { ok: false; problem: SignupProblem }> {
  const email = normalizeEmail(input.email);
  const problem = emailProblem(email);
  if (problem !== null) return { ok: false, problem };

  if (input.password.length < MIN_PASSWORD) return { ok: false, problem: 'weak-password' };

  const taken = await db.execute({
    sql: 'SELECT id FROM users WHERE lower(email) = ? LIMIT 1',
    args: [email],
  });
  if (taken.rows[0] !== undefined) return { ok: false, problem: 'email-taken' };

  const userId = crypto.randomUUID();
  const hash = await hashPassword(input.password);
  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = new Date(nowMs).toISOString();
  const expires = new Date(nowMs + VALID_HOURS * 3_600_000).toISOString();

  try {
    await db.batch(
      [
        {
          // `alert_token` est tiré ICI et non par défaut en base : c'est lui qui
          // rend l'adresse de transfert indevinable (§6), et un compte qui
          // naîtrait sans en serait privé jusqu'à ce que quelqu'un le remarque.
          // `login` RESTE NULL : l'adresse est désormais le seul identifiant
          // qu'on crée. La colonne demeure pour les comptes qui en avaient un
          // avant, et qui continuent de s'en servir pour entrer. SQLite tolère
          // plusieurs NULL sous un index unique, ce qui rend la cohabitation
          // possible sans migration.
          sql: `INSERT INTO users (id, login, password_hash, display_name, created_at, alert_token, email, email_verified)
                VALUES (?, NULL, ?, ?, ?, lower(hex(randomblob(9))), ?, 0)`,
          args: [userId, hash, email.split('@')[0] ?? email, now, email],
        },
        {
          sql: `INSERT INTO email_verifications (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)`,
          args: [tokenHash, userId, now, expires],
        },
      ],
      'write',
    );
  } catch {
    // L'index unique a parlé : quelqu'un a pris l'adresse entre-temps.
    return { ok: false, problem: 'email-taken' };
  }

  return { ok: true, account: { userId, token, email } };
}

export type ChangeEmailProblem = 'email-taken' | 'wrong-password' | EmailProblem;

/**
 * Change l'adresse d'un compte, en la remettant À PROUVER.
 *
 * L'ADRESSE NE SE POSAIT QU'À L'INSCRIPTION, et rien ne permettait d'en
 * changer. Un compte dont l'adresse était fautive, abandonnée ou simplement
 * mal tapée y restait pour toujours : plus de « mot de passe oublié » — la
 * réinitialisation part à cette adresse-là —, plus d'alertes par e-mail, et
 * aucun écran pour le corriger. Les comptes nés d'une migration sont les plus
 * exposés : `email_verified` valait 1 PAR DÉFAUT DE COLONNE, si bien qu'une
 * adresse que personne n'a jamais confirmée se présente comme prouvée.
 *
 * LE MOT DE PASSE EST EXIGÉ, et ce n'est pas une formalité : changer l'adresse
 * d'un compte, c'est déplacer là où part son lien de réinitialisation. Sur une
 * session laissée ouverte, ce seul geste suffirait à prendre le compte.
 *
 * `email_verified` RETOMBE À 0 jusqu'au clic sur le lien. Une adresse
 * seulement saisie peut être celle de quelqu'un d'autre, par faute de frappe
 * ou à dessein ; la marquer prouvée sur parole enverrait ensuite à un inconnu
 * de quoi entrer dans le compte (§26).
 */
export async function changeEmail(
  db: Client,
  userId: string,
  input: { readonly email: string; readonly password: string },
  nowMs: number,
): Promise<
  { ok: true; token: string; email: string } | { ok: false; problem: ChangeEmailProblem }
> {
  const email = normalizeEmail(input.email);
  const problem = emailProblem(email);
  if (problem !== null) return { ok: false, problem };

  const found = await db.execute({
    sql: 'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  });
  const stored = found.rows[0]?.['password_hash'];
  if (typeof stored !== 'string' || !(await verifyPassword(input.password, stored))) {
    return { ok: false, problem: 'wrong-password' };
  }

  // L'unicité est vérifiée AVANT d'écrire, pour rendre un message utile plutôt
  // que l'échec brut de l'index — mais l'index reste la vraie garantie, deux
  // comptes pouvant viser la même adresse au même instant.
  const taken = await db.execute({
    sql: 'SELECT id FROM users WHERE lower(email) = ? AND id != ? LIMIT 1',
    args: [email, userId],
  });
  if (taken.rows[0] !== undefined) return { ok: false, problem: 'email-taken' };

  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = new Date(nowMs).toISOString();
  const expires = new Date(nowMs + VALID_HOURS * 3_600_000).toISOString();

  try {
    await db.batch(
      [
        {
          sql: 'UPDATE users SET email = ?, email_verified = 0 WHERE id = ?',
          args: [email, userId],
        },
        {
          sql: `INSERT INTO email_verifications (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)`,
          args: [tokenHash, userId, now, expires],
        },
      ],
      'write',
    );
  } catch {
    return { ok: false, problem: 'email-taken' };
  }

  return { ok: true, token, email };
}

export type ConfirmOutcome = 'ok' | 'invalid';

/**
 * Consomme un jeton de confirmation et marque l'adresse prouvée.
 *
 * `invalid` recouvre jeton inconnu, expiré ou déjà servi : les distinguer
 * apprendrait à qui essaie au hasard qu'un jeton a existé, et ne changerait
 * rien pour le destinataire légitime.
 */
export async function confirmEmail(
  db: Client,
  token: string,
  nowMs: number,
): Promise<ConfirmOutcome> {
  const tokenHash = await hashToken(token);
  const found = await db.execute({
    sql: 'SELECT user_id, expires_at, used_at FROM email_verifications WHERE token_hash = ? LIMIT 1',
    args: [tokenHash],
  });
  const row = found.rows[0];
  if (row === undefined) return 'invalid';

  const userId = row['user_id'];
  const expiresAt = row['expires_at'];
  if (typeof userId !== 'string' || typeof expiresAt !== 'string') return 'invalid';
  if (row['used_at'] !== null && row['used_at'] !== undefined) return 'invalid';
  if (Date.parse(expiresAt) <= nowMs) return 'invalid';

  await db.batch(
    [
      { sql: 'UPDATE users SET email_verified = 1 WHERE id = ?', args: [userId] },
      {
        sql: 'UPDATE email_verifications SET used_at = ? WHERE token_hash = ?',
        args: [new Date(nowMs).toISOString(), tokenHash],
      },
    ],
    'write',
  );
  return 'ok';
}

/**
 * Efface un compte et TOUT ce qui s'y rattache (RGPD, article 17).
 *
 * LES CLÉS ÉTRANGÈRES NE SUFFISENT PAS. `ON DELETE CASCADE` ne s'applique que
 * si SQLite a `PRAGMA foreign_keys = ON`, ce qui n'est pas garanti d'une
 * connexion à l'autre : s'en remettre à elles laisserait des lignes orphelines
 * sans que rien ne le signale. On nomme donc chaque table, une par une, et
 * cette liste doit grandir avec le schéma.
 *
 * CE QUI N'EST PAS EFFACÉ : les annonces. Elles ne sont à personne — ce sont
 * des offres publiques, collectées chez des agences, et elles restent visibles
 * pour les autres comptes. Ce qui disparaît, c'est tout ce qui RELIE ce compte
 * à elles : ses favoris, son suivi, ses archives, ses brouillons.
 *
 * LES PIÈCES DU DOSSIER VIVENT AILLEURS, dans le stockage clé-valeur, et ne
 * sont pas concernées ici : l'appelant les supprime, parce que lui seul tient
 * ce stockage.
 */
export async function deleteAccount(db: Client, userId: string): Promise<void> {
  await db.batch(
    [
      { sql: 'DELETE FROM listing_user_state WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM app_settings WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM contact_attempts WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM push_subscriptions WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM password_resets WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM email_verifications WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [userId] },
    ],
    'write',
  );
}
