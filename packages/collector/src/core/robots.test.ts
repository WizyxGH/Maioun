import { describe, expect, it } from 'vitest';
import {
  blockingRule,
  createRobotsGate,
  parseRobots,
  parseRobotsFile,
  RobotsDisallowedError,
} from './robots.js';

const FNAIM = `User-agent: *
Disallow: /include/
Disallow: /*.aspx
Disallow: /annonce-immobiliere/*/18-location*
Disallow: /*UTB_FS=*

User-Agent: AhrefsBot
Disallow: /`;

describe('parseRobots / blockingRule', () => {
  const rules = parseRobots(FNAIM, 'MaiounBot');

  it('interdit les fiches de location FNAIM, pas les listes', () => {
    expect(
      blockingRule(rules, '/annonce-immobiliere/53168653/18-location-appartement-nice-06000.htm'),
    ).not.toBeNull();
    expect(
      blockingRule(rules, '/liste-annonces-immobilieres/18/location-nice-06000-page-2.htm'),
    ).toBeNull();
  });

  it('comprend `*` et `$`, querystring comprise', () => {
    const own = parseRobots('User-agent: *\nDisallow: /*?*\nDisallow: */rental$', 'MaiounBot');
    expect(blockingRule(own, '/louer?page=2')).not.toBeNull();
    expect(blockingRule(own, '/louer/appartements/nice')).toBeNull();
    expect(blockingRule(own, '/louer/nice/rental')).not.toBeNull();
    expect(blockingRule(own, '/louer/nice/rental/2')).toBeNull();
  });

  it('la règle la plus longue gagne, Allow à égalité', () => {
    const own = parseRobots('User-agent: *\nDisallow: /biens/\nAllow: /biens/location/', 'X');
    expect(blockingRule(own, '/biens/location/12')).toBeNull();
    expect(blockingRule(own, '/biens/vente/12')).not.toBeNull();
  });

  it('suit le groupe qui NOMME le robot plutôt que `*`', () => {
    const own = parseRobots(
      'User-agent: *\nDisallow: /\n\nUser-agent: maiounbot\nAllow: /',
      'MaiounBot',
    );
    expect(blockingRule(own, '/annonces')).toBeNull();
  });

  it('ne prend pas pour lui un groupe destiné à un autre robot', () => {
    expect(blockingRule(rules, '/liste')).toBeNull();
  });
});

describe('parseRobotsFile — Crawl-delay', () => {
  it('lit le délai du groupe `*`', () => {
    const file = parseRobotsFile('User-agent: *\nDisallow: /*.pdf\nCrawl-delay: 10', 'MaiounBot');
    expect(file.crawlDelaySeconds).toBe(10);
    expect(file.rules).toHaveLength(1);
  });

  it('préfère le groupe qui nomme le robot, même sans règle', () => {
    const text = 'User-agent: *\nCrawl-delay: 20\n\nUser-agent: MaiounBot\nCrawl-delay: 2';
    expect(parseRobotsFile(text, 'MaiounBot').crawlDelaySeconds).toBe(2);
    expect(parseRobotsFile(text, 'AutreBot').crawlDelaySeconds).toBe(20);
  });

  it('ignore le délai d’un autre robot et une valeur illisible', () => {
    expect(
      parseRobotsFile('User-agent: AhrefsBot\nCrawl-delay: 60', 'MaiounBot').crawlDelaySeconds,
    ).toBeNull();
    expect(
      parseRobotsFile('User-agent: *\nCrawl-delay: lent', 'MaiounBot').crawlDelaySeconds,
    ).toBeNull();
    expect(parseRobotsFile('User-agent: *\nCrawl-delay: 0.5', 'X').crawlDelaySeconds).toBe(0.5);
  });
});

describe('createRobotsGate', () => {
  const fetcher = (status: number, body = '') => {
    const calls: string[] = [];
    const impl = ((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.resolve(new Response(body, { status }));
    }) as typeof fetch;
    return { impl, calls };
  };

  it('refuse une page interdite, et ne lit le fichier qu’une fois par site', async () => {
    const { impl, calls } = fetcher(200, FNAIM);
    const gate = createRobotsGate({ userAgent: 'MaiounBot/0.1', fetchImpl: impl });
    await expect(
      gate.check('https://www.fnaim.fr/annonce-immobiliere/1/18-location-studio.htm'),
    ).rejects.toBeInstanceOf(RobotsDisallowedError);
    await gate.check('https://www.fnaim.fr/liste-annonces-immobilieres/18/nice.htm');
    expect(calls).toEqual(['https://www.fnaim.fr/robots.txt']);
  });

  it('rend le Crawl-delay du site sans relire le fichier, 0 sans demande', async () => {
    const { impl, calls } = fetcher(200, 'User-agent: *\nCrawl-delay: 5');
    const gate = createRobotsGate({ userAgent: 'MaiounBot/0.1', fetchImpl: impl });
    await gate.check('https://agence.invalid/location/1');
    expect(await gate.crawlDelayMs('https://agence.invalid/location/2')).toBe(5_000);
    expect(calls).toHaveLength(1);
    const silent = createRobotsGate({ userAgent: 'MaiounBot', fetchImpl: fetcher(404).impl });
    expect(await silent.crawlDelayMs('https://autre.invalid/')).toBe(0);
  });

  it('un fichier absent autorise tout ; un site en panne interdit le temps du passage', async () => {
    await createRobotsGate({ userAgent: 'MaiounBot', fetchImpl: fetcher(404).impl }).check(
      'https://agence.invalid/location/1',
    );
    await expect(
      createRobotsGate({
        userAgent: 'MaiounBot',
        fetchImpl: fetcher(503).impl,
        retryDelayMs: 1,
      }).check('https://agence.invalid/location/1'),
    ).rejects.toBeInstanceOf(RobotsDisallowedError);
  });
});
