/**
 * Se rendre à la liste des annonces, quel que soit le format d'écran.
 *
 * La navigation change de forme : onglets en haut sur grand écran, barre basse
 * sur téléphone. Les scénarios qui parlent d'annonces commencent tous par ce
 * geste, et le dupliquer dans chaque fichier revenait à corriger deux fois la
 * même intermittence.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Cliquer un onglet, sur celle des deux barres qui le porte.
 *
 * Le geste était recopié pour chaque destination — « Recherche »,
 * « Paramètres », « Favoris » —, et chaque copie portait la même
 * intermittence. Une seule ici.
 */
export async function ouvrirOnglet(page: Page, nom: string): Promise<void> {
  /**
   * `isVisible()` EST UNE PHOTO, PAS UNE ATTENTE — et c'est ce qui rendait ce
   * geste intermittent. Juste après un changement de format et un chargement,
   * aucune des deux barres n'est encore posée : la photo répondait « non » pour
   * celle du haut, on se rabattait sur celle du bas, qui n'existe pas sur grand
   * écran, et le clic attendait trente secondes une barre absente.
   *
   * On attend donc que l'UNE des deux porte réellement le bouton, puis on
   * clique sur celle-là. Playwright réessaie jusqu'à ce que ce soit vrai.
   */
  const haut = page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: nom });
  const bas = page
    .getByRole('navigation', { name: 'Navigation', exact: true })
    .getByRole('button', { name: nom });

  await expect(haut.or(bas).first()).toBeVisible();
  await ((await haut.isVisible()) ? haut : bas).click();
}

/** La destination de loin la plus demandée par les scénarios. */
export async function ouvrirRecherche(page: Page): Promise<void> {
  await ouvrirOnglet(page, 'Recherche');
}
