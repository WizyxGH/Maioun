/**
 * L'agence nommée par une alerte, du repère de la source jusqu'au tour avancé.
 */

import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { awaitedAgenciesAfter, awaitedSources, parseAwaitedAgencies } from './agency-refresh.js';

const NOW = Date.parse('2026-09-17T08:00:00.000Z');
const HEURE = 60 * 60 * 1000;

const SOURCES = [
  { id: 'igti', name: 'Immobilière GTI', domain: 'immobilieregti.com' },
  { id: 'century21', name: 'Century 21', domain: 'century21.fr' },
];

function listing(overrides: Partial<RawListing> = {}): RawListing {
  return {
    sourceRef: 'seloger:1',
    sourceUrl: 'https://www.seloger.com/annonce/1',
    title: 'Appartement 2 pièces 40 m²',
    ...overrides,
  };
}

describe('awaitedAgenciesAfter', () => {
  it('retient l’agence que le message nomme', () => {
    const awaited = awaitedAgenciesAfter([], [listing({ agencyName: 'Immobilière GTI' })], NOW);
    expect(awaited).toEqual([{ name: 'Immobilière GTI', since: new Date(NOW).toISOString() }]);
  });

  it('ne retient rien d’une annonce sans annonceur nommé', () => {
    // La très grande majorité des digests taisent l'agence : ils ne doivent
    // déclencher aucun passage, et surtout aucun nom ne s'invente.
    expect(awaitedAgenciesAfter([], [listing(), listing({ agencyName: '  ' })], NOW)).toEqual([]);
  });

  it('garde les agences d’avant tant qu’elles n’ont pas vieilli', () => {
    const previous = [{ name: 'Century 21', since: new Date(NOW - 2 * HEURE).toISOString() }];
    const awaited = awaitedAgenciesAfter(previous, [], NOW);
    expect(awaited.map((one) => one.name)).toEqual(['Century 21']);
  });

  it('oublie une attente de plus de douze heures', () => {
    const previous = [{ name: 'Century 21', since: new Date(NOW - 13 * HEURE).toISOString() }];
    expect(awaitedAgenciesAfter(previous, [], NOW)).toEqual([]);
  });

  it('garde l’instant le plus récent d’une même agence', () => {
    const previous = [{ name: 'IMMOBILIERE GTI', since: new Date(NOW - 5 * HEURE).toISOString() }];
    const awaited = awaitedAgenciesAfter(
      previous,
      [listing({ agencyName: 'Immobilière GTI' })],
      NOW,
    );
    expect(awaited).toHaveLength(1);
    expect(awaited[0]?.since).toBe(new Date(NOW).toISOString());
  });

  it('ne laisse pas une rafale prendre la file entière', () => {
    const listings = Array.from({ length: 30 }, (_value, index) =>
      listing({ sourceRef: `seloger:${index}`, agencyName: `Agence Martin ${index}` }),
    );
    expect(awaitedAgenciesAfter([], listings, NOW)).toHaveLength(10);
  });
});

describe('parseAwaitedAgencies', () => {
  it('lit les agences d’un repère, et ignore le reste', () => {
    const memo = JSON.stringify({
      uidValidity: '42',
      lastUid: 7,
      senders: 'seloger',
      agencies: [
        { name: 'Immobilière GTI', since: '2026-09-17T08:00:00.000Z' },
        { name: 'Sans date' },
        { since: '2026-09-17T08:00:00.000Z' },
        'texte',
      ],
    });
    expect(parseAwaitedAgencies(memo).map((one) => one.name)).toEqual(['Immobilière GTI']);
  });

  it('ne lève jamais sur un repère illisible ou absent', () => {
    expect(parseAwaitedAgencies(null)).toEqual([]);
    expect(parseAwaitedAgencies('{pas du json')).toEqual([]);
    expect(parseAwaitedAgencies('{"agencies":"non"}')).toEqual([]);
  });
});

describe('awaitedSources', () => {
  const memo = (names: readonly string[], sinceMs = NOW): string =>
    JSON.stringify({
      uidValidity: '42',
      lastUid: 7,
      senders: 'seloger',
      agencies: names.map((name) => ({ name, since: new Date(sinceMs).toISOString() })),
    });

  it('rend la source qui collecte cette agence, et depuis quand', () => {
    const expected = awaitedSources(memo(['Immobilière GTI']), SOURCES, NOW);
    expect([...expected]).toEqual([['igti', new Date(NOW).toISOString()]]);
  });

  it('ne réveille AUCUNE source pour une agence inconnue', () => {
    // Le cas ordinaire : l'agence existe, nous ne la collectons pas. Rien ne
    // doit partir — surtout pas vers une source au nom voisin.
    expect(awaitedSources(memo(['PETROVA INVESTISSEMENT IMMOBILIER']), SOURCES, NOW).size).toBe(0);
    expect(awaitedSources(memo(['Agence Immobilière']), SOURCES, NOW).size).toBe(0);
  });

  it('laisse tomber une attente trop vieille', () => {
    expect(awaitedSources(memo(['Immobilière GTI'], NOW - 13 * HEURE), SOURCES, NOW).size).toBe(0);
  });

  it('ne rend rien quand la source n’a pas de repère', () => {
    expect(awaitedSources(null, SOURCES, NOW).size).toBe(0);
  });
});
