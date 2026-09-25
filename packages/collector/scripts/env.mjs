/**
 * Ce que les outils d'enquête ont en commun : le `.env` et le miroir local.
 *
 * `query-db.mjs` lisait le `.env` pour son compte. Le miroir en a besoin des
 * mêmes identifiants, et deux lectures divergent toujours par un détail — un
 * guillemet, un `\r` de Windows. Une seule ici.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La racine du dépôt, trois niveaux au-dessus de ce fichier. */
export const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * L'adresse `file:` d'un fichier de base, SANS percent-encodage.
 *
 * `pathToFileURL` écrirait « Ma%C3%AFoun » pour le « ï » du chemin du dépôt, et
 * la liaison native de libsql ne le redécode pas : elle rend « os error 123 ».
 * Le chemin brut, barres inversées retournées, passe.
 */
export function adresseFichier(chemin) {
  return `file:${chemin.split('\\').join('/')}`;
}

/** Le miroir local. Hors de Git : `.gitignore` refuse déjà tout `*.db`. */
export const cheminMiroir = resolve(racine, '.data/mirror.db');

/** La base que `pnpm local` remplit et que `serve:local` sert. */
export const cheminLocal = resolve(racine, 'data/local.db');

/**
 * QUELLE BASE LOCALE LIRE, et sous quel nom la dire.
 *
 * `pnpm query --local` ne connaissait que le miroir, et refusait donc de lire
 * la base que `pnpm local` venait de remplir — la seule disponible la semaine
 * où le quota Turso est épuisé, puisque l'export l'est aussi. « Aucun miroir
 * local. Tirez-en un » : impossible, justement.
 *
 * MÊME ORDRE QUE `serve.ts` ET `dump.ts` : le fichier désigné, sinon le miroir,
 * sinon la base locale. Diverger ferait lire une base et en servir une autre.
 *
 * ET ON DIT LAQUELLE. Un miroir est une PHOTO de la production ; `local.db`
 * est ce qu'on a collecté ici, qui ne porte ni les comptes ni l'historique des
 * autres. Confondre les deux, c'est conclure de l'une sur l'autre.
 */
export function baseLocale(env = process.env, existe = (chemin) => existsSync(chemin)) {
  const choisi = env.MAIOUN_LOCAL_DB;
  const candidats =
    choisi !== undefined && choisi !== ''
      ? [{ chemin: resolve(racine, choisi), nom: 'base désignée par MAIOUN_LOCAL_DB' }]
      : [
          { chemin: cheminMiroir, nom: 'miroir de la production' },
          { chemin: cheminLocal, nom: 'base locale (collectée sur cette machine)' },
        ];
  for (const candidat of candidats) {
    if (existe(candidat.chemin)) {
      return { ...candidat, url: adresseFichier(candidat.chemin) };
    }
  }
  return null;
}

/** L'adresse `file:` du miroir, pour l'outil qui l'écrit. */
export const urlMiroir = adresseFichier(cheminMiroir);

/**
 * DE QUAND DATENT CES DONNÉES — et non : de quand date ce fichier.
 *
 * Ouvrir une base SQLite suffit à rafraîchir son fichier : le 2026-09-25,
 * `pnpm query --local` annonçait « base du 25/09 11:36 » pour un contenu
 * collecté la veille à 17 h, parce qu'il venait de l'ouvrir. La date la plus
 * rassurante était la moins vraie — et c'est exactement ce que cet affichage
 * doit empêcher.
 *
 * Une copie de cette règle vit dans `src/db/fraicheur.ts`, pour le serveur
 * local, qui est compilé. Elles doivent rester d'accord.
 */
export const SQL_DERNIERE_COLLECTE = 'SELECT MAX(scraped_at) AS quand FROM occurrences';

/** Ce qu'on affiche à côté d'un chiffre tiré d'une base locale. */
export function descriptionDeLaCopie(nom, derniereCollecte, modifieLe) {
  const quand = derniereCollecte === null ? null : new Date(derniereCollecte);
  if (quand !== null && !Number.isNaN(quand.getTime())) {
    return `${nom}, collectée le ${quand.toLocaleString('fr-FR')}`;
  }
  // « fichier » et non « collectée » : le mot dit que la date n'est pas celle
  // des données, et qu'elle ne prouve donc pas leur fraîcheur.
  return `${nom}, fichier du ${modifieLe.toLocaleString('fr-FR')} (contenu de date inconnue)`;
}

/** Le `.env` du dépôt, complété par l'environnement du shell qui l'emporte. */
export function environnement() {
  let fichier = {};
  try {
    fichier = Object.fromEntries(
      readFileSync(resolve(racine, '.env'), 'utf8')
        .split(/\r?\n/)
        .filter((ligne) => /^[A-Z_]+=/.test(ligne))
        .map((ligne) => {
          const coupe = ligne.indexOf('=');
          return [ligne.slice(0, coupe), ligne.slice(coupe + 1).replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    /* pas de `.env` : l'environnement du shell suffira peut-être */
  }
  return { ...fichier, ...process.env };
}

/**
 * Les identifiants Turso, ou un message disant ce qui manque.
 *
 * Rendus ensemble parce qu'ils vont ensemble : une URL sans jeton ne sert à
 * rien contre une base distante.
 */
export function identifiants(env = environnement()) {
  const url = env.TURSO_DATABASE_URL;
  if (url === undefined || url === '') {
    return { manque: 'TURSO_DATABASE_URL absent : renseignez `.env` (voir docs/deployment.md).' };
  }
  return {
    url,
    ...(env.TURSO_AUTH_TOKEN !== undefined && env.TURSO_AUTH_TOKEN !== ''
      ? { authToken: env.TURSO_AUTH_TOKEN }
      : {}),
  };
}

/**
 * Le refus de Turso, dit en clair — ou `null` si l'erreur est autre.
 *
 * Le 24 septembre 2026, le plafond mensuel de lignes lues a été atteint : la
 * base a cessé de répondre, l'export compris, et la collecte a échoué en
 * boucle. La trace d'origine ne disait que « BLOCKED ». Mieux vaut nommer la
 * cause et le geste.
 */
export function refusDeQuota(erreur) {
  const message = String(erreur?.message ?? erreur);
  if (!/reads are blocked|read operations are forbidden|BLOCKED/i.test(message)) return null;
  return [
    'Turso refuse TOUTE lecture : le quota mensuel de lignes lues est épuisé.',
    "L'export est bloqué avec le reste — aucun miroir ne peut être tiré tant",
    'que le quota ne repart pas. Relevez le forfait, ou attendez la remise à',
    'zéro du cycle, puis tirez un miroir : `pnpm db:mirror`.',
  ].join('\n');
}
