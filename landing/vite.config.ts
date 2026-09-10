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
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [tailwindcss()],
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
