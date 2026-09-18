import { describe, expect, it } from 'vitest';
import { announcedTotal, coverageOf } from './announced-total.js';

describe('total annoncé par la page', () => {
  it('lit les compteurs relevés sur les sites que nous lisons', () => {
    expect(announcedTotal('<div class="compteur">15 annonces trouvées </div>')).toBe(15);
    expect(announcedTotal('<p>5 biens disponibles</p>')).toBe(5);
    expect(announcedTotal('<h1>Locations</h1><span> (4 réponses)</span>')).toBe(4);
    expect(announcedTotal('<main><p>3 annonces immobilières</p></main>')).toBe(3);
    expect(announcedTotal('<div>1 Résultats</div>')).toBe(1);
  });

  it('lit le compte porté par le titre de la page', () => {
    expect(announcedTotal('<title>Toutes les locations, 3 annonces</title><body></body>')).toBe(3);
    expect(announcedTotal('<title>2 annonces de logements à louer</title>')).toBe(2);
  });

  it('accepte zéro : un site qui n’a rien le dit aussi', () => {
    expect(announcedTotal('<p>0 annonces immobilières</p>')).toBe(0);
  });

  /**
   * LE NUMÉRO DE PAGE ET LA CARTE D'UNE ANNONCE portent eux aussi un nombre
   * suivi d'un mot du métier. Sans l'exigence d'un mot de décompte, « Page 1
   * Location… » valait un total de 1 sur une liste de quatre.
   */
  it('ne prend pas un numéro de page ni une carte pour un total', () => {
    expect(announcedTotal('<p>Page 1 Location Appartement Nice 680 €</p>')).toBe(null);
    expect(announcedTotal('<li>2 Location meublée 700 €</li>')).toBe(null);
  });

  it('ignore une taille de page', () => {
    expect(announcedTotal('<p>15 annonces par page</p>')).toBe(null);
  });

  it('se tait quand la page annonce deux chiffres différents', () => {
    expect(announcedTotal('<p>4 réponses</p><p>12 annonces trouvées</p>')).toBe(null);
  });

  it('se tait quand la page n’annonce rien', () => {
    expect(announcedTotal('<html><body><a href="/bien/1">Studio</a></body></html>')).toBe(null);
  });

  it('ne lit pas un nombre dans un script ni dans une adresse', () => {
    expect(announcedTotal('<script>var x = "42 annonces trouvées";</script>')).toBe(null);
    expect(announcedTotal('<a href="/12-annonces-trouvees">voir</a>')).toBe(null);
  });
});

describe('verdict de couverture', () => {
  it('dit « courte » quand le site annonce plus que ce qu’on a lu', () => {
    expect(coverageOf(9, 5)).toBe('short');
  });

  it('dit « pleine » dès qu’on a lu au moins le total annoncé', () => {
    expect(coverageOf(9, 9)).toBe('full');
    // Un compteur en retard n'est pas une annonce manquante.
    expect(coverageOf(9, 11)).toBe('full');
  });

  it('ne conclut rien sans total annoncé', () => {
    expect(coverageOf(null, 0)).toBe('unknown');
  });
});
