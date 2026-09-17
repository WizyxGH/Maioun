/**
 * CE QUE LA VEILLE REFUSE DE DIRE.
 *
 * Les cas qui comptent ici ne sont pas les réveils : ce sont les 200 qui ne
 * prouvent rien. Une page de maintenance, un accueil servi à la place d'une
 * annonce, un sitemap vide, un inventaire hors périmètre, un `robots.txt` qui
 * interdit par une phrase et non par une règle — chacun a déjà été rencontré
 * pour de vrai, et chacun ferait sonner un détecteur naïf.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DORMANT_CANDIDATES,
  DORMANT_SETTING,
  MAX_REQUESTS_PER_PROBE,
  contentEvidence,
  declaredSitemap,
  parseDormantMemory,
  perimeterListings,
  pickCandidate,
  probeDormant,
  robotsEvidence,
  withReadableRobots,
  type DormantCandidate,
  type DormantMemory,
} from './dormant.js';
import type { Logger } from '../core/logger.js';

const CITIES = ['Nice', 'Villefranche-sur-Mer', 'Saint-Laurent-du-Var', 'Cagnes-sur-Mer'];
const UA = 'MaiounBot/0.1 (+https://github.com/WizyxGH/Maioun)';

const logger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

/** Un corps assez long pour passer le plancher, sans rien d'exploitable. */
const padding = '<p>Bonjour et bienvenue sur notre site immobilier.</p>'.repeat(40);

const page = (
  body: string,
  url = 'https://exemple.fr/location/nice',
): Parameters<typeof contentEvidence>[1] => ({ url, status: 200, body });

describe('perimeterListings', () => {
  it('ne retient que ce qui nomme location, commune ET référence d’annonce', () => {
    const body = `
      <a href="/location/nice">Locations à Nice</a>
      <a href="/location/villefranche-sur-mer">Villefranche</a>
      <a href="/vente/appartement-nice-874512">Vente</a>
      <a href="/location/appartement-nice-874512">Annonce 1</a>
      <a href="/location/studio-nice-874513">Annonce 2</a>`;
    expect(perimeterListings(body, CITIES)).toEqual([
      '/location/appartement-nice-874512',
      '/location/studio-nice-874513',
    ]);
  });

  it('ne prend pas un code postal du 06 pour une référence d’annonce', () => {
    const body = '<a href="/location/nice-06000">Nice</a><a href="/location/nice-06100">Nice 3</a>';
    expect(perimeterListings(body, CITIES)).toEqual([]);
  });
});

describe('contentEvidence — ce qui ne prouve rien', () => {
  const probe = { kind: 'page', url: 'https://exemple.fr/location/nice' } as const;

  it('refuse une page de maintenance rendue en 200', () => {
    // Le corps réel de confianceimmobiliere.com, complété d'annonces pour que
    // seule la mention de maintenance puisse le faire écarter.
    const body = `<title>Maintenance</title>Ce site est actuellement indisponible.${padding}
      <a href="/location/appartement-nice-874512">1</a>
      <a href="/location/studio-nice-874513">2</a>
      <a href="/location/t2-nice-874514">3</a>`;
    expect(contentEvidence(probe, page(body), CITIES)).toBeNull();
  });

  it('refuse un domaine garé qui répond 200', () => {
    const body = `Bravo ! Votre domaine vendre-louer.fr a bien été créé avec LWS${padding}`;
    expect(contentEvidence(probe, page(body), CITIES)).toBeNull();
  });

  it('refuse un défi anti-bot rendu comme une page', () => {
    expect(
      contentEvidence(probe, page(`<title>Just a moment...</title>${padding}`), CITIES),
    ).toBeNull();
  });

  it('refuse l’accueil servi à la place de la page demandée', () => {
    // Un accueil : des rubriques, pas des annonces. Aucune référence d'annonce.
    const body = `${padding}
      <a href="/location/nice">Locations Nice</a>
      <a href="/location/cagnes-sur-mer">Cagnes</a>
      <a href="/location/saint-laurent-du-var">Saint-Laurent</a>
      <a href="/vente/nice">Ventes</a>`;
    expect(contentEvidence(probe, page(body), CITIES)).toBeNull();
  });

  it('refuse un sitemap vide, et un sitemap qui n’en est pas un', () => {
    const empty = { kind: 'sitemap' } as const;
    const body = `<?xml version="1.0"?><urlset></urlset>${padding}`;
    expect(contentEvidence(empty, page(body, 'https://exemple.fr/sitemap.xml'), CITIES)).toBeNull();
    const html = `<html>${padding}<a href="/location/appartement-nice-874512">1</a></html>`;
    expect(contentEvidence(empty, page(html, 'https://exemple.fr/sitemap.xml'), CITIES)).toBeNull();
  });

  it('refuse un inventaire hors périmètre', () => {
    // Le sitemap de Qasa : de la Suède, de la Norvège, de la Finlande.
    const body = `<urlset>${['se', 'no', 'fi']
      .flatMap((pays) =>
        [1, 2, 3].map((n) => `<loc>https://qasa.com/${pays}/rent/home-12345${n}</loc>`),
      )
      .join('')}</urlset>${padding}`;
    expect(
      contentEvidence({ kind: 'sitemap' }, page(body, 'https://qasa.com/s.xml'), CITIES),
    ).toBeNull();
  });

  it('refuse un 404, et un corps trop court pour porter un inventaire', () => {
    expect(contentEvidence(probe, { ...page(padding), status: 404 }, CITIES)).toBeNull();
    expect(
      contentEvidence(
        probe,
        page('<html><head><title></title></head><body></body></html>'),
        CITIES,
      ),
    ).toBeNull();
  });

  it('parle quand le sitemap porte enfin des annonces du périmètre', () => {
    const body = `<urlset>${[1, 2, 3]
      .map((n) => `<loc>https://exemple.fr/location/appartement-nice-87451${n}</loc>`)
      .join('')}</urlset>${padding}`;
    const evidence = contentEvidence(
      { kind: 'sitemap' },
      page(body, 'https://exemple.fr/s.xml'),
      CITIES,
    );
    expect(evidence).toContain('3 annonce(s) du périmètre');
  });
});

describe('robotsEvidence', () => {
  const fetched = (body: string): Parameters<typeof robotsEvidence>[1] => ({
    url: 'https://exemple.fr/robots.txt',
    status: 200,
    body,
  });

  it('se tait quand la règle interdit toujours', () => {
    expect(
      robotsEvidence('/annonces/', fetched('User-agent: *\nDisallow: /annonces/'), UA),
    ).toBeNull();
  });

  it('se tait quand aucun groupe ne nous concerne', () => {
    // Le fichier de Leboncoin : il n'énumère que des robots nommés.
    expect(
      robotsEvidence('/annonce/', fetched('User-agent: Googlebot\nDisallow: /annonce*'), UA),
    ).toBeNull();
  });

  it('se tait quand l’interdiction est écrite en toutes lettres', () => {
    const body = [
      "## It's forbidden to use search robots or other automatic methods.",
      'User-agent: *',
      'Allow: /',
    ].join('\n');
    expect(robotsEvidence('/annonce/', fetched(body), UA)).toBeNull();
  });

  it('se tait quand la réponse n’est pas un robots.txt', () => {
    expect(robotsEvidence('/annonces/', fetched('<html><body>404</body></html>'), UA)).toBeNull();
    expect(
      robotsEvidence('/annonces/', { ...fetched('User-agent: *'), status: 404 }, UA),
    ).toBeNull();
  });

  it('parle quand la règle qui fermait a disparu', () => {
    const body = 'User-agent: *\nDisallow: /wp-admin/\nCrawl-delay: 5';
    expect(robotsEvidence('/annonces/', fetched(body), UA)).toContain('/annonces/');
  });

  it('tient compte de la querystring, comme la règle de Manda', () => {
    const closed = 'User-agent: *\nDisallow: /location-immobiliere?*';
    expect(robotsEvidence('/location-immobiliere?page=1', fetched(closed), UA)).toBeNull();
  });
});

describe('cadence', () => {
  const candidates = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ] as unknown as readonly DormantCandidate[];
  const now = Date.parse('2026-09-17T08:00:00.000Z');
  const memory = (over: Partial<DormantMemory>): DormantMemory => ({
    lastProbeDay: null,
    probedAt: {},
    awakened: {},
    ...over,
  });

  it('un candidat par jour, pas un de plus', () => {
    expect(pickCandidate(candidates, memory({ lastProbeDay: '2026-09-17' }), now)).toBeNull();
  });

  it('prend le plus anciennement sondé, jamais sondé d’abord', () => {
    const chosen = pickCandidate(
      candidates,
      memory({ probedAt: { a: '2026-09-01T00:00:00.000Z', c: '2026-08-01T00:00:00.000Z' } }),
      now,
    );
    expect(chosen?.id).toBe('b');
  });

  it('ne resonde pas dans la quinzaine', () => {
    const recent = { a: '2026-09-16T00:00:00.000Z', b: '2026-09-15T00:00:00.000Z' };
    expect(pickCandidate(candidates.slice(0, 2), memory({ probedAt: recent }), now)).toBeNull();
  });

  it('oublie définitivement un candidat déjà signalé réveillé', () => {
    const woke = memory({
      awakened: { a: '2026-01-01T00:00:00.000Z', b: '2026-01-01T00:00:00.000Z' },
    });
    expect(pickCandidate(candidates, woke, now)?.id).toBe('c');
  });

  it('repart d’une mémoire vide plutôt que d’échouer sur un réglage illisible', () => {
    expect(parseDormantMemory('{oops')).toEqual({ lastProbeDay: null, probedAt: {}, awakened: {} });
  });
});

describe('probeDormant', () => {
  const candidate: DormantCandidate = {
    id: 'exemple',
    name: 'Exemple',
    origin: 'https://exemple.fr',
    reason: 'offline',
    checkedOn: '2026-09-16',
    refusal: 'page de maintenance',
    wakesIf: 'son sitemap publie des locations du périmètre',
    probe: { kind: 'sitemap' },
  };

  const deps = (
    fetchText: (url: string) => Promise<{ url: string; status: number; body: string }>,
  ) => {
    const written: Record<string, string> = {};
    return {
      written,
      deps: {
        readSetting: async () => written[DORMANT_SETTING] ?? null,
        writeSetting: async (key: string, value: string) => {
          written[key] = value;
        },
        fetchText,
        cities: CITIES,
        userAgent: UA,
        logger,
        nowMs: Date.parse('2026-09-17T08:00:00.000Z'),
        candidates: [candidate],
      },
    };
  };

  it('ne dit rien et note le passage quand le site dort toujours', async () => {
    const { deps: d, written } = deps(async (url) => ({
      url,
      status: 200,
      body: url.endsWith('robots.txt')
        ? 'User-agent: *\nSitemap: https://exemple.fr/sitemap.xml'
        : `<title>Maintenance</title>${padding}`,
    }));
    expect(await probeDormant(d)).toEqual([]);
    expect(JSON.parse(written[DORMANT_SETTING] ?? '{}')).toMatchObject({
      lastProbeDay: '2026-09-17',
      awakened: {},
    });
  });

  it('ne fait plus rien du tout le même jour', async () => {
    const fetchText = vi.fn(async (url: string) => ({ url, status: 404, body: '' }));
    const { deps: d } = deps(fetchText);
    await probeDormant(d);
    const before = fetchText.mock.calls.length;
    await probeDormant(d);
    expect(fetchText.mock.calls.length).toBe(before);
  });

  it('signale UNE fois, puis plus jamais', async () => {
    const sitemap = `<urlset>${[1, 2, 3]
      .map((n) => `<loc>https://exemple.fr/location/appartement-nice-87451${n}</loc>`)
      .join('')}</urlset>${padding}`;
    const { deps: d, written } = deps(async (url) => ({
      url,
      status: 200,
      body: url.endsWith('robots.txt')
        ? 'User-agent: *\nSitemap: https://exemple.fr/sitemap.xml'
        : sitemap,
    }));
    const alerts = await probeDormant(d);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe('awake');
    expect(alerts[0]?.detail).toContain('périmètre');
    expect(JSON.parse(written[DORMANT_SETTING] ?? '{}').awakened).toHaveProperty('exemple');

    // Le lendemain, le même sitemap : plus un mot.
    const next = { ...d, nowMs: d.nowMs + 48 * 60 * 60 * 1000 };
    expect(await probeDormant(next)).toEqual([]);
  });

  it('ne lève jamais : un domaine mort est le cas normal', async () => {
    const { deps: d } = deps(async () => {
      throw new Error('fetch failed');
    });
    expect(await probeDormant(d)).toEqual([]);
  });
});

describe('la liste de veille', () => {
  it('ne coûte jamais plus de deux requêtes par candidat', () => {
    for (const candidate of DORMANT_CANDIDATES) {
      const cost = candidate.probe.kind === 'sitemap' && candidate.probe.url === undefined ? 2 : 1;
      expect(cost).toBeLessThanOrEqual(MAX_REQUESTS_PER_PROBE);
    }
  });

  it('nomme chaque candidat une seule fois, avec une origine lisible', () => {
    const ids = DORMANT_CANDIDATES.map((one) => one.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const candidate of DORMANT_CANDIDATES) {
      expect(() => new URL(candidate.origin)).not.toThrow();
      expect(candidate.refusal).not.toBe('');
      expect(candidate.wakesIf).not.toBe('');
    }
  });

  it('ne sonde une page que là où le refus n’était pas celui du robots.txt', () => {
    // Un candidat refusé pour son robots.txt se resonde en lisant son
    // robots.txt, et rien d'autre.
    for (const candidate of DORMANT_CANDIDATES.filter((one) => one.reason === 'robots')) {
      expect(candidate.probe.kind).toBe('robots');
    }
  });
});

describe('withReadableRobots', () => {
  const refuse: Parameters<typeof withReadableRobots>[0] = {
    check: async () => {
      throw new Error('interdit');
    },
    crawlDelayMs: async () => 0,
  };

  it('laisse lire le robots.txt d’un site qui interdit tout', async () => {
    // Sans quoi Nextdoor et Facebook, qui écrivent « Disallow: / », ne
    // pourraient plus jamais être resondés, même une fois rouverts.
    await expect(
      withReadableRobots(refuse).check('https://x.fr/robots.txt'),
    ).resolves.toBeUndefined();
  });

  it('n’exempte rien d’autre', async () => {
    await expect(withReadableRobots(refuse).check('https://x.fr/annonces/')).rejects.toThrow();
  });
});

describe('declaredSitemap', () => {
  it('lit l’adresse déclarée par le robots.txt', () => {
    expect(declaredSitemap('User-agent: *\nSitemap: https://x.fr/s.xml')).toBe(
      'https://x.fr/s.xml',
    );
    expect(declaredSitemap('User-agent: *')).toBeNull();
  });
});
