/**
 * Interroger la base EN LECTURE, sans risque d'écrire.
 *
 *   node scripts/query-db.mjs "select count(*) from listings where lifecycle='active'"
 *
 * POURQUOI UN OUTIL PLUTÔT QU'UN SCRIPT JETABLE. Chaque enquête recréait le
 * sien, avec sa propre lecture du `.env` et sa propre idée de ce qui est
 * permis — il suffisait d'un `UPDATE` distrait pour abîmer la production. Ici
 * tout ce qui ne commence pas par `SELECT` est refusé avant d'atteindre la
 * base, et le fichier vit dans le dépôt : on le corrige une fois.
 *
 * Les identifiants viennent de `.env`, qui n'est pas versionné.
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La racine du dépôt, trois niveaux au-dessus de ce fichier. */
const racine = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function environnement() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(racine, '.env'), 'utf8')
        .split(/\r?\n/)
        .filter((ligne) => /^[A-Z_]+=/.test(ligne))
        .map((ligne) => {
          const coupe = ligne.indexOf('=');
          return [ligne.slice(0, coupe), ligne.slice(coupe + 1).replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...environnement(), ...process.env };
const url = env.TURSO_DATABASE_URL;
if (url === undefined || url === '') {
  console.error('TURSO_DATABASE_URL absent : renseignez `.env` (voir docs/deployment.md).');
  process.exit(1);
}

const sql = process.argv.slice(2).join(' ').trim();
// LA SEULE BARRIÈRE QUI COMPTE, et elle est volontairement bête : ni `WITH`,
// ni `PRAGMA`, ni point-virgule qui enchaînerait une seconde instruction.
if (!/^select\s/i.test(sql) || sql.includes(';')) {
  console.error('Lecture seule : la requête doit commencer par SELECT et ne porter aucun « ; ».');
  process.exit(1);
}

const db = createClient({
  url,
  ...(env.TURSO_AUTH_TOKEN !== undefined ? { authToken: env.TURSO_AUTH_TOKEN } : {}),
});
const resultat = await db.execute(sql);
console.log(JSON.stringify(resultat.rows, null, 1));
