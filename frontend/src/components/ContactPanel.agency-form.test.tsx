/**
 * Envoi par le formulaire de l'agence : rien ne part avant « Envoyer », et la
 * confirmation montre ce qui sera transmis.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TenantProfile } from '@maioun/shared';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type * as Client from '../api/client.js';

const submit = vi.hoisted(() => vi.fn());

vi.mock('../api/client.js', async (original) => ({
  ...(await original<typeof Client>()),
  canStoreDocuments: () => false,
  agencyFormAvailable: (sourceId: string | undefined) => sourceId === 'orpi',
  submitAgencyForm: submit,
}));

const { ContactPanel } = await import('./ContactPanel.js');

const PROFILE = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'contact@example.invalid',
  phone: '06 00 00 00 12',
  situation: 'cdi',
  monthlyIncome: 2400,
  guarantors: [],
  moveInDate: 'asap',
} as TenantProfile;

const base = MOCK_LISTINGS[0]!;

function listingFrom(sourceId: string): ListingView {
  return {
    ...base,
    contact: { ...base.contact, agencyName: 'Agence Exemple' },
    occurrences: [
      { ...base.occurrences[0]!, sourceId, sourceUrl: 'https://www.orpi.com/annonce-x/' },
    ],
  };
}

const PREVIEW = {
  status: 'preview',
  preview: {
    sourceName: 'Orpi',
    host: 'www.orpi.com',
    consents: [
      {
        name: 'f[allowOrpiMailing]',
        label: 'J’accepte de recevoir de la prospection commerciale : Par e-mail et SMS',
        required: false,
        ticked: false,
      },
    ],
  },
};

function renderPanel(listing: ListingView, onRecorded = vi.fn()): typeof onRecorded {
  render(
    <ContactPanel
      listing={listing}
      profile={PROFILE}
      onRecorded={onRecorded}
      onConfigureProfile={vi.fn()}
    />,
  );
  return onRecorded;
}

beforeEach(() => {
  submit.mockReset();
});

describe('envoi via le formulaire de l’agence', () => {
  it('n’apparaît pas pour une source non prise en charge', () => {
    renderPanel(listingFrom('partners-immo'));
    expect(screen.queryByRole('button', { name: /formulaire de l’agence/ })).toBeNull();
  });

  it('montre ce qui sera envoyé, et n’envoie rien avant « Envoyer »', async () => {
    submit.mockResolvedValueOnce(PREVIEW);
    const onRecorded = renderPanel(listingFrom('orpi'));

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer via le formulaire de l’agence' }));
    const dialog = await screen.findByRole('dialog');

    // L'aperçu est demandé SANS confirmation.
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ confirm: false });

    expect(within(dialog).getByText(/Agence Exemple — www\.orpi\.com/)).toBeTruthy();
    expect(within(dialog).getByText('Alex')).toBeTruthy();
    expect(within(dialog).getByText('Dupont')).toBeTruthy();
    expect(within(dialog).getByText('contact@example.invalid')).toBeTruthy();
    expect(within(dialog).getByText('06 00 00 00 12')).toBeTruthy();
    expect(within(dialog).getByTestId('agency-form-message').textContent).not.toBe('');
    const consents = within(dialog).getByTestId('agency-form-consents');
    expect(consents.textContent).toContain('Non cochée');
    expect(consents.textContent).toContain('prospection commerciale');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('envoie sur « Envoyer », consigne le contact, et le dit', async () => {
    submit.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce({
      status: 'sent',
      message: 'Orpi a accepté le message.',
    });
    const onRecorded = renderPanel(listingFrom('orpi'));

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer via le formulaire de l’agence' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[1]?.[0]).toMatchObject({ confirm: true, acceptedConsents: [] });
    expect(onRecorded.mock.calls[0]?.[0]).toBe('form');
    expect(screen.getByTestId('agency-form-result').textContent).toContain('Message envoyé');
  });

  it('dit l’échec sans consigner, et laisse le recours au formulaire du site', async () => {
    submit.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce({
      status: 'rejected',
      message: 'Orpi a refusé le message.',
      errors: ['Ce champ est requis.'],
    });
    const onRecorded = renderPanel(listingFrom('orpi'));

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer via le formulaire de l’agence' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Envoyer' }),
    );

    const result = await screen.findByText(/Échec/);
    expect(result.textContent).toContain('Ce champ est requis.');
    expect(onRecorded).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copier' })).toBeTruthy();
  });
});
