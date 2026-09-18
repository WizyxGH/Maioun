/**
 * LE TITRE D'UNE ALERTE S'ACCORDE, ou il se voit.
 *
 * Signalé par l'utilisateur le 2026-09-18 : « attention orthographe singulier
 * pluriel sur app et envoi de mail ». Les titres étaient écrits en dur, chacun
 * figé dans un nombre — l'e-mail annonçait « Nouvelles annonces » pour un seul
 * logement, et la notification « Candidatures rouvertes » alors qu'elle ne
 * porte jamais qu'une annonce.
 */

import { describe, expect, it } from 'vitest';
import { alertHeading } from './headings.js';
import { FAVORITE_GONE_TITLE, reopenedContentFor } from './web-push.js';
import type { NotifiableListing } from '../db/repository.js';

const ANNONCE = {
  id: 'orpi:1',
  title: 'Deux pièces Cimiez',
  price: 690,
  area: 32,
  rooms: 2,
  city: 'nice',
  district: null,
  address: null,
  phone: null,
  availableAt: null,
  photoUrls: [],
} as unknown as NotifiableListing;

describe('le titre d’une alerte suit le nombre d’annonces', () => {
  it('met au singulier à une annonce, au pluriel à partir de deux', () => {
    expect(alertHeading('new', 1)).toBe('Nouvelle annonce');
    expect(alertHeading('new', 2)).toBe('Nouvelles annonces');
    expect(alertHeading('reopened', 1)).toBe('Candidature rouverte');
    expect(alertHeading('reopened', 7)).toBe('Candidatures rouvertes');
    expect(alertHeading('nearMatch', 1)).toBe('Proche de vos critères');
    expect(alertHeading('nearMatch', 3)).toBe('Proches de vos critères');
    expect(alertHeading('favoriteGone', 1)).toContain('Un favori n’est plus disponible');
    expect(alertHeading('favoriteGone', 2)).toContain('Des favoris ne sont plus disponibles');
  });

  it('garde le SINGULIER à zéro : le français ne compte qu’à partir de deux', () => {
    expect(alertHeading('new', 0)).toBe('Nouvelle annonce');
  });

  it('laisse invariable la phrase qui ne compte pas d’annonces', () => {
    expect(alertHeading('reminder', 1)).toBe('Vous n’avez pas encore candidaté');
    expect(alertHeading('reminder', 4)).toBe('Vous n’avez pas encore candidaté');
  });
});

describe('la notification, qui part par annonce, ne se met jamais au pluriel', () => {
  it('annonce UNE candidature rouverte', () => {
    expect(reopenedContentFor(ANNONCE, 'https://exemple.invalid').title).toBe(
      'Candidature rouverte',
    );
  });

  it('et le favori disparu garde son titre d’origine', () => {
    expect(FAVORITE_GONE_TITLE).toBe('💔 Un favori n’est plus disponible');
  });
});
