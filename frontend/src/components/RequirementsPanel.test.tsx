/**
 * La garantie loyers impayés, dite avant le clic.
 *
 * Elle n'est pas un refus mais une EXIGENCE : c'est l'assureur qui fixe alors
 * les critères, et un garant n'y remplace pas les revenus du locataire. Le
 * panneau dit ce que l'annonce écrit, et rien de plus.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { NO_REQUIREMENTS, type TenancyRequirements, type TenantProfile } from '@maioun/shared';
import { RequirementsPanel } from './RequirementsPanel.js';

const base = MOCK_LISTINGS[0]!;

const PROFILE: TenantProfile = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.invalid',
  phone: '06 00 00 00 02',
  situation: 'cdi',
  monthlyIncome: 1400,
  incomeKind: 'net',
  guarantors: [{ kind: 'visale' }],
  moveInDate: null,
};

function show(requirements: Partial<TenancyRequirements>, profile: TenantProfile | null): void {
  const listing: ListingView = {
    ...base,
    price: { ...base.price, value: 900 },
    requirements: { ...NO_REQUIREMENTS, ...requirements },
  };
  render(<RequirementsPanel listing={listing} profile={profile} />);
}

describe('assurance loyers impayés', () => {
  it('convertit le multiple du loyer en euros, sans le faire passer pour exact', () => {
    show({ insuredRent: true, incomeMultiplier: 3 }, null);
    expect(screen.getByText('3 × le loyer, soit environ 2700 € net / mois')).toBeInTheDocument();
  });

  it('dit qu’un garant ne remplace pas les revenus du locataire', () => {
    show({ insuredRent: true }, null);
    expect(screen.getByText(/un garant ne remplace pas vos revenus/)).toBeInTheDocument();
  });

  it('n’en parle pas quand l’annonce n’en parle pas', () => {
    show({ minIncome: 1200 }, null);
    expect(screen.queryByText(/un garant ne remplace pas/)).not.toBeInTheDocument();
  });

  it('confronte le multiple au dossier', () => {
    show({ insuredRent: true, incomeMultiplier: 3 }, PROFILE);
    expect(screen.getByText(/2700 € exigés, 1400 € déclarés/)).toBeInTheDocument();
  });
});

describe('garanties refusées', () => {
  it('les nomme, et dit que le dossier ne tient plus', () => {
    show({ insuredRent: true, refusedGuarantees: ['visale', 'physical'] }, PROFILE);
    expect(screen.getByText('Garanties refusées')).toBeInTheDocument();
    expect(screen.getByText('Visale, garant physique')).toBeInTheDocument();
    expect(screen.getByText(/l’annonce refuse Visale/)).toBeInTheDocument();
  });

  it('ne compte pas une garantie refusée parmi les garanties acceptées', () => {
    show({ insuredRent: true, refusedGuarantees: ['visale'] }, null);
    expect(screen.queryByText('Garanties')).not.toBeInTheDocument();
  });
});
