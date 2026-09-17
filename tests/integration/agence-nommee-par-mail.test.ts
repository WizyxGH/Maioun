/**
 * QUAND UNE ALERTE E-MAIL NOMME L'AGENCE, SON CATALOGUE PASSE EN TÊTE.
 *
 * Le digest d'un portail est pauvre : ni adresse, ni téléphone, ni charges, ni
 * DPE. La même annonce, chez l'agence, les porte — et l'e-mail arrive en
 * général avant notre passage programmé. Le repère de la source d'alertes garde
 * donc le nom écrit par le message ; le cœur en tire la source à faire tourner
 * au cycle suivant, sans requête hors cadence.
 *
 * Ce test exerce le CHEMIN ENTIER : repère en base → rapprochement du nom →
 * plan d'exécution. Les unités sont vérifiées ailleurs ; ici on vérifie qu'elles
 * sont bien branchées.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Scraper, SourceRuntimeState } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import {
  ALL_SCRAPERS,
  budgetFor,
  createRegistry,
  createRepository,
  createTestClock,
  migrate,
  openDatabase,
  runPipeline,
  scheduleFor,
  silentLogger,
  type Repository,
} from '@maioun/collector';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, '../../database/migrations');

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const minutesAgo = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

/** La vraie source d'alertes, dont on ne garde que le descripteur. */
const ALERTES = ALL_SCRAPERS.find((scraper) => scraper.descriptor.id === 'email-alerts');

const alertesMuettes: Scraper = {
  descriptor:
    ALERTES?.descriptor ??
    (() => {
      throw new Error('source d’alertes introuvable');
    })(),
  run: () =>
    Promise.resolve({
      sourceId: 'email-alerts',
      listings: [],
      requestCount: 0,
      pagesFetched: 0,
      stopReason: 'completed' as const,
      warnings: [],
    }),
};

/** L'agence que le message nomme — une source locale ordinaire. */
const agence: Scraper = {
  descriptor: {
    id: 'igti',
    name: 'Immobilière GTI',
    domain: 'immobilieregti.com',
    kind: 'localAgency',
    method: 'html',
    priority: 3,
    schedule: scheduleFor('localAgency'),
    budget: budgetFor('localAgency'),
    enabled: true,
    allowedPaths: [],
    notes: '',
  },
  run: () =>
    Promise.resolve({
      sourceId: 'igti',
      listings: [
        {
          sourceRef: 'gti-1',
          sourceUrl: 'https://immobilieregti.com/location/1',
          title: 'Appartement 2 pièces',
          priceText: '780 €',
          areaText: '41 m²',
          cityText: 'Nice',
          postalCodeText: '06000',
        },
      ],
      requestCount: 1,
      pagesFetched: 1,
      stopReason: 'completed' as const,
      warnings: [],
    }),
};

const etat = (
  overrides: Partial<SourceRuntimeState> & { sourceId: string },
): SourceRuntimeState => ({
  health: 'healthy',
  lastRunAt: null,
  lastSuccessAt: null,
  last429At: null,
  lastBlockedAt: null,
  cooldownUntil: null,
  consecutiveErrors: 0,
  lastNewListingCount: 0,
  averageNewListingCount: 0,
  ...overrides,
});

/** Le repère de la source d'alertes, avec ou sans agence nommée. */
const repere = (agencies: readonly { name: string; since: string }[]): string =>
  JSON.stringify({
    uidValidity: '1',
    lastUid: 42,
    senders: 'seloger',
    ...(agencies.length > 0 ? { agencies } : {}),
  });

async function prepare(memo: string): Promise<Repository> {
  const db = openDatabase({ url: ':memory:' });
  await migrate(db, MIGRATIONS, silentLogger);
  const repository = createRepository(db);
  await repository.saveSourceState(
    etat({ sourceId: 'email-alerts', lastRunAt: minutesAgo(1), memo }),
  );
  // L'agence vient d'être relevée : son tour n'est pas dû avant plus d'une heure.
  await repository.saveSourceState(
    etat({
      sourceId: 'igti',
      lastRunAt: minutesAgo(10),
      lastSuccessAt: minutesAgo(10),
      averageNewListingCount: 1,
    }),
  );
  return repository;
}

const options = (repository: Repository) => ({
  registry: createRegistry([alertesMuettes, agence]),
  repository,
  config: {
    criteria: MVP_CRITERIA,
    maxSourcesPerRun: 6,
    referencePricePerSqm: 20,
    missingRunsBeforePossiblyInactive: 2,
    missingRunsBeforeInactive: 6,
  },
  referencePoints: [],
  userAgent: 'MaiounBot/0.1 (test)',
  mode: 'live' as const,
  clock: createTestClock({ startMs: NOW, random: 0 }),
  logger: silentLogger,
});

describe('l’agence nommée par une alerte e-mail', () => {
  it('voit son catalogue relu au cycle suivant, sans attendre son tour', async () => {
    const repository = await prepare(repere([{ name: 'Immobilière GTI', since: minutesAgo(5) }]));
    const report = await runPipeline(options(repository));
    expect(report.sourcesRun).toContain('igti');
  });

  it('reste à son rythme quand aucun message ne la nomme', async () => {
    // Le cas ORDINAIRE : sur vingt et un jours de boîte, vingt-trois messages
    // sur deux cent soixante-quatre nomment leur agence.
    const repository = await prepare(repere([]));
    const report = await runPipeline(options(repository));
    expect(report.sourcesRun).not.toContain('igti');
  });

  it('ne réveille personne pour une agence que nous ne collectons pas', async () => {
    const repository = await prepare(
      repere([{ name: 'PETROVA INVESTISSEMENT IMMOBILIER', since: minutesAgo(5) }]),
    );
    const report = await runPipeline(options(repository));
    expect(report.sourcesRun).not.toContain('igti');
  });
});
