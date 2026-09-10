/**
 * Le 404.html de la racine : le seul filet des adresses profondes.
 *
 * Relevé en ligne le 2026-09-10, après le déménagement de l'application sous
 * `/app/` : toute adresse autre que `/` et `/app/` rendait la 404 générique de
 * GitHub — rafraîchissements, liens d'alerte, anciens favoris. Ces scénarios
 * EXÉCUTENT la redirection contre un `location` simulé, sur ces adresses-là.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — script Node en JavaScript, sans déclaration de types.
import { buildRoot404, legacyRedirect } from '../../scripts/root-404.mjs';

const BASE = '/RentFinder/';

/** Exécute le script de redirection comme le ferait le navigateur. */
function redirige(pathname: string, search = '', hash = ''): string | null {
  const html = (legacyRedirect as (base: string) => string)(BASE);
  const code = html.replace(/^<script>/, '').replace(/<\/script>$/, '');
  let vers: string | null = null;
  const location = {
    pathname,
    search,
    hash,
    replace: (url: string) => {
      vers = url;
    },
  };
  new Function('location', code)(location);
  return vers;
}

describe('adresses d’avant le déménagement', () => {
  it('renvoie une ancienne fiche vers l’application', () => {
    // Le lien que portent les notifications et e-mails déjà envoyés.
    expect(redirige('/RentFinder/annonce/orpi:ad494cb2')).toBe(
      '/RentFinder/app/annonce/orpi:ad494cb2',
    );
  });

  it('garde la requête et l’ancre', () => {
    expect(redirige('/RentFinder/search', '?q=barla', '#liste')).toBe(
      '/RentFinder/app/search?q=barla#liste',
    );
  });
});

describe('adresses de l’application', () => {
  it('ne touche PAS à une adresse déjà sous /app/', () => {
    // C'est la condition qui empêche la boucle : le routeur prend la main.
    expect(redirige('/RentFinder/app/settings/offre')).toBeNull();
    expect(redirige('/RentFinder/app/annonce/orpi:ad494cb2')).toBeNull();
  });

  it('ne touche pas à ce qui n’est pas sous la base du site', () => {
    expect(redirige('/autre-depot/page')).toBeNull();
  });
});

describe('buildRoot404', () => {
  it('pose la redirection en tête de <head>, avant tout chargement', () => {
    const page = (buildRoot404 as (html: string, base: string) => string)(
      '<!doctype html><html><head><script type="module" src="/RentFinder/app/assets/i.js"></script></head></html>',
      BASE,
    );
    expect(page.indexOf('location.replace')).toBeLessThan(page.indexOf('assets/i.js'));
  });

  it('refuse une page sans <head> plutôt que d’écrire un fichier cassé', () => {
    expect(() =>
      (buildRoot404 as (html: string, base: string) => string)('<p>rien</p>', BASE),
    ).toThrow();
  });
});
