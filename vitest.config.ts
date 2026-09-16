import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Configuration Vitest racine — couvre les paquets Node (shared, collector, api).
 * Le frontend possède sa propre configuration (environnement jsdom).
 *
 * §59 : les tests doivent être déterministes. Aucun accès réseau n'est autorisé
 * dans la suite ; les scrapers sont testés contre des fixtures locales (§50).
 */
export default defineConfig({
  resolve: {
    // `tests/` n'est pas un paquet du workspace : sans ces alias, ses fichiers
    // ne sauraient pas résoudre les paquets internes. Pointer vers les sources
    // plutôt que vers `dist/` évite aussi de tester un build périmé.
    alias: {
      // LES SOUS-CHEMINS D'ABORD : `@maioun/collector` seul les
      // masquerait, l'alias le plus général l'emportant sur les autres. Ils
      // sont déclarés dans le paquet vers `dist/`, que les tests ne
      // construisent pas — le Worker les importe, et sans eux son aiguillage
      // restait intestable.
      '@maioun/collector/server/routes': fromRoot('./packages/collector/src/server/routes.ts'),
      '@maioun/collector/notify/mailer': fromRoot('./packages/collector/src/notify/mailer.ts'),
      '@maioun/collector/notify/email-theme': fromRoot(
        './packages/collector/src/notify/email-theme.ts',
      ),
      '@maioun/collector/contact/agency-form': fromRoot(
        './packages/collector/src/contact/agency-form.ts',
      ),
      '@maioun/shared': fromRoot('./packages/shared/src/index.ts'),
      '@maioun/collector': fromRoot('./packages/collector/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    // `.claude/**` : une copie de travail d'agent y est un clone du dépôt. Les
    // motifs ci-dessus ne l'atteignent pas aujourd'hui, mais un `**/` ajouté à
    // l'un d'eux y ferait tourner la suite en double, sur un code d'ailleurs.
    exclude: ['**/node_modules/**', '**/dist/**', 'frontend/**', '.claude/**'],
    globals: false,
    // Horloge et aléatoire sont figés au cas par cas dans les tests concernés.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/types.ts'],
      // §58 : seuils volontairement centrés sur les parties critiques.
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});
