/**
 * Le bandeau d'alerte porte la PHOTO du logement (demande du 2026-09-18) :
 * on reconnaît un bien d'un coup d'œil bien avant d'avoir lu « 690 € · 32 m² ».
 */

import { describe, expect, it } from 'vitest';
import { mergeToasts } from './ToastStack.js';
import type { ListingView } from '../types.js';

function annonce(overrides: Partial<ListingView> = {}): ListingView {
  return {
    id: 'orpi:1',
    title: { value: 'Deux pièces Cimiez', sourceId: 'orpi', conflicts: [] },
    price: { value: 690, sourceId: 'orpi', conflicts: [] },
    area: { value: 32, sourceId: 'orpi', conflicts: [] },
    rooms: { value: 2, sourceId: 'orpi', conflicts: [] },
    city: { value: 'nice', sourceId: 'orpi', conflicts: [] },
    imageUrls: ['https://images.example.invalid/biens/photo_1234567890.jpg'],
    ...overrides,
  } as unknown as ListingView;
}

describe('le bandeau d’une annonce fraîche', () => {
  it('porte la première photo affichable', () => {
    const [toast] = mergeToasts([], [annonce()]);
    expect(toast?.photo).toContain('photo_1234567890.jpg');
    expect(toast?.body).toContain('690');
  });

  it('s’en passe quand la source n’en publie aucune', () => {
    // La cloche reprend alors sa place : mieux vaut aucun cliché qu'un cadre
    // vide qui laisse croire à une image qui ne charge pas.
    const [toast] = mergeToasts([], [annonce({ imageUrls: [] })]);
    expect(toast?.photo).toBeUndefined();
  });

  it('ne montre pas deux fois la même annonce', () => {
    const premier = mergeToasts([], [annonce()]);
    expect(mergeToasts(premier, [annonce()])).toEqual(premier);
  });

  it('n’en empile jamais plus de trois', () => {
    const fraiches = Array.from({ length: 5 }, (_, i) => annonce({ id: `orpi:${i}` }));
    expect(mergeToasts([], fraiches)).toHaveLength(3);
  });
});
