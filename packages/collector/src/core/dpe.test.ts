/**
 * Une étiquette FAUSSE vaut moins qu'une étiquette absente : elle décide d'un
 * filtre, et écarte un logement sur une donnée qui n'est pas la sienne. Ces
 * scénarios éprouvent donc surtout ce que l'appariement REFUSE.
 *
 * Aucun accès réseau : les réponses de l'ADEME sont injectées.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  comparableAddress,
  createDpeLookup,
  createMemoryDpeCache,
  dpeCacheKey,
  pickMatch,
} from './dpe.js';

const NOW = Date.parse('2026-09-10T10:00:00.000Z');

/** Une ligne du jeu de données, telle que l'API la rend. */
const ligne = (
  adresse: string,
  etiquette: string,
  surface: number,
  annee: number | null = 1970,
): Record<string, unknown> => ({
  adresse_ban: adresse,
  etiquette_dpe: etiquette,
  etiquette_ges: 'B',
  surface_habitable_logement: surface,
  annee_construction: annee,
});

describe('comparableAddress', () => {
  it('développe les abréviations des DEUX côtés', () => {
    // Nos sources écrivent « 9 Bd Carlone », l'ADEME « 9 Boulevard Carlone ».
    expect(comparableAddress('9 Bd Carlone')).toBe('9 boulevard carlone');
    expect(comparableAddress('9 Boulevard Carlone')).toBe('9 boulevard carlone');
    expect(comparableAddress('3 Av. Sainte-Marguerite')).toBe('3 avenue sainte marguerite');
    expect(comparableAddress('3 AVENUE STE MARGUERITE')).toBe('3 avenue sainte marguerite');
  });
});

describe('pickMatch — ce qu’on refuse', () => {
  const lignes = [
    ligne('12 Rue Barla 06300 Nice', 'D', 30),
    ligne('12 Rue Barla 06300 Nice', 'C', 64),
    ligne('120 Rue Barla 06300 Nice', 'A', 30),
  ];

  it('apparie sur le numéro, la voie ET la surface', () => {
    expect(pickMatch(lignes, '12 Rue Barla', 30)?.label).toBe('D');
    expect(pickMatch(lignes, '12 Rue Barla', 64)?.label).toBe('C');
  });

  it('ne confond pas le 12 et le 120', () => {
    // La recherche plein texte rapporte les deux ; seul le numéro les sépare.
    expect(pickMatch(lignes, '120 Rue Barla', 30)?.label).toBe('A');
  });

  it('refuse quand aucune surface ne concorde', () => {
    // L'immeuble a des diagnostics, mais aucun de ce logement-là.
    expect(pickMatch(lignes, '12 Rue Barla', 45)).toBeNull();
  });

  it('refuse une adresse sans numéro de voie', () => {
    // Un immeuble sans numéro n'est pas une adresse : rien ne le distingue des
    // cinquante autres de la rue.
    expect(pickMatch(lignes, 'Rue Barla', 30)).toBeNull();
  });

  it('refuse deux candidats qui se contredisent', () => {
    const contradictoires = [
      ligne('7 Rue Guiglia 06000 Nice', 'D', 40),
      ligne('7 Rue Guiglia 06000 Nice', 'F', 40),
    ];
    expect(pickMatch(contradictoires, '7 Rue Guiglia', 40)).toBeNull();
  });

  it('accepte deux candidats qui s’accordent', () => {
    // Le même logement rediagnostiqué : le doute est sans conséquence.
    const accord = [
      ligne('7 Rue Guiglia 06000 Nice', 'D', 40),
      ligne('7 Rue Guiglia 06000 Nice', 'D', 40),
    ];
    expect(pickMatch(accord, '7 Rue Guiglia', 40)?.label).toBe('D');
  });

  it('tolère deux mètres carrés d’écart, pas cinq', () => {
    // L'annonce donne souvent la surface Carrez, le diagnostic l'habitable.
    expect(pickMatch(lignes, '12 Rue Barla', 31.8)?.label).toBe('D');
    expect(pickMatch(lignes, '12 Rue Barla', 35)).toBeNull();
  });

  it('ignore une étiquette illisible', () => {
    expect(pickMatch([ligne('5 Rue X 06000 Nice', 'N/A', 20)], '5 Rue X', 20)).toBeNull();
  });

  it('rend l’année de construction, qu’aucune source ne publie', () => {
    expect(pickMatch([ligne('5 Rue X 06000 Nice', 'C', 20, 1932)], '5 Rue X', 20)?.builtYear).toBe(
      1932,
    );
    // Une année aberrante ne s'invente pas.
    expect(
      pickMatch([ligne('5 Rue X 06000 Nice', 'C', 20, 12)], '5 Rue X', 20)?.builtYear,
    ).toBeNull();
  });
});

describe('createDpeLookup', () => {
  const reponse = (lignes: readonly Record<string, unknown>[]): Response =>
    ({ ok: true, json: () => Promise.resolve({ results: lignes }) }) as unknown as Response;

  it('n’appelle l’ADEME qu’une fois par adresse', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(reponse([ligne('12 Rue Barla 06300 Nice', 'D', 30)])),
    );
    const lookup = createDpeLookup({
      cache: createMemoryDpeCache(),
      nowMs: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });

    expect((await lookup.find('12 Rue Barla', '06300', 30))?.label).toBe('D');
    expect((await lookup.find('12 Rue Barla', '06300', 30))?.label).toBe('D');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('mémorise aussi les recherches INFRUCTUEUSES', async () => {
    // Sans cela, les six cents annonces sans DPE rappelleraient l'ADEME à
    // chaque collecte, pour rien.
    const fetchImpl = vi.fn(() => Promise.resolve(reponse([])));
    const lookup = createDpeLookup({
      cache: createMemoryDpeCache(),
      nowMs: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });

    expect(await lookup.find('12 Rue Barla', '06300', 30)).toBeNull();
    expect(await lookup.find('12 Rue Barla', '06300', 30)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ne mémorise PAS une panne réseau', async () => {
    // Une panne n'est pas une absence de diagnostic : la mettre en cache
    // condamnerait l'annonce à ne jamais être retrouvée.
    const fetchImpl = vi.fn(() => Promise.reject(new Error('réseau')));
    const lookup = createDpeLookup({
      cache: createMemoryDpeCache(),
      nowMs: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });

    expect(await lookup.find('12 Rue Barla', '06300', 30)).toBeNull();
    expect(await lookup.find('12 Rue Barla', '06300', 30)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('n’appelle rien sans code postal exploitable', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(reponse([])));
    const lookup = createDpeLookup({
      cache: createMemoryDpeCache(),
      nowMs: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: 'MaiounBot/0.1',
    });

    expect(await lookup.find('12 Rue Barla', '', 30)).toBeNull();
    expect(await lookup.find('', '06300', 30)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('range la surface dans la clé de cache', () => {
    // Deux logements de la même adresse ne partagent pas leur diagnostic.
    expect(dpeCacheKey('12 Rue Barla', '06300', 30)).not.toBe(
      dpeCacheKey('12 Rue Barla', '06300', 64),
    );
    expect(dpeCacheKey('12 Bd Carlone', '06200', 30)).toBe(
      dpeCacheKey('12 Boulevard Carlone', '06200', 30.4),
    );
  });
});
