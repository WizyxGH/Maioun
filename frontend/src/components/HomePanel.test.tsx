/** La tuile « dans vos critères » annonce le compte des critères DU COMPTE. */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePanel } from './HomePanel.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type { ListingView } from '../types.js';

const noop = (): void => undefined;

/** Une fiche dont seul le caractère « dans les critères » est réglé. */
function annonceCritere(id: string, matchesCriteria: boolean): ListingView {
  return {
    ...MOCK_LISTINGS[0]!,
    id,
    matchesCriteria,
    lifecycle: 'active',
    rented: false,
    archived: false,
  };
}

/** L'accueil avec le strict nécessaire : chaque test ne règle que ce qu'il éprouve. */
function Accueil(
  props: Partial<React.ComponentProps<typeof HomePanel>> & { readonly criteriaCount: number },
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
  it('annonce le compte des critères du COMPTE', async () => {
    render(<Accueil criteriaCount={76} />);
    // LE NOM ACCESSIBLE PORTE LA VALEUR FINALE, tout de suite : le chiffre
    // visible, lui, monte jusqu'à elle.
    const tile = screen.getByRole('button', { name: '76 dans vos critères' });
    await waitFor(() => expect(tile.textContent).toContain('76'));
  });

  it('ne suit PAS les filtres d’affichage du navigateur', async () => {
    // Un poste et un téléphone n'ont pas les mêmes filtres conservés : la
    // tuile annonçait 98 d'un côté et 115 de l'autre, pour le même compte. Elle
    // ne doit dépendre QUE de ce que l'appelant compte sur les critères.
    render(
      <Accueil
        criteriaCount={2}
        listings={[
          annonceCritere('a1', true),
          annonceCritere('a2', false),
          annonceCritere('a3', true),
        ]}
      />,
    );
    expect(await screen.findByRole('button', { name: '2 dans vos critères' })).toBeInTheDocument();
  });

  it('ne montre AUCUN chiffre tant que la liste n’est pas arrivée', async () => {
    // « 0 dans vos critères » le temps du chargement, c'est un chiffre faux
    // présenté comme les vrais, suivi d'un saut.
    render(<Accueil criteriaCount={76} loading listings={[]} />);
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
        criteriaCount={3}
        nowMs={MAINTENANT}
        seenAtMs={MAINTENANT - 60 * 60 * 1000}
        listings={[annonce('a1', { firstSeenAt: '2026-09-25T11:30:00Z' })]}
      />,
    );
    expect(
      screen.getByRole('list', { name: 'Nouveautés depuis votre dernier passage' }),
    ).toBeInTheDocument();
  });

  it('affiche un message indiquant qu’il n’y a pas eu de nouveauté depuis la dernière visite', () => {
    render(
      <Accueil
        criteriaCount={3}
        nowMs={MAINTENANT}
        seenAtMs={MAINTENANT - 2 * 60 * 60 * 1000}
        listings={[annonce('a1', { firstSeenAt: '2026-09-01T09:00:00Z' })]}
      />,
    );
    expect(screen.getByText('Nouveautés')).toBeInTheDocument();
    expect(
      screen.getByText(/Aucune nouveauté depuis votre dernière visite \(il y a 2 h\)/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /Nouveautés/i })).toBeNull();
  });
});

/**
 * UNE SEULE RECHERCHE : LE COMPTE VIENT DU SERVEUR.
 *
 * La tuile ne doit plus dépendre des filtres d'affichage — c'est ce qui la
 * faisait dire 180 à l'accueil et 78 à la recherche pour les mêmes annonces,
 * selon l'appareil.
 */
describe('la tuile des critères', () => {
  /**
   * LE SIGNE « + » DIT QUE LE CHIFFRE EST UN PLANCHER, SANS PARLER DE PLAFOND.
   *
   * Une recherche enregistrée qui dépasse ce que le serveur renvoie est
   * tronquée : le compte s'arrête là où nos identifiants s'arrêtent. « 500+ »
   * le dit. L'ancienne formulation — « au moins — une recherche dépasse le
   * plafond » — expliquait un mécanisme que personne ne voit, et supposait
   * qu'on sache pourquoi le chiffre était faux, ce qu'on ne sait pas toujours :
   * un refus réseau produit le même signal qu'un dépassement.
   */
  it('ajoute « + » quand le compte est un plancher', async () => {
    render(<Accueil criteriaCount={500} criteriaCountApproximatif />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '500+ dans vos critères' })).toBeDefined(),
    );
    // Le signe est VISIBLE, pas seulement dans le nom accessible.
    expect(screen.getByRole('button', { name: '500+ dans vos critères' }).textContent).toContain(
      '+',
    );
  });

  it('ne signe pas un compte exact', async () => {
    render(<Accueil criteriaCount={42} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '42 dans vos critères' })).toBeDefined(),
    );
    expect(screen.queryByRole('button', { name: /\+/ })).toBeNull();
  });
});
