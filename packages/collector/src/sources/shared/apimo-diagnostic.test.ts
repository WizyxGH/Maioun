import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';
import { dpeFromDiagnosticImages } from './apimo-diagnostic.js';

/** Les deux images telles qu'Apimo les écrit : `/1/{kWh}` puis `/2/{CO₂}`. */
const page = (kwh: string, co2: string): cheerio.CheerioAPI =>
  cheerio.load(
    `<div class="diagnostics">
       <img src="https://agence.invalid/fr/diagnostic/4401705/1/${kwh}">
       <img src="https://agence.invalid/fr/diagnostic/4401705/2/${co2}">
     </div>`,
  );

const SELECTOR = '.diagnostics img[src*="/fr/diagnostic/"]';

describe('dpeFromDiagnosticImages', () => {
  it('lit les deux nombres dans l’adresse, sans charger l’image', () => {
    expect(dpeFromDiagnosticImages(page('110', '20'), SELECTOR)).toBe('C');
  });

  it('accepte une valeur décimale', () => {
    expect(dpeFromDiagnosticImages(page('110.5', '20.2'), SELECTOR)).toBe('C');
  });

  // Sans les DEUX nombres, la classe ne se calcule pas : on n'en invente pas.
  it('rend `undefined` s’il manque une des deux images', () => {
    const seulEnergie = cheerio.load(
      `<div class="diagnostics">
         <img src="https://agence.invalid/fr/diagnostic/4401705/1/110"></div>`,
    );
    expect(dpeFromDiagnosticImages(seulEnergie, SELECTOR)).toBeUndefined();
  });

  it('rend `undefined` quand la page ne porte aucun diagnostic', () => {
    expect(dpeFromDiagnosticImages(cheerio.load('<div></div>'), SELECTOR)).toBeUndefined();
  });

  // Le sélecteur appartient à l'appelant : « free7 » range les mêmes images
  // dans l'`article` de la fiche, et rien d'autre ne change.
  it('suit le sélecteur qu’on lui donne', () => {
    const free7 = cheerio.load(
      `<article>
         <img src="https://agence.invalid/fr/diagnostic/9/1/110">
         <img src="https://agence.invalid/fr/diagnostic/9/2/20"></article>`,
    );
    expect(dpeFromDiagnosticImages(free7, 'article img[src*="/fr/diagnostic/"]')).toBe('C');
    expect(dpeFromDiagnosticImages(free7, SELECTOR)).toBeUndefined();
  });
});
