/**
 * Le robots.txt, APPLIQUÉ et non plus seulement lu (§10).
 *
 * Chaque source déclarait ses `allowedPaths` après avoir lu le fichier, et rien
 * ne les vérifiait : c'était une note. Relevé du 2026-09-14 : la FNAIM interdit
 * `/annonce-immobiliere/*\/18-location*`, la règle avait échappé au relevé, et
 * la source lisait vingt fiches interdites par passage. Le client HTTP consulte
 * désormais le fichier avant chaque page, et refuse ce qu'il interdit.
 *
 * Conforme à la RFC 9309 : le groupe qui nomme le robot, sinon `*` ; la règle la
 * plus longue l'emporte, `Allow` à égalité ; `*` joker et `$` fin d'adresse. Un
 * fichier absent (4xx) autorise tout ; un site qui ne répond pas l'interdit, le
 * temps du passage. Le `Crawl-delay` du groupe retenu règle le délai entre deux
 * requêtes au site (voir le client HTTP).
 */

export interface RobotsRule {
  readonly allow: boolean;
  readonly pattern: string;
  readonly regex: RegExp;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, (char) => `\\${char}`))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export interface RobotsFile {
  readonly rules: readonly RobotsRule[];
  /**
   * `Crawl-delay` du même groupe, en secondes, ou `null`. Hors RFC 9309 mais
   * répandu (Netty, WPCasa) : une demande écrite se respecte.
   */
  readonly crawlDelaySeconds: number | null;
}

/**
 * Les règles qui valent pour ce robot : son groupe s'il est nommé, sinon `*`.
 * `productToken` est le nom du robot sans version (« MaiounBot »).
 */
export function parseRobots(text: string, productToken: string): readonly RobotsRule[] {
  return parseRobotsFile(text, productToken).rules;
}

/** Règles et `Crawl-delay` qui valent pour ce robot. */
export function parseRobotsFile(text: string, productToken: string): RobotsFile {
  const named: RobotsRule[] = [];
  const star: RobotsRule[] = [];
  let namedDelay: number | null = null;
  let starDelay: number | null = null;
  let agents: string[] = [];
  let readingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      // Plusieurs `User-agent` d'affilée partagent le même groupe.
      agents = readingAgents ? [...agents, value.toLowerCase()] : [value.toLowerCase()];
      readingAgents = true;
      continue;
    }
    readingAgents = false;
    const forUs = agents.includes(productToken.toLowerCase());
    const forAll = agents.includes('*');

    if (key === 'crawl-delay') {
      const seconds = Number(value.replace(',', '.'));
      if (value === '' || !Number.isFinite(seconds) || seconds < 0) continue;
      if (forUs) namedDelay = seconds;
      if (forAll) starDelay = seconds;
      continue;
    }
    if ((key !== 'allow' && key !== 'disallow') || value === '') continue;

    const rule = { allow: key === 'allow', pattern: value, regex: toRegex(value) };
    if (forUs) named.push(rule);
    if (forAll) star.push(rule);
  }
  const ours = named.length > 0 || namedDelay !== null;
  return {
    rules: named.length > 0 ? named : star,
    crawlDelaySeconds: ours ? namedDelay : starDelay,
  };
}

/** La règle qui décide pour ce chemin (querystring comprise), ou `null` : autorisé. */
export function blockingRule(rules: readonly RobotsRule[], path: string): RobotsRule | null {
  let winner: RobotsRule | null = null;
  for (const rule of rules) {
    if (!rule.regex.test(path)) continue;
    const longer = winner === null || rule.pattern.length > winner.pattern.length;
    const tieAllow = winner !== null && rule.pattern.length === winner.pattern.length && rule.allow;
    if (longer || tieAllow) winner = rule;
  }
  return winner !== null && !winner.allow ? winner : null;
}

export class RobotsDisallowedError extends Error {
  constructor(
    public readonly url: string,
    public readonly rule: string,
  ) {
    super(`robots.txt interdit ${url} (${rule}) — page non demandée`);
    this.name = 'RobotsDisallowedError';
  }
}

export interface RobotsGate {
  /** Lève `RobotsDisallowedError` si la page est interdite. */
  check(url: string): Promise<void>;
  /** `Crawl-delay` demandé pour ce site, en millisecondes ; 0 sans demande. */
  crawlDelayMs(url: string): Promise<number>;
}

/**
 * Un contrôleur partagé par toutes les sources d'un passage : chaque fichier
 * n'est demandé qu'une fois, même par deux sources d'un même site en parallèle.
 */
export function createRobotsGate(options: {
  readonly userAgent: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly retryDelayMs?: number;
}): RobotsGate {
  const doFetch = options.fetchImpl ?? fetch;
  const productToken = options.userAgent.split('/')[0] ?? options.userAgent;
  const byOrigin = new Map<string, Promise<RobotsFile | 'unreachable'>>();
  const EMPTY: RobotsFile = { rules: [], crawlDelaySeconds: null };

  const loadOnce = async (origin: string): Promise<RobotsFile | 'unreachable'> => {
    try {
      const response = await doFetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': options.userAgent },
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
      if (response.status >= 500) return 'unreachable';
      if (!response.ok) return EMPTY;
      return parseRobotsFile(await response.text(), productToken);
    } catch {
      return 'unreachable';
    }
  };

  // Une seconde tentative : un raté réseau d'un instant ne doit pas couper une
  // source pour tout le passage.
  const load = async (origin: string): Promise<RobotsFile | 'unreachable'> => {
    const first = await loadOnce(origin);
    if (first !== 'unreachable') return first;
    await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 2_000));
    return loadOnce(origin);
  };

  const fileOf = (origin: string): Promise<RobotsFile | 'unreachable'> => {
    const known = byOrigin.get(origin) ?? load(origin);
    byOrigin.set(origin, known);
    return known;
  };

  return {
    async check(url) {
      const parsed = new URL(url);
      const file = await fileOf(parsed.origin);
      if (file === 'unreachable') throw new RobotsDisallowedError(url, 'robots.txt injoignable');
      const rule = blockingRule(file.rules, `${parsed.pathname}${parsed.search}`);
      if (rule !== null) throw new RobotsDisallowedError(url, `Disallow: ${rule.pattern}`);
    },

    async crawlDelayMs(url) {
      const file = await fileOf(new URL(url).origin);
      return file === 'unreachable' ? 0 : (file.crawlDelaySeconds ?? 0) * 1000;
    },
  };
}
