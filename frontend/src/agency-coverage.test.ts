/**
 * L'ÉCRAN RÉPONDAIT À LA MAUVAISE QUESTION. « Non suivie » voulait dire « cette
 * annonce-ci n'est pas venue du site de l'agence », alors qu'on lit « nous ne
 * collectons pas cette agence ». Sur les données du 2026-09-17, 220 des 264
 * agences annoncées non suivies étaient collectées : l'annonce était seulement
 * passée par un portail.
 */

import { describe, expect, it } from 'vitest';
import { agencySourceId, hasParserGap, isFollowedAgency } from './agency-coverage.js';
import type { SourceInfo } from './sources.generated.js';

const source = (over: Partial<SourceInfo> & { name: string }): SourceInfo => ({
  domain: null,
  kind: 'localAgency',
  logo: null,
  paidContact: false,
  address: null,
  ...over,
});

const table: Record<string, SourceInfo> = {
  bienici: source({ name: 'Bien’ici', domain: 'bienici.com', kind: 'portal' }),
  fnaim: source({ name: 'FNAIM', domain: 'fnaim.fr', kind: 'portal' }),
  carletta: source({ name: 'Carletta Immobilier', domain: 'carletta.fr' }),
  century21: source({ name: 'Century 21', domain: 'century21.fr', kind: 'agencyNetwork' }),
  'mk-immo': source({ name: 'MK Immo', domain: 'mk-immo.fr' }),
};

describe('isFollowedAgency', () => {
  it('suivie même quand l’annonce n’est arrivée que par un portail', () => {
    // C'est le cœur de la correction : la provenance de l'annonce ne dit rien
    // de la couverture de l'agence.
    expect(isFollowedAgency('Carletta Immobilier', table)).toBe(true);
  });

  it('non suivie quand aucune source ne porte ce nom', () => {
    expect(isFollowedAgency('CONFIANCE IMMOBILIERE', table)).toBe(false);
  });

  it('rapproche « Immo » et « Immobilier », qui sont le même mot abrégé', () => {
    expect(isFollowedAgency('MK IMMOBILIER', table)).toBe(true);
  });

  it('se tait quand le nom ne dit que le métier', () => {
    // « Agence Immobilière » n'est le nom de personne : l'annoncer comme une
    // source manquante enverrait chercher une agence qui n'existe pas.
    expect(isFollowedAgency('AGENCE IMMOBILIERE', table)).toBe(true);
  });
});

describe('agencySourceId', () => {
  it('nomme la source qui collecte l’agence', () => {
    expect(agencySourceId('Carletta Immobilier', table)).toBe('carletta');
  });

  it('ne nomme personne quand le nom est inconnu', () => {
    expect(agencySourceId('CONFIANCE IMMOBILIERE', table)).toBeNull();
  });
});

describe('hasParserGap', () => {
  it('signale l’annonce d’une agence collectée vue seulement chez un portail', () => {
    expect(hasParserGap('Carletta Immobilier', ['bienici'], table)).toBe(true);
  });

  it('ne signale rien quand l’annonce vient bien du site de l’agence', () => {
    expect(hasParserGap('Carletta Immobilier', ['carletta', 'bienici'], table)).toBe(false);
  });

  it('ne signale rien pour une agence qu’on ne collecte pas', () => {
    // Il lui manque une SOURCE, pas une annonce : c'est l'autre liste.
    expect(hasParserGap('CONFIANCE IMMOBILIERE', ['bienici'], table)).toBe(false);
  });

  it('un nom qui désigne un portail n’est pas un parseur d’agence à reprendre', () => {
    expect(hasParserGap('FNAIM', ['bienici'], table)).toBe(false);
  });

  it('un réseau d’agences, lui, a bien un catalogue à relire', () => {
    expect(hasParserGap('Century 21', ['bienici'], table)).toBe(true);
  });
});
