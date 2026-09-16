/**
 * La fiche affiche les DEUX étiquettes du diagnostic. Le GES est le pendant du
 * DPE : une fiche qui n'en montre qu'une en cache la moitié.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { ListingDetail } from './ListingDetail.js';

const base = MOCK_LISTINGS[0]!;

const field = <T,>(
  value: T,
): { value: T; sourceId: string; observedAt: string; conflicts: [] } => ({
  value,
  sourceId: 'test',
  observedAt: '2026-09-16T10:00:00.000Z',
  conflicts: [],
});

function renderDetail(listing: ListingView): void {
  render(
    <ListingDetail
      listing={listing}
      profile={null}
      nowMs={Date.parse('2026-09-16T12:00:00Z')}
      onBack={vi.fn()}
      onTrackingChange={vi.fn()}
      onContactRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

/** Le libellé, puis la valeur qui le suit dans la liste de faits. */
function factValue(label: string): string {
  const dt = screen.getByText(label);
  return dt.nextElementSibling?.textContent ?? '';
}

describe('étiquettes énergie de la fiche', () => {
  it('affiche le GES à côté du DPE, dans la même forme', () => {
    renderDetail({ ...base, dpe: field('C'), ges: field('E') });
    expect(factValue('DPE')).toBe('Classe C');
    expect(factValue('GES')).toBe('Classe E');
  });

  it('laisse le GES vide quand la source ne le publie pas — jamais recopié du DPE', () => {
    renderDetail({ ...base, dpe: field('C'), ges: field(null) });
    expect(factValue('DPE')).toBe('Classe C');
    expect(factValue('GES')).not.toContain('Classe');
  });

  it('supporte une fiche ancienne, écrite avant le champ', () => {
    const { ges: _ges, ...ancienne } = { ...base, ges: field('A') };
    renderDetail(ancienne as ListingView);
    expect(factValue('GES')).not.toContain('Classe');
  });
});
