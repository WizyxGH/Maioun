/**
 * La règle qui compte n'est pas « afficher un logo » mais « ne pas en afficher
 * un FAUX ». Un logo faux, on le croit ; une icône neutre n'induit personne en
 * erreur.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgencyLogo, agencyAddress, agencyLogoUrl, sourceLogoUrl } from './AgencyLogo.js';

describe('agencyLogoUrl', () => {
  it('rend le favicon d’une agence qu’on collecte directement', () => {
    expect(agencyLogoUrl('CL IMMO')).toBe('https://climmo.com/favicon.ico');
  });

  /**
   * QUARANTE-NEUF AGENCES SUR CENT QUATRE-VINGT-NEUF NE SERVENT RIEN à
   * `/favicon.ico`. On pointait une image inexistante, et l'écran retombait sur
   * l'icône neutre alors que leur logo est public — à l'adresse que leur site
   * déclare lui-même.
   */
  it('préfère l’adresse que le site déclare, quand /favicon.ico n’existe pas', () => {
    expect(agencyLogoUrl('Winter Immobilier')).toBe(
      'https://www.agence-winter.com/favicons/favicon.ico',
    );
    expect(agencyLogoUrl('Giletta Immobilier')).toBe(
      'https://www.giletta-properties.com/images/favicon.png',
    );
  });

  it('ne rend rien pour un nom qui désigne un portail', () => {
    // Le domaine d'un portail n'est celui d'aucune des agences qui y publient.
    expect(agencyLogoUrl('FNAIM')).toBeNull();
    expect(agencyLogoUrl('Studapart')).toBeNull();
  });

  /**
   * LE LOGO NE DÉPEND PLUS DU CHEMIN QU'A PRIS L'ANNONCE. On le cherchait parmi
   * les seules sources ayant publié cette annonce-là : une agence que nous
   * collectons, mais dont l'annonce n'était arrivée que par un portail, restait
   * sous l'icône neutre. Cent huit graphies gagnent un logo ainsi.
   */
  it('reconnaît l’agence même si l’annonce n’est venue que d’un portail', () => {
    expect(agencyLogoUrl('L’ADRESSE C.E.C.GORBELLA')).not.toBeNull();
  });

  it('n’attribue pas le logo d’une source à une agence qui n’est pas elle', () => {
    expect(agencyLogoUrl('CABINET MARTIN')).toBeNull();
  });

  it('ne rend rien pour un nom qui ne désigne personne', () => {
    expect(agencyLogoUrl('Agence Immobilière')).toBeNull();
  });
});

describe('AgencyLogo', () => {
  it('affiche l’image du site de l’agence', () => {
    render(<AgencyLogo name="CL Immo" />);
    expect(screen.getByTitle('CL Immo')).toHaveAttribute('src', 'https://climmo.com/favicon.ico');
  });

  it('retombe sur l’icône neutre sans site connu', () => {
    const { container } = render(<AgencyLogo name="Une agence inconnue au bataillon" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('agencyAddress', () => {
  it('rend l’adresse de vitrine de l’agence qu’on collecte directement', () => {
    expect(agencyAddress('Aurus Immobilier')).toBe(
      '14 rue du Maréchal Joffre, 06310 Beaulieu-sur-Mer',
    );
  });

  it('ne la prête ni à une autre agence ni à un réseau', () => {
    expect(agencyAddress('Orpi Riviera')).toBeNull();
    expect(agencyAddress('Orpi')).toBeNull();
  });
});

/**
 * La carte d'annonce tient la source par son IDENTIFIANT : elle n'a pas à
 * repasser par le rapprochement de noms, qui se tait dès qu'un nom est disputé.
 */
describe('sourceLogoUrl', () => {
  it('rend le logo d’une agence désignée par son identifiant de source', () => {
    expect(sourceLogoUrl('tichadou')).toBe('https://tichadou.fr/favicon.ico');
  });

  /**
   * LE PORTAIL A DROIT À SA PROPRE MARQUE, ici : l'écran nomme LA SOURCE, et
   * Studapart sur une annonce Studapart n'usurpe l'identité de personne. Ce
   * qu'un portail n'a pas le droit de faire, c'est prêter son image à une
   * agence — et cela reste interdit, dans `agencyLogoUrl`.
   */
  it('rend le logo d’un portail, qui est bien le sien', () => {
    expect(sourceLogoUrl('studapart')).toBe('https://studapart.com/favicon.ico');
  });

  // Une source sans site — les alertes e-mail n'en sont pas un — n'a pas de
  // logo à montrer, et on n'en invente pas (§17).
  it('ne rend rien pour une source qui n’est pas un site', () => {
    expect(sourceLogoUrl('email-alerts')).toBeNull();
  });

  it('ne rend rien pour une source inconnue', () => {
    expect(sourceLogoUrl('source-qui-n-existe-pas')).toBeNull();
  });
});
