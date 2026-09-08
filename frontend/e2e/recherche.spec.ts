/**
 * LA BARRE DE RECHERCHE FAISAIT TOMBER L'ÉCRAN. Signalé le 2026-09-08 : taper
 * dans le champ affichait « Cet écran n'a pas pu s'afficher », donc une
 * exception au rendu — que rien dans les scénarios existants ne couvrait, aucun
 * d'eux ne se servant de la recherche textuelle.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (error) => erreurs.push(error.message));
  await page.goto('/');
  const haut = page.getByRole('navigation', { name: 'Navigation principale' });
  const barre = (await haut.isVisible())
    ? haut
    : page.getByRole('navigation', { name: 'Navigation', exact: true });
  await barre.getByRole('button', { name: 'Recherche' }).click();
  await expect(page.getByTestId('listing-card').first()).toBeVisible();
  (page as unknown as { erreurs: string[] }).erreurs = erreurs;
});

test('taper dans la barre de recherche ne fait pas tomber l’écran', async ({ page }) => {
  const champ = page.getByLabel('Rechercher une annonce');
  await champ.fill('nice');
  await expect(page.getByText(/n’a pas pu s’afficher/)).toHaveCount(0);

  // Une recherche qui ne rend rien est un cas normal, pas une panne.
  await champ.fill('zzzzzzzz');
  await expect(page.getByText(/n’a pas pu s’afficher/)).toHaveCount(0);

  // Et l'on doit pouvoir revenir en arrière.
  await champ.fill('');
  await expect(page.getByTestId('listing-card').first()).toBeVisible();
  expect((page as unknown as { erreurs: string[] }).erreurs).toEqual([]);
});
