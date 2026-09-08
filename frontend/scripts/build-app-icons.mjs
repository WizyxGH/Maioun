/**
 * Engendre les icônes de l'application à partir du FAVICON.
 *
 *   pnpm --filter @maioun/frontend run app-icons
 *
 * POURQUOI. L'onglet du navigateur montrait une maison — le favicon, une
 * emoji posée en SVG dans `index.html` — pendant que les notifications push
 * en montraient une autre, dessinée à part. Deux identités pour une seule
 * application : on ne reconnaissait pas l'expéditeur d'une alerte avant de
 * lire son titre, alors que c'est précisément le rôle de cette vignette.
 *
 * COMMENT. On rend le MÊME SVG dans Chromium — celui de Playwright, déjà
 * présent pour les tests de bout en bout — et l'on capture le résultat. Passer
 * par un navigateur plutôt que par une bibliothèque de rendu évite d'ajouter
 * une dépendance, et rend exactement ce que le navigateur rendrait.
 *
 * LE FICHIER PRODUIT EST COMMITÉ : la construction du site ne dépend pas de ce
 * script. Il n'est relancé que si l'on change de dessin — et il faut savoir
 * qu'une emoji est rendue par la POLICE DU SYSTÈME : la maison de Windows n'est
 * pas exactement celle de Linux. C'est sans conséquence tant que le résultat
 * est committé, mais c'est la raison pour laquelle ce script ne tourne pas à
 * la construction.
 *
 * LE BADGE N'EST PAS TOUCHÉ. `badge-96.png` doit être blanc sur fond
 * transparent : Android n'en garde que le canal alpha et le reteint. Une image
 * opaque de bord à bord y produisait un CARRÉ NOIR à la place du logo — la
 * regénérer depuis une emoji colorée referait la même faute.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * LA SOURCE EST LE FAVICON LUI-MÊME, et non une copie de son dessin : changer
 * l identite ne doit demander qu une seule retouche, au seul endroit qui la
 * porte.
 */
const FAVICON = readFileSync(
  fileURLToPath(new URL('../public/favicon.svg', import.meta.url)),
  'utf8',
);

/** Ce qu'on produit, et pour qui. */
const TAILLES = [
  { fichier: 'icon-192.png', taille: 192 },
  { fichier: 'icon-512.png', taille: 512 },
];

const navigateur = await chromium.launch();
try {
  for (const { fichier, taille } of TAILLES) {
    const page = await navigateur.newPage({
      viewport: { width: taille, height: taille },
      deviceScaleFactor: 1,
    });
    // FOND OPAQUE, et non transparent : le manifeste déclare ces icônes
    // `maskable`, ce qui autorise le système à les rogner en cercle. Une emoji
    // seule y perdrait ses bords ; posée sur un carré plein, elle survit au
    // masque. La couleur est celle du thème.
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>
         html, body { margin: 0; height: 100%; }
         body {
           background: #0f172a;
           display: flex;
           align-items: center;
           justify-content: center;
           line-height: 1;
         }
         svg {
           width: ${Math.round(taille * 0.72)}px;
           height: ${Math.round(taille * 0.72)}px;
         }
       </style>
       <div>${FAVICON}</div>`,
    );
    const cible = fileURLToPath(new URL(`../public/${fichier}`, import.meta.url));
    writeFileSync(cible, await page.screenshot({ type: 'png' }));
    console.log(`${fichier} — ${taille}×${taille}`);
    await page.close();
  }
} finally {
  await navigateur.close();
}
