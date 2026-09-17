/**
 * « JE VOIS TOUJOURS DES ANNONCES QUE J'AI CONTACTÉES DANS À CONTACTER » —
 * relevé du 2026-09-17, après le correctif de la section du même nom.
 *
 * La section, elle, était bien réparée. C'est la CARTE qui continuait
 * d'annoncer « à contacter », flamme comprise, sur une annonce portant déjà son
 * badge « Contactée » : le libellé ne regardait que la note d'urgence. Et hors
 * du tri par priorité il n'y a pas de section — la carte est alors le seul
 * endroit où l'on lit la chose.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import type { TrackingStatus } from '@maioun/shared';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { ListingCard } from './ListingCard.js';

/** L'annonce la plus pressante du jeu d'essai : sa note dépasse le seuil. */
const PRESSANTE = [...MOCK_LISTINGS].sort((a, b) => b.actionPriority - a.actionPriority)[0]!;

function carte(tracking: TrackingStatus): void {
  const listing: ListingView = { ...PRESSANTE, tracking };
  render(
    <ListingCard
      listing={listing}
      nowMs={Date.parse('2026-09-17T12:00:00Z')}
      onOpen={vi.fn()}
      profile={null}
    />,
  );
}

describe('libellé de priorité d’une carte', () => {
  it('dit « à contacter » tant que rien n’a été fait', () => {
    carte('new');
    expect(screen.getByText('à contacter')).toBeInTheDocument();
  });

  it('le dit aussi sur celle que l’utilisateur a marquée « à contacter »', () => {
    carte('toContact');
    expect(screen.getByText('à contacter')).toBeInTheDocument();
  });

  it('ne le dit plus une fois l’annonce contactée', () => {
    carte('contacted');
    expect(screen.queryByText('à contacter')).not.toBeInTheDocument();
    // La note reste : c'est l'appel à l'action qui tombe, pas le classement.
    expect(screen.getByText('priorité haute')).toBeInTheDocument();
  });

  it('ne le dit pas davantage sur une annonce refusée', () => {
    carte('rejected');
    expect(screen.queryByText('à contacter')).not.toBeInTheDocument();
  });
});
