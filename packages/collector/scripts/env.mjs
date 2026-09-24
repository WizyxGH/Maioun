/**
 * Ce que les outils d'enquête ont en commun : le `.env` et le miroir local.
 *
 * `query-db.mjs` lisait le `.env` pour son compte. Le miroir en a besoin des
 * mêmes identifiants, et deux lectures divergent toujours par un détail — un
 * guillemet, un `\r` de Windows. Une seule ici.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La racine du dépôt, trois niveaux au-dessus de ce fichier. */
export const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Le miroir local. Hors de Git : `.gitignore` refuse déjà tout `*.db`. */
export const cheminMiroir = resolve(racine, '.data/mirror.db');

/**
 * L'adresse `file:` du miroir, SANS percent-encodage.
 *
 * `pathToFileURL` écrirait « Ma%C3%AFoun » pour le « ï » du chemin du dépôt, et
 * la liaison native de libsql ne le redécode pas : elle rend « os error 123 ».
 * Le chemin brut, barres inversées retournées, passe.
 */
export const urlMiroir = `file:${cheminMiroir.split('\\').join('/')}`;

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
