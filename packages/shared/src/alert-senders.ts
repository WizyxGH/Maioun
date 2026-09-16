/**
 * Les portails dont on sait lire les alertes par e-mail (§6, §10).
 *
 * La recherche IMAP du collecteur ne remonte QUE les messages venus de ces
 * expéditeurs : c'est ce qui garantit que les messages personnels de
 * l'utilisateur ne sont jamais lus (§26).
 *
 * La liste vit dans `shared` pour que le site puisse l'afficher telle quelle à
 * l'écran des réglages le jour où il le fera — la recopier garantirait qu'elle
 * diverge (§75), et l'écran conseillerait alors de transférer un expéditeur que
 * le collecteur ignore.
 */

export interface AlertSender {
  /**
   * Fragment cherché dans l'adresse de l'expéditeur, en minuscules. Volontaire-
   * ment court : les portails changent de sous-domaine d'envoi sans prévenir.
   */
  readonly match: string;
  /** Nom du portail, tel qu'on le lit à l'écran. */
  readonly label: string;
}

export const ALERT_SENDERS: readonly AlertSender[] = [
  { match: 'leboncoin', label: 'Leboncoin' },
  { match: 'seloger', label: 'SeLoger' },
  { match: 'bienici', label: 'Bien’ici' },
  { match: 'bien-ici', label: 'Bien’ici' },
  { match: 'pap.fr', label: 'PAP' },
  { match: 'logic-immo', label: 'Logic-Immo' },
];

/** Les fragments seuls, pour la recherche IMAP. */
export const ALERT_SENDER_MATCHES: readonly string[] = ALERT_SENDERS.map((sender) => sender.match);
