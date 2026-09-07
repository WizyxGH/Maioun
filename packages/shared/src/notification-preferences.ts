/**
 * Ce qu'on veut se faire signaler (§29).
 *
 * IL N'Y AVAIT QU'UN INTERRUPTEUR : les alertes de nouvelles annonces, tout ou
 * rien. Or une recherche de logement a plusieurs moments qui méritent qu'on
 * lève les yeux, et ils n'ont pas la même valeur selon le jour. Une annonce qui
 * vient de paraître, oui, toujours. Un rappel de candidater sur un favori mis
 * de côté il y a trois jours, peut-être. Un favori qui disparaît, sûrement — et
 * c'est justement celle qu'on ne pouvait pas demander.
 *
 * TOUT EST ACTIF PAR DÉFAUT, sauf deux choses : ce qui n'existe pas encore, et
 * ce qui ÉLARGIT la recherche. Quelqu'un qui allume les notifications veut être
 * prévenu, pas cocher une liste — mais il n'a pas demandé qu'on lui montre des
 * logements au-dessus du budget qu'il vient de fixer.
 *
 * CES PRÉFÉRENCES SONT LUES PAR LA COLLECTE, qui décide seule d'envoyer ou non.
 * Filtrer côté navigateur n'aurait rien filtré : la notification part du
 * collecteur vers le service de push, sans passer par la page.
 */

/** Les familles d'alertes, dans l'ordre où l'écran les présente. */
export type NotificationKind =
  'newListings' | 'nearMatches' | 'applicationReminders' | 'favoriteGone' | 'email';

export interface NotificationPreferences {
  /** Une annonce entre dans vos critères. C'est la raison d'être de l'outil. */
  readonly newListings: boolean;
  /**
   * Une annonce JUSTE au-dessus des critères — 10 % de budget en plus, ou 10 %
   * de surface en moins.
   *
   * Éteinte par défaut, contrairement aux autres. Ce n'est pas un canal de
   * plus, c'est un ÉLARGISSEMENT de ce qu'on cherche : l'allumer d'office
   * ferait sonner le téléphone pour des logements que l'utilisateur a
   * explicitement exclus en réglant son budget.
   */
  readonly nearMatches: boolean;
  /** Un favori mis de côté et jamais contacté : le marché ne patiente pas. */
  readonly applicationReminders: boolean;
  /** Un favori a disparu de sa source — il est probablement loué. */
  readonly favoriteGone: boolean;
  /** Doubler les alertes par e-mail. PAS ENCORE EN SERVICE (voir ci-dessous). */
  readonly email: boolean;
  /**
   * À quel rythme les alertes partent.
   *
   * Voir `NotificationFrequency` : ce réglage ne décide pas de CE dont on est
   * prévenu — les cases au-dessus s'en chargent — mais de la fréquence à
   * laquelle le téléphone sonne.
   */
  readonly frequency: NotificationFrequency;
}

/**
 * Le rythme des alertes (§29).
 *
 * POURQUOI CE RÉGLAGE. Une recherche active sur Nice fait entrer une dizaine
 * d'annonces par jour, à n'importe quelle heure. C'est exactement ce qu'on veut
 * quand on cherche activement, et c'est insupportable quand on cherche
 * tranquillement : on finit par couper les notifications, donc par ne plus rien
 * recevoir du tout. Un rythme se règle ; un interrupteur ne se rallume pas.
 *
 * `each-run` N'EST PAS « TEMPS RÉEL », ET L'ÉCRAN NE LE DIT PAS. La collecte
 * tourne deux fois par heure ; une annonce parue à 10 h 10 est signalée à
 * 10 h 37. Annoncer du temps réel promettrait une immédiateté qu'on n'a pas, et
 * ferait douter du reste (§17). C'est néanmoins le réglage le plus rapide
 * possible, et il reste celui par défaut : sur ce marché, une heure d'avance
 * décide d'une visite.
 *
 * LES DEUX AUTRES RETIENNENT, PUIS GROUPENT. Rien n'est perdu : les annonces
 * s'accumulent et partent ensemble à la fin de la fenêtre, les plus
 * prioritaires détaillées, le reste résumé en une ligne.
 */
export type NotificationFrequency = 'each-run' | 'hourly' | 'daily';

/** Durée d'attente de chaque rythme, en millisecondes. */
const FREQUENCY_WINDOW: Readonly<Record<NotificationFrequency, number>> = {
  'each-run': 0,
  hourly: 3_600_000,
  daily: 24 * 3_600_000,
};

/**
 * Peut-on sonner maintenant ?
 *
 * @param lastSentAt Instant du dernier envoi (ISO), ou `null` s'il n'y en a
 *   jamais eu — auquel cas on sonne, quel que soit le rythme : faire attendre
 *   vingt-quatre heures un compte qui vient de régler ses alertes lui ferait
 *   croire qu'elles ne marchent pas.
 *
 * LA FENÊTRE EST COMPTÉE DEPUIS LE DERNIER ENVOI, et non calée sur une heure
 * fixe. « Une fois par jour » veut alors dire « au plus une fois par
 * vingt-quatre heures », ce qui se tient sans connaître le fuseau de personne
 * ni décider à sa place qu'il faut sonner à 8 h.
 */
export function canNotifyNow(
  frequency: NotificationFrequency,
  lastSentAt: string | null,
  nowMs: number,
): boolean {
  const window = FREQUENCY_WINDOW[frequency];
  if (window === 0 || lastSentAt === null) return true;
  const last = Date.parse(lastSentAt);
  // Date illisible : on sonne. Un horodatage abîmé ne doit pas faire taire les
  // alertes indéfiniment (§69).
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= window;
}

/**
 * Clé de l'instant du dernier envoi, dans `app_settings`.
 *
 * À PART DES PRÉFÉRENCES, délibérément : celles-ci sont écrites par
 * l'utilisateur depuis le site, celui-là par la collecte. Les mêler ferait
 * qu'un enregistrement depuis l'écran écraserait l'horodatage — et rouvrirait
 * la fenêtre à chaque visite des réglages.
 */
export const NOTIFICATIONS_SENT_AT_SETTING = 'notificationsSentAt';

/**
 * Tout allumé — sauf l'e-mail.
 *
 * L'envoi d'e-mails n'est pas branché : l'afficher actif promettrait des
 * messages qui n'arriveraient jamais, ce qui est exactement le genre de valeur
 * inventée qu'on s'interdit (§17). Il apparaît dans l'écran, éteint et annoncé
 * comme à venir, parce que le savoir possible vaut mieux que le découvrir
 * absent.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  newListings: true,
  nearMatches: false,
  applicationReminders: true,
  favoriteGone: true,
  email: false,
  // Le plus rapide par défaut : sur ce marché, une heure d'avance décide d'une
  // visite. Qui trouve cela trop bavard le règle en deux clics.
  frequency: 'each-run',
};

/**
 * Clé dans `app_settings`.
 *
 * CONTRAT INTER-PROCESSUS, comme les critères : la collecte la lit pour savoir
 * quoi envoyer, le site l'écrit. Ils n'ont aucun autre point de rencontre.
 */
export const NOTIFICATION_PREFERENCES_SETTING = 'notificationPreferences';

/**
 * Relit ce qui est stocké, en complétant par les défauts.
 *
 * Tolérante par construction : une préférence écrite par une version plus
 * ancienne ne connaît pas les familles ajoutées depuis. Refuser l'ensemble
 * couperait alors des alertes que personne n'a demandé de couper (§69).
 */
export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  if (value === null || typeof value !== 'object') return DEFAULT_NOTIFICATION_PREFERENCES;
  const stored = value as Record<string, unknown>;
  const read = (key: NotificationKind): boolean =>
    typeof stored[key] === 'boolean' ? stored[key] : DEFAULT_NOTIFICATION_PREFERENCES[key];

  return {
    newListings: read('newListings'),
    nearMatches: read('nearMatches'),
    applicationReminders: read('applicationReminders'),
    favoriteGone: read('favoriteGone'),
    // L'e-mail reste éteint tant qu'il n'est pas branché, même si la base dit
    // l'inverse : une préférence enregistrée ne fait pas exister un envoi.
    email: false,
    frequency: isFrequency(stored['frequency'])
      ? stored['frequency']
      : DEFAULT_NOTIFICATION_PREFERENCES.frequency,
  };
}

function isFrequency(value: unknown): value is NotificationFrequency {
  return value === 'each-run' || value === 'hourly' || value === 'daily';
}
