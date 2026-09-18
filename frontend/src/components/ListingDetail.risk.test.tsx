/**
 * ENLEVER LE BADGE NE DOIT RIEN FAIRE DISPARAÎTRE EN SILENCE.
 *
 * Les raisons du score de risque vivaient en bas de fiche, dans un panneau
 * replié, sous le message déjà rédigé : le seul avertissement visible avant
 * d'agir était le badge de la carte. Elles remontent donc avant le contact,
 * lisibles sans un clic, et sans jamais porter de verdict.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { RISK_ALERT } from '@maioun/shared';
import { ListingDetail } from './ListingDetail.js';

const base = MOCK_LISTINGS[0]!;

const BAS_LOYER = 'Loyer très inférieur au marché (4.4 €/m²)';
const NEUTRE = 'Agence identifiable (Immo Nice)';

function fiche(risk: number): void {
  const listing: ListingView = {
    ...base,
    scores: {
      ...base.scores,
      risk: {
        value: risk,
        reasons: [
          { code: 'identity.agency', label: NEUTRE, delta: 0 },
          { code: 'price.veryLow', label: BAS_LOYER, delta: 40 },
        ],
        unknownSignals: [],
        confidence: 1,
      },
    },
  };
  render(
    <ListingDetail
      listing={listing}
      profile={null}
      nowMs={Date.parse('2026-09-17T12:00:00Z')}
      onBack={vi.fn()}
      onTrackingChange={vi.fn()}
      onContactRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

/** La bannière, reconnue par son rôle : elle s'annonce, le panneau replié non. */
function banniere(): HTMLElement | null {
  return (
    screen.queryAllByRole('alert').find((node) => node.textContent?.includes(BAS_LOYER)) ?? null
  );
}

describe('signaux d’alerte de la fiche', () => {
  it('met la raison sous les yeux au-dessus du seuil, sans dérouler quoi que ce soit', () => {
    fiche(RISK_ALERT);
    expect(banniere()).not.toBeNull();
  });

  it('ne dit rien en dessous du seuil : le détail reste dans le panneau des scores', () => {
    fiche(RISK_ALERT - 1);
    expect(banniere()).toBeNull();
  });

  it('n’avertit que de ce qui pèse — pas de « agence identifiable » dans une alerte', () => {
    fiche(RISK_ALERT);
    expect(banniere()?.textContent).not.toContain(NEUTRE);
  });

  it('n’accuse pas : aucun mot de verdict dans la bannière', () => {
    fiche(RISK_ALERT + 40);
    const texte = banniere()?.textContent ?? '';
    expect(texte).not.toMatch(/arnaque|fraude|escroquerie|faux/i);
    expect(texte).toMatch(/ne prouve/i);
  });
});
