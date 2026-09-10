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
import { readTestimonials, renderTestimonials } from './src/testimonials.js';

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

export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [tailwindcss(), testimonials()],
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
