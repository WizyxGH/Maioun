/**
 * VOIR SES ANNONCES SANS LA BASE DISTANTE.
 *
 *   pnpm db:mirror        une fois, tant que Turso répond
 *   pnpm serve:local      puis, à volonté, même hors ligne
 *   pnpm dev              dans un autre terminal (voir docs/deployment.md)
 *
 * Le 24 septembre 2026, le quota de lectures de Turso a été épuisé : la base a
 * refusé TOUT, et le site n'a plus rien eu à montrer — l'application entière
 * dépend d'une base qu'un plafond peut fermer. Le miroir local répondait déjà
 * aux requêtes d'enquête ; il manquait de quoi le REGARDER.
 *
 * Ce serveur sert la même API que le Worker, à partir du même code
 * (`server/routes.ts`), contre le fichier local. Rien n'est réécrit : ce qui
 * marche ici marche en ligne, et inversement.
 *
 * IL N'A QU'UN UTILISATEUR, et c'est voulu : c'est votre machine, il n'y a
 * personne d'autre. `route` prend son défaut, donc aucune session, aucun
 * cookie, aucun mot de passe. Il n'écoute que la boucle locale.
 */

import { createServer } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { route } from '../server/routes.js';
import { openDatabase } from '../db/client.js';
import { loadDotEnv } from '../config.js';

const PORT = Number(process.env['MAIOUN_LOCAL_PORT'] ?? 8787);

/** La racine du dépôt, trois niveaux au-dessus de `dist/cli`. */
const racine = resolve(import.meta.dirname, '../../../..');

/**
 * Le fichier à servir : le miroir d'abord, la base de collecte locale ensuite.
 *
 * On ANNONCE lequel et de quand il date. Un écran qui montre l'état d'avant-
 * hier sans le dire est pire qu'un écran vide : on y prend des décisions.
 */
function choisirBase(): { chemin: string; date: string } {
  // `MAIOUN_LOCAL_DB` désigne un autre fichier — une copie datée qu'on veut
  // relire, par exemple. Sinon : le miroir, puis la base de collecte locale.
  const choisi = process.env['MAIOUN_LOCAL_DB'];
  const candidats =
    choisi !== undefined && choisi !== ''
      ? [resolve(racine, choisi)]
      : [resolve(racine, '.data/mirror.db'), resolve(racine, 'data/local.db')];
  for (const chemin of candidats) {
    if (!existsSync(chemin)) continue;
    return { chemin, date: new Date(statSync(chemin).mtime).toLocaleString('fr-FR') };
  }
  console.error(
    [
      'Aucune base locale. Tirez un miroir tant que Turso répond :',
      '  pnpm db:mirror',
      "Si le quota est déjà épuisé, l'export l'est aussi : il faut attendre la",
      'remise à zéro du cycle, ou relever le forfait.',
    ].join('\n'),
  );
  process.exit(1);
}

loadDotEnv();
const base = choisirBase();
const db = openDatabase({ url: `file:${base.chemin.split('\\').join('/')}` });

/**
 * Le schéma est-il celui d'aujourd'hui ?
 *
 * Un miroir tiré de la production l'est toujours. Une vieille base de collecte
 * locale, non : celle du 4 septembre ignorait `listing_user_score`, et l'écran
 * des annonces rendait « no such table » — une erreur SQL brute, là où il
 * suffisait de dire quoi faire.
 */
async function verifierLeSchema(): Promise<void> {
  const requises = ['listings', 'occurrences', 'listing_user_score', 'listing_user_state'];
  // `{ sql, args }` et non deux arguments : le client ignore le second, les
  // « ? » restaient vides, et le contrôle déclarait tout absent.
  const presentes = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table'
            AND name IN (${requises.map(() => '?').join(',')})`,
    args: requises,
  });
  const vues = new Set(presentes.rows.map((row) => String(row['name'])));
  const manquantes = requises.filter((table) => !vues.has(table));
  if (manquantes.length === 0) return;
  console.error(
    [
      `Schéma incomplet dans ${base.chemin} : ${manquantes.join(', ')} absente(s).`,
      'Cette base date d’avant les migrations qui les ont créées.',
      '',
      'Deux voies : tirer un miroir de la production (`pnpm db:mirror`, tant que',
      'Turso répond), ou mettre à jour ce fichier avec `pnpm db:migrate` — il',
      'restera vide, mais lisible.',
    ].join('\n'),
  );
  process.exit(1);
}

// Le site de développement vit sur un autre port : sans cela, le navigateur
// refuse la réponse. Origine ouverte, mais le serveur n'écoute que 127.0.0.1.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

const serveur = createServer((requete, reponse) => {
  void (async () => {
    const url = new URL(requete.url ?? '/', `http://localhost:${PORT}`);
    if (requete.method === 'OPTIONS') {
      reponse.writeHead(204, CORS).end();
      return;
    }

    const corps: Buffer[] = [];
    for await (const morceau of requete) corps.push(morceau as Buffer);

    const demande = new Request(url.toString(), {
      method: requete.method,
      headers: Object.entries(requete.headers).flatMap(([nom, valeur]) =>
        typeof valeur === 'string' ? [[nom, valeur] as [string, string]] : [],
      ),
      ...(corps.length > 0 ? { body: Buffer.concat(corps) } : {}),
    });

    try {
      const segments = url.pathname.split('/').filter((part) => part !== '');
      const rendue = await route(db, demande, url, segments, CORS);
      reponse.writeHead(rendue.status, Object.fromEntries(rendue.headers));
      reponse.end(Buffer.from(await rendue.arrayBuffer()));
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      reponse.writeHead(500, { ...CORS, 'content-type': 'application/json' });
      reponse.end(JSON.stringify({ error: message }));
    }
  })();
});

await verifierLeSchema();

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`Maïoun — API locale sur http://localhost:${PORT}`);
  console.log(`Base : ${base.chemin} (${base.date})`);
  console.log(`Le site : VITE_API_URL=http://localhost:${PORT} pnpm dev`);
});
