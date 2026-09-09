/**
 * Ce que l'écran de contact DIT, et surtout ce qu'il ne laisse pas croire.
 *
 * Une source qui vend la mise en relation ne publie aucune coordonnée. Sans
 * un mot, l'écran affichait « ouvrez l'annonce d'origine pour utiliser le
 * canal prévu par le site » — exact à la lettre, trompeur en pratique : le
 * canal prévu est un péage.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import { ContactPanel } from './ContactPanel.js';

const base = MOCK_LISTINGS[0]!;

/** La même annonce, rattachée à une source donnée et sans coordonnée publiée. */
function listingFrom(sourceId: string): ListingView {
  return {
    ...base,
    contact: {
      ...base.contact,
      name: null,
      agencyName: null,
      phone: null,
      email: null,
      formUrl: null,
      providedBy: [],
    },
    occurrences: [{ ...base.occurrences[0]!, sourceId }],
  };
}

function renderPanel(listing: ListingView): void {
  render(
    <ContactPanel
      listing={listing}
      profile={null}
      onRecorded={vi.fn()}
      onConfigureProfile={vi.fn()}
    />,
  );
}

describe('ContactPanel — sources qui facturent la mise en relation', () => {
  it('prévient AVANT le clic quand la source vend le contact', () => {
    renderPanel(listingFrom('locservice'));
    const note = screen.getByTestId('paid-contact-note');
    expect(note).toHaveTextContent('LocService');
    expect(note).toHaveTextContent('facture la mise en relation');
  });

  it('remplace le message générique plutôt que de s’y ajouter', () => {
    // Ici l'absence de coordonnées n'est pas un manque de la source : c'est
    // son modèle. Les deux phrases côte à côte se contrediraient à moitié.
    renderPanel(listingFrom('locservice'));
    expect(screen.queryByText(/Aucune coordonnée n’est publiée/)).not.toBeInTheDocument();
  });

  it('ne dit rien pour une source qui ne facture pas', () => {
    renderPanel(listingFrom('bienici'));
    expect(screen.queryByTestId('paid-contact-note')).not.toBeInTheDocument();
    // Le message générique, lui, reprend sa place.
    expect(screen.getByText(/Aucune coordonnée n’est publiée/)).toBeInTheDocument();
  });
});
