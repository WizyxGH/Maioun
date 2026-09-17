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
import { MIN_PASSWORD_LENGTH } from '@maioun/shared';
import { hashPassword, verifyPassword } from './auth.js';
import { emailProblem, normalizeEmail, type EmailProblem } from './email-address.js';
import { hashToken, newToken } from './password-reset.js';
import { EMAIL_COLORS, emailDocument, escapeHtml } from '@maioun/collector/notify/email-theme';

/** Durée de validité d'un lien de confirmation. */
const VALID_HOURS = 48;

export type SignupProblem = 'email-taken' | 'weak-password' | EmailProblem;

export interface NewAccount {
  readonly email: string;
  readonly password: string;
}

export interface CreatedAccount {
  readonly userId: string;
  /** Le jeton de confirmation en clair. Il n'existe qu'ici et dans le lien. */
  readonly token: string;
  /** Le code à six chiffres, en clair ici et dans le message seulement. */
  readonly code: string;
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
      return `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`;
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

/**
 * Le code à six chiffres qui double le lien.
 *
 * SANS QUITTER LE SITE : ouvrir sa messagerie sur le téléphone et suivre un
 * lien ouvre souvent un autre navigateur, où l'on n'est pas connecté. Le code
 * se recopie dans l'onglet déjà ouvert.
 *
 * L'EMPREINTE LIE LE CODE AU COMPTE : un million de valeurs se devinent, mais
 * seulement depuis la session de ce compte, et au rythme que la route permet.
 */
export function newCode(): string {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return String((value ?? 0) % 1_000_000).padStart(6, '0');
}

export async function hashCode(userId: string, code: string): Promise<string> {
  return await hashToken(`code:${userId}:${code}`);
}

/** Les deux lignes d'une confirmation : le lien et le code, même échéance. */
export async function verificationRows(
  userId: string,
  nowMs: number,
): Promise<{ token: string; code: string; statements: { sql: string; args: string[] }[] }> {
  const token = newToken();
  const code = newCode();
  const now = new Date(nowMs).toISOString();
  const expires = new Date(nowMs + VALID_HOURS * 3_600_000).toISOString();
  const sql = `INSERT INTO email_verifications (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)`;
  return {
    token,
    code,
    statements: [
      { sql, args: [await hashToken(token), userId, now, expires] },
      { sql, args: [await hashCode(userId, code), userId, now, expires] },
    ],
  };
}

/**
 * LE CODE D'UN SEUL TENANT, EN TÊTE : c'est à cette forme que iOS, Android et
 * Gmail reconnaissent un code à usage unique — bouton « Copier le code » dans la
 * notification, remplissage automatique du champ sur le site. « 042 517 », avec
 * son espace, n'était reconnu par aucun.
 */
export function confirmEmailSubject(code: string): string {
  return `${code} est votre code Maïoun`;
}

/** Le message de confirmation : objet, texte brut de secours, version mise en forme. */
export function confirmEmailMessage(
  link: string,
  code: string,
): { subject: string; text: string; html: string } {
  return {
    subject: confirmEmailSubject(code),
    text: confirmEmailBody(link, code),
    html: confirmEmailHtml(link, code),
  };
}

/** La version mise en forme : le code en grand, sélectionnable d'un geste. */
export function confirmEmailHtml(link: string, code: string): string {
  const { primary, foreground, muted, border } = EMAIL_COLORS;
  const safeLink = escapeHtml(link);
  return emailDocument({
    title: confirmEmailSubject(code),
    // Ce qu'affiche la notification après l'objet : le code encore, seul.
    preheader: `${code} — saisissez ce code sur Maïoun pour confirmer votre adresse.`,
    rows: `<tr><td style="padding:0 0 12px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${border};border-radius:12px">
<tr><td align="center" style="padding:28px 20px">
<div style="font-size:20px;font-weight:700;color:${foreground}">Confirmez votre adresse</div>
<div style="margin-top:6px;font-size:14px;color:${muted}">Votre code de confirmation</div>
<div style="margin:16px auto 0 auto;display:inline-block;padding:14px 22px;border:2px dashed ${primary};border-radius:12px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:8px;color:${foreground};-webkit-user-select:all;user-select:all">${escapeHtml(code)}</div>
<div style="margin-top:10px;font-size:13px;color:${muted}">Appuyez longuement sur le code pour le copier.</div>
<div style="margin-top:22px"><a href="${safeLink}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 20px;border-radius:8px">Confirmer mon adresse</a></div>
<div style="margin-top:14px;font-size:12px;color:${muted}">Le code et le lien expirent dans ${VALID_HOURS} heures.</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:12px 8px 0 8px;font-size:12px;color:${muted};line-height:1.5">
Tant qu’elle n’est pas confirmée, votre adresse ne permet pas de réinitialiser votre mot de passe.
Si vous n’êtes pas à l’origine de cette inscription, ignorez ce message : le compte créé n’a accès à rien qui vous appartienne, et sera supprimé.
</td></tr>`,
  });
}

/** Le corps du message de confirmation, en texte brut. */
export function confirmEmailBody(link: string, code: string): string {
  return [
    `${code} est votre code de confirmation Maïoun.`,
    '',
    'Bienvenue sur Maïoun.',
    '',
    'Saisissez-le sur Maïoun, dans Paramètres, ou suivez ce lien :',
    link,
    '',
    `Le code et le lien expirent dans ${VALID_HOURS} heures.`,
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

  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, problem: 'weak-password' };

  const taken = await db.execute({
    sql: 'SELECT id FROM users WHERE lower(email) = ? LIMIT 1',
    args: [email],
  });
  if (taken.rows[0] !== undefined) return { ok: false, problem: 'email-taken' };

  const userId = crypto.randomUUID();
  const hash = await hashPassword(input.password);
  const verification = await verificationRows(userId, nowMs);
  const now = new Date(nowMs).toISOString();

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
        ...verification.statements,
      ],
      'write',
    );
  } catch {
    // L'index unique a parlé : quelqu'un a pris l'adresse entre-temps.
    return { ok: false, problem: 'email-taken' };
  }

  return {
    ok: true,
    account: { userId, token: verification.token, code: verification.code, email },
  };
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
  | { ok: true; token: string; code: string; email: string }
  | { ok: false; problem: ChangeEmailProblem }
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

  const verification = await verificationRows(userId, nowMs);

  try {
    await db.batch(
      [
        {
          sql: 'UPDATE users SET email = ?, email_verified = 0 WHERE id = ?',
          args: [email, userId],
        },
        ...verification.statements,
      ],
      'write',
    );
  } catch {
    return { ok: false, problem: 'email-taken' };
  }

  return { ok: true, token: verification.token, code: verification.code, email };
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
  return await consumeVerification(db, await hashToken(token), nowMs);
}

/**
 * Consomme le code à six chiffres saisi sur le site, pour CE compte seulement.
 * Espaces et tirets tolérés : on recopie « 123 456 » tel qu'il est écrit.
 */
export async function confirmEmailCode(
  db: Client,
  userId: string,
  code: string,
  nowMs: number,
): Promise<ConfirmOutcome> {
  const digits = code.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(digits)) return 'invalid';
  return await consumeVerification(db, await hashCode(userId, digits), nowMs);
}

async function consumeVerification(
  db: Client,
  tokenHash: string,
  nowMs: number,
): Promise<ConfirmOutcome> {
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
      // Les identifiants d'une source payante : un SECRET, et c'était le plus
      // grave des oublis — il survivait à l'effacement du compte.
      { sql: 'DELETE FROM source_credentials WHERE user_id = ?', args: [userId] },
      // Ce qui correspondait à ses critères et son temps de trajet : un profil
      // de préférences, pas une donnée technique.
      { sql: 'DELETE FROM listing_user_score WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM daily_stats_per_user WHERE user_id = ?', args: [userId] },
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
