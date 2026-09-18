/** La tuile « dans vos critères » affiche le total de la recherche où elle mène. */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePanel } from './HomePanel.js';

const noop = (): void => undefined;

/** L'accueil avec le strict nécessaire : chaque test ne règle que ce qu'il éprouve. */
function Accueil(
  props: Partial<React.ComponentProps<typeof HomePanel>> & { readonly searchCount: number },
): React.JSX.Element {
  return (
    <HomePanel
      listings={[]}
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
      {...props}
    />
  );
}

describe('accueil', () => {
  it('reprend le nombre de résultats de la recherche, filtres compris', async () => {
    render(<Accueil searchCount={76} />);
    // LE NOM ACCESSIBLE PORTE LA VALEUR FINALE, tout de suite : le chiffre
    // visible, lui, monte jusqu'à elle.
    const tile = screen.getByRole('button', { name: '76 dans vos critères' });
    await waitFor(() => expect(tile.textContent).toContain('76'));
  });

  it('ne montre AUCUN chiffre tant que la liste n’est pas arrivée', async () => {
    // « 0 dans vos critères » le temps du chargement, c'est un chiffre faux
    // présenté comme les vrais, suivi d'un saut.
    render(<Accueil searchCount={76} loading listings={[]} />);
    expect(screen.queryByText('dans vos critères')).toBeNull();
    expect(await screen.findByLabelText('Chargement de vos compteurs')).toBeInTheDocument();
  });
});
