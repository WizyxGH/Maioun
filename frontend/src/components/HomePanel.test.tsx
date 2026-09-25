/** La tuile « dans vos critères » affiche le total de la recherche où elle mène. */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePanel } from './HomePanel.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type { ListingView } from '../types.js';

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
      onOpenExchanges={noop}
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

/**
 * LES NOUVEAUTÉS EN CARTES, QU'ON FAIT DÉFILER.
 *
 * La section n'offrait que des lignes compactes, et une carte morte — « rien de
 * neuf » — quand il n'y avait rien : le haut de l'accueil n'apprenait alors
 * rien du tout.
 */
describe('carrousel des nouveautés', () => {
  const MAINTENANT = Date.parse('2026-09-25T12:00:00Z');
  const socle = MOCK_LISTINGS[0]!;

  const annonce = (id: string, champs: Partial<ListingView>): ListingView => ({
    ...socle,
    id,
    lifecycle: 'active',
    rented: false,
    archived: false,
    matchesCriteria: true,
    ...champs,
  });

  it('montre les nouveautés depuis le dernier passage', () => {
    render(
      <Accueil
        searchCount={3}
        nowMs={MAINTENANT}
        seenAtMs={MAINTENANT - 60 * 60 * 1000}
        listings={[annonce('a1', { firstSeenAt: '2026-09-25T11:30:00Z' })]}
      />,
    );
    expect(
      screen.getByRole('list', { name: 'Nouveautés depuis votre dernier passage' }),
    ).toBeInTheDocument();
  });

  // LE REPLI, ET SON ÉTIQUETTE. Montrer d'anciennes annonces sous le titre
  // « Nouveautés » ferait appeler une agence pour un bien vu il y a trois
  // semaines : le contenu change, le libellé aussi.
  it('à défaut, montre les dernières annonces dans les critères, en le disant', () => {
    render(
      <Accueil
        searchCount={3}
        nowMs={MAINTENANT}
        seenAtMs={MAINTENANT}
        listings={[annonce('a1', { firstSeenAt: '2026-09-01T09:00:00Z' })]}
      />,
    );
    expect(
      screen.getByRole('list', { name: 'Dernières annonces dans vos critères' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/dernières annonces dans vos critères/i)).toBeInTheDocument();
  });

  it('ne met dans ce repli que ce qui EST dans les critères', () => {
    render(
      <Accueil
        searchCount={0}
        nowMs={MAINTENANT}
        seenAtMs={MAINTENANT}
        listings={[
          annonce('hors', { firstSeenAt: '2026-09-01T09:00:00Z', matchesCriteria: false }),
        ]}
      />,
    );
    expect(screen.queryByRole('list', { name: /dernières annonces/i })).toBeNull();
  });

  it('garde un mot quand il n’y a vraiment rien à montrer', () => {
    render(<Accueil searchCount={0} nowMs={MAINTENANT} seenAtMs={MAINTENANT} listings={[]} />);
    expect(screen.getByText(/aucune annonce dans vos critères/i)).toBeInTheDocument();
  });
});
