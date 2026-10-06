/**
 * L'adresse de la page : celle que Pages déclare quand le déploiement la
 * donne — domaine personnalisé compris —, sinon celle qu'il publie par défaut.
 */

import { describe, expect, it } from 'vitest';
import { siteInfo } from './site.js';

const DEPOT = { GITHUB_REPOSITORY: 'Proprietaire/Depot' } as unknown as NodeJS.ProcessEnv;

describe('siteInfo', () => {
  it('prend l’adresse déclarée par Pages, avec une seule barre finale', () => {
    const info = siteInfo({ ...DEPOT, SITE_URL: 'https://maioun.example.invalid' });
    expect(info.siteUrl).toBe('https://maioun.example.invalid/');
    expect(siteInfo({ ...DEPOT, SITE_URL: 'https://maioun.example.invalid//' }).siteUrl).toBe(
      'https://maioun.example.invalid/',
    );
  });

  it('retombe sur l’adresse par défaut de Pages sans déclaration', () => {
    expect(siteInfo(DEPOT).siteUrl).toBe('https://proprietaire.github.io/Depot/');
    expect(siteInfo({ ...DEPOT, SITE_URL: '  ' }).siteUrl).toBe(
      'https://proprietaire.github.io/Depot/',
    );
  });

  it('garde le lien vers le code, quel que soit le domaine', () => {
    expect(siteInfo({ ...DEPOT, SITE_URL: 'https://maioun.example.invalid/' }).repoUrl).toBe(
      'https://github.com/Proprietaire/Depot',
    );
  });
});
