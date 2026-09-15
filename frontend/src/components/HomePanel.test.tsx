/** La tuile « dans vos critères » affiche le total de la recherche où elle mène. */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePanel } from './HomePanel.js';

const noop = (): void => undefined;

describe('accueil', () => {
  it('reprend le nombre de résultats de la recherche, filtres compris', () => {
    render(
      <HomePanel
        listings={[]}
        searchCount={76}
        sources={[]}
        savedSearches={[]}
        nowMs={Date.now()}
        seenAtMs={0}
        profileComplete
        onOpenListing={noop}
        onOpenSearch={noop}
        onOpenFavorites={noop}
        onOpenAlerts={noop}
        onOpenSavedSearches={noop}
        onOpenProfile={noop}
        onApplySearch={noop}
      />,
    );
    const tile = screen.getByText('dans vos critères').closest('button');
    expect(tile?.textContent).toContain('76');
  });
});
