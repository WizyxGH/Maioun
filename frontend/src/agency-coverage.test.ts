import { describe, expect, it } from 'vitest';
import { isFollowedAgency } from './agency-coverage.js';
import type { SourceInfo } from './sources.generated.js';

const table: Record<string, SourceInfo> = {
  bienici: { name: 'Bien’ici', domain: null, logo: null, paidContact: false, address: null },
  fnaim: { name: 'FNAIM', domain: null, logo: null, paidContact: false, address: null },
  carletta: {
    name: 'Carletta',
    domain: 'carletta.fr',
    logo: null,
    paidContact: false,
    address: null,
  },
};

describe('isFollowedAgency', () => {
  it('suivie dès qu’une de ses sources est son propre site', () => {
    expect(isFollowedAgency(['bienici', 'carletta'], table)).toBe(true);
  });

  it('non suivie quand elle n’apparaît que sur des portails', () => {
    expect(isFollowedAgency(['bienici', 'fnaim'], table)).toBe(false);
  });

  it('une source inconnue du tableau ne vaut pas suivi', () => {
    expect(isFollowedAgency(['disparue'], table)).toBe(false);
  });
});
