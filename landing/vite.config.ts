/**
 * Site de présentation de Maïoun.
 *
 * SÉPARÉ DE L'APPLICATION, et c'est le but : la web app rejoindra un
 * sous-domaine, cette page restera à la racine. Deux publics, deux rythmes de
 * publication, deux poids — un visiteur qui découvre le projet n'a aucune
 * raison de télécharger React, Leaflet et quarante écrans.
 *
 * AUCUN JAVASCRIPT APPLICATIF. Ce que fait cette page — lire, dérouler, cliquer
 * un lien — le HTML le fait seul. Vite ne sert qu'à compiler la feuille de
 * style Tailwind et à empreindre les fichiers.
 */

import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readTestimonials, renderTestimonials } from './src/testimonials.js';
import { fillSite, siteInfo } from './src/site.js';
import { readFacts, structuredData } from './src/structured-data.js';
import { renderLlmsTxt } from './src/llms-txt.js';

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

/**
 * Pose la section des témoignages à la place de son repère.
 *
 * À LA CONSTRUCTION, et pas dans le navigateur : la page reste sans
 * JavaScript. Le fichier est relu à chaque construction — ajouter un
 * témoignage, c'est ajouter une entrée et republier.
 */
function testimonials(): Plugin {
  return {
    name: 'maioun-temoignages',
    transformIndexHtml(html) {
      if (!html.includes('<!-- TEMOIGNAGES -->')) return html;
      const liste = readTestimonials(page('temoignages.json'));
      return html.replace('<!-- TEMOIGNAGES -->', renderTestimonials(liste));
    },
  };
}

/**
 * Pose les adresses de la page — la sienne et celle du code — là où les
 * fichiers portent `%SITE_URL%` et `%REPO_URL%`.
 *
 * DANS LES PAGES, avant que Vite ne les lise (`order: 'pre'`) ; DANS
 * `robots.txt` ET LE PLAN DU SITE, une fois recopiés tels quels depuis
 * `public/`, que Vite ne transforme pas.
 */
function siteAddresses(): Plugin {
  const info = siteInfo();
  let outDir = 'dist';
  return {
    name: 'maioun-adresses',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: { order: 'pre', handler: (html) => fillSite(html, info) },
    closeBundle() {
      for (const name of ['robots.txt', 'sitemap.xml']) {
        const path = join(outDir, name);
        writeFileSync(path, fillSite(readFileSync(path, 'utf8'), info));
      }
    },
  };
}

/**
 * Pose le nombre de sources là où la page porte `%SOURCE_COUNT%`.
 *
 * LU À LA CONSTRUCTION dans la table que l'application engendre, et arrondi à
 * la dizaine inférieure : « plus de 130 » reste vrai d'une source à l'autre.
 * La page affichait « 57 » alors qu'on en relevait plus du double. Table
 * absente (page construite seule) : le dernier nombre connu.
 */
function sourceCount(): Plugin {
  const exact = readSourceCount();
  // ARRONDI À LA DIZAINÉ INFÉRIEURE : « plus de 130 » reste vrai d'une source
  // à l'autre, « 137 » serait faux demain.
  const label = exact === null ? '130' : String(Math.floor(exact / 10) * 10);
  return {
    name: 'maioun-sources',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%SOURCE_COUNT%', label),
    },
  };
}

/**
 * LE NOMBRE DE SOURCES, lu de la table que l'application engendre.
 *
 * Lu UNE FOIS et partagé par les trois usages — le texte de la page, le
 * balisage JSON-LD et `llms.txt`. Le lire à chaque endroit serait trois
 * lectures du même fichier et trois endroits à corriger le jour où la table
 * change de forme.
 *
 * `null` si la table est absente ou illisible : au balisage et au fichier, on
 * n'écrit alors RIEN. Une donnée absente se laisse combler par le lecteur ;
 * un chiffre faux, non.
 */
function readSourceCount(): number | null {
  try {
    const table = readFileSync(page('../frontend/src/sources.generated.ts'), 'utf8');
    const count = (table.match(/^ {2}'?[a-z0-9-]+'?: \{/gm) ?? []).length;
    return count > 0 ? count : null;
  } catch {
    // Page construite hors du dépôt : on ne connaît pas le nombre.
    return null;
  }
}

/**
 * LE BALISAGE, ET LE FICHIER QUE LISION UN SEUL LLM.
 *
 * Les deux sont ASSEMBLÉS À LA CONSTRUCTION, depuis la page elle-même : les
 * questions et leurs réponses sont lues dans le HTML, jamais recopiées. Deux
 * textes qui en décrivent le même contenu finissent toujours par diverger, et
 * c'est alors le LLM qui répond à partir du mauvais.
 */
function forLlm(): Plugin {
  let outDir = 'dist';
  return {
    name: 'maioun-llm',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const facts = readFacts(html, readSourceCount());
        if (facts === null || !html.includes('<!-- JSON-LD -->')) return html;
        const json = structuredData(facts, siteInfo());
        if (json === null) return html;
        return html.replace(
          '<!-- JSON-LD -->',
          `<script type="application/ld+json">\n${json}\n    </script>`,
        );
      },
    },
    // `writeBundle` ET NON `closeBundle` : les HTML sont écrits APRÈS
    // `closeBundle` sous Rolldown, et le lire plus tôt échoue sur un fichier
    // qui n'existe pas encore. C'est aussi le moment qu'utilise le greffon 404
    // de l'application, pour la même raison.
    writeBundle(options) {
      // LE TEXTE DE `index.html` EST RELU À LA FIN, APRÈS LE BALISAGE : c'est
      // lui qui porte les questions, une fois la page complète. Le lire avant
      // aurait produit un fichier sans une seule question.
      const dir = options.dir ?? outDir;
      const html = readFileSync(join(dir, 'index.html'), 'utf8');
      const facts = readFacts(html, readSourceCount());
      if (facts === null) return;
      writeFileSync(join(dir, 'llms.txt'), renderLlmsTxt(facts, siteInfo()), 'utf8');
    },
  };
}

export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [tailwindcss(), siteAddresses(), sourceCount(), testimonials(), forLlm()],
  build: {
    sourcemap: false,
    /**
     * CHAQUE PAGE DOIT ÊTRE DÉCLARÉE. Vite ne construit que `index.html` par
     * défaut : les pages légales existaient dans le dossier, le pied les
     * référençait, et elles n'étaient tout simplement pas publiées — trois liens
     * vers des 404. Un service accessible au public sans mentions légales est
     * en infraction ; les oublier silencieusement est le pire des deux mondes.
     */
    rollupOptions: {
      input: {
        index: page('index.html'),
        mentions: page('mentions-legales.html'),
        confidentialite: page('confidentialite.html'),
        conditions: page('conditions.html'),
      },
    },
  },
});
