/**
 * Ce que le SITEMAP ne dit pas.
 *
 * Relevé du 2026-09-18 sur orea-immobilier.fr : une fiche retirée redirige vers
 * `/fr/not-found`, mais reste au sitemap régénéré le matin même. Confirmée sans
 * requête, elle restait « en ligne » chez nous, son lien menant à une page
 * d'erreur. Relire une fiche connue par passage est ce qui la dénonce.
 */

import { describe, expect, it, vi } from 'vitest';
import type { DetailMemoryEntry, FetchResult, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeApimoScraper } from './scraper.js';

const ORIGIN = 'https://agence-fictive.fr';
const SITEMAP = `${ORIGIN}/sitemap.xml`;

const ficheUrl = (reference: string): string =>
  `${ORIGIN}/fr/propriete/location+appartement+nice+beau-studio+${reference}`;

const sitemap = (references: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${references
    .map((reference) => `<url><loc>${ficheUrl(reference)}</loc><lastmod>2026-09-18</lastmod></url>`)
    .join('')}</urlset>`;

/** Fiche vivante, qui porte sa propre canonique. */
const fiche = (reference: string): string =>
  `<!DOCTYPE html><html><head><link rel="canonical" href="${ficheUrl(reference)}" />
    <script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'RealEstateAgent', name: 'Agence Fictive' },
        {
          '@type': 'Apartment',
          name: `Studio ${reference}`,
          numberOfRooms: 1,
          floorSize: { value: 25 },
          offers: { price: 700 },
          address: { addressLocality: 'Nice', postalCode: '06000' },
        },
      ],
    })}</script></head><body></body></html>`;

/** Ce que le site sert à la place d'une fiche retirée, après la redirection. */
const INTROUVABLE = `<!DOCTYPE html><html><head><link rel="canonical" href="${ORIGIN}/fr/not-found" /></head><body>Introuvable</body></html>`;

interface ContexteOptions {
  /** Références au sitemap. */
  readonly references: readonly string[];
  /** Celles que la base connaît déjà. */
  readonly connues: readonly string[];
  /** Celles dont la page est retirée. */
  readonly retirees?: readonly string[];
  /** Date de dernière lecture, par référence. */
  readonly lues?: Readonly<Record<string, string>>;
  /** Reçoit les références notées dans la mémoire des fiches. */
  readonly notees?: string[];
}

function contexte(options: ContexteOptions): {
  readonly context: ScrapeContext;
  readonly fetched: string[];
} {
  const fetched: string[] = [];
  const retirees = new Set(options.retirees ?? []);
  const connues = new Set(options.connues);
  const context: ScrapeContext = {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url): Promise<FetchResult> => {
      fetched.push(url);
      const body =
        url === SITEMAP
          ? sitemap(options.references)
          : retirees.has(url.split('+').at(-1) ?? '')
            ? INTROUVABLE
            : fiche(url.split('+').at(-1) ?? '');
      return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
    },
    isKnown: (reference) => connues.has(reference),
    knownRefs: connues,
    lastFullPassAt: null,
    detailMemory: {
      get: (reference): DetailMemoryEntry | null => {
        const fetchedAt = options.lues?.[reference];
        return fetchedAt === undefined ? null : { draft: {}, fetchedAt };
      },
      save: (entries) => {
        options.notees?.push(...entries.map((entry) => entry.sourceRef));
        return Promise.resolve();
      },
    },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
  return { context, fetched };
}

const scraper = makeApimoScraper({
  id: 'apimo-fictive',
  name: 'Agence Fictive',
  domain: 'agence-fictive.fr',
  sitemapUrl: SITEMAP,
  citySlugs: ['nice'],
});

describe('makeApimoScraper — fiches connues relues', () => {
  it('éteint la fiche connue que le sitemap annonce encore', async () => {
    const { context } = contexte({
      references: ['820001', '820002', '820003'],
      connues: ['820001', '820002', '820003'],
      retirees: ['820001'],
    });
    const result = await scraper.run(context);
    expect(result.withdrawnRefs).toEqual(['820001']);
    // Ni confirmée en ligne dans le même passage : le cœur la réécrirait
    // active juste avant de l'éteindre.
    expect(result.confirmedRefs ?? []).toEqual(['820002', '820003']);
  });

  it('ne relit qu’une fiche par passage', async () => {
    const { context, fetched } = contexte({
      references: ['820001', '820002', '820003'],
      connues: ['820001', '820002', '820003'],
    });
    await scraper.run(context);
    expect(fetched).toEqual([SITEMAP, ficheUrl('820001')]);
  });

  it('relit la jamais lue d’abord, puis la plus anciennement lue', async () => {
    const lues = { '820001': '2026-09-18T08:00:00.000Z', '820003': '2026-09-01T08:00:00.000Z' };
    const { context, fetched } = contexte({
      references: ['820001', '820002', '820003'],
      connues: ['820001', '820002', '820003'],
      lues,
    });
    // La deuxième n'a jamais été lue ; la première l'a été ce matin, elle attend.
    await scraper.run(context);
    expect(fetched).toEqual([SITEMAP, ficheUrl('820002')]);

    const suivant = contexte({
      references: ['820001', '820002', '820003'],
      connues: ['820001', '820002', '820003'],
      lues: { ...lues, '820002': '2026-09-17T08:00:00.000Z' },
    });
    await scraper.run(suivant.context);
    expect(suivant.fetched).toEqual([SITEMAP, ficheUrl('820003')]);
  });

  it('ne relit rien tant qu’il reste des nouveautés à servir', async () => {
    // Neuf inconnues pour un plafond de huit : le passage est déjà plein.
    const references = [
      '830001',
      '830002',
      '830003',
      '830004',
      '830005',
      '830006',
      '830007',
      '830008',
      '830009',
      '830010',
    ];
    const { context, fetched } = contexte({ references, connues: ['830010'] });
    await scraper.run(context);
    expect(fetched).toHaveLength(9);
    expect(fetched).not.toContain(ficheUrl('830010'));
  });

  /**
   * UNE ENTRÉE MORTE DU SITEMAP NE BLOQUE PLUS LA RELECTURE. Immo JBF garde
   * des centaines de fiches retirées à son sitemap : redemandées à chaque
   * passage, elles prenaient tout le budget, et la fiche connue retirée
   * n'était jamais relue — elle restait « en ligne », son lien en 404.
   */
  it('ne redemande pas une entrée lue cette semaine sans rien donner', async () => {
    const { context, fetched } = contexte({
      references: ['840001', '820001'],
      connues: ['820001'],
      lues: { '840001': new Date(Date.now() - 86_400_000).toISOString() },
    });
    await scraper.run(context);
    expect(fetched).toEqual([SITEMAP, ficheUrl('820001')]);
  });

  it('note les nouvelles qui n’ont rien donné, pas celles qui ont donné une annonce', async () => {
    const notees: string[] = [];
    const { context } = contexte({
      references: ['840001', '840002'],
      connues: [],
      retirees: ['840001'],
      notees,
    });
    await scraper.run(context);
    expect(notees).toEqual(['840001']);
  });

  it('relit sans en-tête conditionnel : un 304 n’apprendrait rien', async () => {
    const { context } = contexte({ references: ['820001'], connues: ['820001'] });
    const espion = vi.spyOn(context, 'fetch');
    await scraper.run(context);
    expect(espion).toHaveBeenLastCalledWith(ficheUrl('820001'), { conditional: false });
  });
});

/**
 * LA PAGE DE LISTE EN PLUS DU SITEMAP.
 *
 * Un sitemap oublie parfois ce qui vient d'arriver — relevé chez Étude Lotte,
 * dont une annonce ne figurait que sur sa page de locations. Mais sa page
 * n'affichait que deux fiches quand vingt-deux répondaient 200 : lire la page
 * SEULE en aurait fait perdre vingt. C'est l'UNION des deux vues qu'on veut.
 */
describe('makeApimoScraper — la page de liste complète le sitemap', () => {
  const LISTE = `${ORIGIN}/fr/locations`;

  const scraperAvecListe = makeApimoScraper({
    id: 'apimo-fictive',
    name: 'Agence Fictive',
    domain: 'agence-fictive.fr',
    sitemapUrl: SITEMAP,
    citySlugs: ['nice'],
    listUrls: [LISTE],
  });

  /** La page de liste, avec les fiches qu'on lui donne. */
  const pageDeListe = (references: readonly string[]): string =>
    `<!DOCTYPE html><html><body>${references
      .map((ref) => `<a href="${ORIGIN}/fr/propriete/location+appartement+nice+${ref}">voir</a>`)
      .join('')}</body></html>`;

  function contexteAvecListe(
    sitemapRefs: readonly string[],
    pageRefs: readonly string[],
    suivantes: readonly (readonly string[])[] = [],
  ) {
    const fetched: string[] = [];
    // La page N renvoie vers la N+1 tant qu'il en reste une.
    const pages = [pageRefs, ...suivantes];
    const pageN = (numero: number): string =>
      pageDeListe(pages[numero - 1] ?? []).replace(
        '</body>',
        numero < pages.length
          ? `<a href="/fr/locations?page=${numero + 1}">suivante</a></body>`
          : '</body>',
      );
    const context: ScrapeContext = {
      ...contexte({ references: sitemapRefs, connues: [] }).context,
      fetch: (url): Promise<FetchResult> => {
        fetched.push(url);
        const numero = Number(new URL(url).searchParams.get('page') ?? '1');
        const body =
          url === SITEMAP
            ? sitemap(sitemapRefs)
            : url.startsWith(LISTE)
              ? pageN(numero)
              : fiche(url.split('+').at(-1) ?? '');
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
    };
    return { context, fetched };
  }

  it('sert une annonce que le sitemap ignore', async () => {
    const { context } = contexteAvecListe(['111111'], ['222222']);
    const result = await scraperAvecListe.run(context);
    expect(result.listings.map((one) => one.sourceRef).sort()).toEqual(['111111', '222222']);
  });

  it('ne perd pas celles que la page n’affiche pas', async () => {
    const { context } = contexteAvecListe(['111111', '333333'], ['222222']);
    const result = await scraperAvecListe.run(context);
    expect(result.listings).toHaveLength(3);
  });

  /**
   * LE TROU QUI A MOTIVÉ TOUT CECI N'A ÉTÉ DÉCOUVERT QUE PARCE QU'UN
   * UTILISATEUR A REÇU L'ANNONCE PAR UN AUTRE CANAL. Le chiffre doit rester
   * sous les yeux : à zéro durable, la requête de plus ne sert à rien ; s'il
   * explose, c'est le sitemap qui s'est cassé.
   */
  it('journalise ce que le sitemap aurait manqué', async () => {
    const journal: { event: string; data?: Record<string, unknown> }[] = [];
    const { context } = contexteAvecListe(['111111'], ['222222']);
    await scraperAvecListe.run({
      ...context,
      log: (event, data) => journal.push({ event, ...(data === undefined ? {} : { data }) }),
    });
    const ligne = journal.find((one) => one.event === 'list.rescued');
    expect(ligne?.data?.['references']).toBe(1);
    expect(ligne?.data?.['examples']).toEqual(['222222']);
  });

  /** Un sitemap muet pendant que la page publie : inventaire cassé, pas agence vide. */
  it('signale un sitemap sans la moindre location', async () => {
    const { context } = contexteAvecListe([], ['222222']);
    const result = await scraperAvecListe.run(context);
    expect(result.warnings.some((one) => one.includes('Sitemap sans aucune location'))).toBe(true);
  });

  /**
   * LA PAGE 2 AUSSI. Palais Immobilier range seize locations sur deux pages,
   * et le sitemap date de 2024 celles de la seconde : on ne les voyait jamais.
   */
  it('suit la pagination que la page publie', async () => {
    const { context, fetched } = contexteAvecListe([], ['111111'], [['222222']]);
    const result = await scraperAvecListe.run(context);
    expect(result.listings.map((one) => one.sourceRef).sort()).toEqual(['111111', '222222']);
    expect(fetched).toContain(`${LISTE}?page=2`);
    // Pas de page 3 demandée : la page 2 n'y renvoie pas.
    expect(fetched).not.toContain(`${LISTE}?page=3`);
  });

  /**
   * LA PAGE FAIT FOI SUR LA DATE DU SITEMAP. Palais Immobilier date de 2024 au
   * sitemap une annonce que sa page affiche aujourd'hui : la règle d'âge
   * l'écartait.
   */
  it('lit une fiche de la page que le sitemap date de plus d’un an', async () => {
    const { context } = contexteAvecListe([], ['111111']);
    const vieux = `<?xml version="1.0"?><urlset><url><loc>${ficheUrl('111111')}</loc><lastmod>2024-06-03</lastmod></url></urlset>`;
    const fetchDOrigine = context.fetch;
    const result = await scraperAvecListe.run({
      ...context,
      fetch: (url, options) =>
        url === SITEMAP
          ? Promise.resolve({ status: 200, body: vieux, headers: {}, notModified: false })
          : fetchDOrigine(url, options),
    });
    expect(result.listings.map((one) => one.sourceRef)).toEqual(['111111']);
  });

  /**
   * ELLE PASSE DEVANT LES ENTRÉES DU SITEMAP. Gestion Cassini garde des
   * dizaines de fiches mortes au sitemap ; ses deux studios affichés passaient
   * derrière, et le budget s'épuisait avant eux.
   */
  it('sert d’abord les fiches de la page, avant celles du seul sitemap', async () => {
    const sitemapRefs = Array.from({ length: 12 }, (_, rang) => String(900_000 + rang));
    const { context, fetched } = contexteAvecListe(sitemapRefs, ['222222']);
    await scraperAvecListe.run(context);
    const fiches = fetched.filter((url) => url.includes('/propriete/'));
    expect(fiches[0]).toBe(`${ORIGIN}/fr/propriete/location+appartement+nice+222222`);
  });

  it('ne devine pas une page 2 que le site ne publie pas', async () => {
    const { context, fetched } = contexteAvecListe(['111111'], ['222222']);
    await scraperAvecListe.run(context);
    expect(fetched.some((url) => url.includes('page='))).toBe(false);
  });

  it('ne compte pas deux fois une fiche vue des deux côtés', async () => {
    const { context } = contexteAvecListe(['111111'], ['111111']);
    const result = await scraperAvecListe.run(context);
    expect(result.listings).toHaveLength(1);
  });
});
