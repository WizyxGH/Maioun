/**
 * L'adresse à laquelle un compte fait suivre ses alertes de portail (§6).
 *
 * POURQUOI UN TRANSFERT, ET NON UN ACCÈS À LA BOÎTE. Lire les alertes suppose
 * d'atteindre une boîte mail. La faire ouvrir par nous demanderait un mot de
 * passe d'application par compte, rangé en base — ce que le §26 interdit, et ce
 * qu'aucun utilisateur ne devrait accepter de confier. OAuth a été écarté le
 * 2026-09-05 : il ne couvre que Gmail et Outlook, quand les boîtes visées sont
 * chez laposte.net, Orange ou Free, et il exige une vérification annuelle
 * payante de Google faute de quoi les jetons expirent tous les sept jours.
 *
 * Le transfert renverse la charge : l'utilisateur pose une règle dans SA boîte,
 * vers une adresse qui n'est qu'à lui, et la retire quand il veut. Nous ne
 * détenons rien de lui.
 */

/**
 * Compose l'adresse d'un compte à partir du gabarit et de son jeton.
 *
 * @param template gabarit portant `{token}`, ex. `alertes+{token}@exemple.fr`
 * @param token jeton du compte, tel qu'il sort de la base (donc `unknown`)
 * @returns l'adresse, ou `null` si l'un des deux manque.
 *
 * ON NE REND JAMAIS D'ADRESSE À MOITIÉ (§17). Une adresse fausse serait pire
 * que pas d'adresse du tout : l'utilisateur poserait une règle de transfert
 * vers le vide et attendrait des alertes qui ne viendraient jamais, sans que
 * rien ne le lui dise — un transfert qui n'aboutit pas ne fait aucun bruit.
 *
 * Un gabarit sans `{token}` est refusé pour la même raison : il donnerait la
 * MÊME adresse à tous les comptes, et l'on ne saurait plus qui a transféré.
 */
export function alertAddress(template: string | undefined, token: unknown): string | null {
  if (template === undefined || template.trim() === '') return null;
  if (typeof token !== 'string' || token.trim() === '') return null;
  if (!template.includes('{token}')) return null;
  return template.trim().replace('{token}', token.trim());
}

/**
 * La boîte que le collecteur lit, déduite du gabarit.
 *
 * `alertes+{token}@example.invalid` désigne la boîte `alertes@example.invalid` :
 * le sous-adressage `+` fait arriver au même endroit. On retire donc le `+` et
 * ce qui suit, jusqu'à l'arobase.
 */
export function readMailbox(template: string | undefined): string | null {
  if (template === undefined || template.trim() === '') return null;
  const at = template.lastIndexOf('@');
  if (at <= 0) return null;
  const local = template.slice(0, at);
  const plus = local.indexOf('+');
  const base = plus === -1 ? local : local.slice(0, plus);
  return base === '' ? null : `${base}${template.slice(at)}`.trim().toLowerCase();
}

/**
 * `true` quand le compte EST le propriétaire de la boîte lue.
 *
 * IL N'A ALORS RIEN À FAIRE, et le lui demander était le plus sûr moyen de
 * faire passer la fonctionnalité pour compliquée : ses alertes arrivent déjà
 * dans cette boîte, le collecteur les lit déjà, et l'écran lui réclamait
 * pourtant de créer des alertes puis de poser une règle de transfert vers
 * lui-même. Trois étapes pour un résultat déjà acquis.
 *
 * La comparaison est exacte : rien n'est deviné (§17).
 */
export function ownsReadMailbox(template: string | undefined, email: unknown): boolean {
  const mailbox = readMailbox(template);
  if (mailbox === null || typeof email !== 'string') return false;
  return email.trim().toLowerCase() === mailbox;
}
