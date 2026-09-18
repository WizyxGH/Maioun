/**
 * « Parfois la première image du carrousel est la même que la deuxième, mais
 * en flou » — relevé du 2026-09-18 : 138 fiches actives sur 3 072 publiaient
 * un même cliché sous deux adresses.
 */

import { describe, expect, it } from 'vitest';
import { uniquePhotos } from './photo-duplicates.js';

const LBI = 'https://gilettaimmo.staticlbi.com';
const CLICHE =
  'images/biens/1/ec28b0d8b13569cc09829fc2394a2278/photo_8113d32473f7794c1188bb830d19d0df.jpg';

describe('le même cliché ne paraît qu’une fois', () => {
  it('garde l’originale quand la plateforme sert aussi une version réduite', () => {
    const urls = [`${LBI}/1600xauto/${CLICHE}`, `${LBI}/original/${CLICHE}`];
    expect(uniquePhotos(urls)).toEqual([`${LBI}/original/${CLICHE}`]);
  });

  it('reconnaît la même photo chez deux hébergeurs, et garde l’entière', () => {
    // Laforêt : une découpe de 400 × 250 servie par son redimensionneur, et
    // l'image entière chez l'hébergeur d'origine. Le nom du fichier est le même.
    const decoupe =
      'https://www.laforet.com/glide/office9/agence/catalog/images/pr_p/5/2/8/6/2/9/6/7/52862967a.jpg?w=400&h=250&fit=crop';
    const entiere =
      'https://media.example.invalid/office9/agence/catalog/images/pr_p/5/2/8/6/2/9/6/7/52862967a.jpg';
    expect(uniquePhotos([decoupe, entiere])).toEqual([entiere]);
  });

  it('LAISSE LA PLACE de la première : l’ordre des photos ne bouge pas', () => {
    const autre = `${LBI}/original/images/biens/1/aaa/photo_0000000000000000000000000000.jpg`;
    const resultat = uniquePhotos([
      `${LBI}/1600xauto/${CLICHE}`,
      autre,
      `${LBI}/original/${CLICHE}`,
    ]);
    expect(resultat).toEqual([`${LBI}/original/${CLICHE}`, autre]);
  });

  it('ne rapproche PAS deux « 1.jpg » venus de deux sources différentes', () => {
    // Une fiche réunit plusieurs sources : chacune peut avoir son « 1.jpg »,
    // et ce ne sont pas les mêmes photos. Un nom court ne vaut que chez le
    // même hébergeur.
    const urls = [
      'https://a.example.invalid/photos/1.jpg',
      'https://b.example.invalid/photos/1.jpg',
    ];
    expect(uniquePhotos(urls)).toEqual(urls);
  });

  it('rapproche en revanche deux tailles d’un « 1.jpg » du même hébergeur', () => {
    const urls = [
      'https://a.example.invalid/thumb/1.jpg',
      'https://a.example.invalid/original/1.jpg',
    ];
    expect(uniquePhotos(urls)).toEqual(['https://a.example.invalid/original/1.jpg']);
  });

  it('garde deux clichés réellement différents', () => {
    const urls = [
      `${LBI}/original/${CLICHE}`,
      `${LBI}/original/images/biens/1/bbb/photo_1111111111111111111111111111.jpg`,
    ];
    expect(uniquePhotos(urls)).toEqual(urls);
  });

  it('ne perd pas une adresse illisible : elle reste telle quelle', () => {
    expect(uniquePhotos(['pas une adresse'])).toEqual(['pas une adresse']);
  });

  it('rend une liste vide sans rien inventer', () => {
    expect(uniquePhotos([])).toEqual([]);
  });
});
