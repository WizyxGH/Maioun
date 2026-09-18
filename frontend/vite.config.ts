import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { siteInfo } from '../landing/src/site.js';

/** GitHub Pages sert depuis `/<repo>/` ; `BASE_PATH` vient du workflow. */
const base = process.env['BASE_PATH'] ?? '/';

/**
 * Le repli des adresses profondes sur GitHub Pages.
 *
 * Pages sert des fichiers : il ne connaît que `index.html`. Ouvrir
 * `/annonce/seloger:123` — un lien collé, un favori, un rafraîchissement —
 * tomberait donc sur une 404, alors que l'application sait très bien afficher
 * cette adresse. Pages sert `404.html` pour tout chemin inconnu : en y mettant
 * la même page, le routeur reprend la main côté navigateur.
 */
function pagesDeepLinkFallback(): Plugin {
  return {
    name: 'rf-404-fallback',
    apply: 'build',
    // `writeBundle` et non `generateBundle` : la page d'entrée est écrite par
    // le greffon HTML de Vite, après la constitution du bundle — à l'étape
    // précédente, elle n'y figure pas encore.
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      copyFileSync(join(dir, 'index.html'), join(dir, '404.html'));
    },
  };
}

/**
 * L'adresse publique du site dans les métadonnées de partage (`%SITE_URL%`).
 *
 * DÉDUITE DU DÉPÔT, comme pour la page de présentation dont on reprend la
 * fonction : un nom écrit en dur a déjà cassé tous les liens à un renommage.
 * Dépôt introuvable (construction hors dépôt) : adresses relatives plutôt
 * qu'une construction qui échoue pour un aperçu.
 */
function shareMetadata(): Plugin {
  let siteUrl = '/';
  try {
    siteUrl = siteInfo().siteUrl;
  } catch {
    // Pas de dépôt connu : l'aperçu perd son image, l'application reste.
  }
  return {
    name: 'rf-share-metadata',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
  };
}

/**
 * Ouvrir la connexion à l'API PENDANT que le code se télécharge.
 *
 * Le site est servi par GitHub Pages, l'API par un Worker : deux domaines.
 * Aujourd'hui la seconde connexion — nom de domaine, TCP, TLS, soit trois
 * allers-retours — ne commence qu'une fois le bundle chargé et exécuté, donc
 * au plus tôt trois secondes après l'ouverture sur un réseau lent. Ces trois
 * allers-retours se font aussi bien pendant le téléchargement.
 *
 * `use-credentials` et non l'ancrage anonyme : toutes les requêtes portent le
 * cookie de session (`credentials: 'include'`), et une connexion ouverte dans
 * l'autre mode ne leur servirait pas.
 *
 * L'ADRESSE VIENT DE L'ENVIRONNEMENT, jamais d'une constante : c'est la même
 * variable que le code lit (`VITE_API_URL`), posée par le déploiement. Absente
 * — aperçu local, démonstration —, on n'écrit rien plutôt qu'une adresse
 * inventée.
 */
function apiPreconnect(): Plugin {
  let origin: string | null = null;
  try {
    const raw = process.env['VITE_API_URL'];
    origin = raw === undefined || raw === '' ? null : new URL(raw).origin;
  } catch {
    // Adresse illisible : pas de connexion anticipée, l'application reste.
  }
  return {
    name: 'rf-api-preconnect',
    transformIndexHtml: {
      order: 'pre',
      // En TÊTE : c'est la première chose utile que l'analyseur de préchargement
      // rencontre, donc la connexion part avant même le téléchargement du code.
      handler: (html) =>
        origin === null
          ? html
          : html.replace(
              '<head>',
              `<head>\n    <link rel="preconnect" href="${origin}" crossorigin="use-credentials" />`,
            ),
    },
  };
}

export default defineConfig(() => {
  return {
    base,
    plugins: [react(), tailwindcss(), pagesDeepLinkFallback(), shareMetadata(), apiPreconnect()],
    resolve: {
      // Alias shadcn/ui standard — permet `npx shadcn add <composant>`.
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      // Figé à la compilation : `false` rend les branches de démonstration
      // mortes, donc `mock-data.ts` n'entre pas dans le bundle.
      __DEMO__: JSON.stringify(process.env['VITE_DEMO'] === 'true'),
      // Clé PUBLIQUE du serveur de push : ce n'est pas un secret, elle doit
      // se retrouver dans le bundle pour que le navigateur puisse s'abonner.
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(
        process.env['VAPID_PUBLIC_KEY'] ?? '',
      ),
      // Identifiant OAuth de l'application. PUBLIC comme la clé de push, et
      // pour la même raison : c'est le navigateur qui s'en sert. Ce n'est pas
      // un secret mais une identité — c'est le Worker qui la CONTRÔLE, en la
      // comparant à celle que porte le jeton rendu par Google.
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
        process.env['GOOGLE_CLIENT_ID'] ?? '',
      ),
    },
    build: {
      // §39 : le frontend doit rester léger. Un dépassement signale une
      // dépendance lourde ajoutée sans y penser.
      chunkSizeWarningLimit: 300,
      sourcemap: false,
    },
  };
});
