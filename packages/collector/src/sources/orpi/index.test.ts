/**
 * Le passage Orpi : il couvre les treize communes du périmètre, ne conclut à
 * un inventaire complet que si le site le confirme par son propre total, et ne
 * prend jamais pour niçois ce que le repli départemental lui sert.
 * Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { SHORT_COVERAGE_WARNING } from '../shared/announced-total.js';
import { orpiScraper } from './index.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/orpi');
const NICE = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const REPLI = readFileSync(join(FIXTURES, 'repli-departement.html'), 'utf8');
const RETIREE = readFileSync(join(FIXTURES, 'fiche-retiree.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'fiche-estate.html'), 'utf8');

/**
 * La page de Nice telle que le site la sert VRAIMENT quand tout son inventaire
 * tient sur une page : les cinq cartes annoncées, et plus de lien « suivant ».
 */
const NICE_COMPLETE = NICE.replace(/rel="next"/g, '');

/** Les treize communes, telles qu'Orpi les attend. */
const SLUGS = [
  'nice',
  'saint-laurent-du-var',
  'cagnes-sur-mer',
  'villeneuve-loubet',
  'beaulieu-sur-mer',
  'cap-d-ail',
  'villefranche-sur-mer',
  'la-trinite-alpes-maritimes',
  'saint-andre-de-la-roche',
  'drap',
  'carros',
  'contes',
  'colomars',
];

const SITEMAP_URL = 'https://www.orpi.com/sitemap-biens-a-louer.xml';

/** Les quatre logements niçois de la page de test, et son stationnement. */
const NICE_REFS = {
  studio: 'x-000001-101',
  deuxPieces: '00000000-0000-4000-8000-000000000202',
  troisPieces: 'x-000003-303',
  maison: 'x-000004-404',
  stationnement: 'x-000000-901',
};

const FICHE_NICE: Record<string, string> = {
  [NICE_REFS.studio]: 'appartement-t1-nice-06000',
  [NICE_REFS.deuxPieces]: 'appartement-t2-nice-06100',
  [NICE_REFS.troisPieces]: 'appartement-t3-nice-06100',
  [NICE_REFS.maison]: 'maison-t4-nice-06200',
  [NICE_REFS.stationnement]: 'stationnement-nice-06300',
};

const adresse = (slugEtCp: string, reference: string): string =>
  `https://www.orpi.com/annonce-location-${slugEtCp}-${reference}/`;

/** Le sitemap des biens à louer, réduit aux adresses qu'on veut lui faire dire. */
const sitemap = (urls: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;

/** Le sitemap qui énumère exactement ce que la page de Nice porte. */
const SITEMAP_NICE = sitemap(
  Object.entries(FICHE_NICE).map(([reference, slugEtCp]) => adresse(slugEtCp, reference)),
);

interface Options {
  readonly mode?: 'live' | 'backfill';
  /** Corps servi par commune ; défaut : la page de repli départemental. */
  readonly pages?: Record<string, string>;
  /** Références dont la fiche répond « bien loué » ; les autres sont normales. */
  readonly retirees?: readonly string[];
  readonly knownRefs?: readonly string[];
  /** Le sitemap des locations ; défaut : celui qui colle à la page de Nice. */
  readonly sitemap?: string;
  /** Ce que le passage précédent avait retenu du sitemap. */
  readonly sitemapPrecedent?: readonly string[];
  /** Le sitemap ne répond pas : la source retombe sur le total des pages. */
  readonly sitemapEnPanne?: boolean;
}

function contexte(options: Options = {}): { ctx: ScrapeContext; vues: string[] } {
  const vues: string[] = [];
  const known = new Set(options.knownRefs ?? []);
  const ctx: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: options.mode ?? 'live',
    fetch: (url): Promise<FetchResult> => {
      vues.push(url);
      const reponse = (body: string, status = 200): Promise<FetchResult> =>
        Promise.resolve({ status, body, headers: {}, notModified: false });
      if (url === SITEMAP_URL) {
        return options.sitemapEnPanne === true
          ? Promise.reject(new Error('503'))
          : reponse(options.sitemap ?? SITEMAP_NICE);
      }
      if (url.includes('/annonce-location-')) {
        const partie = options.retirees?.some((ref) => url.includes(ref)) === true;
        return reponse(partie ? RETIREE : FICHE);
      }
      const slug = /location-immobiliere-([a-z0-9-]+)\//.exec(url)?.[1] ?? '';
      return reponse(options.pages?.[slug] ?? REPLI);
    },
    isKnown: (ref) => known.has(ref),
    knownRefs: known,
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: {
      get: (url) =>
        Promise.resolve(url === SITEMAP_URL ? (options.sitemapPrecedent ?? null) : null),
      set: () => Promise.resolve(),
    },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { ctx, vues };
}

const listes = (vues: readonly string[]): string[] =>
  vues.filter((url) => url.includes('location-immobiliere'));

describe('orpiScraper — couverture du périmètre', () => {
  it('interroge les treize communes suivies, pas la seule ville de Nice', async () => {
    const { ctx, vues } = contexte({ pages: { nice: NICE_COMPLETE } });
    await orpiScraper.run(ctx);
    for (const slug of SLUGS) {
      expect(listes(vues)).toContain(`https://www.orpi.com/location-immobiliere-${slug}/`);
    }
  });

  /**
   * LA LISTE ENTIÈRE, FIGÉE. Orpi répond 200 et sert la page du département
   * pour une commune qu'il ne connaît pas : une écriture fausse ne se
   * distinguerait pas d'une commune sans annonce. Ici, ni code postal ni
   * abréviation — le portail écrit les communes comme nous.
   */
  it('construit exactement ces adresses', async () => {
    const { ctx, vues } = contexte({ pages: { nice: NICE_COMPLETE } });
    await orpiScraper.run(ctx);
    expect(listes(vues)).toEqual([
      'https://www.orpi.com/location-immobiliere-nice/',
      'https://www.orpi.com/location-immobiliere-saint-laurent-du-var/',
      'https://www.orpi.com/location-immobiliere-cagnes-sur-mer/',
      'https://www.orpi.com/location-immobiliere-villeneuve-loubet/',
      'https://www.orpi.com/location-immobiliere-beaulieu-sur-mer/',
      'https://www.orpi.com/location-immobiliere-cap-d-ail/',
      'https://www.orpi.com/location-immobiliere-villefranche-sur-mer/',
      'https://www.orpi.com/location-immobiliere-la-trinite-alpes-maritimes/',
      'https://www.orpi.com/location-immobiliere-saint-andre-de-la-roche/',
      'https://www.orpi.com/location-immobiliere-drap/',
      'https://www.orpi.com/location-immobiliere-carros/',
      'https://www.orpi.com/location-immobiliere-contes/',
      'https://www.orpi.com/location-immobiliere-colomars/',
    ]);
  });

  it('ne prend pas pour local ce que le repli départemental lui sert', async () => {
    // Douze communes sur treize répondent ici le repli, qui porte une annonce
    // cannoise. Sans la vérification du canonique, elle entrait en base au nom
    // de chacune d'elles.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.listings.map((l) => l.sourceRef)).not.toContain('x-000080-880');
  });

  it('ne demande pas de page au-delà du total annoncé', async () => {
    // Cinq cartes annoncées, cinq lues : la page suivante ne porterait que le
    // repli départemental.
    const { ctx, vues } = contexte({ pages: { nice: NICE } });
    await orpiScraper.run(ctx);
    expect(listes(vues).filter((url) => url.includes('?page='))).toHaveLength(0);
  });
});

describe('orpiScraper — un inventaire complet, ou dit incomplet', () => {
  it('conclut « complet » quand le total annoncé est atteint', async () => {
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('completed');
    expect(result.fullPass).toBe(true);
  });

  it('se dit incomplet quand le site ne publie plus son total', async () => {
    // Sans total, l'exhaustivité redevient une hypothèse — celle-là même qui
    // laissait un tiers du stock invisible sans que rien ne le signale.
    const sansTotal = NICE_COMPLETE.replace(/&quot;nbResults&quot;:\d+/g, '&quot;x&quot;:0');
    const { ctx } = contexte({ pages: { nice: sansTotal } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
    expect(result.fullPass).toBe(false);
  });

  it('se dit incomplet quand il manque des annonces et que le sitemap manque aussi', async () => {
    // Le site en annonce cinq et la liste n'en porte plus qu'une. Sans le
    // sitemap pour dire LESQUELLES manquent, on ne peut rien conclure de mieux
    // que « inventaire non vérifié ».
    const ampute = NICE_COMPLETE.replace(/<!-- Carte [2345][\s\S]*?<\/article>\n/g, '');
    const { ctx } = contexte({ pages: { nice: ampute }, sitemapEnPanne: true });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
  });

  it('reste complet malgré les communes qu’Orpi ne connaît pas', async () => {
    // Cap-d'Ail, Drap et Contes n'ont pas de page chez Orpi : leur silence
    // n'est pas un trou, sans quoi la source serait incomplète à jamais — et
    // n'éteindrait plus jamais une annonce.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('completed');
  });

  it('refuse de conclure quand le périmètre entier devient muet', async () => {
    // Aucune commune ne répond, mais des annonces sont connues : c'est le
    // gabarit ou les adresses qui ont changé, pas le marché qui s'est vidé.
    const { ctx } = contexte({ knownRefs: ['x-000001-101'] });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
  });
});

describe('orpiScraper — ce que la fiche apprend', () => {
  it('éteint sur-le-champ l’annonce qu’Orpi dit louée en 200', async () => {
    // Orpi répond 410 sur la plupart de ses fiches parties — ce cas-là est
    // couvert par `shared/withdrawn.ts` — mais pas sur toutes : celle-ci rend
    // 200 et l'accueil du site, et seul son canonique la dénonce.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE }, retirees: ['x-000001-101'] });
    const result = await orpiScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual(['x-000001-101']);
    // Une annonce retirée n'est pas rendue AUSSI comme en ligne.
    const eteintes = new Set(result.withdrawnRefs ?? []);
    for (const listing of result.listings) expect(eteintes.has(listing.sourceRef)).toBe(false);
  });

  it('n’éteint rien quand TOUTES les fiches se disent louées', async () => {
    // Une salve pareille dénonce un gabarit d'URL changé, pas quatre biens
    // loués dans la minute : le garde-fou de `shared/withdrawn.ts` s'applique.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      retirees: [
        'x-000001-101',
        '00000000-0000-4000-8000-000000000202',
        'x-000003-303',
        'x-000004-404',
      ],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.withdrawnRefs).toEqual([]);
  });

  it('recolle « charges comprises » sur le loyer frais de la carte', async () => {
    // La fiche le démontre (950 = 894 + 56) mais son loyer, mémorisé une
    // semaine, figerait le chiffre de la liste : on garde le montant de la
    // carte et on lui ajoute la mention.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE } });
    const result = await orpiScraper.run(ctx);
    const studio = result.listings.find((l) => l.sourceRef === 'x-000001-101');
    expect(studio?.priceText).toBe('690 € par mois charges comprises');
  });
});

describe('orpiScraper — un nom de commune ne désigne pas une commune', () => {
  const MARTINIQUE = readFileSync(join(FIXTURES, 'la-trinite-homonyme.html'), 'utf8');
  /**
   * La page martiniquaise servie SOUS LE NOM QU'ON DEMANDE.
   *
   * Orpi répond aujourd'hui le repli départemental sur
   * `la-trinite-alpes-maritimes`, et le canonique suffit à l'écarter. Ce
   * garde-fou-ci vise l'autre cas, celui qui a fait entrer deux appartements
   * de Martinique en base le 2026-09-17 : une page servie sous le nom demandé,
   * canonique en règle, cartes normales — et une autre commune.
   */
  const HOMONYME = MARTINIQUE.replace(
    /location-immobiliere-la-trinite\//g,
    'location-immobiliere-la-trinite-alpes-maritimes/',
  );
  const pages = { nice: NICE_COMPLETE, 'la-trinite-alpes-maritimes': HOMONYME };

  it('demande La Trinité par son département, la seule écriture qui la désigne', async () => {
    // Le nom seul sert la Martinique. Orpi lève l'ambiguïté par le département,
    // et son sitemap de pages le montre : la-trinite-alpes-maritimes répond 200
    // et publie 06340. L'adresse répond aujourd'hui le repli départemental,
    // faute d'annonce à louer — c'est un silence, pas un trou.
    const { ctx, vues } = contexte({ pages: { nice: NICE_COMPLETE } });
    await orpiScraper.run(ctx);
    expect(listes(vues)).toContain(
      'https://www.orpi.com/location-immobiliere-la-trinite-alpes-maritimes/',
    );
    expect(listes(vues)).not.toContain('https://www.orpi.com/location-immobiliere-la-trinite/');
  });

  it('ne prend rien de la page servie sous le nom de La Trinité', async () => {
    const { ctx } = contexte({ pages });
    const result = await orpiScraper.run(ctx);
    const refs = result.listings.map((l) => l.sourceRef);
    expect(refs).not.toContain('00000000-0000-4000-8000-000000000972');
    expect(refs).not.toContain('00000000-0000-4000-8000-000000000973');
  });

  it('le dit, au lieu de passer pour une commune sans annonce', async () => {
    const { ctx } = contexte({ pages });
    const result = await orpiScraper.run(ctx);
    expect(result.warnings.some((w) => w.includes('97220') && w.includes('06340'))).toBe(true);
  });

  it('n’en fait pas un trou : la commune n’a simplement pas de page ici', async () => {
    // En faire un inventaire incomplet condamnerait la source à ne plus jamais
    // rien retirer, pour une commune qu'Orpi ne publie pas.
    const { ctx } = contexte({ pages });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('completed');
  });

  it('lit toujours en entier la page d’une commune qui est BIEN la nôtre', async () => {
    // Le garde-fou ne doit pas mordre sur le stock du périmètre : la page de
    // Nice publie 06000, celui que notre table lui donne.
    const { ctx } = contexte({ pages });
    const result = await orpiScraper.run(ctx);
    expect(result.listings.length).toBeGreaterThan(0);
    expect(result.listings.every((l) => l.sourceUrl.includes('-nice-'))).toBe(true);
  });

  it('écarte du sitemap les annonces de l’homonyme', async () => {
    // Le sitemap porte l'adresse entière, code postal compris :
    // `la-trinite-97220` n'est pas du périmètre, et ne doit ni se confirmer ni
    // se réclamer.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemap: sitemap([adresse('appartement-t2-la-trinite-97220', 'x-000972-972')]),
      sitemapPrecedent: ['x-000972-972'],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.confirmedRefs).not.toContain('x-000972-972');
    expect(result.warnings.join(' ')).not.toContain('x-000972-972');
  });

  it('reconnaît en revanche La Trinité des Alpes-Maritimes dans le sitemap', async () => {
    // Le jour où Orpi y publiera, son sitemap nommera l'annonce avec son code
    // postal : le manque se verra, même si la page ville tardait à exister.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemap: sitemap([adresse('appartement-t2-la-trinite-06340', 'x-000340-340')]),
      sitemapPrecedent: ['x-000340-340'],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.warnings.join(' ')).toContain('x-000340-340');
  });
});

describe('orpiScraper — la pagination n’est pas un instantané', () => {
  /** Une annonce niçoise que le sitemap publie et que la page n'a pas portée. */
  const SAUTEE = 'x-000005-505';
  const SITEMAP_AVEC_SAUTEE = sitemap([
    ...Object.entries(FICHE_NICE).map(([reference, slugEtCp]) => adresse(slugEtCp, reference)),
    adresse('appartement-t2-nice-06200', SAUTEE),
  ]);

  it('confirme l’annonce que la pagination a sautée, au lieu de crier au trou', async () => {
    // L'ordre des résultats bouge d'une requête à l'autre : une annonce se
    // retrouve sur deux pages et une autre sur aucune. Elle n'a pas disparu —
    // le sitemap la publie, et nous la tenons déjà.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemap: SITEMAP_AVEC_SAUTEE,
      sitemapPrecedent: [SAUTEE],
      knownRefs: [SAUTEE],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.confirmedRefs).toContain(SAUTEE);
    expect(result.stopReason).toBe('completed');
  });

  it('ne dépense pas une requête de plus pour la confirmer', async () => {
    const { ctx, vues } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemap: SITEMAP_AVEC_SAUTEE,
      sitemapPrecedent: [SAUTEE],
      knownRefs: [SAUTEE],
    });
    await orpiScraper.run(ctx);
    expect(vues.filter((url) => url.includes(SAUTEE))).toHaveLength(0);
  });

  it('signale en revanche l’annonce du périmètre qu’on n’a JAMAIS lue', async () => {
    // Celle-là n'est pas un aléa de pagination : Orpi la publie depuis au moins
    // un passage et nous ne l'avons jamais eue. Le relevé de couverture relit
    // cet avertissement.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemap: SITEMAP_AVEC_SAUTEE,
      sitemapPrecedent: [SAUTEE],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.warnings.some((w) => w.startsWith(SHORT_COVERAGE_WARNING))).toBe(true);
    expect(result.warnings.join(' ')).toContain(SAUTEE);
  });

  it('laisse un cycle à l’annonce qui vient de paraître', async () => {
    // Le sitemap est régénéré en continu quand les pages de liste sont servies
    // d'un cache : sans ce délai, chaque parution passerait pour un trou.
    const { ctx } = contexte({ pages: { nice: NICE_COMPLETE }, sitemap: SITEMAP_AVEC_SAUTEE });
    const result = await orpiScraper.run(ctx);
    expect(result.warnings).toEqual([]);
  });

  it('ne réclame pas un stationnement, qu’on n’enregistre jamais', async () => {
    // Le compter ferait un trou permanent : le sitemap le publie, la page le
    // porte, et rien n'en entre en base.
    const { ctx } = contexte({
      pages: { nice: NICE_COMPLETE },
      sitemapPrecedent: [NICE_REFS.stationnement],
    });
    const result = await orpiScraper.run(ctx);
    expect(result.confirmedRefs).not.toContain(NICE_REFS.stationnement);
    expect(result.warnings).toEqual([]);
  });

  it('crie au gabarit quand plus AUCUNE carte ne se lit', async () => {
    // Depuis que le sitemap confirme, un passage qui ne lirait plus rien
    // resterait plein de confirmations : ce sont les CARTES qui font foi.
    const { ctx } = contexte({ knownRefs: [NICE_REFS.studio] });
    const result = await orpiScraper.run(ctx);
    expect(result.stopReason).toBe('incomplete');
    expect(result.confirmedRefs).toEqual([]);
  });
});
