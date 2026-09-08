/**
 * À QUEL COMPTE un e-mail d'alerte transféré appartient (§6, §26).
 *
 * LE PROBLÈME. Le collecteur lit UNE boîte, celle du projet. Chaque compte y
 * fait suivre ses propres alertes de portail depuis sa messagerie. Rien, dans
 * le corps du message, ne dit de qui il vient : un digest SeLoger a la même
 * apparence pour tout le monde.
 *
 * CE QUI LE DIT, c'est l'ADRESSE À LAQUELLE il a été envoyé. Chaque compte
 * dispose de la sienne — `alertes+<jeton>@…` —, et le sous-adressage `+` fait
 * arriver tous ces messages dans la même boîte tout en conservant, dans les
 * en-têtes, l'adresse exacte visée.
 *
 * CE N'EST PAS QU'UNE ÉTIQUETTE, C'EST UNE PORTE. La boîte du projet reçoit
 * tout ce qu'on lui envoie. Sans cette vérification, n'importe qui connaissant
 * son adresse pourrait y déverser des annonces et les faire entrer dans la base
 * COMMUNE à tous les comptes. Le jeton est tiré au hasard et ne se devine pas :
 * exiger qu'il soit présent, c'est exiger que le message ait été transféré par
 * quelqu'un à qui nous l'avons donné.
 *
 * CE MODULE NE LIT NI E-MAIL NI BASE : il ne fait que rapprocher des chaînes.
 * C'est ce qui le rend testable sans réseau (§59), et c'est le seul endroit où
 * cette correspondance est décidée.
 */

/**
 * Le jeton contenu dans une adresse, selon le gabarit configuré.
 *
 * Le gabarit ressemble à `alertes+{token}@exemple.fr`. On le découpe en deux et
 * l'on retient ce qui se trouve entre les deux morceaux. `null` dès que
 * l'adresse ne suit pas le gabarit — on ne devine pas (§17).
 */
export function tokenFromAddress(address: string, template: string): string | null {
  const marker = template.indexOf('{token}');
  if (marker === -1) return null;
  const prefix = template.slice(0, marker).toLowerCase();
  const suffix = template.slice(marker + '{token}'.length).toLowerCase();
  const value = address.trim().toLowerCase();
  if (prefix === '' || !value.startsWith(prefix) || !value.endsWith(suffix)) return null;
  const token = value.slice(prefix.length, value.length - suffix.length);
  // Un jeton vide signifierait « n'importe qui » : c'est l'inverse du but.
  return /^[a-z0-9_-]+$/.test(token) ? token : null;
}

/**
 * Les en-têtes qui portent une destination, du plus fiable au moins.
 *
 * `Delivered-To` D'ABORD, parce que c'est le seul que le serveur de RÉCEPTION
 * écrit lui-même : il porte l'adresse réellement visée, sous-adressage compris.
 * `To:` garde ce qu'avait écrit l'expéditeur d'origine — après un transfert,
 * c'est l'adresse personnelle de l'utilisateur, pas la nôtre. Les autres
 * suivent parce qu'aucun fournisseur ne les écrit tous.
 */
export const RECIPIENT_HEADERS = [
  'delivered-to',
  'x-original-to',
  'x-forwarded-to',
  'envelope-to',
  'to',
  'cc',
] as const;

/** Extrait les adresses d'une valeur d'en-tête (« Nom &lt;a@exemple.invalid&gt;, b@exemple.invalid »). */
export function addressesIn(headerValue: string | null | undefined): string[] {
  if (headerValue === null || headerValue === undefined) return [];
  return [...headerValue.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((match) => match[0].toLowerCase());
}

/**
 * Le jeton du compte qui a fait suivre ce message, ou `null`.
 *
 * `null` N'EST PAS UN DÉTAIL : le message n'a pas été envoyé à une adresse que
 * nous avons distribuée. L'appelant l'écarte — voir l'en-tête de ce fichier.
 *
 * GABARIT VIDE = PAS DE VÉRIFICATION. Tant que la fonctionnalité n'est pas
 * configurée, le collecteur se comporte comme avant : il lit la boîte qu'on lui
 * indique, sans rien exiger des destinataires. Refuser tout, faute de gabarit,
 * couperait l'import chez qui lit simplement sa propre boîte.
 */
export function forwardingToken(recipients: readonly string[], template: string): string | null {
  if (template.trim() === '') return null;
  for (const address of recipients) {
    const token = tokenFromAddress(address, template);
    if (token !== null) return token;
  }
  return null;
}

/**
 * `true` si ce message peut entrer dans la base commune.
 *
 * Trois cas : gabarit non configuré (on n'exige rien), jeton reconnu (le
 * message est attribué à son compte), ou message adressé à la BOÎTE ELLE-MÊME.
 *
 * Ce dernier cas est ce qui rend le gabarit posable sans rien casser : les
 * alertes déjà configurées chez les portails visent l'adresse simple, et les
 * couper le jour où l'on renseigne le gabarit ferait disparaître la source
 * sans que rien ne le dise. Elles entrent donc comme avant, sans jeton, donc
 * sans être attribuées — le temps de repointer les portails.
 */
export function acceptsRecipients(
  recipients: readonly string[],
  template: string,
  mailbox = '',
): boolean {
  if (template.trim() === '') return true;
  if (forwardingToken(recipients, template) !== null) return true;
  const own = mailbox.trim().toLowerCase();
  return own !== '' && recipients.some((address) => address.trim().toLowerCase() === own);
}
