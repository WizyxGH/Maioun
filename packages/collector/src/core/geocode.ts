/**
 * Géocodage d'adresses via la Base Adresse Nationale (§20, §6).
 *
 * `api-adresse.data.gouv.fr` est l'API **officielle et gratuite** de l'État
 * français, explicitement prévue pour l'automatisation (aucune clé, quota
 * généreux). On la préfère donc à tout scraping (§6).
 *
 * Économie (§30) : chaque adresse géocodée est mise en cache — une adresse ne
 * déménage pas. Les échecs sont aussi mémorisés pour ne pas réessayer en
 * boucle. Deux appels réseau au plus par adresse nouvelle, jamais davantage.
 *
 * CE QUE LES ANNONCES ÉCRIVENT DANS « adresse ». Presque jamais une adresse
 * postale propre : un nom d'immeuble collé à la voie (« 38 Rue Smollett Le
 * Vasco de Gamma »), un début de description avalé par le parseur (« 11 avenue
 * Louis Cappatti à Nice les informations sur le »), un pays et une région en
 * queue (« …, 06200 Nice, France »). La BAN retrouve la bonne voie malgré ce
 * bruit, mais elle baisse son score de confiance — au point de passer sous le
 * seuil et de ne rien placer du tout. On ne décide donc plus sur le score seul :
 * on vérifie que le résultat parle bien de LA VOIE DEMANDÉE, et ce garde-fou
 * là remplace le seuil.
 */

import type { Coordinates } from './geo.js';

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

/** Entrée de cache : coordonnées, ou `null`/`null` si la BAN a échoué. */
export interface GeocodeEntry {
  readonly lat: number | null;
  readonly lon: number | null;
  readonly geocodedAt: string;
  /** L'adresse telle que la BAN l'écrit, quand elle a placé un NUMÉRO. */
  readonly label?: string | null;
  readonly postcode?: string | null;
}

/**
 * CE QUE LA BAN A PLACÉ : le point, et l'adresse écrite comme il faut.
 *
 * Un sur-ensemble de `Coordinates`, pour que les appelants qui n'attendaient
 * qu'un point continuent de marcher sans une ligne de changement.
 *
 * `label` N'EST RENDU QUE POUR UN NUMÉRO DONT LE NUMÉRO CORRESPOND à celui que
 * la source annonçait. Une voie sans numéro placerait le bien au milieu d'elle
 * et réécrirait l'adresse en perdant le numéro : ce serait une régression
 * déguisée en correction.
 */
export interface PlacedAddress extends Coordinates {
  readonly label: string | null;
  readonly postcode: string | null;
}

export interface GeocodeCacheStore {
  get(query: string): Promise<GeocodeEntry | null>;
  set(query: string, entry: GeocodeEntry): Promise<void>;
}

export interface GeocoderOptions {
  readonly cache: GeocodeCacheStore;
  readonly nowMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent: string;
  /** Plancher de confiance BAN (0-1) : écarte le bruit, pas le bon résultat. */
  readonly minScore?: number;
}

export interface Geocoder {
  /**
   * Géocode une adresse, ou `null` si introuvable/vide. Cache d'abord.
   * `city` est la commune attendue : elle écarte une rue homonyme ailleurs.
   */
  geocode(address: string, city?: string | null): Promise<PlacedAddress | null>;
}

/** Cache en mémoire, pour les tests. */
export function createMemoryGeocodeCache(): GeocodeCacheStore {
  const entries = new Map<string, GeocodeEntry>();
  return {
    async get(query) {
      return entries.get(query) ?? null;
    },
    async set(query, entry) {
      entries.set(query, entry);
    },
  };
}

/**
 * Clé de cache d'une adresse (espaces, casse).
 *
 * « v3 » : les résultats mémorisés avant le 2026-09-16 venaient d'une résolution
 * qui abandonnait dès qu'un nom d'immeuble faisait baisser le score BAN — dont
 * des ÉCHECS mémorisés pour des adresses parfaitement plaçables. Ils sont
 * ignorés, et chaque adresse est replacée.
 */
export function geocodeCacheKey(address: string, city?: string | null): string {
  const parts = [address, city].filter((part): part is string => (part ?? '').trim() !== '');
  return `v3 ${parts.join(' ').trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Ce que la BAN a situé : un numéro ou une rue. Une commune, un lieu-dit ou un
 * code postal ne placent pas un logement — relevé du 2026-09-15 : cinq annonces
 * de l'avenue Sainte-Marguerite (06200), publiées avec « 06000 », posées au
 * centre du 06000, près du port.
 */
const PLACED_TYPES = new Set(['housenumber', 'street']);

interface BanProperties {
  readonly score?: number;
  readonly type?: string;
  readonly city?: string;
  readonly citycode?: string;
  /** L'adresse entière, telle que la BAN l'écrit : « 52 Rue Smollett 06300 Nice ». */
  readonly label?: string;
  readonly postcode?: string;
  readonly housenumber?: string;
  /** Nom de la voie (`street` sur un numéro, `name` sur une voie). */
  readonly street?: string;
  readonly name?: string;
}

interface BanFeature {
  readonly geometry?: { readonly coordinates?: readonly [number, number] };
  readonly properties?: BanProperties;
}

/** Minuscules, sans accents ni ponctuation : « Saint-André » → « saint andre ». */
const words = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** « Saint-Laurent-du-Var » et « saint laurent du var » désignent la même commune. */
const sameCity = (a: string, b: string): boolean => words(a) === words(b);

/** Types de voie : ils disent où commence le NOM de la voie. */
const STREET_TYPES = new Set(
  (
    'rue rues r av avenue avenues ave bd boulevard boulevards bld blvd chemin chemins che ch ' +
    'allee allees impasse impasses imp place places pl route routes rte quai quais corniche ' +
    'corniches promenade promenades prom traverse traverses montee montees descente descentes ' +
    'square squares voie voies sente sentes sentier sentiers cours crs passage passages pass ' +
    'lotissement esplanade esplanades parvis bis ter quater'
  ).split(' '),
);

const ARTICLES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et']);

/** La BAN écrit les titres en toutes lettres, les annonces les abrègent. */
const TITLES = new Map(
  Object.entries({
    dr: 'docteur',
    st: 'saint',
    ste: 'sainte',
    gal: 'general',
    gen: 'general',
    gnl: 'general',
    col: 'colonel',
    cdt: 'commandant',
    cmdt: 'commandant',
    mal: 'marechal',
    mar: 'marechal',
    pr: 'professeur',
    prof: 'professeur',
    pdt: 'president',
    mgr: 'monseigneur',
  }),
);
const expand = (word: string): string => TITLES.get(word) ?? word;

/**
 * Deux mots à une faute près : une lettre ajoutée, retirée ou changée.
 *
 * SIX LETTRES AU MOINS, sinon « pont » et « port » seraient le même mot. Au
 * delà, une lettre d'écart est presque toujours une coquille de saisie : les
 * sources écrivent l'adresse à la main, et « Smolett » pour « Smollett » ou
 * « Gambeta » pour « Gambetta » faisait rejeter le bon résultat de la BAN —
 * donc pas de point sur la carte, et pas de correction d'adresse non plus.
 */
function uneFauteApres(a: string, b: string): boolean {
  if (a.length < 6 || b.length < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [court, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let fautes = 0;
  while (i < court.length && j < long.length) {
    if (court[i] === long[j]) {
      i += 1;
      j += 1;
      continue;
    }
    fautes += 1;
    if (fautes > 1) return false;
    // Longueurs égales : une lettre CHANGÉE, on avance des deux côtés.
    // Longueurs différentes : une lettre EN TROP dans le long.
    if (court.length === long.length) i += 1;
    j += 1;
  }
  return fautes + (long.length - j) + (court.length - i) <= 1;
}

/** Deux mots se correspondent, tronqué, collé ou à une faute près. */
const near = (a: string, b: string): boolean =>
  a === b ||
  (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) ||
  uneFauteApres(a, b);

/** Mots du NOM d'une voie : sans le type, les articles ni les numéros. */
const nameWords = (street: string): string[] =>
  words(street)
    .split(' ')
    .filter((w) => w.length > 1 && !STREET_TYPES.has(w) && !ARTICLES.has(w) && !/^\d+$/.test(w))
    .map(expand);

/**
 * Premier mot du nom de la voie demandée : « 86 boulevard Bishoffeim palais
 * saint Charles » → `bishoffeim`.
 *
 * C'EST LUI QUI INTERDIT D'INVENTER UN POINT. Sur cette adresse la BAN propose
 * « Chemin Saint-Charles » — cohérent avec la fin du texte, à un kilomètre de
 * la bonne voie. Exiger le PREMIER mot du nom, et non n'importe lequel, écarte
 * ce qui ne vient que du nom d'immeuble ou de la description avalée.
 */
function anchorWord(address: string): string | null {
  const tokens = words(address)
    .split(' ')
    .filter((t) => t !== '');
  const typeAt = tokens.findIndex((t) => STREET_TYPES.has(t));
  const rest = typeAt >= 0 ? tokens.slice(typeAt + 1) : tokens;
  const first = rest.find(
    (t) => t.length > 1 && !ARTICLES.has(t) && !STREET_TYPES.has(t) && !/^\d/.test(t),
  );
  return first === undefined ? null : expand(first);
}

/** Queue d'adresse qui n'aide pas la BAN et qui la gêne : pays, région, code postal. */
const TAIL_NOISE = /^(france|fr|provence alpes cote d azur|paca|alpes maritimes)$/;

/**
 * Coupe l'adresse à sa partie utile : « 8 Bd Jean Jaurès, 06300 Nice, France »
 * → « 8 Bd Jean Jaurès ». Sans cette coupe la BAN ne rend que des escaliers du
 * quartier ; avec elle, le bon numéro.
 */
export function cleanAddress(address: string, city?: string | null): string {
  const kept: string[] = [];
  for (const segment of address.split(',')) {
    const normalized = words(segment);
    if (normalized === '' || /\b\d{5}\b/.test(normalized) || TAIL_NOISE.test(normalized)) break;
    if ((city ?? '') !== '' && normalized === words(city as string)) break;
    kept.push(segment.trim());
  }
  const joined = kept.join(', ').replace(/[\s/,;.-]+$/, '');
  return joined.length >= 4 ? joined : address.replace(/[\s/,;-]+$/, '');
}

/**
 * Le numéro en tête d'une adresse (« 52 bis Rue X » → « 52 »), ou `null`.
 *
 * SERT DE GARDE-FOU, pas d'information : la BAN ne réécrit l'adresse que si
 * elle a placé CE numéro-là. Sans cette comparaison, « 52 Smolett » corrigé en
 * « 5 Rue Smollett » passerait pour une amélioration.
 */
export function leadingNumber(address: string): string | null {
  const match = /^\s*(\d{1,4})(?!\d)/.exec(address);
  return match === null ? null : (match[1] as string);
}

/** Un numéro l'emporte sur une voie ; à type égal, le meilleur score. */
const rank = (feature: BanFeature | null): number =>
  feature === null
    ? -1
    : (feature.properties?.type === 'housenumber' ? 1 : 0) + (feature.properties?.score ?? 0);

/** Le meilleur résultat qui situe vraiment l'adresse demandée, ou `null`. */
function placedFeature(
  features: readonly BanFeature[],
  criteria: {
    readonly anchor: string;
    readonly minScore: number;
    readonly cityCode: string | null;
    readonly city: string | null;
  },
): { best: BanFeature | null; kept: readonly BanFeature[] } {
  const kept = features.filter((feature) => {
    const props = feature.properties ?? {};
    if (!PLACED_TYPES.has(props.type ?? '') || feature.geometry?.coordinates === undefined) {
      return false;
    }
    if ((props.score ?? 0) < criteria.minScore) return false;
    // La commune : par son code INSEE quand on le connaît — il ne souffre ni
    // des abréviations (« st andre ») ni des quartiers collés au nom de ville.
    if (criteria.cityCode !== null) {
      if (props.citycode !== criteria.cityCode) return false;
    } else if (
      criteria.city !== null &&
      props.city !== undefined &&
      !sameCity(props.city, criteria.city)
    ) {
      return false;
    }
    const resultWords = nameWords(props.street ?? props.name ?? '');
    return resultWords.length > 0 && resultWords.some((w) => near(w, criteria.anchor));
  });

  return { best: kept.sort((a, b) => rank(b) - rank(a))[0] ?? null, kept };
}

/**
 * L'ADRESSE ÉCRITE PAR LA BAN, et à quelles conditions on y touche.
 *
 * UN NUMÉRO : on réécrit l'adresse entière, à condition que la BAN ait placé
 * LE NUMÉRO ANNONCÉ. Deux garde-fous plutôt qu'un seuil de score : le score
 * tombe vers 0,4 sur une adresse alourdie d'un nom d'immeuble tout en
 * désignant le bon numéro, tandis qu'un numéro qui ne correspond pas est faux
 * quel que soit le score.
 *
 * PAS DE NUMÉRO : il n'y en a aucun à perdre, et le code postal manque
 * justement là. « Boulevard Louis Delfino, Nice » devient « Boulevard Général
 * Louis Delfino 06300 Nice » — la voie officielle et son code, que la source
 * n'écrivait pas.
 *
 * MAIS SEULEMENT SI LA VOIE EST SANS AMBIGUÏTÉ. Une longue artère peut
 * traverser deux codes postaux, et la BAN rend alors plusieurs voies du même
 * nom. En donner un au hasard placerait l'annonce dans le mauvais quartier
 * avec l'aplomb d'une donnée officielle : dès que les candidats ne s'accordent
 * pas sur un seul code, on n'écrit rien.
 */
function adresseNormalisee(
  best: BanFeature | null,
  candidats: readonly BanFeature[],
  address: string,
): { label: string | null; postcode: string | null } {
  const props = best?.properties;
  if (props?.label === undefined) return { label: null, postcode: null };
  const annonce = leadingNumber(address);

  if (annonce !== null) {
    return props.type === 'housenumber' && props.housenumber === annonce
      ? { label: props.label, postcode: props.postcode ?? null }
      : { label: null, postcode: null };
  }

  if (props.type !== 'street') return { label: null, postcode: null };
  const codes = new Set(
    candidats
      .filter((one) => one.properties?.type === 'street')
      .map((one) => one.properties?.postcode)
      .filter((code): code is string => code !== undefined),
  );
  return codes.size === 1
    ? { label: props.label, postcode: props.postcode ?? null }
    : { label: null, postcode: null };
}

export function createGeocoder(options: GeocoderOptions): Geocoder {
  const fetchImpl = options.fetchImpl ?? fetch;
  // Plancher bas : c'est la cohérence avec la voie demandée qui protège, pas le
  // score — une adresse alourdie d'un nom d'immeuble tombe vers 0,4 tout en
  // désignant le bon numéro.
  const minScore = options.minScore ?? 0.25;
  // Une commune se résout une fois par run : quelques villes, autant d'appels.
  const cityCodes = new Map<string, string | null>();

  const search = async (params: Record<string, string>): Promise<readonly BanFeature[]> => {
    const url = `${BAN_ENDPOINT}?${new URLSearchParams({ ...params, limit: '8' }).toString()}`;
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': options.userAgent, Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: readonly BanFeature[] };
    return data.features ?? [];
  };

  /**
   * Code INSEE de la commune. « nice fleurs gambetta » — un quartier collé au
   * nom de ville — ne trouve rien : on retire alors le dernier mot, jusqu'à
   * retomber sur « nice ».
   */
  const cityCodeOf = async (city: string | null): Promise<string | null> => {
    if (city === null || city.trim() === '') return null;
    const memo = cityCodes.get(city);
    if (memo !== undefined) return memo;

    let code: string | null = null;
    let parts = city.trim().split(/\s+/);
    while (parts.length > 0 && code === null) {
      const found = (await search({ q: parts.join(' '), type: 'municipality' })).find(
        (feature) =>
          feature.properties?.type === 'municipality' && (feature.properties.score ?? 0) >= 0.6,
      );
      code = found?.properties?.citycode ?? null;
      parts = parts.slice(0, -1);
    }
    cityCodes.set(city, code);
    return code;
  };

  return {
    async geocode(rawAddress: string, city: string | null = null): Promise<PlacedAddress | null> {
      const trimmed = rawAddress.trim();
      if (trimmed.length < 4) return null;

      const key = geocodeCacheKey(trimmed, city);
      const cached = await options.cache.get(key);
      if (cached !== null) {
        // Résultat connu (succès ou échec mémorisé) : aucun appel réseau.
        return cached.lat !== null && cached.lon !== null
          ? {
              latitude: cached.lat,
              longitude: cached.lon,
              label: cached.label ?? null,
              postcode: cached.postcode ?? null,
            }
          : null;
      }

      let coords: Coordinates | null = null;
      let placed: { label: string | null; postcode: string | null } = {
        label: null,
        postcode: null,
      };
      try {
        const address = cleanAddress(trimmed, city);
        const anchor = anchorWord(address);
        // Pas de nom de voie identifiable (« M3.2 », « TAMANGO 4 ») : rien à
        // vérifier, donc rien à placer. Mieux vaut pas de point qu'un faux.
        if (anchor !== null) {
          const cityCode = await cityCodeOf(city);
          // DEUX FORMULATIONS, ET NON UNE. La ville dans la question tolère le
          // bruit mais laisse la BAN partir dans une autre commune ; la commune
          // imposée par son code INSEE recadre mais supporte mal le bruit.
          // Chacune rattrape ce que l'autre rate.
          const attempts: Array<Record<string, string>> = [
            { q: [address, city].filter((p) => (p ?? '') !== '').join(' ') },
          ];
          if (cityCode !== null) attempts.push({ q: address, citycode: cityCode });

          let best: BanFeature | null = null;
          let candidats: readonly BanFeature[] = [];
          for (const params of attempts) {
            const found = placedFeature(await search(params), { anchor, minScore, cityCode, city });
            if (rank(found.best) > rank(best)) {
              best = found.best;
              candidats = found.kept;
            }
            // Un numéro sûr : inutile de redemander autrement.
            if (rank(best) >= 1.8) break;
          }

          // BAN renvoie [longitude, latitude] (ordre GeoJSON).
          const position = best?.geometry?.coordinates;
          if (position !== undefined) coords = { latitude: position[1], longitude: position[0] };

          placed = adresseNormalisee(best, candidats, address);
        }
      } catch {
        // Panne réseau : on ne met PAS en cache un échec transitoire, pour
        // pouvoir réessayer au prochain run.
        return null;
      }

      await options.cache.set(key, {
        lat: coords?.latitude ?? null,
        lon: coords?.longitude ?? null,
        geocodedAt: new Date(options.nowMs).toISOString(),
        label: placed.label,
        postcode: placed.postcode,
      });
      return coords === null ? null : { ...coords, ...placed };
    },
  };
}
