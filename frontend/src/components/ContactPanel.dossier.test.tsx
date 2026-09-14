/**
 * Avant de candidater : les pièces nécessaires, et les champs du formulaire.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TenantProfile } from '@maioun/shared';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';

const documents = vi.hoisted(() => ({ list: [] as { name: string; size: number }[] }));

vi.mock('../api/client.js', async (original) => ({
  ...(await original<typeof import('../api/client.js')>()),
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

describe('champs du formulaire à copier', () => {
  it('copie chaque valeur du profil d’un geste', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: /Copier e-mail/ }));
    expect(writeText).toHaveBeenCalledWith('alex@example.invalid');
    expect(await screen.findByText('E-mail copié')).toBeInTheDocument();
  });

  it('ne s’affiche pas quand l’annonce a un e-mail ou un téléphone', async () => {
    renderPanel({
      ...FORM_ONLY,
      contact: { ...FORM_ONLY.contact, email: 'agence@example.invalid' },
    });
    await screen.findByLabelText('Message préparé');
    expect(screen.queryByText('Pour remplir le formulaire')).not.toBeInTheDocument();
  });
});
