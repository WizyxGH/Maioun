/**
 * Le diagnostic de performance énergétique, cherché à l'adresse.
 *
 * IL EST OBLIGATOIRE DANS UNE ANNONCE DE LOCATION DEPUIS 2021, et la moitié
 * des sources ne le publie pas : sur 2 708 occurrences actives le 2026-09-10,
 * 589 seulement portaient une étiquette. Six cents avaient une adresse de rue
 * et rien d'autre. Or l'information existe, publique et gratuite.
 *
 * L'ADEME PUBLIE TOUS LES DIAGNOSTICS. Quinze millions et demi de lignes,
 * 15 630 pour le seul code postal 06200, avec l'adresse normalisée par la Base
 * Adresse Nationale, l'étiquette, la surface habitable et l'année de
 * construction. Aucune clé, aucun quota déclaré : c'est une API d'État prévue
 * pour l'automatisation, et on la préfère donc à tout scraping.
 *
 * ON N'APPARIE QUE CE QUI EST SÛR. Un immeuble porte des dizaines de logements
 * et donc des dizaines de diagnostics : l'adresse seule ne désigne personne.
 * C'est la SURFACE qui tranche — deux logements de la même adresse à moins d'un
 * mètre carré près sont rarissimes. Sans surface, ou sans candidat unique, on
 * ne rend rien : une étiquette fausse vaut moins qu'une étiquette absente,
 * puisqu'elle décide d'un filtre.
 *
 * ÉCONOMIE : une adresse ne déménage pas et un diagnostic vaut dix ans.
 * Chaque recherche est donc mise en cache, les échecs compris — sans quoi les
 * six cents annonces sans DPE rappelleraient l'ADEME à chaque collecte.
 */

/** Le jeu de données des logements existants, millésime en cours. */
const ADEME_ENDPOINT = 'https://data.ademe.fr/data-fair/api/v1/datasets/dpe03existant/lines';

/**
 * Écart de surface toléré entre l'annonce et le diagnostic, en m².
 *
 * DEUX MÈTRES CARRÉS, parce que les deux ne mesurent pas tout à fait la même
 * chose : l'annonce donne souvent la surface Carrez, le diagnostic la surface
 * habitable, et elles diffèrent des placards et des sous-pentes. Au-delà, ce
 * n'est plus une différence de méthode mais un autre logement.
 */
const SURFACE_TOLERANCE = 2;

/** Diagnostics rapportés au plus par adresse. Un immeuble en a rarement plus. */
const MAX_CANDIDATES = 50;

/** Ce que le diagnostic apprend d'un logement. */
export interface DpeRecord {
  /** Étiquette énergie, « A » à « G ». */
  readonly label: string;
  /** Étiquette climat, « A » à « G ». `null` si absente. */
  readonly gesLabel: string | null;
  /** Année de construction, que ne publie aucune source d'annonces. */
  readonly builtYear: number | null;
  /** Surface habitable mesurée par le diagnostic, en m². */
  readonly area: number;
}

/** Entrée de cache. `record` à `null` mémorise une recherche infructueuse. */
export interface DpeEntry {
  readonly record: DpeRecord | null;
  readonly searchedAt: string;
}

export interface DpeCacheStore {
  get(key: string): Promise<DpeEntry | null>;
  set(key: string, entry: DpeEntry): Promise<void>;
}

export interface DpeLookupOptions {
  readonly cache: DpeCacheStore;
  readonly nowMs: number;
  readonly fetchImpl?: typeof fetch;
  readonly userAgent: string;
}

export interface DpeLookup {
  /**
   * Le diagnostic d'un logement, ou `null` si l'appariement n'est pas certain.
   *
   * @param address adresse de voie telle que l'annonce la donne
   * @param postalCode code postal — l'API filtre dessus, il est obligatoire
   * @param area surface annoncée, qui départage les logements d'un immeuble
   */
  find(address: string, postalCode: string, area: number): Promise<DpeRecord | null>;
}

/** Cache en mémoire, pour les tests. */
export function createMemoryDpeCache(): DpeCacheStore {
  const entries = new Map<string, DpeEntry>();
  return {
    async get(key) {
      return entries.get(key) ?? null;
    },
    async set(key, entry) {
      entries.set(key, entry);
    },
  };
}

/**
 * Forme comparable d'une adresse : minuscules, sans accent, abréviations
 * développées.
 *
 * LES DEUX CÔTÉS ABRÈGENT DIFFÉREMMENT. Nos sources écrivent « 9 Bd Carlone »,
 * l'ADEME « 9 Boulevard Carlone » — et l'inverse arrive aussi. Sans ce
 * développement, une adresse sur trois ne se reconnaissait pas elle-même.
 */
export function comparableAddress(address: string): string {
  return address
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bbd\b/g, 'boulevard')
    .replace(/\bav\b/g, 'avenue')
    .replace(/\bbld\b/g, 'boulevard')
    .replace(/\bch\b/g, 'chemin')
    .replace(/\bimp\b/g, 'impasse')
    .replace(/\bpl\b/g, 'place')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\brte\b/g, 'route')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La clé de cache : l'adresse, le code postal et la surface au m² près. */
export function dpeCacheKey(address: string, postalCode: string, area: number): string {
  return `${comparableAddress(address)}|${postalCode}|${Math.round(area)}`;
}

/** Le numéro de voie en tête d'adresse, ou `null`. */
function houseNumber(address: string): string | null {
  return /^\s*(\d{1,4})/.exec(address)?.[1] ?? null;
}

/** Une ligne du jeu de données, réduite à ce qu'on en lit. */
interface AdemeLine {
  readonly adresse_ban?: unknown;
  readonly etiquette_dpe?: unknown;
  readonly etiquette_ges?: unknown;
  readonly surface_habitable_logement?: unknown;
  readonly annee_construction?: unknown;
}

/** `true` si l'étiquette est une classe valide. L'API en publie d'illisibles. */
function isLabel(value: unknown): value is string {
  return typeof value === 'string' && /^[A-G]$/.test(value);
}

/**
 * Le diagnostic qui correspond, parmi ceux de l'adresse.
 *
 * TROIS CONDITIONS, ET LES TROIS COMPTENT : même voie, même numéro, et surface
 * concordante. Le numéro est ce qui distingue le 9 du 90 dans une recherche
 * plein texte, et son absence des deux côtés interdit l'appariement — un
 * immeuble sans numéro n'est pas une adresse.
 *
 * @returns le diagnostic, ou `null` si aucun candidat n'est CERTAIN.
 */
export function pickMatch(
  lines: readonly AdemeLine[],
  address: string,
  area: number,
): DpeRecord | null {
  const numero = houseNumber(address);
  if (numero === null) return null;
  const notre = comparableAddress(address);

  const candidats = lines.filter((line) => {
    if (typeof line.adresse_ban !== 'string') return false;
    const leur = comparableAddress(line.adresse_ban);
    // Le numéro d'abord : c'est lui qui distingue le 9 du 90.
    if (houseNumber(leur) !== numero) return false;
    // Puis la voie : l'un des deux libellés doit contenir l'autre, l'ADEME
    // ajoutant le code postal et la commune que nos sources omettent.
    return leur.startsWith(notre) || notre.startsWith(leur.replace(/ \d{5}.*$/, ''));
  });

  const surSurface = candidats.filter((line) => {
    const mesuree = Number(line.surface_habitable_logement);
    return Number.isFinite(mesuree) && Math.abs(mesuree - area) <= SURFACE_TOLERANCE;
  });

  /**
   * UN SEUL CANDIDAT, OU RIEN. Deux diagnostics de même adresse et de même
   * surface sont soit le même logement rediagnostiqué, soit deux logements
   * jumeaux — et l'on ne sait pas lequel. S'ils s'accordent sur l'étiquette,
   * le doute est sans conséquence ; sinon, on renonce.
   */
  const labels = new Set(
    surSurface.map((line) => line.etiquette_dpe).filter((value): value is string => isLabel(value)),
  );
  if (labels.size !== 1) return null;

  const retenu = surSurface.find((line) => isLabel(line.etiquette_dpe));
  if (retenu === undefined) return null;

  const annee = Number(retenu.annee_construction);
  return {
    label: String(retenu.etiquette_dpe),
    gesLabel: isLabel(retenu.etiquette_ges) ? retenu.etiquette_ges : null,
    builtYear: Number.isFinite(annee) && annee > 1700 && annee <= 2100 ? annee : null,
    area: Number(retenu.surface_habitable_logement),
  };
}

/** Construit le chercheur de diagnostics. */
export function createDpeLookup(options: DpeLookupOptions): DpeLookup {
  const call = options.fetchImpl ?? fetch;

  return {
    async find(address, postalCode, area) {
      if (address.trim() === '' || !/^\d{5}$/.test(postalCode) || !Number.isFinite(area)) {
        return null;
      }

      const key = dpeCacheKey(address, postalCode, area);
      const cached = await options.cache.get(key);
      if (cached !== null) return cached.record;

      const url = new URL(ADEME_ENDPOINT);
      url.searchParams.set('size', String(MAX_CANDIDATES));
      url.searchParams.set(
        'select',
        'adresse_ban,etiquette_dpe,etiquette_ges,surface_habitable_logement,annee_construction',
      );
      url.searchParams.set('code_postal_ban_eq', postalCode);
      // Recherche plein texte sur la voie : l'API n'expose pas de filtre exact
      // sur l'adresse, et la ponctuation la fait échouer.
      url.searchParams.set('q', comparableAddress(address));

      let record: DpeRecord | null = null;
      try {
        const response = await call(url, { headers: { 'User-Agent': options.userAgent } });
        if (response.ok) {
          const body = (await response.json()) as { results?: readonly AdemeLine[] };
          record = pickMatch(body.results ?? [], address, area);
        }
      } catch {
        /**
         * L'ÉCHEC N'EST JAMAIS BLOQUANT, et il n'est pas non plus MÉMORISÉ :
         * une panne réseau n'est pas une absence de diagnostic. Le mettre en
         * cache condamnerait l'annonce à ne jamais être retrouvée.
         */
        return null;
      }

      await options.cache.set(key, { record, searchedAt: new Date(options.nowMs).toISOString() });
      return record;
    },
  };
}
