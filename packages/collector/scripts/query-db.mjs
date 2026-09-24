/**
 * Interroger la base EN LECTURE, sans risque d'écrire.
 *
 *   pnpm query "select count(*) from listings where lifecycle='active'"
 *   pnpm query --local "…"     le miroir local, gratuit et hors ligne
 *
 * POURQUOI UN OUTIL PLUTÔT QU'UN SCRIPT JETABLE. Chaque enquête recréait le
 * sien, avec sa propre lecture du `.env` et sa propre idée de ce qui est
 * permis — il suffisait d'un `UPDATE` distrait pour abîmer la production. Ici
 * tout ce qui ne commence pas par `SELECT` est refusé avant d'atteindre la
 * base, et le fichier vit dans le dépôt : on le corrige une fois.
 *
 * LE QUOTA DE LECTURE EST FINI. Turso facture les lignes lues, et le plafond
 * mensuel a déjà été atteint — la base cesse alors de répondre. Quand elle
 * refuse, on bascule sur le miroir (`pnpm db:mirror`) plutôt que de rendre une
 * erreur : mais on ANNONCE la date de la copie, parce qu'un chiffre périmé pris
 * pour l'état du jour est pire que pas de chiffre du tout.
 *
 * Les identifiants viennent de `.env`, qui n'est pas versionné.
 */

import { createClient } from '@libsql/client';
import { existsSync, statSync } from 'node:fs';
import { cheminMiroir, identifiants, refusDeQuota, urlMiroir } from './env.mjs';

const arguments_ = process.argv.slice(2);
const local = arguments_.includes('--local');
const sql = arguments_
  .filter((mot) => mot !== '--local')
  .join(' ')
  .trim();

// LA SEULE BARRIÈRE QUI COMPTE, et elle est volontairement bête : ni `WITH`,
// ni `PRAGMA`, ni point-virgule qui enchaînerait une seconde instruction.
if (!/^select\s/i.test(sql) || sql.includes(';')) {
  console.error('Lecture seule : la requête doit commencer par SELECT et ne porter aucun « ; ».');
  process.exit(1);
}

/** Le miroir, et l'âge qu'on affichera avec ses résultats. */
function miroir() {
  if (!existsSync(cheminMiroir)) return null;
  return {
    db: createClient({ url: urlMiroir }),
    date: new Date(statSync(cheminMiroir).mtime).toLocaleString('fr-FR'),
  };
}

function rendre(lignes) {
  console.log(JSON.stringify(lignes, null, 1));
}

if (local) {
  const copie = miroir();
  if (copie === null) {
    console.error('Aucun miroir local. Tirez-en un : pnpm db:mirror');
    process.exit(1);
  }
  console.error(`— miroir du ${copie.date}, pas la base distante —`);
  rendre((await copie.db.execute(sql)).rows);
  process.exit(0);
}

const acces = identifiants();
if (acces.manque !== undefined) {
  console.error(acces.manque);
  process.exit(1);
}

try {
  const db = createClient({
    url: acces.url,
    ...(acces.authToken !== undefined ? { authToken: acces.authToken } : {}),
  });
  rendre((await db.execute(sql)).rows);
} catch (erreur) {
  const copie = miroir();
  const quota = refusDeQuota(erreur);
  if (copie === null) {
    console.error(quota ?? `Base distante indisponible : ${erreur.message ?? erreur}`);
    process.exit(1);
  }
  console.error(quota ?? `Base distante indisponible (${erreur.message}).`);
  console.error(`— miroir du ${copie.date}, pas la base distante —`);
  rendre((await copie.db.execute(sql)).rows);
}
