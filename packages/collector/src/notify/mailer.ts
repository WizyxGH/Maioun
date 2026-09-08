/**
 * Envoi d'e-mails transactionnels (§24, §26).
 *
 * DEUX APPELANTS, UN SEUL FOURNISSEUR. Le Worker envoie les liens de
 * réinitialisation et de confirmation d'adresse ; le collecteur envoie les
 * alertes. Ce fichier vivait dans le Worker : le collecteur aurait dû
 * réécrire le même appel, et un projet qui parle à Resend à deux endroits en
 * change à deux endroits. Il est donc ici, exposé par
 * `@maioun/collector/notify/mailer`.
 *
 * Rien d'autre ne part d'ici — les messages aux AGENCES restent envoyés par
 * l'utilisateur lui-même, depuis son propre client (§24), et cela ne change
 * pas.
 *
 * POURQUOI UNE API HTTP ET NON SMTP. Un Worker Cloudflare ne peut pas ouvrir de
 * connexion TCP arbitraire : SMTP lui est fermé. Le collecteur, lui, pourrait —
 * mais il ne tourne que sur minuterie, toutes les demi-heures au mieux et en
 * pratique toutes les deux à quatre heures : personne n'attend son mot de passe
 * aussi longtemps. Il faut donc une API appelable en HTTP, et une seule suffit
 * aux deux.
 *
 * CE FICHIER N'IMPORTE RIEN DE NODE, et ne doit jamais le faire : le Worker le
 * charge, et un `node:fs` y romprait le bundle.
 *
 * POURQUOI RESEND. Palier gratuit sans carte bancaire — la contrainte du projet
 * (§30) —, trois mille messages par mois, et une API d'une seule requête. Son
 * expéditeur de démarrage fonctionne sans posséder de domaine, ce qui permet de
 * s'en servir tout de suite.
 *
 * LE FOURNISSEUR EST ISOLÉ DANS CE FICHIER, et c'est délibéré : `sendEmail` est
 * la seule chose que le reste du Worker connaît. En changer revient à réécrire
 * `postToResend`, une vingtaine de lignes, sans toucher au flux de
 * réinitialisation.
 *
 * NON CONFIGURÉ = ON LE DIT. Sans clé d'API, `sendEmail` rend `false` au lieu
 * de faire semblant. L'écran affiche alors que la fonctionnalité n'est pas
 * disponible, plutôt que « un message vous a été envoyé » pour un message qui
 * ne partira jamais (§17) — l'utilisateur attendrait, rafraîchirait sa boîte,
 * et n'aurait aucun moyen de comprendre.
 */

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  /** Corps en texte brut. Aucun HTML : rien ici n'a besoin de mise en forme. */
  readonly text: string;
}

export interface MailerEnv {
  /** Clé d'API du fournisseur d'envoi. Absente = envoi désactivé. */
  readonly EMAIL_API_KEY?: string;
  /** Expéditeur, ex. `Maïoun <compte@example.invalid>`. */
  readonly EMAIL_FROM?: string;
}

/** `true` si l'envoi est configuré — donc si l'on peut promettre un message. */
export function mailerConfigured(env: MailerEnv): boolean {
  return (
    env.EMAIL_API_KEY !== undefined &&
    env.EMAIL_API_KEY.trim() !== '' &&
    env.EMAIL_FROM !== undefined &&
    env.EMAIL_FROM.trim() !== ''
  );
}

/**
 * Envoie un message. `false` si l'envoi n'est pas configuré ou a échoué.
 *
 * NE LÈVE JAMAIS (§69). Un fournisseur indisponible ne doit pas transformer une
 * demande de réinitialisation en erreur 500 : l'appelant décide quoi dire, et
 * il n'a de toute façon rien de mieux à répondre qu'« essayez plus tard ».
 */
export async function sendEmail(env: MailerEnv, message: EmailMessage): Promise<boolean> {
  return (await sendEmailResult(env, message)) === 'sent';
}

/**
 * Pourquoi un envoi n'a pas eu lieu.
 *
 * `unconfigured` il manque la clé ou l'expéditeur ; `refused` le fournisseur a
 * dit non ; `unreachable` on ne l'a pas joint.
 */
export type SendOutcome = 'sent' | 'unconfigured' | 'refused' | 'unreachable';

/**
 * Envoie un message et DIT CE QUI S'EST PASSÉ.
 *
 * `sendEmail` rendait `false` dans les quatre cas, et n'écrivait rien nulle
 * part : une clé absente, une clé invalide et un destinataire refusé étaient
 * indiscernables. L'écran affichait alors « l'envoi n'est pas configuré » pour
 * un envoi parfaitement configuré que le fournisseur venait de refuser — ce qui
 * envoie chercher le problème exactement là où il n'est pas (§17).
 *
 * LE REFUS EST JOURNALISÉ, corps compris : c'est la seule trace qui permette de
 * comprendre. Resend explique précisément ses refus — expéditeur non vérifié,
 * destinataire interdit tant qu'aucun domaine ne l'est — et cette phrase vaut
 * mieux que toutes nos suppositions.
 *
 * NE LÈVE JAMAIS (§69) : un fournisseur en panne ne doit pas transformer une
 * demande de réinitialisation en erreur 500.
 */
export async function sendEmailResult(env: MailerEnv, message: EmailMessage): Promise<SendOutcome> {
  if (!mailerConfigured(env)) return 'unconfigured';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (response.ok) return 'sent';
    // Le corps est lu puis journalisé, jamais rendu à l'appelant : il peut
    // nommer l'expéditeur configuré, qui ne regarde pas le navigateur.
    const detail = await response.text().catch(() => '');
    /**
     * LA FORME DE LA CLÉ, JAMAIS LA CLÉ. « API key is invalid » ne dit pas si
     * elle a été révoquée ou simplement mal recopiée — une valeur tronquée,
     * des guillemets restés collés, un retour à la ligne. Sa longueur et son
     * préfixe tranchent entre les deux, et ne permettent pas de la
     * reconstituer : une clé Resend fait « re_ » suivi d une trentaine de
     * caractères.
     */
    const key = env.EMAIL_API_KEY ?? '';
    console.error('email.refused', response.status, detail.slice(0, 500), {
      keyLength: key.length,
      keyPrefix: key.slice(0, 3),
      keyTrimmed: key === key.trim(),
      keyQuoted: /^["']|["']$/.test(key),
    });
    return 'refused';
  } catch (error) {
    console.error('email.unreachable', error instanceof Error ? error.message : String(error));
    return 'unreachable';
  }
}
