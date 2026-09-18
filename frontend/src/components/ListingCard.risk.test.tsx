/**
 * « C'est un peu comme le "trop beau pour être vrai" qu'on a fait. On devrait
 * fusionner avec ça, ou en tout cas utiliser ces critères et enlever le tag. »
 *
 * Le tag, c'était le badge « Trop beau ? » de la carte : un second nom, avec
 * son propre seuil, pour le score que la fiche appelle « Signaux d'alerte ».
 * La carte ne doit plus porter aucun libellé de suspicion — les critères, eux,
 * continuent d'alimenter le score, et la note de priorité en tient compte.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { RISK_ALERT } from '@maioun/shared';
import { ListingCard } from './ListingCard.js';

const base = MOCK_LISTINGS[0]!;

function carte(risk: number): void {
  const listing: ListingView = {
    ...base,
    scores: {
      ...base.scores,
      risk: {
        value: risk,
        reasons: [
          { code: 'price.veryLow', label: 'Loyer très inférieur au marché (4.4 €/m²)', delta: 40 },
        ],
        unknownSignals: [],
        confidence: 1,
      },
    },
  };
  render(
    <ListingCard
      listing={listing}
      nowMs={Date.parse('2026-09-17T12:00:00Z')}
      onOpen={vi.fn()}
      profile={null}
    />,
  );
}

describe('la carte ne porte plus de libellé de suspicion', () => {
  it('reste muette sur une annonce très au-dessus du seuil d’alerte', () => {
    carte(RISK_ALERT + 40);
    expect(screen.queryByText(/trop beau/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/suspect/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/douteu/i)).not.toBeInTheDocument();
  });

  it('n’en porte pas davantage juste au seuil', () => {
    carte(RISK_ALERT);
    expect(screen.queryByText(/trop beau/i)).not.toBeInTheDocument();
  });

  it('continue d’afficher la note de priorité, qui intègre le risque', () => {
    carte(RISK_ALERT + 40);
    expect(screen.getByLabelText('Priorité d’action')).toBeInTheDocument();
  });
});
