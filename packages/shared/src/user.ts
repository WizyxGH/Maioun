/**
 * À QUI appartient une décision.
 *
 * Une fiche de logement est partagée ; « je l'ai mise en favori », « je l'ai
 * contactée », « je l'ai archivée » ne le sont pas. Ces états vivaient sur la
 * fiche elle-même — à deux, le favori de l'un serait devenu celui de l'autre.
 * Ils sont désormais rattachés à un utilisateur (`listing_user_state`).
 *
 * IL N'Y EN A QU'UN POUR L'INSTANT, et cette constante le dit franchement.
 * Le site est un bundle statique qui parle directement à Turso avec un jeton
 * conservé par le navigateur : dans ce modèle, aucun mot de passe ne peut être
 * vérifié — le jeton donne accès à toute la base, et un écran de connexion
 * posé devant serait contournable en quelques secondes. Mettre une constante
 * plutôt qu'un écran de connexion, c'est refuser une sécurité de façade (§26).
 *
 * LE JOUR OÙ UN SERVEUR TIENDRA LA SESSION, cette constante devient la valeur
 * lue dans le cookie. C'est le seul endroit à changer côté données — c'est
 * précisément pourquoi le schéma a été préparé avant l'écran.
 */
export const CURRENT_USER = 'moi';

/**
 * QUI REGARDE SANS COMPTE.
 *
 * Consulter est libre : on ne demande pas à quelqu'un de s'inscrire pour
 * savoir ce qu'il y a à louer. Agir ne l'est pas — un favori, un contact, une
 * archive appartiennent à quelqu'un, et il faut donc savoir à qui.
 *
 * CETTE IDENTITÉ NE POSSÈDE RIEN, et c'est tout son intérêt. Les états
 * personnels sont attachés par des jointures externes sur l'identifiant :
 * servir le catalogue sous ce nom rend naturellement aucun favori, aucun
 * masquage, aucun score — sans qu'une seule requête ait à connaître le cas.
 * Les valeurs par défaut prennent le relais là où l'utilisateur n'a rien réglé.
 *
 * Elle ne peut pas entrer en collision : les comptes portent un UUID, et le
 * compte local s'appelle `moi`. Rien ne s'écrit jamais sous ce nom — le
 * verrou qui refuse les écritures anonymes est posé AVANT que l'identité ne
 * serve, en un seul endroit.
 */
export const ANONYMOUS_USER = 'anonyme';
