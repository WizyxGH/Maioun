/**
 * Qui peut lire le serveur local (`cli/serve.ts`), depuis un navigateur.
 *
 * À PART DE LA COMMANDE, et il le faut : importer `serve.ts` démarre le
 * serveur — un test qui voudrait vérifier cette règle ouvrirait un port et
 * lirait une base.
 */

/**
 * La machine elle-même. C'est le cas par défaut, et le seul sûr.
 *
 * `*` NE MARCHE PAS. Le site envoie ses requêtes avec `credentials: 'include'`,
 * et un navigateur refuse alors toute réponse portant une origine générique :
 * l'écran serait resté vide sans que rien n'explique pourquoi.
 *
 * ET RENVOYER L'ORIGINE DEMANDÉE, QUELLE QU'ELLE SOIT, serait pire : n'importe
 * quelle page ouverte dans votre navigateur peut joindre `127.0.0.1`, et
 * lirait alors vos annonces. Écouter la boucle locale ne protège donc de rien
 * à soi seul.
 */
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Le réseau domestique, et lui seul — quand on a DÉLIBÉRÉMENT ouvert le
 * serveur pour consulter depuis un téléphone.
 *
 * Les trois plages privées de la RFC 1918, rien d'autre : une adresse publique
 * n'a aucune raison de figurer ici, et l'accepter reviendrait à rouvrir la
 * porte que la règle précédente ferme.
 *
 * CE N'EST PAS UNE AUTHENTIFICATION. Quiconque partage le Wi-Fi peut alors
 * lire les annonces, et poser un favori. C'est acceptable chez soi, et c'est
 * pourquoi cela ne s'allume pas tout seul.
 */
const ORIGINE_PRIVEE =
  /^http:\/\/(10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/;

/**
 * Les en-têtes à rendre pour cette origine.
 *
 * `surLeReseau` suit l'écoute : on n'élargit la règle que là où le serveur est
 * effectivement ouvert. Les deux se décident au même endroit, faute de quoi
 * l'une des deux moitiés se pose sans l'autre.
 */
export function entetes(origine: string | undefined, surLeReseau = false): Record<string, string> {
  const commun = {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  const acceptee =
    origine !== undefined &&
    (ORIGINE_LOCALE.test(origine) || (surLeReseau && ORIGINE_PRIVEE.test(origine)));
  if (!acceptee) return commun;
  return {
    ...commun,
    'Access-Control-Allow-Origin': origine,
    'Access-Control-Allow-Credentials': 'true',
    // L'origine varie d'une requête à l'autre : sans cela, un cache rendrait à
    // l'une la réponse taillée pour l'autre.
    Vary: 'Origin',
  };
}
