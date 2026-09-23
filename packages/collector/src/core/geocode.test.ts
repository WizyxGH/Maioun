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
  readonly label?: string;
  readonly postcode?: string;
  readonly housenumber?: string;
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
        ...(f.label !== undefined ? { label: f.label } : {}),
        ...(f.postcode !== undefined ? { postcode: f.postcode } : {}),
        ...(f.housenumber !== undefined ? { housenumber: f.housenumber } : {}),
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
    expect(coords).toMatchObject({
      latitude: 43.7024,
      longitude: 7.2662,
      label: null,
      postcode: null,
    });
  });

  /**
   * L'ADRESSE ÉCRITE PAR LE REGISTRE OFFICIEL.
   *
   * Le cas relevé le 2026-09-22 : la source publie « 52 SMOLETT, 06000 Nice ».
   * Il manque le type de voie, le nom perd un L, et le code postal est celui
   * que l'agence met sur toutes ses annonces — Nice en a quatre.
   */
  it('rend l’adresse telle que la BAN l’écrit', async () => {
    const { impl } = fakeBan(() => [
      {
        street: 'Rue Smollett',
        housenumber: '52',
        label: '52 Rue Smollett 06300 Nice',
        postcode: '06300',
      },
    ]);
    const placed = await geocoderWith(impl).geocode('52 SMOLETT', 'Nice');
    expect(placed?.label).toBe('52 Rue Smollett 06300 Nice');
    expect(placed?.postcode).toBe('06300');
  });

  /**
   * LE NUMÉRO DOIT CORRESPONDRE, sans quoi la correction serait une
   * substitution : réécrire « 52 Smolett » en « 5 Rue Smollett » aurait l'air
   * d'une amélioration et changerait l'immeuble.
   */
  it('n’écrit rien quand la BAN a placé un autre numéro', async () => {
    const { impl } = fakeBan(() => [
      {
        street: 'Rue Smollett',
        housenumber: '5',
        label: '5 Rue Smollett 06300 Nice',
        postcode: '06300',
      },
    ]);
    const placed = await geocoderWith(impl).geocode('52 SMOLETT', 'Nice');
    expect(placed?.label).toBeNull();
    expect(placed?.postcode).toBeNull();
  });

  /** Une VOIE n'écrit pas l'adresse D'UN NUMÉRO : elle le perdrait. */
  it('n’écrit rien quand la BAN n’a placé qu’une voie sous un numéro', async () => {
    const { impl } = fakeBan(() => [
      { type: 'street', name: 'Rue Smollett', label: 'Rue Smollett 06300 Nice' },
    ]);
    const placed = await geocoderWith(impl).geocode('52 SMOLETT', 'Nice');
    expect(placed?.label).toBeNull();
  });

  /**
   * SANS NUMÉRO, IL N'Y EN A AUCUN À PERDRE — et c'est justement là que le code
   * postal manque. « Boulevard Louis Delfino, Nice » n'en portait pas.
   */
  it('écrit la voie officielle et son code postal quand l’adresse n’a pas de numéro', async () => {
    const { impl } = fakeBan(() => [
      {
        type: 'street',
        name: 'Boulevard Général Louis Delfino',
        label: 'Boulevard Général Louis Delfino 06300 Nice',
        postcode: '06300',
        ...NICE,
      },
    ]);
    const placed = await geocoderWith(impl).geocode('Boulevard Louis Delfino', 'Nice');
    expect(placed?.label).toBe('Boulevard Général Louis Delfino 06300 Nice');
    expect(placed?.postcode).toBe('06300');
  });

  /**
   * UNE ARTÈRE QUI TRAVERSE DEUX CODES POSTAUX n'en désigne aucun. En choisir
   * un placerait l'annonce dans le mauvais quartier avec l'aplomb d'une donnée
   * officielle.
   */
  it('n’écrit aucun code postal quand la voie en porte deux', async () => {
    const { impl } = fakeBan(() => [
      {
        type: 'street',
        name: 'Avenue de la Californie',
        label: 'Avenue de la Californie 06200 Nice',
        postcode: '06200',
        ...NICE,
      },
      {
        type: 'street',
        name: 'Avenue de la Californie',
        label: 'Avenue de la Californie 06000 Nice',
        postcode: '06000',
        ...NICE,
      },
    ]);
    const placed = await geocoderWith(impl).geocode('Avenue de la Californie', 'Nice');
    expect(placed?.postcode).toBeNull();
    expect(placed?.label).toBeNull();
  });

  /**
   * LA TOLÉRANCE S'ARRÊTE AUX MOTS COURTS. « Pont » et « Port » ne diffèrent
   * que d'une lettre et désignent deux endroits sans rapport : en dessous de
   * six lettres, une lettre d'écart n'est plus une coquille.
   */
  it('ne confond pas deux mots courts à une lettre près', async () => {
    const { impl } = fakeBan(() => [{ street: 'Rue du Port', ...NICE }]);
    expect(await geocoderWith(impl).geocode('12 rue du Pont')).toBeNull();
  });

  /**
   * LE POINT SANS ADRESSE. Beaucoup d'annonces ne nomment que le quartier tout
   * en publiant leurs coordonnées, et leur code postal est celui que l'agence
   * met partout — à Nice, 06000 pour les quatre.
   */
  it('lit le code postal d’un point, à la commune et à la distance près', async () => {
    const impl = (async () =>
      new Response(
        JSON.stringify({
          features: [
            {
              properties: {
                label: '17 Rue Acchiardi de Saint-Léger 06300 Nice',
                postcode: '06300',
                distance: 35,
                city: 'Nice',
              },
            },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const trouve = await geocoderWith(impl).reverse(43.71377, 7.28957, 'Nice');
    expect(trouve?.postcode).toBe('06300');
  });

  /** Au-delà de cent mètres, on n'est plus devant l'immeuble. */
  it('se tait quand l’adresse la plus proche est loin', async () => {
    const impl = (async () =>
      new Response(
        JSON.stringify({
          features: [
            { properties: { label: 'X', postcode: '06300', distance: 400, city: 'Nice' } },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(await geocoderWith(impl).reverse(43.7, 7.28, 'Nice')).toBeNull();
  });

  /**
   * UN POINT DANS UNE AUTRE COMMUNE N'EST PAS LE LOGEMENT : c'est souvent
   * l'agence, dont certaines plateformes recopient les coordonnées.
   */
  it('se tait quand le point tombe dans une autre commune', async () => {
    const impl = (async () =>
      new Response(
        JSON.stringify({
          features: [
            { properties: { label: 'Y', postcode: '06800', distance: 20, city: 'Cagnes-sur-Mer' } },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(await geocoderWith(impl).reverse(43.66, 7.15, 'Nice')).toBeNull();
  });

  it('garde l’adresse normalisée en cache, sans rappeler le réseau', async () => {
    const { impl, calls } = fakeBan(() => [
      {
        street: 'Rue Smollett',
        housenumber: '52',
        label: '52 Rue Smollett 06300 Nice',
        postcode: '06300',
      },
    ]);
    const geocoder = geocoderWith(impl);
    await geocoder.geocode('52 SMOLETT', 'Nice');
    const premierTour = calls.length;
    const again = await geocoder.geocode('52 SMOLETT', 'Nice');
    expect(calls).toHaveLength(premierTour);
    expect(again?.label).toBe('52 Rue Smollett 06300 Nice');
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
    expect(coords).toMatchObject({ latitude: 43.702834, longitude: 7.28638 });
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
