/**
 * Ce qu'on accepte comme adresse e-mail, et ce qu'on refuse (§26).
 *
 * « Fait en sorte qu'on ne puisse pas avoir de compte avec des adresses mails
 * wtf ou encore spam/ddos le projet. » Ce fichier répond à la première moitié ;
 * `rate-limit.ts` répond à la seconde.
 *
 * TROIS FILTRES, DU PLUS BÊTE AU PLUS UTILE :
 *
 *   1. LA FORME. Une adresse sans arobase, sans point dans le domaine, ou dont
 *      le domaine finit par un TLD réservé (`.local`, `.test`, `.invalid`,
 *      `.example`) ne peut recevoir aucun message. L'accepter, c'est créer un
 *      compte à qui l'on ne pourra jamais écrire — donc un compte sans recours
 *      le jour où son mot de passe sera perdu.
 *
 *   2. LES BOÎTES JETABLES. Yopmail, Mailinator et leurs semblables donnent une
 *      adresse valable dix minutes, souvent publique, souvent sans mot de
 *      passe. Un compte adossé à l'une d'elles n'a pas de propriétaire : le
 *      lien de réinitialisation qu'on y enverrait serait lisible par le premier
 *      venu qui devine le nom de la boîte.
 *
 *   3. RIEN D'AUTRE. Pas de vérification MX, pas de service tiers de scoring,
 *      pas de « cette adresse a l'air suspecte ». Ces jugements se trompent, et
 *      quand ils se trompent ils refusent l'inscription de quelqu'un de
 *      parfaitement légitime sans qu'il puisse rien y faire. La preuve
 *      sérieuse, c'est la CONFIRMATION par lien : elle ne se devine pas, ne se
 *      contourne pas, et ne rejette personne à tort.
 *
 * LA LISTE EST FORCÉMENT INCOMPLÈTE, et c'est assumé : elle écarte les
 * fournisseurs qu'on rencontre vraiment, pas tous ceux qui existent. Une liste
 * exhaustive demanderait un abonnement payant, que le projet n'a pas (§30), et
 * n'apporterait rien que la confirmation d'adresse n'apporte déjà.
 */

/**
 * Les domaines réservés par les normes, qui ne peuvent pas exister sur
 * Internet. Un message envoyé là ne part jamais.
 */
const RESERVED_TLDS = ['test', 'invalid', 'example', 'local', 'localhost', 'localdomain'];

/**
 * Fournisseurs d'adresses jetables les plus courants.
 *
 * Beaucoup exposent des dizaines de domaines alternatifs ; on retient ceux
 * qu'on croise, en acceptant de ne pas tous les tenir. Le filtre porte aussi
 * sur les SOUS-DOMAINES : `mail.yopmail.com` est du yopmail.
 */
const DISPOSABLE_DOMAINS = [
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'byom.de',
  'cock.li',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'emailtemporaire.com',
  'fakeinbox.com',
  'fakemail.net',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'harakirimail.com',
  'inboxkitten.com',
  'jetable.org',
  'mail-temporaire.fr',
  'mail7.io',
  'mailcatch.com',
  'maildrop.cc',
  'mailduck.io',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'mailtemp.top',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'nowmymail.com',
  'pokemail.net',
  'sharklasers.com',
  'spam4.me',
  'spambog.com',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.dev',
  'tempmail.plus',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'tmail.ws',
  'tmpmail.net',
  'trashmail.com',
  'trashmail.de',
  'trashmail.fr',
  'wegwerfmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
];

/**
 * Forme d'une adresse, volontairement plus stricte que la norme.
 *
 * LA RFC 5322 AUTORISE DES CHOSES QUE PERSONNE N'UTILISE — des guillemets, des
 * commentaires entre parenthèses, des caractères de contrôle échappés. Les
 * accepter ne rendrait service à personne et ouvrirait la porte à des adresses
 * qui cassent tout ce qui les touche ensuite. On s'en tient à ce qu'une boîte
 * réelle porte : lettres, chiffres, et `. _ % + -` avant l'arobase.
 */
const SHAPE = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/;

/** Longueur maximale d'une adresse, telle que la fixe la RFC 5321. */
const MAX_LENGTH = 254;

export type EmailProblem = 'shape' | 'disposable';

/**
 * L'adresse mise en forme comparable : espaces retirés, tout en minuscules.
 *
 * LA CASSE DISPARAÎT DES DEUX CÔTÉS DE L'AROBASE, alors que la norme ne
 * l'autorise qu'à droite. En théorie `Jean@example.com` et `jean@example.com` pourraient être
 * deux boîtes ; en pratique aucun fournisseur ne fait cette distinction, et la
 * conserver créerait deux comptes là où l'utilisateur croit n'en avoir qu'un.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Ce qui cloche dans une adresse, ou `null` si elle est acceptable.
 *
 * L'adresse est supposée déjà normalisée.
 */
export function emailProblem(email: string): EmailProblem | null {
  if (email.length > MAX_LENGTH) return 'shape';
  const domain = SHAPE.exec(email)?.[1];
  if (domain === undefined) return 'shape';

  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (RESERVED_TLDS.includes(tld)) return 'shape';
  // Un TLD d'une seule lettre n'existe pas ; deux chiffres non plus.
  if (tld.length < 2 || /[0-9]/.test(tld)) return 'shape';

  // Le domaine LUI-MÊME ou l'un de ses parents : `mail.yopmail.com` est du
  // yopmail, et se contenter d'une égalité stricte se contournerait en une
  // seconde.
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain === blocked || domain.endsWith(`.${blocked}`)) return 'disposable';
  }
  return null;
}

/** Le message montré à l'inscription, pour chaque refus. */
export function emailProblemMessage(problem: EmailProblem): string {
  return problem === 'disposable'
    ? 'Les adresses jetables ne sont pas acceptées : sans adresse durable, vous ne pourriez pas récupérer votre compte.'
    : 'Cette adresse e-mail ne semble pas valide.';
}
