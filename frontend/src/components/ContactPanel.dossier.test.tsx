/**
 * Avant de candidater : les pièces nécessaires.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TenantProfile } from '@maioun/shared';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type * as Client from '../api/client.js';

const documents = vi.hoisted(() => ({ list: [] as { name: string; size: number }[] }));

vi.mock('../api/client.js', async (original) => ({
  ...(await original<typeof Client>()),
  canStoreDocuments: () => true,
  fetchDocuments: () => Promise.resolve(documents.list),
}));

const { ContactPanel } = await import('./ContactPanel.js');

const PROFILE: TenantProfile = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'alex@example.invalid',
  phone: '0600000000',
  situation: 'cdi',
  monthlyIncome: 2400,
  guarantors: [{ kind: 'visale' }],
  moveInDate: 'asap',
} as TenantProfile;

/** Une annonce dont le seul canal est le formulaire du site. */
const FORM_ONLY: ListingView = {
  ...MOCK_LISTINGS[0]!,
  contact: {
    ...MOCK_LISTINGS[0]!.contact,
    phone: null,
    email: null,
    formUrl: 'https://agence.example.invalid/annonce/1',
  },
};

function renderPanel(listing: ListingView = FORM_ONLY): void {
  render(
    <ContactPanel
      listing={listing}
      profile={PROFILE}
      onRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

beforeEach(() => {
  documents.list = [];
});

describe('pièces pour candidater', () => {
  it('liste les pièces du dossier selon la garantie, et dit lesquelles manquent', async () => {
    documents.list = [
      { name: 'identite__carte.jpg', size: 10 },
      { name: 'ressources__bulletins.pdf', size: 10 },
    ];
    renderPanel();

    const section = await screen.findByRole('region', { name: 'Pièces pour candidater' });
    // Locataire (4 pièces) + Visale (1) : 2 fournies sur 5.
    expect(within(section).getByText('2/5 prêtes')).toBeInTheDocument();
    expect(within(section).getAllByText('à déposer')).toHaveLength(3);
    expect(within(section).getByText('Visa Visale')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Compléter le dossier' })).toBeInTheDocument();
  });

  it('ne propose plus de compléter quand tout est là', async () => {
    documents.list = ['identite', 'domicile', 'situation', 'ressources', 'garant-visale'].map(
      (slot) => ({ name: `${slot}__piece.pdf`, size: 10 }),
    );
    renderPanel();

    const section = await screen.findByRole('region', { name: 'Pièces pour candidater' });
    expect(within(section).getByText('5/5 prêtes')).toBeInTheDocument();
    expect(within(section).queryByRole('link')).not.toBeInTheDocument();
  });
});

/**
 * LA PROPOSITION APPARAÎT LÀ OÙ L'ON DÉCIDE — et disparaît quand elle n'a plus
 * d'objet : proposer un dossier vérifié à qui en a déjà un serait du bruit.
 */
describe('la proposition DossierFacile sur l’écran de candidature', () => {
  it('se propose quand aucun dossier vérifié n’est enregistré', async () => {
    renderPanel();
    expect(await screen.findByText(/Pas encore de dossier vérifié/)).toBeInTheDocument();
  });

  it('ne se propose plus quand le dossier est là', async () => {
    render(
      <ContactPanel
        listing={FORM_ONLY}
        profile={{
          ...PROFILE,
          dossierFacileUrl: 'https://www.dossierfacile.logement.gouv.fr/file/abc',
        }}
        onRecorded={vi.fn()}
        onConfigureProfile={vi.fn()}
      />,
    );
    expect(await screen.findByText(/Dossier vérifié, joint au message/)).toBeInTheDocument();
    expect(screen.queryByText(/Pas encore de dossier vérifié/)).not.toBeInTheDocument();
  });
});
