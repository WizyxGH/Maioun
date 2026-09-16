/**
 * Le repère de la carte : ce que le dossier doit savoir AVANT le clic.
 *
 * La garantie loyers impayés n'est pas une alerte — elle se dit d'un badge
 * neutre. Ce qui coince vraiment, lui, s'affiche en avertissement.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { NO_REQUIREMENTS, type TenancyRequirements, type TenantProfile } from '@maioun/shared';
import { ListingCard } from './ListingCard.js';

const base = MOCK_LISTINGS[0]!;

const PROFILE: TenantProfile = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.invalid',
  phone: '06 00 00 00 03',
  situation: 'cdi',
  monthlyIncome: 1400,
  incomeKind: 'net',
  guarantors: [{ kind: 'visale' }],
  moveInDate: null,
};

function show(
  requirements: Partial<TenancyRequirements>,
  profile: TenantProfile | null | undefined,
): void {
  const listing: ListingView = {
    ...base,
    price: { ...base.price, value: 900 },
    requirements: { ...NO_REQUIREMENTS, ...requirements },
  };
  render(
    <ListingCard
      listing={listing}
      nowMs={Date.parse('2026-09-16T12:00:00Z')}
      onOpen={vi.fn()}
      profile={profile}
    />,
  );
}

describe('badge de conditions', () => {
  it('signale l’assurance loyers impayés sans profil, et sans alarme', () => {
    show({ insuredRent: true }, null);
    expect(screen.getByText('Garantie loyers impayés')).toBeInTheDocument();
  });

  it('dit « Revenu exigé » quand le multiple du loyer écarte le dossier', () => {
    // 3 × 900 = 2 700 € exigés, 1 400 € déclarés.
    show({ insuredRent: true, incomeMultiplier: 3 }, PROFILE);
    expect(screen.getByText('Revenu exigé')).toBeInTheDocument();
    // Un seul repère : le badge neutre s'efface devant ce qui coince.
    expect(screen.queryByText('Garantie loyers impayés')).not.toBeInTheDocument();
  });

  it('dit « Garantie refusée » quand le dossier ne tient que par elle', () => {
    show({ insuredRent: true, refusedGuarantees: ['visale'] }, { ...PROFILE, monthlyIncome: 4000 });
    expect(screen.getByText('Garantie refusée')).toBeInTheDocument();
  });

  it('ne marque rien quand l’annonce n’énonce aucune condition', () => {
    show({}, PROFILE);
    expect(screen.queryByText(/Garantie loyers impayés|Revenu exigé|Garantie refusée/)).toBeNull();
  });
});
