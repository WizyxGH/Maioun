/**
 * LES CANDIDATS ENDORMIS — ceux qu'on a refusés pour un motif RÉVERSIBLE.
 *
 * Une cinquantaine de sources ont été écartées ces dernières semaines : site en
 * maintenance, domaine mort, anti-bot, `robots.txt` qui ferme, volume nul dans
 * le périmètre. Chaque étude se termine par « à resonder dans quelques
 * semaines », et personne ne le fait — Confiance Immobilière serait restée hors
 * ligne pour nous longtemps après son retour.
 *
 * Cette liste rend ces verdicts exécutables : pour chaque candidat, le motif du
 * refus, la date du relevé, et surtout LA PREUVE qui dirait que la situation a
 * changé. Les faits viennent de `docs/sources.md`, fiche par fiche.
 *
 * ZÉRO FAUX POSITIF, C'EST LA RÈGLE. Un 200 ne prouve rien : le site de
 * Confiance Immobilière répond 200 avec une page « Maintenance », un domaine
 * garé répond 200 avec la page de son hébergeur, et plusieurs portails rendent
 * leur accueil à la place d'une annonce absente. On ne parle donc que sur une
 * preuve POSITIVE de contenu exploitable — des adresses d'annonces de location
 * du périmètre, en nombre — ou, pour un refus de `robots.txt`, la disparition
 * de la règle qui fermait. Dans le doute, on se tait.
 *
 * ÉCONOME ET LENT : un candidat par jour au plus, deux ou trois requêtes, et
 * jamais deux fois le même candidat dans la quinzaine.
 */

import type { Logger } from '../core/logger.js';
import { blockingRule, parseRobotsFile, type RobotsGate } from '../core/robots.js';
import type { SourceAlert } from '../notify/source-health.js';

/** Ce qui a fait écarter le candidat, et qui peut cesser d'être vrai. */
export type DormantReason =
  /** Site en maintenance, domaine garé, serveur injoignable. */
  | 'offline'
  /** Le site répond, mais derrière un pare-feu qui refuse les robots. */
  | 'antiBot'
  /** Le `robots.txt` interdit précisément ce qu'on voudrait lire. */
  | 'robots'
  /** Accès conforme, mais aucune annonce du périmètre. */
  | 'noVolume';

/** Comment on vérifie, et ce qui compterait comme preuve. */
export type DormantProbe =
  | {
      /** On lit le `robots.txt`, et RIEN D'AUTRE : c'est lui qui refusait. */
      readonly kind: 'robots';
      /** Le chemin que le fichier interdit aujourd'hui. */
      readonly path: string;
    }
  | {
      /** On lit le sitemap : c'est l'inventaire que le site publie lui-même. */
      readonly kind: 'sitemap';
      /** Adresse relevée dans l'étude ; sinon celle que déclare le `robots.txt`. */
      readonly url?: string;
      readonly minMatches?: number;
      /** Forme d'adresse propre au candidat, quand l'étude l'a relevée. */
      readonly pattern?: RegExp;
    }
  | {
      /** On demande UNE page, celle que l'étude a relevée comme autorisée. */
      readonly kind: 'page';
      readonly url: string;
      readonly minMatches?: number;
      readonly pattern?: RegExp;
    };

export interface DormantCandidate {
  readonly id: string;
  readonly name: string;
  /** Origine telle que l'étude l'a jointe (le schéma compte : certains n'ont pas de HTTPS valide). */
  readonly origin: string;
  readonly reason: DormantReason;
  /** Date du relevé qui a conclu au refus. */
  readonly checkedOn: string;
  /** Le motif, en une ligne. */
  readonly refusal: string;
  /** Ce qui prouverait que la situation a changé, en une ligne. */
  readonly wakesIf: string;
  readonly probe: DormantProbe;
}

/** Annonces du périmètre à trouver pour parler, sauf mention contraire. */
const DEFAULT_MIN_MATCHES = 3;

/**
 * LA LISTE, dérivée de `docs/sources.md`.
 *
 * Chaque entrée reprend un verdict daté et le traduit en une vérification que
 * la machine sait faire. Rien n'y est deviné : les adresses sondées sont celles
 * que l'étude a relevées, ou l'emplacement conventionnel d'un `robots.txt` et
 * d'un sitemap.
 */
export const DORMANT_CANDIDATES: readonly DormantCandidate[] = [
  // ── Sites morts ou en maintenance ───────────────────────────────────────
  {
    id: 'confiance-immobiliere',
    name: 'Confiance Immobilière',
    origin: 'http://www.confianceimmobiliere.com',
    reason: 'offline',
    checkedOn: '2026-09-17',
    refusal: 'racine en « Maintenance », anciennes adresses en 404, hors ligne depuis juin',
    wakesIf: 'son sitemap publie de nouveau des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'locatme',
    name: "Locat'me",
    origin: 'http://locatme.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'domaine garé chez OVH, page « Site en construction »',
    wakesIf: 'un sitemap rend des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'somhome',
    name: 'Somhome',
    origin: 'https://somhome.com',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'plus aucun enregistrement DNS',
    wakesIf: 'le domaine résout de nouveau et publie des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'louervite',
    name: 'Louervite',
    origin: 'https://louervite.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'le domaine résout mais rien n’écoute, ni en 443 ni en 80',
    wakesIf: 'un serveur répond et son sitemap porte des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'lesparticuliers',
    name: 'LesParticuliers',
    origin: 'https://www.lesparticuliers.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'serveur injoignable sur les deux ports',
    wakesIf: 'un serveur répond et son sitemap porte des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'annoncesjaunes',
    name: 'Annoncesjaunes',
    origin: 'http://www.annoncesjaunes.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'parking Verisign, 94 octets de HTML vide',
    wakesIf: 'un sitemap rend des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'webmycar',
    name: 'Webmycar',
    origin: 'http://webmycar.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'parking OVH, page « Site en construction » — et le nom annonçait de l’automobile',
    wakesIf: 'un sitemap rend des locations du périmètre',
    probe: { kind: 'sitemap' },
  },
  {
    id: 'annonces-de-france',
    name: 'Annonces de France',
    origin: 'https://annoncesdefrance.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'seul ce domaine résout, et il ne répond pas en 443',
    wakesIf: 'un serveur répond et son sitemap porte des locations du périmètre',
    probe: { kind: 'sitemap' },
  },

  // ── Pare-feu anti-robot ─────────────────────────────────────────────────
  {
    id: 'pap',
    name: 'PAP',
    origin: 'https://www.pap.fr',
    reason: 'antiBot',
    checkedOn: '2026-09-16',
    refusal: 'défi JavaScript Cloudflare en 403, pour fetch comme pour curl',
    wakesIf: 'la page de Nice, autorisée par son robots.txt, rend enfin des annonces',
    probe: { kind: 'page', url: 'https://www.pap.fr/annonce/locations-nice-06-g8979' },
  },
  {
    id: 'entreparticuliers',
    name: 'Entreparticuliers',
    origin: 'https://www.entreparticuliers.com',
    reason: 'antiBot',
    checkedOn: '2026-09-16',
    refusal: 'robots.txt accueillant, mais toute page en 403 « Sorry, you have been blocked »',
    wakesIf: 'le sitemap qu’il déclare répond et porte des locations du périmètre',
    probe: { kind: 'sitemap', url: 'https://www.entreparticuliers.com/sitemap.xml' },
  },
  {
    id: 'lacartedescolocs',
    name: 'La Carte des Colocs',
    origin: 'https://www.lacartedescolocs.fr',
    reason: 'antiBot',
    checkedOn: '2026-09-16',
    refusal: 'défi Cloudflare en 403 sur toutes les pages d’annonces',
    wakesIf: 'la page de Nice, que son robots.txt laisse ouverte, rend des colocations',
    probe: { kind: 'page', url: 'https://www.lacartedescolocs.fr/colocations/france/nice' },
  },
  {
    id: 'seloger',
    name: 'SeLoger',
    origin: 'https://www.seloger.com',
    reason: 'antiBot',
    checkedOn: '2026-09-16',
    refusal: '403 DataDome ; les listes et les API sont fermées par robots.txt',
    wakesIf: 'son robots.txt cesse d’interdire /list.htm',
    // Aucune page n'est demandée : l'étude a décidé de ne plus la solliciter.
    probe: { kind: 'robots', path: '/list.htm' },
  },

  // ── Fermés par leur robots.txt ──────────────────────────────────────────
  {
    id: 'manda',
    name: 'Manda',
    origin: 'https://www.manda.fr',
    reason: 'robots',
    checkedOn: '2026-09-16',
    refusal: 'robots.txt interdit /location-immobiliere?* et son flux .json',
    wakesIf: 'la recherche de locations n’est plus interdite',
    probe: { kind: 'robots', path: '/location-immobiliere?page=1' },
  },
  {
    id: 'marche',
    name: 'Marche.fr',
    origin: 'https://www.marche.fr',
    reason: 'robots',
    checkedOn: '2026-09-16',
    refusal: 'robots.txt interdit /annonces/ et /petites-annonces/',
    wakesIf: 'ces deux rubriques ne sont plus interdites',
    probe: { kind: 'robots', path: '/annonces/' },
  },
  {
    id: 'leboncoin',
    name: 'Leboncoin',
    origin: 'https://www.leboncoin.fr',
    reason: 'robots',
    checkedOn: '2026-09-16',
    refusal: 'aucun groupe pour un robot non nommé, et l’interdiction écrite en tête du fichier',
    wakesIf: 'le fichier ouvre un groupe générique ET n’interdit plus l’accès automatisé',
    probe: { kind: 'robots', path: '/annonce/' },
  },
  {
    id: 'nextdoor',
    name: 'Nextdoor',
    origin: 'https://nextdoor.com',
    reason: 'robots',
    checkedOn: '2026-09-16',
    refusal: 'robots.txt : « User-agent: * / Disallow: / »',
    wakesIf: 'le groupe générique n’interdit plus la racine',
    probe: { kind: 'robots', path: '/' },
  },
  {
    id: 'facebook',
    name: 'Facebook Marketplace',
    origin: 'https://www.facebook.com',
    reason: 'robots',
    checkedOn: '2026-09-16',
    refusal:
      'la collecte automatisée est interdite sans autorisation écrite, en tête du robots.txt',
    wakesIf: 'cette interdiction disparaît du fichier — sinon rien, et c’est attendu',
    probe: { kind: 'robots', path: '/marketplace/' },
  },
  {
    id: 'square-habitat',
    name: 'Square Habitat',
    origin: 'https://www.squarehabitat.fr',
    reason: 'robots',
    checkedOn: '2026-08-15',
    refusal: 'robots.txt interdit /resultat-location et les fiches de location',
    wakesIf: 'les résultats de location ne sont plus interdits',
    probe: { kind: 'robots', path: '/resultat-location' },
  },

  // ── Conformes, mais rien dans le périmètre ──────────────────────────────
  {
    id: 'qasa',
    name: 'Qasa',
    origin: 'https://qasa.com',
    reason: 'noVolume',
    checkedOn: '2026-09-16',
    refusal: 'sitemap suédois, norvégien et finlandais ; zéro URL française',
    wakesIf: 'des adresses françaises réapparaissent à son sitemap de recherche',
    probe: {
      kind: 'sitemap',
      url: 'https://qasa.com/sitemaps/home-search/sitemap.xml',
      pattern: /qasa\.com\/fr\//i,
      minMatches: 1,
    },
  },
  {
    id: 'vivastreet',
    name: 'Vivastreet',
    origin: 'https://www.vivastreet.com',
    reason: 'noVolume',
    checkedOn: '2026-09-16',
    refusal: 'sept annonces pour tout le département, dont deux demandes de logement',
    wakesIf: 'sa page de commune rend enfin des annonces du périmètre',
    probe: { kind: 'page', url: 'https://www.vivastreet.com/immobilier-location/nice' },
  },
  {
    id: 'wunderflats',
    name: 'Wunderflats',
    origin: 'https://wunderflats.com',
    reason: 'noVolume',
    checkedOn: '2026-09-16',
    refusal: 'la page de Nice répond 404 ; le sitemap français ne couvre que Paris',
    wakesIf: 'cette page répond et porte des annonces du périmètre',
    probe: { kind: 'page', url: 'https://wunderflats.com/fr/appartements-meubles/nice' },
  },
  {
    id: 'coliving',
    name: 'Coliving.com',
    origin: 'https://coliving.com',
    reason: 'noVolume',
    checkedOn: '2026-09-16',
    refusal: 'un seul bien dans la zone, à Biot, hors des treize communes',
    wakesIf: 'sa page France rend des annonces du périmètre',
    probe: { kind: 'page', url: 'https://coliving.com/france/nice' },
  },
];

/** Ce qu'une requête a rendu. Volontairement minimal : c'est tout ce qui sert. */
export interface Fetched {
  readonly url: string;
  readonly status: number;
  readonly body: string;
}

/**
 * Les pages qui répondent 200 sans rien servir.
 *
 * C'est le piège central : maintenance, parking de domaine, défi anti-bot et
 * « site en construction » rendent tous un 200 parfaitement valide.
 */
const DEAD_PAGE =
  /(maintenance|site en construction|site est actuellement indisponible|en cours de construction|coming soon|domaine .{0,60} a bien été créé|just a moment|attention required|you have been blocked|default web site page|bienvenue sur votre hébergement)/i;

/** Un corps plus court n'a jamais contenu d'inventaire. */
const MIN_BODY_BYTES = 800;

/** Ce qui, dans une adresse, dit « location ». */
const RENT_WORDS =
  /(^|[/\-_.])(location|locations|louer|a-louer|alouer|rent|rental|rentals|colocation|colocations|mieten)([/\-_.]|$)/i;

/**
 * Une adresse d'ANNONCE, pas de rubrique.
 *
 * Le repère est l'identifiant : une fiche en porte un, une page de ville non.
 * Les codes postaux du département sont retirés d'abord, sinon « nice-06000 »
 * passerait pour une référence d'annonce et l'index d'une ville se ferait
 * prendre pour un inventaire.
 */
function hasListingId(url: string): boolean {
  return /\d{4,}/.test(url.replace(/\b06\d{3}\b/g, ''));
}

/** Toutes les adresses d'un document, qu'il soit HTML ou sitemap. */
function linksIn(body: string): readonly string[] {
  const hrefs = [...body.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '');
  const locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1] ?? '');
  return [...hrefs, ...locs];
}

/** Le chemin d'une adresse, absolue ou relative : c'est lui qu'on dédoublonne. */
function pathOf(url: string): string {
  const withoutScheme = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  return (withoutScheme === '' ? '/' : withoutScheme).split(/[?#]/)[0] ?? '/';
}

/** Forme comparable d'un nom de commune : « Saint-Laurent-du-Var » → « saint laurent du var ». */
function slugOf(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Les adresses qui nomment À LA FOIS une location, une commune du périmètre et
 * une référence d'annonce. Les trois ensemble, jamais une seule.
 */
export function perimeterListings(
  body: string,
  cities: readonly string[],
  pattern?: RegExp,
): readonly string[] {
  const slugs = cities.map(slugOf).filter((slug) => slug.length >= 3);
  const kept = new Set<string>();
  for (const link of linksIn(body)) {
    const low = link.toLowerCase();
    if (pattern !== undefined) {
      if (pattern.test(link)) kept.add(pathOf(link));
      continue;
    }
    if (!RENT_WORDS.test(low)) continue;
    if (!slugs.some((slug) => low.includes(slug)) && !/\b06\d{3}\b/.test(low)) continue;
    if (!hasListingId(low)) continue;
    kept.add(pathOf(link));
  }
  return [...kept];
}

export interface ProbeContext {
  readonly cities: readonly string[];
  readonly userAgent: string;
}

/** Une interdiction écrite en toutes lettres vaut refus, quoi que disent les règles. */
const WRITTEN_BAN =
  /(forbidden|prohibited|not permitted|express written permission|automated means|interdit|non autoris)/i;

/**
 * Le `robots.txt` n'interdit PLUS le chemin qui fermait la source.
 *
 * Trois garde-fous, parce qu'un fichier absent autorise tout et qu'un fichier
 * qui ne nous concerne pas ne nous autorise rien : il faut un vrai `robots.txt`,
 * un groupe qui s'applique à nous, et aucune interdiction écrite en clair —
 * c'est celle de Leboncoin, que la lecture des règles ne verrait pas.
 */
export function robotsEvidence(path: string, fetched: Fetched, userAgent: string): string | null {
  if (fetched.status !== 200) return null;
  if (!/^\s*user-agent\s*:/im.test(fetched.body)) return null;
  if (!/^\s*user-agent\s*:\s*(\*|maiounbot)\s*$/im.test(fetched.body)) return null;
  if (WRITTEN_BAN.test(fetched.body)) return null;
  const token = userAgent.split('/')[0] ?? userAgent;
  const file = parseRobotsFile(fetched.body, token);
  if (blockingRule(file.rules, path) !== null) return null;
  return `son robots.txt n'interdit plus ${path}`;
}

/**
 * Le document rend des annonces du périmètre, en nombre.
 *
 * On écarte d'abord tout ce qui répond 200 sans rien servir, puis on ne compte
 * que les adresses qui portent une location, une commune du périmètre et une
 * référence d'annonce. Un accueil servi à la place d'une fiche ne les a pas.
 */
export function contentEvidence(
  probe: Extract<DormantProbe, { kind: 'sitemap' | 'page' }>,
  fetched: Fetched,
  cities: readonly string[],
): string | null {
  if (fetched.status !== 200) return null;
  if (fetched.body.length < MIN_BODY_BYTES) return null;
  if (DEAD_PAGE.test(fetched.body)) return null;
  // Un sitemap qui n'en est pas un — page d'erreur, accueil HTML — ne compte pas.
  if (probe.kind === 'sitemap' && !/<loc>/i.test(fetched.body)) return null;

  const own = pathOf(fetched.url);
  const found = perimeterListings(fetched.body, cities, probe.pattern).filter(
    (path) => path !== own,
  );
  const needed = probe.minMatches ?? DEFAULT_MIN_MATCHES;
  if (found.length < needed) return null;
  const where = probe.kind === 'sitemap' ? 'son sitemap' : 'sa page';
  return `${where} rend ${found.length} annonce(s) du périmètre (${found.slice(0, 2).join(', ')})`;
}

/** L'adresse de sitemap que déclare un `robots.txt`, s'il en déclare une. */
export function declaredSitemap(body: string): string | null {
  return /^\s*sitemap\s*:\s*(\S+)/im.exec(body)?.[1] ?? null;
}

// ── Mémoire et cadence ────────────────────────────────────────────────────

/**
 * Où la veille note ce qu'elle a déjà sondé et déjà dit.
 *
 * Un réglage à part, dans `app_settings` : la surveillance des sources a le
 * sien, et mélanger les deux mémoires ferait qu'un incident de source effacerait
 * le tour de sondage.
 */
export const DORMANT_SETTING = 'dormantWatch';

export interface DormantMemory {
  /** Jour du dernier sondage, tous candidats confondus : un par jour au plus. */
  readonly lastProbeDay: string | null;
  /** Dernier sondage, par candidat. */
  readonly probedAt: Readonly<Record<string, string>>;
  /** Candidats déjà signalés réveillés : on ne le redit jamais. */
  readonly awakened: Readonly<Record<string, string>>;
}

const EMPTY_MEMORY: DormantMemory = { lastProbeDay: null, probedAt: {}, awakened: {} };

const dates = (value: unknown): Readonly<Record<string, string>> =>
  value === null || typeof value !== 'object' || Array.isArray(value)
    ? {}
    : Object.fromEntries(
        Object.entries(value as Record<string, unknown>).flatMap(([key, one]) =>
          typeof one === 'string' ? [[key, one]] : [],
        ),
      );

export function parseDormantMemory(raw: string | null): DormantMemory {
  if (raw === null) return EMPTY_MEMORY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return EMPTY_MEMORY;
    const record = parsed as Record<string, unknown>;
    return {
      lastProbeDay: typeof record['lastProbeDay'] === 'string' ? record['lastProbeDay'] : null,
      probedAt: dates(record['probedAt']),
      awakened: dates(record['awakened']),
    };
  } catch {
    // Une mémoire illisible ne doit pas faire échouer une collecte : on repart
    // à vide, quitte à resonder un candidat une fois de trop.
    return EMPTY_MEMORY;
  }
}

/** Délai minimal entre deux sondages d'un même candidat. */
const REPROBE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Le candidat du jour, ou aucun.
 *
 * UN PAR JOUR, ET LE PLUS ANCIENNEMENT SONDÉ D'ABORD. La collecte tourne deux
 * fois par heure : sans cette borne, la veille coûterait mille requêtes par jour
 * à des sites qui nous ont déjà dit non.
 */
export function pickCandidate(
  candidates: readonly DormantCandidate[],
  memory: DormantMemory,
  nowMs: number,
): DormantCandidate | null {
  if (memory.lastProbeDay === dayKey(nowMs)) return null;
  const due = candidates.filter((candidate) => {
    if (memory.awakened[candidate.id] !== undefined) return false;
    const last = memory.probedAt[candidate.id];
    if (last === undefined) return true;
    const age = nowMs - Date.parse(last);
    return Number.isNaN(age) || age >= REPROBE_DAYS * DAY_MS;
  });
  if (due.length === 0) return null;
  const ageOf = (candidate: DormantCandidate): number => {
    const last = memory.probedAt[candidate.id];
    // Jamais sondé : le plus ancien de tous, donc le premier servi.
    return last === undefined ? Number.NEGATIVE_INFINITY : Date.parse(last);
  };
  return [...due].sort((a, b) => ageOf(a) - ageOf(b) || a.id.localeCompare(b.id))[0] ?? null;
}

// ── Le sondage ────────────────────────────────────────────────────────────

/** Combien de requêtes un sondage peut coûter, quel que soit le candidat. */
export const MAX_REQUESTS_PER_PROBE = 2;

/**
 * LE `robots.txt` SE LIT TOUJOURS — c'est le fichier qui dit les règles.
 *
 * Sans cela, la veille se mordait la queue : Nextdoor et Facebook écrivent
 * `Disallow: /`, le contrôleur en déduisait que leur propre `robots.txt` était
 * interdit, et ces deux candidats ne pouvaient plus jamais être resondés — pas
 * même pour constater que l'interdiction a été levée. Aucune autre page n'est
 * exemptée : le contrôleur décide de tout le reste.
 */
export function withReadableRobots(gate: RobotsGate): RobotsGate {
  return {
    async check(url) {
      if (!new URL(url).pathname.endsWith('/robots.txt')) await gate.check(url);
    },
    crawlDelayMs: (url) => gate.crawlDelayMs(url),
  };
}

export interface DormantDeps {
  readonly readSetting: (key: string) => Promise<string | null>;
  readonly writeSetting: (key: string, value: string) => Promise<void>;
  /** Doit passer par le client HTTP du projet : budget, robots.txt et user-agent. */
  readonly fetchText: (url: string) => Promise<Fetched>;
  readonly cities: readonly string[];
  readonly userAgent: string;
  readonly logger: Logger;
  readonly nowMs: number;
  readonly candidates?: readonly DormantCandidate[];
}

/** Ce que le sondage a trouvé, et la mémoire à réécrire. PUR une fois les corps lus. */
async function evidenceFor(candidate: DormantCandidate, deps: DormantDeps): Promise<string | null> {
  const probe = candidate.probe;
  if (probe.kind === 'robots') {
    return robotsEvidence(
      probe.path,
      await deps.fetchText(`${candidate.origin}/robots.txt`),
      deps.userAgent,
    );
  }
  if (probe.kind === 'page') {
    return contentEvidence(probe, await deps.fetchText(probe.url), deps.cities);
  }
  // Sitemap : l'adresse relevée par l'étude, sinon celle que le site déclare.
  let url = probe.url;
  if (url === undefined) {
    const robots = await deps.fetchText(`${candidate.origin}/robots.txt`);
    url = declaredSitemap(robots.body) ?? `${candidate.origin}/sitemap.xml`;
  }
  return contentEvidence(probe, await deps.fetchText(url), deps.cities);
}

/**
 * Sonde au plus un candidat, et ne parle que s'il s'est réveillé.
 *
 * NE LÈVE JAMAIS : un domaine mort, un serveur qui ne répond pas ou un refus
 * anti-bot sont le cas NORMAL ici, pas une panne de la collecte.
 */
export async function probeDormant(deps: DormantDeps): Promise<readonly SourceAlert[]> {
  const candidates = deps.candidates ?? DORMANT_CANDIDATES;
  try {
    const memory = parseDormantMemory(await deps.readSetting(DORMANT_SETTING));
    const candidate = pickCandidate(candidates, memory, deps.nowMs);
    if (candidate === null) return [];

    const now = new Date(deps.nowMs).toISOString();
    let evidence: string | null = null;
    try {
      evidence = await evidenceFor(candidate, deps);
    } catch (error) {
      // Injoignable, interdit, bloqué : le candidat dort toujours, c'est tout.
      deps.logger.debug('dormant.asleep', {
        candidat: candidate.id,
        raison: error instanceof Error ? error.message : String(error),
      });
    }

    await deps.writeSetting(
      DORMANT_SETTING,
      JSON.stringify({
        lastProbeDay: dayKey(deps.nowMs),
        probedAt: { ...memory.probedAt, [candidate.id]: now },
        awakened: evidence === null ? memory.awakened : { ...memory.awakened, [candidate.id]: now },
      } satisfies DormantMemory),
    );

    if (evidence === null) {
      deps.logger.debug('dormant.probed', { candidat: candidate.id, verdict: 'toujours endormi' });
      return [];
    }
    deps.logger.warn('dormant.awake', { candidat: candidate.id, preuve: evidence });
    return [
      {
        sourceId: candidate.id,
        kind: 'awake',
        detail: `candidat écarté le ${candidate.checkedOn} (${candidate.refusal}) — ${evidence}`,
      },
    ];
  } catch (error) {
    deps.logger.warn('dormant.failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
