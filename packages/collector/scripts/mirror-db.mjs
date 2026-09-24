/**
 * COPIER LA BASE EN LOCAL, pour pouvoir l'interroger sans consommer le quota.
 *
 *   pnpm db:mirror
 *
 * Turso compte les LIGNES LUES, et le forfait a un plafond mensuel. Une
 * enquête un peu curieuse — quelques `count(*)` sur `occurrences` — en dépense
 * des millions, et une fois le plafond atteint la base ne répond plus : plus
 * de diagnostic possible au moment précis où l'on en a besoin.
 *
 * Un réplica embarqué déplace le problème : la copie est tirée une fois, puis
 * seules les MODIFICATIONS transitent. Les `SELECT` tapent ensuite le fichier
 * local — ils ne coûtent rien et marchent hors ligne.
 *
 * LE MIROIR EST UNE PHOTO, ET PEUT MENTIR PAR RETARD. C'est pourquoi chaque
 * lecture locale affiche sa date : un chiffre tiré d'une copie de la veille ne
 * doit jamais être pris pour l'état du jour.
 *
 * Le fichier ne quitte pas la machine : il contient des annonces réelles et le
 * dépôt est public. `.gitignore` refuse tout `*.db` et le dossier `.data/`.
 */

// Le client ALIASÉ, récent : la plateforme Turso refuse le protocole de
// synchronisation de `@libsql/client@0.14`, que la collecte utilise par
// ailleurs. Deux versions cohabitent plutôt que de toucher la production.
import { createClient } from '@libsql/sync';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { cheminMiroir, identifiants, refusDeQuota, urlMiroir } from './env.mjs';

const acces = identifiants();
if (acces.manque !== undefined) {
  console.error(acces.manque);
  process.exit(1);
}

mkdirSync(dirname(cheminMiroir), { recursive: true });

/**
 * ATTENDRE QUE LE QUOTA REPARTE, plutôt que de guetter soi-même.
 *
 *   pnpm db:mirror --attendre        réessaie toutes les quinze minutes
 *   pnpm db:mirror --attendre 5      toutes les cinq
 *
 * Le jour où les lectures ont été bloquées, il n'y avait plus AUCUN moyen de
 * sortir les données — ni SQL, ni export. Les favoris, le suivi et les
 * archivages n'étaient pas perdus, seulement hors d'atteinte, et il fallait
 * penser à retenter. Cette attente-là se délègue : une requête minuscule par
 * quart d'heure, et le miroir est tiré à la première seconde où c'est possible.
 */
const arguments_ = process.argv.slice(2);
const attendre = arguments_.includes('--attendre');
const minutes = Number(arguments_[arguments_.indexOf('--attendre') + 1]) || 15;

/** Une tentative. Rend le client, ou `null` si la base refuse encore. */
async function tenter() {
  try {
    // Le tirage a lieu DÈS LA CRÉATION du client, pas au `sync()` : c'est ici
    // que le refus arrive.
    const client = createClient({
      url: urlMiroir,
      syncUrl: acces.url,
      ...(acces.authToken !== undefined ? { authToken: acces.authToken } : {}),
    });
    await client.sync();
    return client;
  } catch (erreur) {
    const quota = refusDeQuota(erreur);
    if (quota === null || !attendre) {
      console.error(quota ?? `Synchronisation refusée : ${erreur.message ?? erreur}`);
      if (existsSync(cheminMiroir) && statSync(cheminMiroir).size > 0) {
        const age = new Date(statSync(cheminMiroir).mtime).toLocaleString('fr-FR');
        console.error(`Le miroir du ${age} reste lisible : pnpm query --local "select …"`);
      }
      process.exit(1);
    }
    return null;
  }
}

const depart = Date.now();
let db = await tenter();
if (db === null) {
  console.error(
    `Lectures encore bloquées. Nouvelle tentative toutes les ${minutes} min — laissez tourner.`,
  );
}
while (db === null) {
  await new Promise((resolve) => setTimeout(resolve, minutes * 60_000));
  const heure = new Date().toLocaleTimeString('fr-FR');
  db = await tenter();
  console.error(db === null ? `${heure} — toujours bloqué` : `${heure} — ça repart`);
}

const secondes = ((Date.now() - depart) / 1000).toFixed(1);
const taille = (statSync(cheminMiroir).size / 1024 / 1024).toFixed(1);

// Compter en LOCAL : ces lectures-là sont gratuites, et elles prouvent que la
// copie contient bien quelque chose.
const tables = ['listings', 'occurrences', 'listing_user_state', 'collection_runs'];
const compte = [];
for (const table of tables) {
  try {
    const r = await db.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    compte.push(`${table} ${r.rows[0].n}`);
  } catch {
    /* table absente de ce schéma : rien à en dire */
  }
}

console.log(`Miroir à jour en ${secondes} s — ${taille} Mo — ${compte.join(', ')}`);
console.log(`Interrogez-le sans toucher au quota : pnpm query --local "select …"`);
