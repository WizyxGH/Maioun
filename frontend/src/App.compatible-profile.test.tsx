import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MOCK_LISTINGS } from './api/mock-data.js';
import type { TenantProfile } from '@maioun/shared';
import type * as ApiClient from './api/client.js';

const INCOMPATIBLE_PROFILE: TenantProfile = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  phone: '06 00 00 00 00',
  situation: 'cdd',
  monthlyIncome: 1200,
  incomeKind: 'net',
  guarantors: [],
  moveInDate: null,
};

const mockListingsWithRequirements = [
  {
    ...MOCK_LISTINGS[0]!,
    id: 'listing-gli-expensive',
    title: { ...MOCK_LISTINGS[0]!.title, value: 'Studio sous GLI cher' },
    price: { ...MOCK_LISTINGS[0]!.price, value: 600 },
    actionPriority: 90,
    matchesCriteria: true,
    requirements: {
      minIncome: null,
      incomeMultiplier: 3,
      insuredRent: true,
      guarantees: [],
      refusedGuarantees: [],
      situations: ['cdi' as const],
    },
  },
  {
    ...MOCK_LISTINGS[1]!,
    id: 'listing-accessible',
    title: { ...MOCK_LISTINGS[1]!.title, value: 'Studio accessible sans condition' },
    price: { ...MOCK_LISTINGS[1]!.price, value: 450 },
    actionPriority: 60,
    matchesCriteria: true,
    requirements: undefined,
  },
];

vi.mock('./api/client.js', async (original) => {
  const actual = await original<typeof ApiClient>();
  return {
    ...actual,
    fetchListings: () =>
      Promise.resolve({
        listings: mockListingsWithRequirements,
        total: mockListingsWithRequirements.length,
      }),
  };
});

const { App } = await import('./App.js');

describe('Profil locataire et influence sur le scoring et le filtrage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('abaisse la priorité d’action d’une annonce incompatible avec le profil', async () => {
    localStorage.setItem('maioun.tenantProfile', JSON.stringify(INCOMPATIBLE_PROFILE));
    render(<App />);

    const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
    await userEvent.click(tabs[0]!);

    // L'annonce dont la priorité de base était 90 est abaissée à 35 en raison des conditions non remplies
    await waitFor(() => {
      expect(screen.getByText('35')).toBeInTheDocument();
    });
  });

  it('permet de filtrer les annonces incompatibles avec le profil via la bascule', async () => {
    localStorage.setItem('maioun.tenantProfile', JSON.stringify(INCOMPATIBLE_PROFILE));
    render(<App />);

    const tabs = await screen.findAllByRole('button', { name: 'Recherche' });
    await userEvent.click(tabs[0]!);

    // Avant le filtre, les 2 annonces sont présentes (600 € et 450 €)
    await waitFor(() => {
      expect(screen.getByText(/600\s*€/)).toBeInTheDocument();
      expect(screen.getByText(/450\s*€/)).toBeInTheDocument();
    });

    // Ouvrir la modale Filtres
    const filtersBtn = screen.getByRole('button', { name: /Filtres/i });
    await userEvent.click(filtersBtn);

    // Déplier le MultiSelect Affichage
    const displaySelect = screen.getByRole('button', { name: /Afficher/i });
    await userEvent.click(displaySelect);

    // Activer l'option 'Profil compatible uniquement'
    const toggleOption = screen.getByLabelText(/Profil compatible uniquement/i);
    await userEvent.click(toggleOption);

    // Fermer la modale
    const closeBtn = screen.getByRole('button', { name: /Voir les|Fermer/i });
    await userEvent.click(closeBtn);

    // L'annonce incompatible (600 €) doit avoir été filtrée
    await waitFor(() => {
      expect(screen.queryByText(/600\s*€/)).not.toBeInTheDocument();
      expect(screen.getByText(/450\s*€/)).toBeInTheDocument();
    });

    // La puce 'Profil compatible uniquement' est affichée et retirable
    const chip = screen.getByRole('button', { name: /Retirer.*Profil compatible/i });
    expect(chip).toBeInTheDocument();

    await userEvent.click(chip);

    // L'annonce incompatible (600 €) réapparaît
    await waitFor(() => {
      expect(screen.getByText(/600\s*€/)).toBeInTheDocument();
    });
  });
});
