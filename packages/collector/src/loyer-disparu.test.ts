/**
 * UN SÉLECTEUR MORT NE FAIT PAS DE BRUIT.
 *
 * Square Habitat a renommé la classe CSS de son prix le 2026-09-24 : cinq
 * annonces niçoises remontaient sans loyer. Un champ absent reste absent —
 * c'est la règle du projet —, donc rien ne protestait ; et l'inventaire ne
 * s'était pas effondré, donc le garde-fou des chutes suspectes ne voyait rien
 * non plus. Il manquait celui-ci.
 */

import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { loyerDisparu } from './pipeline.js';

const annonce = (priceText?: string): RawListing =>
  ({
    sourceId: 'square-habitat',
    sourceRef: Math.random().toString(36).slice(2),
    sourceUrl: 'https://example.invalid/bien',
    ...(priceText === undefined ? {} : { priceText }),
  }) as RawListing;

const plusieurs = (combien: number, priceText?: string): RawListing[] =>
  Array.from({ length: combien }, () => annonce(priceText));

describe('loyerDisparu', () => {
  it('signale une page entière rendue sans loyer', () => {
    expect(loyerDisparu(plusieurs(5))).toBe(true);
  });

  it('ne dit rien quand les loyers sont là', () => {
    expect(loyerDisparu(plusieurs(5, '849 €'))).toBe(false);
  });

  it('ne dit rien si UNE SEULE en porte un : ce n’est pas un sélecteur mort', () => {
    expect(loyerDisparu([...plusieurs(9), annonce('750 €')])).toBe(false);
  });

  // Une agence n'ayant que des biens « prix sur demande » ne doit pas passer
  // pour cassée : il en faut assez pour que l'absence générale veuille dire
  // quelque chose.
  it('se tait sous cinq annonces', () => {
    expect(loyerDisparu(plusieurs(4))).toBe(false);
    expect(loyerDisparu([])).toBe(false);
  });

  it('traite un loyer vide ou en blancs comme absent', () => {
    expect(loyerDisparu(plusieurs(5, '   '))).toBe(true);
  });
});
