/**
 * Les adresses que le collecteur DÉDUIT au lieu de les écrire.
 *
 * Le nom du dépôt figurait en dur : au renommage du 2026-09-10, tous les liens
 * d'alerte sont partis vers une page morte. Ces scénarios fixent la déduction,
 * avec l'environnement de GitHub Actions tel qu'il est réellement fourni.
 */

import { describe, expect, it } from 'vitest';
import { collectorUserAgent, publicSiteUrl, repositorySlug } from './config.js';

/** L'environnement d'un job GitHub Actions, réduit à ce qui compte ici. */
const ACTIONS = {
  GITHUB_REPOSITORY: 'WizyxGH/Maioun',
  GITHUB_SERVER_URL: 'https://github.com',
} as unknown as NodeJS.ProcessEnv;

describe('déduction depuis GitHub Actions', () => {
  it('prend le dépôt que GitHub fournit, à jour après un renommage', () => {
    expect(repositorySlug(ACTIONS)).toBe('WizyxGH/Maioun');
  });

  it('compose l’adresse de l’application sur GitHub Pages', () => {
    // Le propriétaire passe en minuscules : c'est un nom d'hôte.
    expect(publicSiteUrl(ACTIONS)).toBe('https://wizyxgh.github.io/Maioun/app/');
  });

  it('suit un renommage sans une ligne de code', () => {
    const renomme = { ...ACTIONS, GITHUB_REPOSITORY: 'WizyxGH/NouveauNom' };
    expect(publicSiteUrl(renomme)).toBe('https://wizyxgh.github.io/NouveauNom/app/');
    expect(collectorUserAgent(renomme)).toBe(
      'MaiounBot/0.1 (+https://github.com/WizyxGH/NouveauNom)',
    );
  });

  it('annonce l’adresse du dépôt dans son identité', () => {
    expect(collectorUserAgent(ACTIONS)).toBe('MaiounBot/0.1 (+https://github.com/WizyxGH/Maioun)');
  });
});

describe('ce qu’on donne explicitement l’emporte', () => {
  it('garde une SITE_URL posée à la main — un domaine à soi, par exemple', () => {
    expect(publicSiteUrl({ ...ACTIONS, SITE_URL: 'https://maioun.example/app/' })).toBe(
      'https://maioun.example/app/',
    );
  });

  it('ignore une valeur vide plutôt que de s’en servir', () => {
    // Une variable de dépôt vidée arrive comme chaîne vide, pas comme absente.
    expect(publicSiteUrl({ ...ACTIONS, SITE_URL: '  ' })).toBe(
      'https://wizyxgh.github.io/Maioun/app/',
    );
    expect(collectorUserAgent({ ...ACTIONS, COLLECTOR_USER_AGENT: '' })).toContain('Maioun');
  });
});
