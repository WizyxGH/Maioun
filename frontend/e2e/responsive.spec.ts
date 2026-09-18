/**
 * Vérification du responsive (§39).
 *
 * Un seul défaut compte vraiment ici : le DÉBORDEMENT HORIZONTAL. Il oblige à
 * balayer latéralement pour lire, et c'est le symptôme le plus courant d'un
 * élément à largeur fixe oublié. On le mesure donc sur chaque vue, à plusieurs
 * largeurs, plutôt que de décrire des mises en page qui bougeront.
 */

import { test, expect, type Page } from '@playwright/test';
import { ouvrirRecherche } from './navigation.js';

/** Largeurs réelles : petit Android, iPhone courant, tablette, portable. */
const WIDTHS = [
  { name: 'petit mobile', width: 360, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablette', width: 768, height: 1024 },
  { name: 'portable', width: 1280, height: 800 },
];

/** Combien de pixels dépassent horizontalement, tolérance à 1 px d'arrondi. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - doc.clientWidth);
  });
}

for (const { name, width, height } of WIDTHS) {
  test(`aucun débordement horizontal en ${name} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    // L'accueil est un point de situation ; la liste vit sous « Recherche ».
    await ouvrirRecherche(page);
    await expect(page.getByTestId('listing-card').first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // La modale « Filtres » : c'est elle qui porte le plus de contrôles
    // sur une petite largeur.
    await page.getByRole('button', { name: /Filtres/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: /^(Voir \d+ annonces?|Aucun résultat)$/ }).click();

    // La fiche détaillée : titres longs, photos, tableau de scores.
    await page.getByTestId('listing-card').first().click();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
}

test('les cibles tactiles restent atteignables au doigt', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  // L'accueil est un point de situation ; la liste vit sous « Recherche ».
  await page
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'Recherche' })
    .click();
  await expect(page.getByTestId('listing-card').first()).toBeVisible();

  /**
   * LA MESURE EST REPRISE JUSQU'À CE QU'ELLE SE STABILISE, et il a fallu en
   * arriver là. Une hauteur de bouton dépend de la police chargée, des icônes
   * dimensionnées en `em` et de la mise en page une fois posée : prise trop
   * tôt, elle vaut celle de la police de repli. `document.fonts.ready` ne
   * suffisait pas — le test passait seul et tombait dans la suite complète, où
   * plusieurs navigateurs se partagent la machine et où le rendu traîne.
   *
   * `expect.poll` ne rend pas l'assertion plus indulgente : un bouton
   * réellement trop petit le reste à chaque reprise, et le test échoue au bout
   * du délai. Il retire seulement la fenêtre pendant laquelle la page n'est
   * pas encore la page.
   */
  await expect
    .poll(
      async () => {
        const small: string[] = [];
        for (const button of await page.getByRole('button').all()) {
          if (!(await button.isVisible())) continue;
          const box = await button.boundingBox();
          // 36 px : en deçà, une cible devient difficile à viser au doigt.
          // Seuil indulgent — on cherche les oublis, pas la perfection.
          if (box !== null && box.height < 36) {
            small.push((await button.textContent())?.trim() || '(sans texte)');
          }
        }
        return small.join(', ');
      },
      { message: 'cibles tactiles trop petites' },
    )
    .toBe('');
});

test('le bouton de résultats reste visible sans dérouler la modale (§39)', async ({ page }) => {
  // Le pied de la modale porte le NOMBRE d'annonces qui restent : c'est ce
  // qu'on regarde en réglant un filtre. Il se trouvait après huit sections de
  // défilement, si bien qu'on réglait sans jamais voir l'effet du réglage.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'Recherche' })
    .click();
  await page.getByRole('button', { name: /Filtres/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Filtres' });
  const resultats = dialog.getByRole('button', {
    name: /^(Voir \d+ annonces?|Aucun résultat)$/,
  });
  await expect(resultats).toBeInViewport();

  // Et il y reste après avoir déroulé jusqu'au dernier filtre, tout en bas :
  // c'est bien un pied fixe, pas le hasard d'un panneau assez court.
  await dialog.getByLabel('Caractère meublé').scrollIntoViewIfNeeded();
  await expect(resultats).toBeInViewport();
});

test('la carte tient dans l’écran du téléphone, sans défilement (§39)', async ({ page }) => {
  // Elle occupait 65 % de la hauteur de fenêtre, mesurée BARRE D'ADRESSE
  // MASQUÉE — donc plus que l'écran réel —, en plus de l'en-tête, de la barre
  // de filtres et de la barre de navigation basse. Il fallait défiler pour en
  // voir le bas, sur un écran qui tient dans une main.
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: 'Recherche' })
    .click();
  await expect(page.getByTestId('listing-card').first()).toBeVisible();

  await page.getByRole('button', { name: /Carte/ }).click();
  const carte = page.getByTestId('map-view');
  await expect(carte).toBeVisible();

  const boite = await carte.boundingBox();
  expect(boite).not.toBeNull();
  // Le bas de la carte reste au-dessus du bas de l'écran : rien à faire
  // défiler pour la voir en entier.
  expect(boite!.y + boite!.height).toBeLessThanOrEqual(740);
});

/**
 * LA BARRE DE PUCES TIENT SUR UNE SEULE LIGNE, ET LE DIT QUAND ELLE DÉBORDE.
 *
 * Elle se repliait (`flex-wrap`) : six à dix filtres posés — le cas courant
 * depuis que les critères ont leur puce — prenaient deux à quatre lignes, et la
 * première annonce passait sous le pli sur un téléphone. Trois choses se
 * mesurent ici, parce qu'aucune ne se voit dans un test en mémoire :
 *
 *  - UNE LIGNE : toutes les puces au même `offsetTop` ;
 *  - C'EST LA BARRE QUI DÉFILE, PAS LA PAGE : aucun débordement du document ;
 *  - LE DÉBORDEMENT S'ANNONCE : sans repère visible, une rangée coupée net
 *    ressemble à une rangée complète et cache des filtres.
 *
 * Les largeurs sont celles demandées, du plus petit Android au portable large.
 */
const CHIP_WIDTHS = [320, 360, 390, 768, 1440];

for (const width of CHIP_WIDTHS) {
  test(`les puces de filtres tiennent sur une ligne à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await ouvrirRecherche(page);
    await expect(page.getByTestId('listing-card').first()).toBeVisible();

    // DE QUOI CHARGER LA BARRE comme l'utilisateur la charge : le budget et la
    // surface, les trois critères de collecte, un texte cherché, quatre types.
    await page.getByLabel('Rechercher une annonce').fill('nice');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Filtres/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Filtres' });
    for (const type of ['Appartement', 'Studio', 'Maison', 'Loft']) {
      await dialog.getByRole('button', { name: type, exact: true }).click();
    }
    await dialog.getByRole('button', { name: /^(Voir \d+ annonces?|Aucun résultat)$/ }).click();

    const rail = page.getByTestId('filter-chips');
    await expect(rail).toBeVisible();
    const mesure = await rail.evaluate((el) => {
      const chips = [...el.children].filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      );
      const doc = document.documentElement;
      return {
        puces: chips.length,
        lignes: new Set(chips.map((chip) => chip.offsetTop)).size,
        barreDeborde: el.scrollWidth > el.clientWidth + 1,
        pageDeborde: Math.max(0, doc.scrollWidth - doc.clientWidth),
      };
    });

    expect(mesure.puces).toBeGreaterThanOrEqual(8);
    expect(mesure.lignes).toBe(1);
    expect(mesure.pageDeborde).toBeLessThanOrEqual(1);
    if (mesure.barreDeborde) {
      await expect(page.getByTestId('filter-chips-more')).toBeVisible();
    }
    // « Effacer tout » reste atteignable sans défiler la barre : il vit à côté.
    await expect(page.getByRole('button', { name: 'Effacer tout' })).toBeInViewport();
  });
}
