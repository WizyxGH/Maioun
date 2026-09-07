import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitPhotos } from './photos.js';

/**
 * L'adresse du Worker, réglable d'un test à l'autre.
 *
 * `vi.hoisted` parce que la fabrique de `vi.mock` est remontée en tête de
 * fichier : une variable déclarée plus bas n'existerait pas encore quand elle
 * s'exécute. Le getter, lui, rend `photos.ts` sensible au changement — il lit
 * la liaison à chaque appel, pas une fois à l'import.
 */
const state = vi.hoisted(() => ({ apiUrl: '' }));

vi.mock('./api/client.js', () => ({
  get API_URL() {
    return state.apiUrl;
  },
}));

/** Change le protocole vu par le module, comme le ferait le navigateur. */
function servedOver(protocol: 'http:' | 'https:'): void {
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    protocol,
  } as Location);
}

beforeEach(() => {
  state.apiUrl = 'https://api.exemple.invalid';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('splitPhotos', () => {
  const claire = 'http://www.beptransaction.com/bep/docs/b.jpg';
  const sure = 'https://images.example.invalid/a.jpg';
  const urls = [sure, claire];

  it('fait passer par le RELAIS ce que le navigateur bloquerait', () => {
    // Le cœur du sujet : ces photos étaient collectées, stockées, et jamais
    // vues. Le relais les rend en https, donc affichables.
    servedOver('https:');
    const split = splitPhotos(urls);
    expect(split.linkOnly).toEqual([]);
    expect(split.embeddable).toEqual([
      sure,
      `https://api.exemple.invalid/api/photo?url=${encodeURIComponent(claire)}`,
    ]);
  });

  it('n’invente pas de relais quand aucune API n’est configurée', () => {
    // Démo, ou développement sans Worker : il n'y a personne pour relayer.
    // Prétendre le contraire produirait une image qui ne charge jamais.
    state.apiUrl = '';
    servedOver('https:');
    expect(splitPhotos(urls)).toEqual({ embeddable: [sure], linkOnly: [claire] });
  });

  it('sur une page http, tout s’affiche — le relais est inutile', () => {
    servedOver('http:');
    expect(splitPhotos(urls)).toEqual({ embeddable: urls, linkOnly: [] });
  });

  it('ne perd aucune photo au passage', () => {
    servedOver('https:');
    const split = splitPhotos(urls);
    expect([...split.embeddable, ...split.linkOnly]).toHaveLength(urls.length);
  });

  it('encode l’URL d’origine, qui contient des caractères réservés', () => {
    // Sans encodage, un `&` dans l'URL d'origine couperait le paramètre en
    // deux et le Worker recevrait une adresse tronquée.
    servedOver('https:');
    const avecQuery = 'http://www.beptransaction.com/img.php?id=1&taille=grande';
    const [relayed] = splitPhotos([avecQuery]).embeddable;
    expect(relayed).toContain(encodeURIComponent(avecQuery));
    expect(relayed).not.toContain('&taille=');
  });
});
