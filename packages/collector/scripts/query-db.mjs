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
import { statSync } from 'node:fs';
import {
  baseLocale,
  descriptionDeLaCopie,
  identifiants,
  refusDeQuota,
  SQL_DERNIERE_COLLECTE,
} from './env.mjs';

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

/**
 * La base locale, et ce qu'on annoncera avec ses résultats.
 *
 * SON NOM AVEC SA DATE, toujours : un miroir est une photo de la production,
 * `data/local.db` ce qu'on a collecté ici. Un chiffre tiré de l'une, pris pour
 * l'autre, se conclut de travers.
 */
async function copieLocale() {
  const choix = baseLocale();
  if (choix === null) return null;
  const db = createClient({ url: choix.url });
  let collecteeLe = null;
  try {
    const rendu = await db.execute(SQL_DERNIERE_COLLECTE);
    const quand = rendu.rows[0]?.quand;
    collecteeLe = quand === null || quand === undefined ? null : String(quand);
  } catch {
    // Base vide ou table absente : on le dira, plutôt que de laisser croire.
  }
  return {
    db,
    quoi: descriptionDeLaCopie(choix.nom, collecteeLe, new Date(statSync(choix.chemin).mtime)),
  };
}

function rendre(lignes) {
  console.log(JSON.stringify(lignes, null, 1));
}

if (local) {
  const copie = await copieLocale();
  if (copie === null) {
    console.error(
      [
        'Aucune base locale à lire. Deux voies :',
        '  pnpm db:mirror   tirer une copie de la production (tant que Turso répond)',
        '  pnpm local       collecter ici, dans data/local.db',
      ].join('\n'),
    );
    process.exit(1);
  }
  console.error(`— ${copie.quoi}, pas la base distante —`);
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
  const copie = await copieLocale();
  const quota = refusDeQuota(erreur);
  if (copie === null) {
    console.error(quota ?? `Base distante indisponible : ${erreur.message ?? erreur}`);
    process.exit(1);
  }
  console.error(quota ?? `Base distante indisponible (${erreur.message}).`);
  console.error(`— ${copie.quoi}, pas la base distante —`);
  rendre((await copie.db.execute(sql)).rows);
}
