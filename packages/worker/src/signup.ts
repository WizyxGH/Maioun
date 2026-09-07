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
import { hashPassword } from './auth.js';
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

/**
 * Forme d'un identifiant de connexion.
 *
 * Volontairement étroite. Un identifiant sert à se connecter et à rien d'autre :
 * il n'a pas besoin d'espaces, d'accents ni d'emoji, et les accepter crée des
 * comptes qu'on ne peut plus taper depuis un autre clavier. Trois caractères au
 * moins, trente-deux au plus, commençant par une lettre.
 */
const LOGIN_SHAPE = /^[a-z][a-z0-9._-]{2,31}$/;

/**
 * Identifiants réservés, qui ne doivent appartenir à personne.
 *
 * `admin` ou `support` dans un message donnent à leur porteur une autorité
 * qu'il n'a pas — c'est le plus vieux tour de l'hameçonnage.
 */
const RESERVED_LOGINS = [
  'admin',
  'administrateur',
  'root',
  'maioun',
  'support',
  'contact',
  'aide',
  'help',
  'moi',
  'api',
  'www',
  'system',
  'noreply',
  'no-reply',
  'postmaster',
  'abuse',
  'security',
  'securite',
];

export type SignupProblem =
  'login-shape' | 'login-reserved' | 'login-taken' | 'email-taken' | 'weak-password' | EmailProblem;

export interface NewAccount {
  readonly login: string;
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
    case 'login-shape':
      return 'L’identifiant doit faire 3 à 32 caractères : une lettre, puis des lettres, chiffres, points, tirets ou soulignés.';
    case 'login-reserved':
      return 'Cet identifiant est réservé. Choisissez-en un autre.';
    case 'login-taken':
      return 'Cet identifiant est déjà pris.';
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
  const login = input.login.trim().toLowerCase();
  if (!LOGIN_SHAPE.test(login)) return { ok: false, problem: 'login-shape' };
  if (RESERVED_LOGINS.includes(login)) return { ok: false, problem: 'login-reserved' };

  const email = normalizeEmail(input.email);
  const problem = emailProblem(email);
  if (problem !== null) return { ok: false, problem };

  if (input.password.length < MIN_PASSWORD) return { ok: false, problem: 'weak-password' };

  const taken = await db.execute({
    sql: 'SELECT login, lower(email) AS email FROM users WHERE login = ? OR lower(email) = ? LIMIT 1',
    args: [login, email],
  });
  const clash = taken.rows[0];
  if (clash !== undefined) {
    return { ok: false, problem: clash['login'] === login ? 'login-taken' : 'email-taken' };
  }

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
          sql: `INSERT INTO users (id, login, password_hash, display_name, created_at, alert_token, email, email_verified)
                VALUES (?, ?, ?, ?, ?, lower(hex(randomblob(9))), ?, 0)`,
          args: [userId, login, hash, login, now, email],
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
    // L'index unique a parlé : quelqu'un a pris la place entre-temps. On ne
    // sait pas lequel des deux, et le dire n'aiderait personne.
    return { ok: false, problem: 'login-taken' };
  }

  return { ok: true, account: { userId, token, email } };
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
