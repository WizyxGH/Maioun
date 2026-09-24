/**
 * Les en-têtes de session, et ce que le CORS doit en laisser passer.
 *
 * ILS ÉTAIENT ÉCRITS À TROIS ENDROITS : la page qui les envoie, le Worker qui
 * les autorise, le serveur local qui les autorisait mal. Le serveur local
 * n'en permettait qu'un seul — `content-type` — si bien que le navigateur
 * refusait CHAQUE appel au pré-vol, avant même de l'envoyer. Le site se
 * branchait sur l'API locale et n'affichait rien : ni annonces, ni réglages,
 * et pas un message pour le dire, puisque le serveur ne voyait jamais passer
 * la requête.
 *
 * Une liste partagée plutôt que trois copies : un en-tête ajouté à la page
 * apparaît des deux côtés du même coup, ou il n'apparaît nulle part.
 */

/** Le jeton de session renouvelé, que la réponse remet à la page. */
export const SESSION_TOKEN_HEADER = 'X-Session-Token';

/** La clé publique de l'appareil, sa preuve, et l'heure qu'elle signe. */
export const SESSION_KEY_HEADER = 'X-Session-Key';
export const SESSION_PROOF_HEADER = 'X-Session-Proof';
export const SESSION_TIME_HEADER = 'X-Session-Time';

/**
 * Ce qu'un navigateur a le droit d'ENVOYER.
 *
 * Tout en-tête absent d'ici fait échouer le pré-vol, donc la requête entière.
 */
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  SESSION_KEY_HEADER,
  SESSION_PROOF_HEADER,
  SESSION_TIME_HEADER,
].join(', ');

/**
 * Les méthodes autorisées.
 *
 * `PUT` a déjà manqué une fois côté Worker, et c'est le genre d'oubli qui ne se
 * voit qu'à l'usage : le navigateur refuse la requête AVANT de l'envoyer, si
 * bien que l'écran annonce un échec pour un appel que le serveur n'a jamais
 * reçu. Les critères de recherche et les réglages de compte s'enregistrent en
 * PUT — aucun des deux ne fonctionnait.
 */
export const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

/**
 * Posé sur une réponse servie depuis la COPIE de secours, Turso ayant refusé.
 *
 * Ce n'est pas l'état du jour, et un écran qui l'affiche sans le dire fait
 * prendre des décisions sur une photo.
 */
export const SECOURS_HEADER = 'X-Maioun-Secours';

/**
 * Ce qu'un navigateur a le droit de LIRE dans la réponse.
 *
 * Sans le jeton renouvelé, la session expire au bout de son délai au lieu de
 * se prolonger, et l'on est déconnecté sans raison apparente. Sans la marque
 * de secours, l'écran ne peut pas dire qu'il montre une copie.
 */
export const CORS_EXPOSED_HEADERS = [SESSION_TOKEN_HEADER, SECOURS_HEADER].join(', ');
