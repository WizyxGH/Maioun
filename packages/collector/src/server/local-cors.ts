/**
 * Qui peut lire le serveur local (`cli/serve.ts`), depuis un navigateur.
 *
 * À PART DE LA COMMANDE, et il le faut : importer `serve.ts` démarre le
 * serveur — un test qui voudrait vérifier cette règle ouvrirait un port et
 * lirait une base.
 */

/**
 * LES SEULES ORIGINES SERVIES : la machine elle-même.
 *
 * Le site de développement vit sur un autre port, d'où le CORS. Mais deux
 * pièges se referment ici.
 *
 * `*` NE MARCHE PAS. Le site envoie ses requêtes avec `credentials: 'include'`,
 * et un navigateur refuse alors toute réponse portant une origine générique :
 * l'écran serait resté vide sans que rien n'explique pourquoi.
 *
 * ET RENVOYER L'ORIGINE DEMANDÉE, QUELLE QU'ELLE SOIT, serait pire : n'importe
 * quelle page ouverte dans votre navigateur peut joindre `127.0.0.1`, et
 * lirait alors vos annonces. Écouter la boucle locale ne protège donc de rien
 * à soi seul. Seule une origine locale est acceptée.
 */
const ORIGINE_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function entetes(origine: string | undefined): Record<string, string> {
  const commun = {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  if (origine === undefined || !ORIGINE_LOCALE.test(origine)) return commun;
  return {
    ...commun,
    'Access-Control-Allow-Origin': origine,
    'Access-Control-Allow-Credentials': 'true',
    // L'origine varie d'une requête à l'autre : sans cela, un cache rendrait à
    // l'une la réponse taillée pour l'autre.
    Vary: 'Origin',
  };
}
