// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it } from 'vitest';
import { readableDescription } from './description-text.js';

describe('readableDescription', () => {
  it('rend tel quel un texte qui a déjà ses lignes', () => {
    const text = 'Studio au calme. Loyer : 600 €\nLibre de suite.';
    expect(readableDescription(text)).toBe(text);
  });

  it('va à la ligne avant chaque puce d’une liste', () => {
    expect(readableDescription('Proche de tout : • Plages : 14 min • Gare : 10 min')).toBe(
      'Proche de tout :\n• Plages : 14 min\n• Gare : 10 min',
    );
  });

  it('ne touche pas une puce isolée', () => {
    expect(readableDescription('Studio • Nice')).toBe('Studio • Nice');
  });

  it('ouvre un paragraphe avant une rubrique qui commence une phrase', () => {
    expect(
      readableDescription(
        'Deux pièces au 12 rue Exemple, 06000 Nice. Loyer 750 € dont 50 € de charges. Montant estimé des dépenses : 900 €.',
      ),
    ).toBe(
      'Deux pièces au 12 rue Exemple, 06000 Nice.\n\nLoyer 750 € dont 50 € de charges.\n\nMontant estimé des dépenses : 900 €.',
    );
  });

  it('laisse les rubriques en milieu de phrase et les prix intacts', () => {
    const text =
      'NICE - FABRON Appartement 1.250 m du tram, loyer 1.200 € charges comprises, DPE C';
    expect(readableDescription(text)).toBe(text);
  });
});
