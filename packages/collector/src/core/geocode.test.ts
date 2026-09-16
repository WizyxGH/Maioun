/**
 * Géocodage via la Base Adresse Nationale (§20, §6, §30).
 *
 * Aucun appel réseau : les réponses BAN sont simulées (§59). On vérifie
 * l'économie de requêtes, et surtout ce que les annonces écrivent vraiment dans
 * le champ adresse — nom d'immeuble, description avalée, pays en queue.
 */

import { describe, expect, it, vi } from 'vitest';
import { cleanAddress, createGeocoder, createMemoryGeocodeCache } from './geocode.js';

const NOW = Date.parse('2026-08-15T12:00:00.000Z');

interface FakeFeature {
  readonly type?: string;
  readonly score?: number;
  readonly street?: string;
  readonly name?: string;
  readonly city?: string;
  readonly citycode?: string;
  readonly lon?: number;
  readonly lat?: number;
}

/** Réponse BAN simulée : coordonnées en [lon, lat] (ordre GeoJSON). */
function banBody(features: readonly FakeFeature[]): string {
  return JSON.stringify({
    features: features.map((f) => ({
      geometry: { coordinates: [f.lon ?? 7.26, f.lat ?? 43.7] },
      properties: {
        type: f.type ?? 'housenumber',
        score: f.score ?? 0.9,
        ...(f.street !== undefined ? { street: f.street } : {}),
        ...(f.name !== undefined ? { name: f.name } : {}),
        ...(f.city !== undefined ? { city: f.city } : {}),
        ...(f.citycode !== undefined ? { citycode: f.citycode } : {}),
      },
    })),
  });
}

const ok = (features: readonly FakeFeature[]): Response =>
  new Response(banBody(features), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** Aiguille les réponses simulées sur les paramètres réellement envoyés. */
function fakeBan(route: (params: URLSearchParams) => readonly FakeFeature[]): {
  impl: typeof fetch;
  calls: URLSearchParams[];
} {
  const calls: URLSearchParams[] = [];
  const impl = vi.fn(async (input: string | URL | Request) => {
    const params = new URL(String(input)).searchParams;
    calls.push(params);
    return ok(route(params));
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const geocoderWith = (impl: typeof fetch, minScore?: number) =>
  createGeocoder({
    cache: createMemoryGeocodeCache(),
    nowMs: NOW,
    userAgent: 'test',
    fetchImpl: impl,
    ...(minScore !== undefined ? { minScore } : {}),
  });

const NICE = { city: 'Nice', citycode: '06088' };

describe('createGeocoder', () => {
  it('géocode une adresse et convertit [lon, lat] → {latitude, longitude}', async () => {
    const { impl } = fakeBan(() => [{ street: 'Boulevard Fictif', lon: 7.2662, lat: 43.7024 }]);
    const coords = await geocoderWith(impl).geocode('42 Bd Fictif 06000 Nice');
    expect(coords).toEqual({ latitude: 43.7024, longitude: 7.2662 });
  });

  it('ne rappelle pas le réseau pour une adresse déjà en cache (§30)', async () => {
    const { impl, calls } = fakeBan(() => [{ street: 'Boulevard Fictif' }]);
    const geocoder = createGeocoder({
      cache: createMemoryGeocodeCache(),
      nowMs: NOW,
      userAgent: 'test',
      fetchImpl: impl,
    });

    await geocoder.geocode('42 Bd Fictif 06000 Nice');
    await geocoder.geocode('42 Bd Fictif 06000 Nice');
    await geocoder.geocode('42  BD  FICTIF  06000  nice'); // même clé normalisée
    expect(calls).toHaveLength(1);
  });

  it('mémorise un échec pour ne pas réessayer en boucle', async () => {
    const { impl, calls } = fakeBan(() => []);
    const geocoder = createGeocoder({
      cache: createMemoryGeocodeCache(),
      nowMs: NOW,
      userAgent: 'test',
      fetchImpl: impl,
    });

    expect(await geocoder.geocode('12 rue introuvable')).toBeNull();
    expect(await geocoder.geocode('12 rue introuvable')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('rejette un résultat BAN sous le plancher de confiance', async () => {
    const { impl } = fakeBan(() => [{ street: 'Rue Fictive', score: 0.1 }]);
    expect(await geocoderWith(impl).geocode('12 rue Fictive')).toBeNull();
  });
});

describe('ce qui place vraiment un logement', () => {
  it('écarte le centre d’une commune ou d’un code postal au profit de la rue', async () => {
    const { impl } = fakeBan(() => [
      { type: 'municipality', score: 0.8, name: 'Nice', ...NICE, lon: 7.278 },
      { type: 'street', score: 0.7, name: 'Avenue Sainte-Marguerite', ...NICE, lon: 7.2106 },
    ]);
    const coords = await geocoderWith(impl).geocode('avenue Sainte-Marguerite', 'nice');
    expect(coords?.longitude).toBe(7.2106);
  });

  it('écarte une rue homonyme d’une autre commune', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? []
        : [{ type: 'street', score: 0.9, name: 'Rue de Nice', city: 'Drancy', citycode: '93029' }],
    );
    expect(await geocoderWith(impl).geocode('rue de Nice', 'nice')).toBeNull();
  });

  it('préfère le numéro à la voie', async () => {
    const { impl } = fakeBan(() => [
      { type: 'street', score: 0.95, name: 'Rue Chabrier', ...NICE, lon: 7.28 },
      { type: 'housenumber', score: 0.6, street: 'Rue Chabrier', ...NICE, lon: 7.29 },
    ]);
    expect((await geocoderWith(impl).geocode('5 Rue Chabrier', 'nice'))?.longitude).toBe(7.29);
  });
});

describe('adresses telles que les annonces les écrivent', () => {
  /**
   * Le cas relevé le 2026-09-16 : le nom d'immeuble fait tomber le score BAN de
   * 0,98 à 0,49 alors que la BAN a bel et bien trouvé le bon numéro.
   */
  it('place une adresse dont le nom d’immeuble suit la voie', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
        : [
            {
              type: 'housenumber',
              score: 0.49,
              street: 'Rue Smollett',
              ...NICE,
              lon: 7.28638,
              lat: 43.702834,
            },
            {
              type: 'housenumber',
              score: 0.47,
              street: 'Rue Vasco De Gama',
              city: 'Sainte-Luce-sur-Loire',
              citycode: '44152',
              lon: -1.475207,
              lat: 47.251345,
            },
          ],
    );
    const coords = await geocoderWith(impl).geocode('38 Rue Smollett le Vasco de Gamma', 'nice');
    expect(coords).toEqual({ latitude: 43.702834, longitude: 7.28638 });
  });

  it('place une adresse précédée du nom de la résidence', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
        : [{ type: 'housenumber', score: 0.44, street: 'Impasse Mont Rabeau', ...NICE, lon: 7.24 }],
    );
    const coords = await geocoderWith(impl).geocode(
      'Résidence parc Anahit, 3 Imp. Mont Rabeau, 06000 Nice, France',
      'nice',
    );
    expect(coords?.longitude).toBe(7.24);
  });

  it('place une adresse suivie d’un morceau de description', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
        : [
            {
              type: 'housenumber',
              score: 0.46,
              street: 'Avenue Louis Cappatti',
              ...NICE,
              lon: 7.25,
            },
          ],
    );
    const coords = await geocoderWith(impl).geocode(
      '11 avenue Louis Cappatti à Nice les informations sur le',
      'nice',
    );
    expect(coords?.longitude).toBe(7.25);
  });

  it('reconnaît un titre abrégé dans le nom de la voie', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
        : [{ type: 'street', score: 0.5, name: 'Rue Docteur Albert Baréty', ...NICE, lon: 7.27 }],
    );
    expect((await geocoderWith(impl).geocode('rue Dr Barety', 'nice'))?.longitude).toBe(7.27);
  });

  /** « Mieux vaut pas de point qu'un point erroné » : la fin du texte ne suffit pas. */
  it('refuse une voie qui ne doit son nom qu’au nom d’immeuble', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
        : [{ type: 'street', score: 0.33, name: 'Chemin Saint-Charles', ...NICE, lon: 7.25 }],
    );
    const coords = await geocoderWith(impl).geocode(
      '86 boulevard Bishoffeim palais saint Charles',
      'nice',
    );
    expect(coords).toBeNull();
  });

  it('refuse une adresse sans nom de voie identifiable', async () => {
    const { impl, calls } = fakeBan(() => [{ street: 'Rue Quelconque', ...NICE }]);
    expect(await geocoderWith(impl).geocode('Avenue de la', 'nice')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('la commune, posée en filtre plutôt qu’en mots', () => {
  it('impose la commune par son code INSEE quand la question seule échoue', async () => {
    const { impl, calls } = fakeBan((params) => {
      if (params.get('type') === 'municipality') {
        return [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }];
      }
      // Sans le filtre commune, la BAN part sur une autre ville.
      return params.get('citycode') === '06088'
        ? [{ type: 'housenumber', score: 0.98, street: 'Rue des Potiers', ...NICE, lon: 7.27 }]
        : [
            {
              type: 'housenumber',
              score: 0.67,
              street: 'Rue Lafayette',
              city: 'Dijon',
              citycode: '21231',
            },
          ];
    });
    const coords = await geocoderWith(impl).geocode('42 rue des Potiers', 'nice');
    expect(coords?.longitude).toBe(7.27);
    expect(calls.some((c) => c.get('citycode') === '06088')).toBe(true);
  });

  it('retrouve la commune malgré un quartier collé à son nom', async () => {
    const { impl } = fakeBan((params) => {
      if (params.get('type') === 'municipality') {
        return params.get('q') === 'nice'
          ? [{ type: 'municipality', score: 0.96, name: 'Nice', ...NICE }]
          : [];
      }
      return params.get('citycode') === '06088'
        ? [{ type: 'housenumber', score: 0.82, street: 'Boulevard Gambetta', ...NICE, lon: 7.25 }]
        : [];
    });
    const coords = await geocoderWith(impl).geocode('26 bd Gambetta', 'nice fleurs gambetta');
    expect(coords?.longitude).toBe(7.25);
  });

  it('accepte une commune abrégée dans l’annonce', async () => {
    const { impl } = fakeBan((params) =>
      params.get('type') === 'municipality'
        ? [
            {
              type: 'municipality',
              score: 0.67,
              name: 'Saint-André-de-la-Roche',
              city: 'Saint-André-de-la-Roche',
              citycode: '06114',
            },
          ]
        : [
            {
              type: 'street',
              score: 0.78,
              name: 'Quai de la Banquière',
              city: 'Saint-André-de-la-Roche',
              citycode: '06114',
              lon: 7.31,
            },
          ],
    );
    const coords = await geocoderWith(impl).geocode('QUAI DE LA BANQUIÈRE', 'st andre de la roche');
    expect(coords?.longitude).toBe(7.31);
  });
});

describe('cleanAddress', () => {
  it('coupe le code postal, la ville et le pays en queue', () => {
    expect(cleanAddress('8 Bd Jean Jaurès, 06300 Nice, France', 'nice')).toBe('8 Bd Jean Jaurès');
    expect(
      cleanAddress('62 Rue Auguste Pegurier, Nice, Provence-Alpes-Côte d’Azur, France', 'nice'),
    ).toBe('62 Rue Auguste Pegurier');
  });

  it('garde une adresse sans queue parasite', () => {
    expect(cleanAddress('38 Rue Smollett Le Vasco de Gamma', 'nice')).toBe(
      '38 Rue Smollett Le Vasco de Gamma',
    );
  });

  it('ne rend jamais une adresse vide', () => {
    expect(cleanAddress('06000 Nice, France', 'nice')).toBe('06000 Nice, France');
  });
});
