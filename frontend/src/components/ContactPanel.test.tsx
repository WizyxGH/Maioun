/**
 * Ce que l'écran de contact DIT, et surtout ce qu'il ne laisse pas croire.
 *
 * Une source qui vend la mise en relation ne publie aucune coordonnée. Sans
 * un mot, l'écran affichait « ouvrez l'annonce d'origine pour utiliser le
 * canal prévu par le site » — exact à la lettre, trompeur en pratique : le
 * canal prévu est un péage.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ListingView } from '../types.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type { TenantProfile } from '@maioun/shared';
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

/** Un dossier complet : sans lui, aucun message n'est préparé, donc aucune action. */
const PROFIL = {
  firstName: 'Alex',
  lastName: 'Dupont',
  email: 'alex@example.invalid',
  phone: '06 00 00 00 12',
  situation: 'salarie',
  monthlyIncome: 2400,
  incomeBasis: 'net',
  guarantors: [],
} as unknown as TenantProfile;

function renderPanel(listing: ListingView, profile: unknown = null): void {
  render(
    <ContactPanel
      listing={listing}
      profile={profile as never}
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

describe('ContactPanel — fiche', () => {
  it('affiche la référence de l’agence quand elle est connue', () => {
    const listing = listingFrom('bienici');
    renderPanel({ ...listing, contact: { ...listing.contact, reference: 'LA2987' } });
    expect(screen.getByTestId('agency-reference')).toHaveTextContent('LA2987');
    expect(screen.getByText('Réf. agence')).toBeInTheDocument();
  });

  it('tait la ligne quand la référence manque', () => {
    const listing = listingFrom('bienici');
    renderPanel({ ...listing, contact: { ...listing.contact, reference: null } });
    expect(screen.queryByTestId('agency-reference')).not.toBeInTheDocument();
  });

  it('ne met plus de flèche vers la fiche de la source sur chaque ligne', () => {
    render(
      <ContactPanel
        listing={listingFrom('bienici')}
        profile={null}
        onRecorded={vi.fn()}
        onConfigureProfile={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /voir toutes les annonces/i })).toBeNull();
  });
});

/**
 * APPELER EST UNE DÉMARCHE. Le suivi ne connaissait que le brouillon : on
 * appelait, l'annonce restait « nouvelle », et le rappel « pas encore
 * candidaté » revenait le lendemain.
 */
describe('bouton Appeler', () => {
  const avecNumero = (tracking: ListingView['tracking']): ListingView => ({
    ...base,
    tracking,
    contact: { ...base.contact, phone: '0600000001' },
  });

  it('consigne la démarche au clic', () => {
    const onRecorded = vi.fn();
    render(
      <ContactPanel
        listing={avecNumero('new')}
        profile={null}
        onRecorded={onRecorded}
        onConfigureProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /Appeler/ }));
    expect(onRecorded).toHaveBeenCalledWith('phone', '');
  });

  it('écrire ouvre le courrier et consigne la démarche', () => {
    const onRecorded = vi.fn();
    render(
      <ContactPanel
        listing={{
          ...avecNumero('new'),
          contact: { ...base.contact, phone: null, email: 'agence@example.invalid' },
        }}
        profile={null}
        onRecorded={onRecorded}
        onConfigureProfile={vi.fn()}
      />,
    );
    const bouton = screen.getByRole('link', { name: /Écrire à/ });
    expect(bouton).toHaveAttribute('href', 'mailto:agence@example.invalid');
    fireEvent.click(bouton);
    expect(onRecorded).toHaveBeenCalledWith('email', '');
  });

  it('ne compte pas une relance à chaque clic', () => {
    const onRecorded = vi.fn();
    render(
      <ContactPanel
        listing={avecNumero('contacted')}
        profile={null}
        onRecorded={onRecorded}
        onConfigureProfile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: /Appeler/ }));
    expect(onRecorded).not.toHaveBeenCalled();
  });
});

describe('le courrier : l’adresse plutôt qu’un bouton', () => {
  /** L'annonce, avec une adresse d'agence et rien d'autre pour la joindre. */
  function parCourrier(): ListingView {
    return {
      ...base,
      contact: {
        ...base.contact,
        name: null,
        phone: null,
        formUrl: null,
        email: 'agence@example.invalid',
      },
    };
  }

  it('AFFICHE l’adresse, qui n’apparaissait nulle part', () => {
    renderPanel(parCourrier());
    expect(screen.getByTestId('agency-email')).toHaveTextContent('agence@example.invalid');
  });

  it('n’offre plus de bouton « Ouvrir l’e-mail »', () => {
    // `mailto:` ouvre un logiciel de courrier — souvent aucun, parfois le
    // mauvais — et le message préparé était alors perdu. Le dossier est
    // rempli : le message EST préparé, seul son bouton d'ouverture s'en va.
    renderPanel(parCourrier(), PROFIL);
    expect(screen.queryByTestId('contact-action')).toBeNull();
    expect(screen.queryByRole('link', { name: /Ouvrir l’e-mail/ })).toBeNull();
  });

  it('garde le bouton quand le canal mène QUELQUE PART', () => {
    // Le téléphone et le formulaire, eux, aboutissent.
    renderPanel(
      {
        ...base,
        contact: { ...base.contact, email: null, formUrl: null, phone: '06 00 00 00 12' },
      },
      PROFIL,
    );
    expect(screen.getByTestId('contact-action')).toBeInTheDocument();
  });
});

describe('le dossier vérifié remplace la liste des pièces', () => {
  const LIEN = 'https://www.dossierfacile.logement.gouv.fr/file/abc123';

  it('annonce le dossier au lieu de réclamer des dépôts', async () => {
    renderPanel(base, { ...PROFIL, dossierFacileUrl: LIEN });
    expect(await screen.findByText(/Dossier vérifié, joint au message/)).toBeInTheDocument();
    // Plus de compte « 0/5 prêtes » ni d'invitation à compléter : le dossier
    // est hébergé et contrôlé ailleurs.
    expect(screen.queryByText('Pièces pour candidater')).toBeNull();
    expect(screen.queryByText(/Compléter le dossier/)).toBeNull();
  });

  it('montre le lien tel qu’il partira', async () => {
    renderPanel(base, { ...PROFIL, dossierFacileUrl: LIEN });
    expect(await screen.findByRole('link', { name: LIEN })).toHaveAttribute('href', LIEN);
  });

  it('IGNORE une adresse qui n’est pas celle du service', () => {
    renderPanel(base, { ...PROFIL, dossierFacileUrl: 'https://exemple.invalid/dossier' });
    expect(screen.queryByText(/Dossier vérifié, joint au message/)).toBeNull();
  });
});
