/**
 * ON NE PROPOSAIT LE DOSSIER VÉRIFIÉ QU'À QUI LE CONNAISSAIT DÉJÀ.
 *
 * L'adresse du service n'apparaissait que dans un message d'ERREUR, quand on
 * collait un lien de travers. Qui ne connaissait pas DossierFacile voyait, au
 * moment de candidater, une liste de pièces à déposer ici — la voie longue,
 * pour un dossier que le bailleur devra vérifier lui-même.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DOSSIER_FACILE_HOME } from '@maioun/shared';
import { DossierFacileOffer } from './DossierFacileOffer.js';

describe('la proposition DossierFacile', () => {
  it('mène au service officiel, et à lui seul', () => {
    render(<DossierFacileOffer />);
    const lien = screen.getByRole('link', { name: /Créer mon dossier/ });
    expect(lien).toHaveAttribute('href', DOSSIER_FACILE_HOME);
    // Un lien qui s'ouvre ailleurs ne doit pas donner la main sur notre onglet.
    expect(lien).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('dit que c’est gratuit et public — c’est ce qui décide', () => {
    render(<DossierFacileOffer />);
    expect(screen.getByText(/gratuit de l’État/)).toBeInTheDocument();
  });

  /** §26 : on ne garde jamais les pièces, et on le dit plutôt que de le taire. */
  it('dit où restent les pièces', () => {
    render(<DossierFacileOffer />);
    expect(screen.getByText(/restent chez eux, pas chez nous/)).toBeInTheDocument();
  });
});
