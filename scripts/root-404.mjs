/**
 * Le `404.html` de la RACINE du site publié.
 *
 * GITHUB PAGES NE SERT UN 404.html QU'À LA RACINE. L'application en produit un
 * — copie de son `index.html` — et c'est ce qui faisait marcher les adresses
 * profondes : un lien de notification, un rafraîchissement, un favori. Tant
 * que l'application ÉTAIT la racine, il tombait au bon endroit.
 *
 * Depuis que la page de présentation occupe la racine et l'application `/app/`,
 * ce fichier est rangé dans `site/app/404.html`, où Pages ne le regarde jamais.
 * Toute adresse autre que `/` et `/app/` rendait donc la 404 générique de
 * GitHub : chaque rafraîchissement, chaque lien d'alerte, chaque ancien favori.
 *
 * CE FICHIER FAIT DEUX CHOSES :
 *
 *   - sous `/app/…`, il EST l'application — même page, même routeur, qui
 *     reprend la main côté navigateur ;
 *   - ailleurs, il renvoie vers `/app/` + le même chemin. Les liens émis avant
 *     le déménagement — `/annonce/…`, `/search`, dans des notifications et des
 *     e-mails déjà partis — pointaient vers la racine, et ne peuvent plus être
 *     corrigés là où ils ont été envoyés.
 *
 * Usage : node scripts/root-404.mjs <dossier du site> <chemin de base>
 *   ex.   node scripts/root-404.mjs site /Maioun/
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Le script de redirection des anciennes adresses.
 *
 * `replace` et non `assign` : l'adresse morte ne doit pas rester dans
 * l'historique, sans quoi le bouton « retour » y ramènerait.
 *
 * UNE SEULE CONDITION POUR NE PAS BOUCLER : on ne redirige que ce qui n'est pas
 * déjà sous `/app/`. Une adresse inconnue DANS l'application est l'affaire de
 * son routeur, pas de ce script.
 */
export function legacyRedirect(base) {
  const app = `${base}app/`;
  return (
    '<script>(function(){' +
    `var b=${JSON.stringify(base)},a=${JSON.stringify(app)},p=location.pathname;` +
    'if(p.indexOf(a)!==0&&p.indexOf(b)===0){' +
    'location.replace(a+p.slice(b.length)+location.search+location.hash);' +
    '}})();</script>'
  );
}

/** Insère la redirection en tête de `<head>`, avant tout chargement. */
export function buildRoot404(appIndexHtml, base) {
  const head = /<head[^>]*>/i.exec(appIndexHtml);
  if (head === null) throw new Error('page de l’application sans <head>');
  const at = head.index + head[0].length;
  return appIndexHtml.slice(0, at) + legacyRedirect(base) + appIndexHtml.slice(at);
}

// Exécution directe : `node scripts/root-404.mjs site /Maioun/`.
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [siteDir, base] = process.argv.slice(2);
  if (siteDir === undefined || base === undefined || !base.startsWith('/') || !base.endsWith('/')) {
    console.error('usage : node scripts/root-404.mjs <dossier du site> </base/>');
    process.exit(2);
  }
  const html = readFileSync(join(siteDir, 'app', 'index.html'), 'utf8');
  writeFileSync(join(siteDir, '404.html'), buildRoot404(html, base));
  console.log(`404.html racine écrit (${base} → ${base}app/)`);
}
