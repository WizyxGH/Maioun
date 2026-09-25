// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

/**
 * Les adresses rendues en `href` viennent des sites collectés. Ce test dit ce
 * qu'on accepte d'eux, et surtout ce qu'on refuse.
 */

import { describe, expect, it } from 'vitest';
import { safeHref } from './safe-url.js';

describe('safeHref', () => {
  it('laisse passer une adresse web ordinaire', () => {
    expect(safeHref('https://exemple.invalid/annonce/1')).toBe('https://exemple.invalid/annonce/1');
    expect(safeHref('http://exemple.invalid/a')).toBe('http://exemple.invalid/a');
  });

  it('refuse « javascript: », quelle qu’en soit l’écriture', () => {
    // C'est le cas qui compte : posé dans un href, il s'exécute au clic dans
    // notre origine, avec le profil locataire à portée.
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JavaScript:alert(1)')).toBeNull();
    expect(safeHref('  javascript:alert(1)')).toBeNull();
    // Un retour à la ligne au milieu du schéma : le navigateur l'ignore et
    // exécute quand même, une comparaison de chaîne naïve le laisserait passer.
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
  });

  it('refuse les autres schémas qui portent du contenu', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    expect(safeHref('file:///C:/Windows/win.ini')).toBeNull();
  });

  it('rend null sur une adresse absente, vide ou relative', () => {
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref('   ')).toBeNull();
    // Relative : ce n'est pas un lien sortant, on n'en fabrique pas un.
    expect(safeHref('/annonce/1')).toBeNull();
  });
});
