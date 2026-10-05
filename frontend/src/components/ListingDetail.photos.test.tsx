/**
 * Des photos que la source réserve à son site : la fiche ne peut pas les
 * montrer, mais elle doit dire qu'elles existent, et où les voir. Elle les
 * retirait en silence, et l'annonce paraissait sans photo (Lamy, 5 sur 5).
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { ListingDetail } from './ListingDetail.js';

const base = MOCK_LISTINGS[0]!;
const RESERVEES = [
  'https://res.cloudinary.com/agence/image/private/w_1600/dossier/a.jpg',
  'https://res.cloudinary.com/agence/image/private/w_1600/dossier/b.jpg',
];

function renderDetail(listing: ListingView): void {
  render(
    <ListingDetail
      listing={listing}
      profile={null}
      nowMs={Date.parse('2026-10-05T12:00:00Z')}
      onBack={vi.fn()}
      onTrackingChange={vi.fn()}
      onContactRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

describe('photos réservées au site de la source', () => {
  it('les annonce, avec un lien vers l’annonce d’origine', () => {
    const { videoUrl: _video, ...sansVideo } = base;
    renderDetail({ ...sansVideo, imageUrls: RESERVEES } as ListingView);
    const encart = screen.getByTestId('photos-at-source');
    expect(encart).toHaveTextContent('2 photos');
    const lien = screen.getByRole('link', { name: /annonce d’origine/ });
    expect(lien).toHaveAttribute('href', base.occurrences[0]!.sourceUrl);
  });

  it('ne dit rien quand l’annonce n’a aucune photo', () => {
    const { videoUrl: _video, ...sansVideo } = base;
    renderDetail({ ...sansVideo, imageUrls: [] } as ListingView);
    expect(screen.queryByTestId('photos-at-source')).toBeNull();
  });
});
