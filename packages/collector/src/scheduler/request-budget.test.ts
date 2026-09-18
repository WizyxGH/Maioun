import { describe, expect, it } from 'vitest';
import {
  cadence,
  conditionalReach,
  service,
  spendByGroup,
  spendBySource,
  type DiscoveryRecord,
  type RunRecord,
} from './request-budget.js';
import { PUBLIC_CONFIG } from '../config.js';
import { ALL_SCRAPERS } from '../sources/index.js';

const T0 = Date.parse('2026-09-16T08:00:00.000Z');
const min = (n: number): number => n * 60_000;

function passage(sourceId: string, debutMin: number, requests: number, dureeS = 30): RunRecord {
  return {
    sourceId,
    startedAtMs: T0 + min(debutMin),
    finishedAtMs: T0 + min(debutMin) + dureeS * 1000,
    requestCount: requests,
  };
}

function trouvee(sourceId: string, debutMin: number, decalageS = 5): DiscoveryRecord {
  return { sourceId, atMs: T0 + min(debutMin) + decalageS * 1000 };
}

describe('spendBySource', () => {
  it('compte les requêtes par annonce réellement neuve', () => {
    const runs = [passage('agence', 0, 4), passage('agence', 60, 6)];
    const spend = spendBySource(runs, [trouvee('agence', 0), trouvee('agence', 60)])[0];

    expect(spend?.requests).toBe(10);
    expect(spend?.discoveries).toBe(2);
    expect(spend?.requestsPerDiscovery).toBe(5);
  });

  it('appelle stérile un passage qui ne découvre rien, et chiffre ce qu’il a coûté', () => {
    const runs = [passage('agence', 0, 3), passage('agence', 60, 7)];
    const spend = spendBySource(runs, [trouvee('agence', 60)])[0];

    expect(spend?.sterilePasses).toBe(1);
    expect(spend?.sterileRequests).toBe(3);
  });

  it('rend `null` plutôt que l’infini pour une source qui n’a rien découvert', () => {
    const spend = spendBySource([passage('muette', 0, 10)], [])[0];

    expect(spend?.discoveries).toBe(0);
    expect(spend?.requestsPerDiscovery).toBeNull();
    expect(spend?.sterileRequests).toBe(10);
  });

  it('rattache une découverte au passage qui tournait à cet instant', () => {
    // Deux passages rapprochés : seul celui dont la fenêtre couvre l'instant
    // doit être crédité, sans quoi le tableau désigne la mauvaise source.
    const runs = [passage('agence', 0, 2, 120), passage('agence', 10, 2, 120)];
    const spends = spendBySource(runs, [trouvee('agence', 10, 30)]);

    expect(spends[0]?.discoveries).toBe(1);
    expect(spends[0]?.sterilePasses).toBe(1);
  });

  it('crédite le dernier passage commencé quand la découverte tombe après sa fin', () => {
    // L'écriture en base suit la collecte : une découverte datée quelques
    // secondes après la fin du passage lui appartient tout de même.
    const runs = [passage('agence', 0, 2, 30)];
    const spends = spendBySource(runs, [trouvee('agence', 0, 45)]);

    expect(spends[0]?.discoveries).toBe(1);
    expect(spends[0]?.sterilePasses).toBe(0);
  });

  it('ignore une découverte antérieure à tout passage connu de la fenêtre', () => {
    const spends = spendBySource([passage('agence', 60, 2)], [trouvee('agence', 0)]);

    expect(spends[0]?.discoveries).toBe(0);
  });

  it('classe la source la plus dépensière en tête', () => {
    const runs = [passage('petite', 0, 1), passage('grosse', 0, 30)];
    expect(spendBySource(runs, []).map((one) => one.sourceId)).toEqual(['grosse', 'petite']);
  });
});

describe('spendByGroup', () => {
  it('somme les dépenses et recalcule le rendement du groupe', () => {
    const runs = [passage('a', 0, 10), passage('b', 0, 30), passage('c', 0, 5)];
    const familles = new Map([
      ['a', 'localAgency'],
      ['b', 'portal'],
      ['c', 'localAgency'],
    ]);
    const groupes = spendByGroup(
      spendBySource(runs, [trouvee('a', 0), trouvee('b', 0)]),
      (id) => familles.get(id) ?? 'inconnue',
    );

    const locales = groupes.find((one) => one.group === 'localAgency');
    expect(locales?.sources).toBe(2);
    expect(locales?.requests).toBe(15);
    expect(locales?.discoveries).toBe(1);
    expect(locales?.requestsPerDiscovery).toBe(15);
    expect(locales?.sterilePasses).toBe(1);
  });
});

describe('cadence', () => {
  it('regroupe en un seul cycle les passages lancés coup sur coup', () => {
    const departs = [0, 0.5, 1, 2].map((m) => T0 + min(m));
    expect(cadence(departs).cycles).toBe(1);
  });

  it('mesure la cadence réelle et non celle demandée', () => {
    // Quatre cycles espacés de quinze minutes : une heure de fenêtre.
    const departs = [0, 15, 30, 45].map((m) => T0 + min(m));
    const mesure = cadence(departs);

    expect(mesure.cycles).toBe(4);
    expect(mesure.medianGapMinutes).toBe(15);
    expect(mesure.holes).toBe(0);
    expect(mesure.cyclesPerDay).toBeCloseTo(128, 0);
  });

  it('appelle trou un silence de plus de vingt-cinq minutes et en dit la part', () => {
    // Deux cycles à l'heure, puis trois heures de silence : c'est ce silence,
    // et non l'intervalle des sources, qui décide de ce qu'on rate.
    const departs = [0, 15, 195].map((m) => T0 + min(m));
    const mesure = cadence(departs);

    expect(mesure.holes).toBe(1);
    expect(mesure.longestGapMinutes).toBe(180);
    expect(mesure.holeShare).toBeCloseTo(180 / 195, 3);
  });

  it('ne prétend rien mesurer sur un seul cycle', () => {
    expect(cadence([T0]).cyclesPerDay).toBe(0);
    expect(cadence([]).cycles).toBe(0);
  });
});

describe('conditionalReach', () => {
  it('compte les sources dont le site rend un validateur', () => {
    const portee = conditionalReach(
      [
        'https://www.centragence.net/sitemap.xml',
        'https://www.centragence.net/location/1',
        'https://www.ferrero-immobilier.fr/sitemap.xml',
      ],
      ['centragence.net', 'ferrero-immobilier.fr', 'acropolisimmo.com', 'climmo.com'],
    );

    expect(portee.cachedUrls).toBe(3);
    expect(portee.origins).toBe(2);
    expect(portee.coveredSources).toBe(2);
    expect(portee.totalSources).toBe(4);
  });

  it('reconnaît un sous-domaine du site de la source', () => {
    const portee = conditionalReach(['https://altarea.flatbay.fr/annonces'], ['flatbay.fr']);
    expect(portee.coveredSources).toBe(1);
  });

  it('ignore une adresse illisible plutôt que d’inventer son origine', () => {
    const portee = conditionalReach(['pas une adresse'], ['climmo.com']);
    expect(portee.origins).toBe(0);
    expect(portee.coveredSources).toBe(0);
  });
});

describe('service', () => {
  it('compte la demande en passages par jour, intervalle par intervalle', () => {
    // Une source toutes les 20 min en réclame 72, une autre toutes les 720 en
    // réclame 2.
    const rendu = service([20, 720], 96, 50);

    expect(rendu.demandPerDay).toBeCloseTo(74, 6);
    expect(rendu.capacityPerDay).toBe(4_800);
    expect(rendu.serviceRate).toBe(1);
    expect(rendu.capped).toBe(false);
  });

  it('signale le plafond quand les places manquent, sans regarder le temps', () => {
    // Trente sources dues toutes les 10 minutes : 4 320 passages réclamés,
    // 960 offerts. Le cycle a beau finir en avance, il refuse des sources dues.
    const rendu = service(
      Array.from({ length: 30 }, () => 10),
      96,
      10,
    );

    expect(rendu.capped).toBe(true);
    expect(rendu.serviceRate).toBeCloseTo(960 / 4_320, 6);
  });

  it('ne dépasse jamais un service complet quand les places sont de reste', () => {
    expect(service([60], 96, 50).serviceRate).toBe(1);
    expect(service([], 96, 50).serviceRate).toBe(1);
  });
});

/**
 * LE PLAFOND DOIT SUIVRE LE PARC, SINON IL DÉCIDE À LA PLACE DES INTERVALLES.
 *
 * Une source ajoutée augmente la demande sans rien ajouter aux places : passé
 * le point d'équilibre, les intervalles ne sont plus tenus et l'attente monte
 * sans que rien ne le dise. Ce test est là pour le dire.
 */
describe('places de cycle face au parc réel', () => {
  // Le Worker réveille la collecte quatre fois par heure.
  const CYCLES_PAR_JOUR = 96;

  /**
   * LE PLANCHER, ET NON L'INTERVALLE DE BASE. Le scheduler accélère une source
   * qui produit, jusqu'à son `minIntervalMinutes` : c'est donc la demande
   * maximale qu'il peut réclamer, et celle que les places doivent pouvoir
   * servir. Au repos, le parc demande nettement moins — dimensionner sur ce
   * chiffre-là laissait le plafond mordre dès qu'une source s'animait.
   */
  it('offre assez de places même si toutes les sources passent à leur plancher', () => {
    const planchers = ALL_SCRAPERS.map((s) => s.descriptor.schedule.minIntervalMinutes);
    const rendu = service(planchers, CYCLES_PAR_JOUR, PUBLIC_CONFIG.maxSourcesPerRun);

    expect(rendu.capped).toBe(false);
    expect(rendu.serviceRate).toBe(1);
  });
});
