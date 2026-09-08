/**
 * La règle qui compte n'est pas « afficher un logo » mais « ne pas en afficher
 * un FAUX ». Un logo faux, on le croit ; une icône neutre n'induit personne en
 * erreur (§17).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgencyLogo, agencyLogoUrl, sameAgency } from './AgencyLogo.js';

describe('agencyLogoUrl', () => {
  it('rend le favicon d’une agence qu’on collecte directement', () => {
    expect(agencyLogoUrl(['climmo'], 'CL IMMO')).toBe('https://climmo.com/favicon.ico');
  });

  /**
   * NEUF AGENCES SUR TRENTE-SEPT NE SERVENT RIEN à `/favicon.ico`. On pointait
   * donc une image inexistante, et l'écran retombait sur l'icône neutre alors
   * que leur logo est public — à l'adresse que leur site déclare lui-même.
   */
  it('préfère l’adresse que le site déclare, quand /favicon.ico n’existe pas', () => {
    expect(agencyLogoUrl(['winter'], 'Winter Immobilier')).toBe(
      'https://www.agence-winter.com/favicons/favicon.ico',
    );
    expect(agencyLogoUrl(['giletta'], 'Giletta Immobilier')).toBe(
      'https://www.giletta-properties.com/images/favicon.png',
    );
  });

  it('ne rend rien pour un portail', () => {
    // fnaim et studapart sont des portails : leur domaine n'est celui d'aucune
    // des agences qui y publient.
    expect(agencyLogoUrl(['fnaim'], 'CL IMMO')).toBeNull();
    expect(agencyLogoUrl(['studapart'], 'CL IMMO')).toBeNull();
  });

  it('retient le site propre quand une agence vient de deux sources', () => {
    expect(agencyLogoUrl(['fnaim', 'climmo'], 'CL Immo')).toBe('https://climmo.com/favicon.ico');
  });

  /**
   * LE DÉFAUT QUI DONNAIT DE FAUX LOGOS. Le site d'une agence locale publie
   * parfois un bien dont le contact est une AUTRE agence : celle-ci retenait
   * alors le premier domaine venu, donc le logo de la première.
   */
  it('n’attribue pas le logo d’une source à une agence qui n’est pas elle', () => {
    expect(agencyLogoUrl(['climmo'], 'CABINET MARTIN')).toBeNull();
  });

  it('ne rend rien pour une source inconnue', () => {
    expect(agencyLogoUrl(['source-qui-nexiste-pas'], 'Une agence')).toBeNull();
  });
});

describe('sameAgency', () => {
  it('ignore casse, accents, ponctuation et mentions légales', () => {
    expect(sameAgency('Centragence', 'CENTRAGENCE SARL')).toBe(true);
    expect(sameAgency('I.C.I Info Conseil Immobilier', 'ICI INFO CONSEIL IMMOBILIER')).toBe(true);
  });

  /**
   * Une inclusion trop courte ne prouve rien : « immo » se retrouve dans la
   * moitié des noms d'agences de France.
   */
  it('refuse une correspondance trop courte pour signifier quelque chose', () => {
    expect(sameAgency('Immo 3000', 'IMMO')).toBe(false);
    expect(sameAgency('Immo JBF', 'IMMO')).toBe(false);
  });

  it('sépare deux agences distinctes', () => {
    expect(sameAgency('Palais Immobilier', 'Acropolis Immo')).toBe(false);
  });
});

describe('AgencyLogo', () => {
  it('affiche l’image du site de l’agence', () => {
    render(<AgencyLogo sources={['climmo']} name="CL Immo" />);
    expect(screen.getByTitle('CL Immo')).toHaveAttribute('src', 'https://climmo.com/favicon.ico');
  });

  it('retombe sur l’icône neutre sans site connu', () => {
    const { container } = render(<AgencyLogo sources={['fnaim']} name="Une agence" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
