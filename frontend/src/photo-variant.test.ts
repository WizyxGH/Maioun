// @vitest-environment node
// Aucun navigateur ici : ce test ne touche ni au DOM, ni au stockage, ni à
// `window`. Monter jsdom pour rien coûtait 0,9 s par fichier — 6 s sur les
// trente et un fichiers concernés, à chaque exécution.

import { describe, expect, it } from 'vitest';
import { photoVariant } from './photo-variant.js';

describe('photoVariant', () => {
  it('réduit une largeur staticlbi plus grande que la cible', () => {
    expect(
      photoVariant('https://agence.staticlbi.com/1600xauto/images/biens/1/abc/photo_1.jpg', 800),
    ).toBe('https://agence.staticlbi.com/800xauto/images/biens/1/abc/photo_1.jpg');
    expect(photoVariant('https://agence.staticlbi.com/original/images/biens/1/a/p.png', 500)).toBe(
      'https://agence.staticlbi.com/500xauto/images/biens/1/a/p.png',
    );
  });

  it('n’agrandit pas une photo staticlbi déjà petite, ni une taille inconnue', () => {
    const small = 'https://agence.staticlbi.com/500xauto/images/biens/1/a/p.jpg';
    expect(photoVariant(small, 800)).toBe(small);
    const wa = 'https://agence.staticlbi.com/wa/images/biens/1/a/p.png';
    expect(photoVariant(wa, 800)).toBe(wa);
  });

  it('réduit le côté borné par apimo, sans agrandir', () => {
    expect(photoVariant('https://media.apimo.pro/cache/abc_def_1920-original.jpg', 1200)).toBe(
      'https://media.apimo.pro/cache/abc_def_1200-original.jpg',
    );
    const small = 'https://media.apimo.pro/cache/abc_def_640-original.jpg';
    expect(photoVariant(small, 800)).toBe(small);
  });

  it('ne prend la petite taille studapart que si elle suffit', () => {
    const large = 'https://media.studapart.com/property_images_large/6a32c8ee21c6f.jpeg';
    expect(photoVariant(large, 500)).toBe(
      'https://media.studapart.com/property_images_small/6a32c8ee21c6f.jpeg',
    );
    expect(photoVariant(large, 800)).toBe(large);
  });

  it('demande à bienici une taille contenue, sans recadrage', () => {
    expect(photoVariant('https://file.bienici.com/photo/abc-photo-hd.jpg', 800)).toBe(
      'https://file.bienici.com/photo/abc-photo-hd.jpg?width=800&height=800&fit=inside',
    );
  });

  it('ajoute la largeur à seloger, sauf si l’URL en porte déjà une', () => {
    expect(photoVariant('https://mms.seloger.com/0/c/d/4/x.jpg?ci_seal=6f0f', 800)).toBe(
      'https://mms.seloger.com/0/c/d/4/x.jpg?ci_seal=6f0f&w=800',
    );
    const sized = 'https://mms.seloger.com/f/2/b/e/x.jpg?ci_seal=4ae3&h=400&w=540';
    expect(photoVariant(sized, 800)).toBe(sized);
  });

  it('rend telle quelle une URL d’hébergeur non vérifié, relayée ou invalide', () => {
    for (const url of [
      'https://d36vnx92dgl2c5.cloudfront.net/prod/Cello/3796/media/32f6.jpg',
      'https://www.laforet.com/glide/office9/a.jpg?w=400&h=250&s=bc4e',
      'http://agence.staticlbi.com/1600xauto/images/p.jpg',
      'pas une url',
    ]) {
      expect(photoVariant(url, 800)).toBe(url);
    }
  });
});
