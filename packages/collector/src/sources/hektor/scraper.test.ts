/**
 * Ce que la FICHE apprend, quand la liste ment encore.
 *
 * Relevé du 2026-09-16 sur sudagence.fr : une annonce retirée reste sur la
 * page de liste, son adresse de fiche redirige vers l'accueil, et l'accueil
 * répond 200. Le passage la rendait donc « vivante », avec le nom de l'agence
 * pour titre. C'est le canonique de la page servie qui la dénonce.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DetailMemoryEntry, ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { makeHektorScraper } from './scraper.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/hektor');
const ACCUEIL = readFileSync(join(FIXTURES, 'detail-redirigee-accueil.html'), 'utf8');
const FICHE = readFileSync(join(FIXTURES, 'detail-li-data.html'), 'utf8');

const ORIGIN = 'https://www.agence-fictive.fr';
const LIST = `${ORIGIN}/location/1`;
const ficheUrl = (reference: string): string =>
  `${ORIGIN}/location/06-alpes-maritimes/1-nice/grand-studio-vide-de-33-m-quartier-nord-790/${reference}-appartement`;

/** Liste qui affiche encore les références données, boutons `data-url`. */
const liste = (references: readonly string[]): string =>
  `<html><body>${references
    .map((reference) => `<div data-url="${ficheUrl(reference)}">Détails</div>`)
    .join('')}</body></html>`;

/** Chaque référence retirée reçoit l'accueil ; les autres, une vraie fiche. */
function contexte(references: readonly string[], retirees: readonly string[]): ScrapeContext {
  const pages: Record<string, string> = { [LIST]: liste(references) };
  for (const reference of references) {
    // La fiche porte SA propre canonique : sans quoi toutes se diraient retirées.
    pages[ficheUrl(reference)] = retirees.includes(reference)
      ? ACCUEIL
      : FICHE.replace(/href="[^"]*554-appartement"/, `href="${ficheUrl(reference)}"`);
  }
  return {
    criteria: MVP_CRITERIA,
    mode: 'live',
    fetch: (url) =>
      Promise.resolve({ status: 200, body: pages[url] ?? '', headers: {}, notModified: false }),
    isKnown: () => false,
    knownRefs: new Set(),
    lastFullPassAt: null,
    detailMemory: { get: () => null, save: () => Promise.resolve() },
    pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    log: () => undefined,
    credentials: null,
    shouldStop: () => false,
  };
}

const scraper = makeHektorScraper({
  id: 'hektor-retiree',
  name: 'Agence Fictive',
  domain: 'agence-fictive.fr',
  listUrls: [LIST],
});

describe('makeHektorScraper — fiches retirées servies en 200', () => {
  it('éteint la fiche que le site remplace par son accueil', async () => {
    const result = await scraper.run(contexte(['553', '554', '282'], ['282']));
    expect(result.withdrawnRefs).toEqual(['282']);
    // Elle n'est rendue ni comme annonce, ni comme référence confirmée : la
    // réécrire vivante juste avant de l'éteindre l'aurait ressuscitée.
    expect(result.listings.map((listing) => listing.sourceRef).sort()).toEqual(['553', '554']);
    expect(result.confirmedRefs ?? []).not.toContain('282');
  });

  it('n’éteint rien quand toutes les fiches mènent à l’accueil', async () => {
    // Une salve pareille dénonce un gabarit changé, pas trois biens loués dans
    // la minute : le garde-fou de `shared/withdrawn.ts` s'applique.
    const result = await scraper.run(contexte(['553', '554', '282'], ['553', '554', '282']));
    expect(result.withdrawnRefs).toEqual([]);
  });
});

/**
 * LA PAGE 2 N'ÉTAIT JAMAIS LUE. Le descripteur écrivait ses pages à la main :
 * giletta-properties.com publiait 53 locations sur six pages pour trois
 * adresses déclarées le 2026-09-17, soit 23 annonces invisibles. La pagination
 * du site est maintenant suivie — et elle ne s'arrête pas toute seule, puisque
 * la plateforme propose encore une page suivante au-delà de la dernière.
 */
describe('makeHektorScraper — pagination suivie', () => {
  const pagine = (page: number, references: readonly string[], suivante: number | null): string =>
    `<html><body>${references.map((r) => `<div data-url="${ficheUrl(r)}">Détails</div>`).join('')}
     <ul class="pagination">
       <li><span class="btn active">${String(page)}</span></li>
       ${suivante === null ? '' : `<li><a href="/location/${String(suivante)}">${String(suivante)}</a></li>`}
     </ul></body></html>`;

  function contextePagine(pages: Readonly<Record<string, string>>, trace: string[]): ScrapeContext {
    return {
      ...contexte([], []),
      fetch: (url) => {
        trace.push(url);
        // Une fiche porte SA propre canonique, sans quoi elle se dirait retirée.
        // Toute autre page de liste est un au-delà de la dernière : vide, et
        // pourtant munie d'un lien « suivant » de plus.
        const body =
          pages[url] ??
          (url.endsWith('-appartement')
            ? FICHE.replace(/href="[^"]*554-appartement"/, `href="${url}"`)
            : pagine(99, [], 100));
        return Promise.resolve({ status: 200, body, headers: {}, notModified: false });
      },
    };
  }

  it('suit la pagination et rend les fiches des pages jamais déclarées', async () => {
    const trace: string[] = [];
    const scrapeur = makeHektorScraper({
      id: 'hektor-pagine',
      name: 'Agence Fictive',
      domain: 'agence-fictive.fr',
      listUrls: [LIST],
      maxDetailsLive: 9,
    });
    const result = await scrapeur.run(
      contextePagine(
        {
          [LIST]: pagine(1, ['1', '2', '3'], 2),
          [`${ORIGIN}/location/2`]: pagine(2, ['4', '5', '6'], 3),
          [`${ORIGIN}/location/3`]: pagine(3, ['7'], null),
        },
        trace,
      ),
    );

    const listes = trace.filter((url) => /\/location\/\d+$/.test(url));
    expect(listes).toEqual([LIST, `${ORIGIN}/location/2`, `${ORIGIN}/location/3`]);
    expect(result.listings.map((listing) => listing.sourceRef).sort()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });

  it('s’arrête sur une page sans fiche, qui offre pourtant une suivante', async () => {
    const trace: string[] = [];
    const scrapeur = makeHektorScraper({
      id: 'hektor-fin',
      name: 'Agence Fictive',
      domain: 'agence-fictive.fr',
      listUrls: [LIST],
    });
    await scrapeur.run(
      contextePagine(
        { [LIST]: pagine(1, ['1'], 2), [`${ORIGIN}/location/2`]: pagine(2, [], 3) },
        trace,
      ),
    );
    const listes = trace.filter((url) => /\/location\/\d+$/.test(url));
    expect(listes).toEqual([LIST, `${ORIGIN}/location/2`]);
  });
});

/**
 * UNE FICHE CONNUE N'ÉTAIT JAMAIS RELUE, et c'est ce qui figeait le stock : le
 * parseur apprenait à lire le téléphone, l'e-mail ou l'adresse, et seules les
 * annonces découvertes APRÈS en profitaient. Relevé du 2026-09-18 sur les
 * cinquante-trois agences de la plateforme : 160 des 228 annonces en ligne sont
 * sans e-mail, alors que leur fiche le porte.
 */
describe('makeHektorScraper — relecture des fiches connues', () => {
  const REFS = ['553', '554', '282'];

  interface Options {
    readonly connues?: readonly string[];
    readonly memoire?: ReadonlyMap<string, DetailMemoryEntry>;
    readonly mode?: 'live' | 'backfill';
  }

  /** Trace les adresses demandées, avec le caractère conditionnel de l'appel. */
  function contexteRelecture(
    options: Options,
    trace: { url: string; conditional: boolean }[],
    notees: string[][],
  ): ScrapeContext {
    const base = contexte(REFS, []);
    const connues = new Set(options.connues ?? []);
    return {
      ...base,
      mode: options.mode ?? 'live',
      isKnown: (reference) => connues.has(reference),
      knownRefs: connues,
      fetch: (url, init) => {
        trace.push({ url, conditional: init?.conditional !== false });
        return base.fetch(url);
      },
      detailMemory: {
        get: (reference) => options.memoire?.get(reference) ?? null,
        save: (entries) => {
          notees.push(entries.map((entry) => entry.sourceRef));
          return Promise.resolve();
        },
      },
    };
  }

  const scrapeur = makeHektorScraper({
    id: 'hektor-relecture',
    name: 'Agence Fictive',
    domain: 'agence-fictive.fr',
    listUrls: [LIST],
  });
  const fiches = (trace: { url: string }[]): string[] =>
    trace.filter((appel) => appel.url.endsWith('-appartement')).map((appel) => appel.url);

  it('relit une fiche connue, sans cache conditionnel', async () => {
    const trace: { url: string; conditional: boolean }[] = [];
    const result = await scrapeur.run(contexteRelecture({ connues: REFS }, trace, []));
    // Aucune nouveauté à visiter : une seule fiche connue est relue.
    expect(fiches(trace)).toHaveLength(1);
    expect(trace.filter((appel) => appel.url.endsWith('-appartement'))[0]?.conditional).toBe(false);
    // Elle revient en ANNONCE — c'est là tout l'intérêt — tout en restant
    // confirmée : sinon le scheduler la prendrait pour une parution.
    expect(result.listings).toHaveLength(1);
    expect(result.confirmedRefs).toContain(result.listings[0]?.sourceRef);
  });

  it('commence par la fiche jamais lue, puis par la plus ancienne', async () => {
    const lue = (iso: string): DetailMemoryEntry => ({ draft: {}, fetchedAt: iso });
    const trace: { url: string; conditional: boolean }[] = [];
    await scrapeur.run(
      contexteRelecture(
        {
          connues: REFS,
          // '554' n'a aucune mémoire : elle passe avant les deux autres.
          memoire: new Map([
            ['553', lue(new Date(Date.now() - 30 * 86_400_000).toISOString())],
            ['282', lue(new Date(Date.now() - 20 * 86_400_000).toISOString())],
          ]),
        },
        trace,
        [],
      ),
    );
    expect(fiches(trace)).toEqual([expect.stringContaining('/554-appartement')]);
  });

  it('laisse tranquille une fiche lue dans la semaine', async () => {
    const fraiche: DetailMemoryEntry = { draft: {}, fetchedAt: new Date().toISOString() };
    const trace: { url: string; conditional: boolean }[] = [];
    await scrapeur.run(
      contexteRelecture(
        { connues: REFS, memoire: new Map(REFS.map((reference) => [reference, fraiche])) },
        trace,
        [],
      ),
    );
    expect(fiches(trace)).toEqual([]);
  });

  it('note la date de lecture des fiches visitées, nouvelles comprises', async () => {
    const notees: string[][] = [];
    await scrapeur.run(contexteRelecture({ connues: ['553'] }, [], notees));
    // Deux nouvelles lues, et la connue relue par-dessus.
    expect(notees.flat().sort()).toEqual(['282', '553', '554']);
  });

  it('sert d’abord les nouveautés : aucune relecture quand elles saturent', async () => {
    const trace: { url: string; conditional: boolean }[] = [];
    const bride = makeHektorScraper({
      id: 'hektor-relecture-bridee',
      name: 'Agence Fictive',
      domain: 'agence-fictive.fr',
      listUrls: [LIST],
      maxDetailsLive: 1,
    });
    await bride.run(contexteRelecture({ connues: ['282'] }, trace, []));
    expect(fiches(trace)).toHaveLength(1);
    expect(fiches(trace)[0]).not.toContain('/282-appartement');
  });

  it('relit plus de fiches quand l’agence en a beaucoup', async () => {
    // Une seule par passage figeait les grosses agences des jours entiers :
    // Giletta, 51 annonces, gardait deux jours et demi ses vieilles références
    // fabriquées. Un dixième du stock ramène toute agence à dix passages.
    const nombreuses = Array.from({ length: 30 }, (_valeur, rang) => String(100 + rang));
    const trace: { url: string; conditional: boolean }[] = [];
    const base = contexte(nombreuses, []);
    const connues = new Set(nombreuses);
    await scrapeur.run({
      ...base,
      isKnown: (reference) => connues.has(reference),
      knownRefs: connues,
      fetch: (url, init) => {
        trace.push({ url, conditional: init?.conditional !== false });
        return base.fetch(url);
      },
    });
    expect(fiches(trace)).toHaveLength(3);
  });

  it('en reste à une relecture pour une petite agence', async () => {
    const trace: { url: string; conditional: boolean }[] = [];
    await scrapeur.run(contexteRelecture({ connues: REFS }, trace, []));
    expect(fiches(trace)).toHaveLength(1);
  });

  it('en rattrapage, relit plusieurs fiches d’un coup', async () => {
    const trace: { url: string; conditional: boolean }[] = [];
    await scrapeur.run(contexteRelecture({ connues: REFS, mode: 'backfill' }, trace, []));
    expect(fiches(trace)).toHaveLength(3);
  });
});
