/**
 * ACCESSIBILITÉ : les règles WCAG 2.2 AA vérifiables automatiquement, en clair
 * et en sombre. Relevé du 2026-09-15 : dix-sept manquements (contrastes du thème
 * sombre, carte cliquable qui contenait le bouton favori, liens sources trop
 * petits au doigt). Ce scénario empêche qu'ils reviennent.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirRecherche } from './navigation.js';

const REGLES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function violations(page: Page): Promise<string[]> {
  // Mesurer pendant un fondu relève des couleurs à mi-chemin, pas celles du thème.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  );
  const { violations: found } = await new AxeBuilder({ page }).withTags(REGLES).analyze();
  return found.flatMap((v) =>
    v.nodes.map((n) => `${v.id} ${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
  );
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`thème ${colorScheme === 'light' ? 'clair' : 'sombre'}`, () => {
    test.use({ colorScheme });

    test('accueil, recherche et fiche sans manquement', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('main')).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await ouvrirRecherche(page);
      await expect(page.getByTestId('listing-card').first()).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await page.getByTestId('listing-card').first().click();
      await expect(page.getByRole('region', { name: 'Contact' })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
