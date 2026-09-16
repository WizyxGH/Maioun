/**
 * Le GES, source par source, sur les documents DÉJÀ téléchargés.
 *
 * Toutes ces étiquettes voyageaient dans les pages qu'on lisait déjà, à côté du
 * DPE, et on les jetait. Ce fichier tient le relevé : une source qui cesse de
 * rendre son GES le dit ici, sans qu'il faille rouvrir quinze fichiers de test.
 *
 * DEUX RÈGLES Y SONT VÉRIFIÉES AUTANT QUE LES LETTRES : une étiquette absente
 * reste ABSENTE — « NA », « Non communiqué », `null`, une échelle sans case
 * active —, et le GES n'est JAMAIS recopié du DPE. Les couples C/A et D/C des
 * fixtures le montrent : les deux classes divergent.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../normalization/normalize.js';
import { parseDetail as locserviceDetail } from './locservice/parser.js';
import { parseSearchResponse as bieniciSearch } from './bienici/parser.js';
import { parseDetail as procivisDetail } from './procivis/parser.js';
import { parseDetail as imodirectDetail } from './imodirect/parser.js';
import { parseDetail as guyHoquetDetail } from './guy-hoquet/parser.js';
import { parseDetail as orientationDetail } from './orientation-immobiliere/parser.js';
import { parseDetail as barnesDetail } from './barnes/parser.js';
import { parseListPage as figaroList } from './figaro-immo/parser.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../tests/fixtures');
const read = (...parts: string[]): string => readFileSync(join(FIXTURES, ...parts), 'utf8');

const NOW = Date.parse('2026-09-16T10:00:00.000Z');

describe('GES lu dans les documents déjà téléchargés', () => {
  it('locservice — barre « pollution », jumelle de la barre « energy »', () => {
    const fiche = read('locservice', 'fiche.html');
    // Telle quelle, la fixture dit « le GES n'a pas été renseigné » : « NA ».
    // Une non-réponse n'est pas une étiquette, et rien ne doit sortir.
    expect(locserviceDetail(fiche)?.extra?.['ges']).toBeUndefined();
    expect(locserviceDetail(fiche)?.extra?.['dpe']).toBe('D');

    // La même page avec une note renseignée : la lettre de la case active.
    const notee = fiche
      .replace('pollution-bar-item--NA pollution-bar-item--active', 'pollution-bar-item--NA')
      .replace(
        'pollution-bar-item pollution-bar-item--C"',
        'pollution-bar-item pollution-bar-item--C pollution-bar-item--active"',
      )
      .replace(
        '<div class="pollution-bar-item pollution-bar-item--C pollution-bar-item--active" role="listitem"></div>',
        '<div class="pollution-bar-item pollution-bar-item--C pollution-bar-item--active" role="listitem"><span class="pollution-bar-letter">C</span></div>',
      );
    expect(locserviceDetail(notee)?.extra?.['ges']).toBe('C');
  });

  it('bienici — clé jumelle de `energyClassification`, qui en diffère', () => {
    const { listings } = bieniciSearch(read('bienici', 'search.json'));
    const etiquettes = listings.map((l) => [l.extra?.['dpe'], l.extra?.['ges']]);
    expect(etiquettes).toContainEqual(['C', 'A']);
    expect(etiquettes.every(([dpe, ges]) => dpe !== undefined && ges !== undefined)).toBe(true);
  });

  it('procivis — case active de l’échelle, le texte n’en dit rien', () => {
    const draft = procivisDetail(read('procivis', 'fiche-2dh7jsqs.html'));
    expect(draft?.extra?.['dpe']).toBe('C');
    expect(draft?.extra?.['ges']).toBe('B');
  });

  it('imodirect — identifiant de la case retenue', () => {
    expect(imodirectDetail(read('imodirect', 'fiche-6144.html'))?.extra?.['ges']).toBe('C');
  });

  it('guy-hoquet — texte alternatif de l’image jumelle, jamais le SVG', () => {
    expect(guyHoquetDetail(read('guy-hoquet', 'fiche-1898127.html'))?.extra?.['ges']).toBe('E');
  });

  it('orientation-immobiliere — la même adresse d’image porte les deux classes', () => {
    const draft = orientationDetail(read('orientation-immobiliere', 'fiche-GES00290121_821.html'));
    expect(draft?.extra?.['dpe']).toBe('C');
    expect(draft?.extra?.['ges']).toBe('D');
  });

  it('barnes — ligne jumelle du tableau ; « Non communiqué » ne donne rien', () => {
    expect(barnesDetail(read('barnes', 'fiche-APM-87323598.html'))?.extra?.['ges']).toBe('A');
    expect(barnesDetail(read('barnes', 'fiche-ITB-LS104-2.html'))?.extra?.['ges']).toBeUndefined();
  });

  it('figaro-immo — `gesCategory` du même objet que `energyCategory`', () => {
    const page = figaroList(read('figaro-immo', 'liste-page-1.html'));
    const etiquettes = page.listings.map((l) => [l.extra?.['dpe'], l.extra?.['ges']]);
    expect(etiquettes).toContainEqual(['D', 'C']);
  });

  it('netty — « Classe climat A » des mentions légales, lu à la normalisation', () => {
    const mentions =
      'Honoraires de 398 € TTC à la charge du locataire. Classe énergie C, Classe climat A';
    const listing = normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://netty.example.invalid/annonce/1',
        priceText: '780 € par mois',
        cityText: 'Nice',
        extra: { features: mentions },
      },
      { sourceId: 'netty', nowMs: NOW },
    );
    expect(listing?.dpe).toBe('C');
    expect(listing?.ges).toBe('A');
  });
});
