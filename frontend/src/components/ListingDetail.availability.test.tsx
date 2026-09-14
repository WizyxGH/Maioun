/**
 * Ouverte par un lien, la fiche d'un bien qui n'est plus disponible le dit
 * d'emblée, et dit pourquoi.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { ListingDetail } from './ListingDetail.js';

const base = MOCK_LISTINGS[0]!;

function renderDetail(listing: ListingView): void {
  render(
    <ListingDetail
      listing={listing}
      profile={null}
      nowMs={Date.parse('2026-09-14T12:00:00Z')}
      onBack={vi.fn()}
      onTrackingChange={vi.fn()}
      onContactRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

describe('fiche d’un bien qui n’est plus disponible', () => {
  it('dit qu’il est loué', () => {
    renderDetail({ ...base, rented: true });
    expect(screen.getByText('Ce logement est loué')).toBeInTheDocument();
  });

  it('dit qu’il a disparu de sa source, et depuis quand', () => {
    renderDetail({ ...base, lifecycle: 'inactive', lastSeenAt: '2026-09-10T08:00:00Z' });
    expect(screen.getByText('Cette annonce n’est plus en ligne')).toBeInTheDocument();
    expect(screen.getByText(/vue pour la dernière fois le 10 septembre/)).toBeInTheDocument();
  });

  it('dit que les candidatures sont fermées, et qu’elles peuvent rouvrir', () => {
    renderDetail({ ...base, applicationStatus: 'full' });
    expect(screen.getByText('Candidatures fermées')).toBeInTheDocument();
    expect(screen.getByText(/reviendra d’elle-même/)).toBeInTheDocument();
  });

  it('ne dit rien d’un bien disponible', () => {
    renderDetail({ ...base, lifecycle: 'active', rented: false, archived: false });
    expect(screen.queryByText(/plus en ligne|loué|Candidatures fermées/)).not.toBeInTheDocument();
  });
});
