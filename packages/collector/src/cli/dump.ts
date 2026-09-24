/**
 * SORTIR LA BASE DANS UN FICHIER, pour la garder ailleurs que chez Turso.
 *
 *   pnpm db:mirror        d'abord : la copie locale, qui ne coûte rien
 *   pnpm db:dump          puis : un .sql portable, dans .data/
 *
 * Le 24 septembre 2026 le quota de lectures a été épuisé, et la base a refusé
 * TOUT — l'export compris. Il n'existait alors aucune copie des favoris, des
 * comptes et du suivi : ils n'étaient pas perdus, seulement hors d'atteinte, et
 * le seul geste possible était d'attendre. Une sauvegarde se prend AVANT le
 * mur, pas pendant.
 *
 * Le fichier rendu est du SQL ordinaire : n'importe quel SQLite le relit, et il
 * sert aussi à remplir une base de secours (`wrangler d1 import`).
 *
 * CE FICHIER CONTIENT DES DONNÉES PERSONNELLES — adresses e-mail, empreinte de
 * mot de passe, abonnements aux notifications, identifiants de portails. Il est
 * écrit dans `.data/`, que `.gitignore` refuse en entier, et le dépôt est
 * public : ne le déplacez pas dans l'arbre de travail.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from '../db/client.js';
import { instructionsInsert, ordonnerTables, type ObjetSchema } from '../db/dump-sql.js';

const arguments_ = process.argv.slice(2);

/** La valeur d'une option `--nom valeur`, ou `undefined`. */
function option(nom: string): string | undefined {
  const index = arguments_.indexOf(`--${nom}`);
  return index === -1 ? undefined : arguments_[index + 1];
}

/** La racine du dépôt, quatre niveaux au-dessus de `dist/cli`. */
const racine = resolve(import.meta.dirname, '../../../..');

/**
 * La base à lire : le miroir d'abord, la base de collecte locale ensuite.
 *
 * MÊME ORDRE QUE `cli/serve.ts`, et volontairement : les deux doivent parler de
 * la même base, sinon on sauvegarde autre chose que ce qu'on regarde.
 */
function choisirSource(): string {
  const explicite = option('source');
  if (explicite !== undefined) return resolve(racine, explicite);
  if (arguments_.includes('--local')) return resolve(racine, 'data/local.db');
  for (const chemin of [resolve(racine, '.data/mirror.db'), resolve(racine, 'data/local.db')]) {
    if (existsSync(chemin)) return chemin;
  }
  console.error(
    [
      'Aucune base locale à sauvegarder. Tirez un miroir tant que Turso répond :',
      '  pnpm db:mirror',
      'Ou visez une autre base : pnpm db:dump --source <chemin>',
    ].join('\n'),
  );
  process.exit(1);
}

const source = choisirSource();
if (!existsSync(source)) {
  console.error(`Base introuvable : ${source}`);
  process.exit(1);
}

const jour = new Date().toISOString().slice(0, 10);
const sortie = resolve(racine, option('sortie') ?? `.data/sauvegarde-${jour}.sql`);

// Le chemin brut, barres inversées retournées : `pathToFileURL` écrirait
// « Ma%C3%AFoun » pour le « ï » du dépôt, que la liaison native ne redécode pas.
const db = openDatabase({ url: `file:${source.split('\\').join('/')}` });

const schema = await db.execute(
  `SELECT type, name, sql FROM sqlite_master
     WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
);
const objets = schema.rows.map((ligne) => ({
  type: String(ligne['type']),
  name: String(ligne['name']),
  sql: String(ligne['sql']),
}));
const tables: ObjetSchema[] = ordonnerTables(objets.filter((objet) => objet.type === 'table'));
const index = objets.filter((objet) => objet.type !== 'table');

const morceaux = [
  `-- Maïoun — sauvegarde du ${new Date().toLocaleString('fr-FR')}`,
  `-- Source : ${source}`,
  '-- Relecture : sqlite3 neuve.db < ce-fichier.sql',
  '',
];
for (const table of tables) morceaux.push(`${table.sql};`);
morceaux.push('');

const comptes: string[] = [];
for (const table of tables) {
  const contenu = await db.execute(`SELECT * FROM "${table.name}"`);
  if (contenu.rows.length === 0) continue;
  comptes.push(`${table.name} ${contenu.rows.length}`);
  const lignes = contenu.rows.map((ligne) => contenu.columns.map((_, rang) => ligne[rang]));
  morceaux.push(...instructionsInsert(table.name, contenu.columns, lignes));
}

morceaux.push('');
// LES INDEX EN DERNIER : les poser avant les données ferait réindexer à chaque
// ligne insérée.
for (const objet of index) morceaux.push(`${objet.sql};`);
morceaux.push('');

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, morceaux.join('\n'), 'utf8');

const mo = (statSync(sortie).size / 1024 / 1024).toFixed(1);
const dateSource = new Date(statSync(source).mtime).toLocaleString('fr-FR');
console.log(`Sauvegarde écrite : ${sortie} — ${mo} Mo`);
console.log(`Source : ${source} (${dateSource})`);
console.log(`Contenu : ${comptes.join(', ')}`);
console.log(
  'DONNÉES PERSONNELLES dedans (comptes, jetons, identifiants de portails) :\n' +
    'ce fichier reste hors du dépôt, qui est public.',
);
