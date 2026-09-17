/**
 * CE QUE LE SCORE DE RISQUE DOIT TAIRE, ET CE QU'IL DOIT DIRE.
 *
 * Chaque cas « à ne pas signaler » ci-dessous est une annonce RÉELLE de
 * l'inventaire du 2026-09-17, que l'ancienne règle désignait à tort. Les
 * chiffres sont ceux de la fiche, pas des valeurs choisies pour faire passer
 * le test : c'est ce qui rend ce fichier utile quand la règle rebougera.
 *
 * L'exigence qui commande tout : dire « à vérifier » sur l'annonce d'une agence
 * honnête coûte plus cher que de manquer une arnaque.
 */

import { describe, expect, it } from 'vitest';
import { makeAggregated, makeContact } from '../../../../tests/helpers/factories.js';
import { scoreRisk } from './risk.js';
import type { AggregatedListing } from '@maioun/shared';

const options = { referencePricePerSqm: 20 };

/** Les raisons qui ALOURDISSENT le score — les seules qui signalent. */
const flags = (listing: AggregatedListing): string[] =>
  scoreRisk(listing, options)
    .reasons.filter((reason) => reason.delta > 0)
    .map((reason) => reason.code);

describe('loyer au m² : le repère est celui de Nice, et de nulle part ailleurs', () => {
  it('ne prête pas les loyers de Nice à une maison du Vaucluse', () => {
    // citya:GES70090001-84 — « Maison à louer 6 pièces 133.28m² - Bédoin (84) ».
    // La commune était mal rendue (`nice`) ; le code postal, lui, disait 84410.
    const listing = makeAggregated({
      price: 918,
      area: 133.28,
      rooms: 6,
      propertyType: 'house',
      city: 'nice',
      postalCode: '84410',
      contact: makeContact(),
    });
    expect(flags(listing)).not.toContain('price.veryLow');
    expect(scoreRisk(listing, options).unknownSignals.join(' ')).toContain('commune');
  });

  it('ne tient pas pour suspect le prix normal d’une commune de l’arrière-pays', () => {
    // contesso:784 — maison à Bezaudun-les-Alpes, 750 € pour 64 m² : 11,7 €/m²,
    // c'est-à-dire le prix du village. Quatorze annonces hors de Nice étaient
    // ainsi signalées, toutes entre 8 et 12 €/m², et pas une arnaque.
    const listing = makeAggregated({
      price: 750,
      area: 64,
      rooms: 3,
      propertyType: 'house',
      city: 'bezaudun les alpes',
      postalCode: '06510',
      contact: makeContact(),
    });
    expect(flags(listing)).not.toContain('price.low');
  });

  it('continue de signaler un loyer aberrant à Nice', () => {
    const listing = makeAggregated({ price: 250, area: 60, rooms: 3, postalCode: '06000' });
    expect(flags(listing)).toContain('price.veryLow');
  });

  it('compare charges comprises, comme le fait le repère publié', () => {
    // acropolis-immo:6005099 — 731 € hors charges + 60 € de provision, 56,5 m².
    // Comparé hors charges, ce deux-pièces Riquier passait pour bradé ; charges
    // comprises, il est au prix du quartier.
    const listing = makeAggregated({
      price: 731,
      charges: 60,
      chargesIncluded: false,
      area: 56.5,
      rooms: 2,
      postalCode: '06000',
      contact: makeContact(),
    });
    expect(flags(listing)).not.toContain('price.low');
  });

  it('ne compare rien sans type ni nombre de pièces : ce peut être un garage', () => {
    // arthurimmo:32564853 — « Louer immobilier 750 € à Nice (06300) », 170 m²,
    // type non précisé. C'était un parking, et il arrivait en tête des annonces
    // « à risque » avec 4,4 €/m².
    const listing = makeAggregated({
      price: 750,
      area: 170,
      rooms: null,
      propertyType: 'other',
      postalCode: '06300',
      contact: makeContact(),
    });
    expect(flags(listing)).not.toContain('price.veryLow');
  });
});

describe('incohérence pièces/surface : pas en colocation', () => {
  it('ne signale pas une chambre de 12 m² dans un cinq-pièces', () => {
    // bep:87153764 — « CHAMBRE - avec accès terrasse et jardin ». La surface est
    // celle de la chambre, le nombre de pièces celui du logement entier.
    const listing = makeAggregated({
      price: 700,
      area: 12,
      rooms: 5,
      flatShare: true,
      contact: makeContact(),
    });
    expect(flags(listing)).not.toContain('inconsistent.roomsArea');
  });

  it('signale toujours un logement entier aux proportions impossibles', () => {
    const listing = makeAggregated({ price: 690, area: 20, rooms: 4, contact: makeContact() });
    expect(flags(listing)).toContain('inconsistent.roomsArea');
  });
});

describe('désaccords entre sources', () => {
  const withPriceConflict = (value: number, sourceId: string): AggregatedListing => {
    const listing = makeAggregated({ price: 900, area: 40, contact: makeContact() });
    return {
      ...listing,
      price: {
        ...listing.price,
        conflicts: [{ value, sourceId, observedAt: listing.price.observedAt }],
      },
    };
  };

  it('ne prend pas la convention d’affichage de Rentumo pour une contradiction', () => {
    // Rentumo publie le loyer hors charges : 55 loyers contredits, moyenne −10 %.
    expect(flags(withPriceConflict(720, 'rentumo'))).not.toContain('inconsistent.sources');
  });

  it('signale le même écart venu d’une source qui publie sur la même base', () => {
    expect(flags(withPriceConflict(720, 'fnaim'))).toContain('inconsistent.sources');
  });

  it('ne compte pas deux mètres carrés d’arrondi sur un studio', () => {
    // bienici:ag752861-426261640 — 18 m² ici, 20 m² chez LocService.
    const listing = makeAggregated({ price: 600, area: 18, rooms: 1, contact: makeContact() });
    const withAreaConflict: AggregatedListing = {
      ...listing,
      area: {
        ...listing.area,
        conflicts: [{ value: 20, sourceId: 'locservice', observedAt: listing.area.observedAt }],
      },
    };
    expect(flags(withAreaConflict)).not.toContain('inconsistent.sources');
  });

  it('ne compte plus une adresse écrite autrement', () => {
    // gestion-cassini:86063212 — « 39 Boulevard Général Louis Delfino » chez
    // l'agence, « 39 BD DELFINO » chez Bien'ici. Même immeuble, deux graphies.
    const listing = makeAggregated({
      price: 870,
      area: 28.58,
      rooms: 1,
      address: '39 Boulevard Général Louis Delfino',
      contact: makeContact(),
    });
    const withAddressConflict: AggregatedListing = {
      ...listing,
      address: {
        ...listing.address,
        conflicts: [
          { value: '39 BD DELFINO', sourceId: 'bienici', observedAt: listing.address.observedAt },
        ],
      },
    };
    expect(flags(withAddressConflict)).not.toContain('inconsistent.sources');
  });
});

describe('formulations : il faut qu’elles parlent d’argent, et du bailleur', () => {
  const described = (description: string): AggregatedListing =>
    makeAggregated({ description, price: 900, area: 40, rooms: 2, contact: makeContact() });

  it('ne prend pas un dossier demandé avant la visite pour un paiement', () => {
    // mirabello:7886589, mot pour mot. Toute agence niçoise demande le dossier
    // avant de faire visiter.
    expect(
      flags(
        described(
          'Dossier avec revenus au moins 2,7 fois le montant du loyer exigé. ' +
            'Dossier à faire parvenir avant la visite à mirabelloimmobilier@gmail.com.',
        ),
      ),
    ).not.toContain('suspicious.wording');
  });

  it('ne prend pas l’expatrié recherché pour un bailleur à l’étranger', () => {
    // locservice:2461138, mot pour mot.
    expect(
      flags(
        described(
          'Idéal pour étudiant, mission professionnelle, télétravailleur, ' +
            'expatrié ou personne recherchant une location temporaire.',
        ),
      ),
    ).not.toContain('suspicious.wording');
  });

  it('ne prend pas un dépôt de garantie versé à la remise des clés pour une arnaque', () => {
    // morningcroissant:45586 et six autres, mot pour mot. C'est la règle.
    expect(
      flags(described('Le dépôt de garantie de 2200 devra être versé avant la remise des clés.')),
    ).not.toContain('suspicious.wording');
  });

  it('signale un virement demandé avant la visite', () => {
    expect(
      flags(described('Le virement de la caution est demandé avant la visite du logement.')),
    ).toContain('suspicious.wording');
  });

  it('signale un moyen de paiement intraçable', () => {
    expect(flags(described('Règlement par mandat cash ou en bitcoin uniquement.'))).toContain(
      'suspicious.wording',
    );
  });

  it('signale un bailleur qui se déclare à l’étranger', () => {
    expect(
      flags(described('Je suis actuellement à l’étranger, je ne peux pas faire visiter.')),
    ).toContain('suspicious.wording');
  });
});

describe('une annonce d’agence honnête n’est jamais signalée', () => {
  it('ne pose aucun avertissement sur une fiche ordinaire et complète', () => {
    // acropolis-immo:6005099, telle qu'elle est collectée : agence nommée,
    // téléphone, courriel, référence, loyer au prix du quartier.
    const listing = makeAggregated({
      title: 'Riquier, proche gare, grand 2 pièces',
      description:
        'Riquier, Beau 2 pièces traversant, 3ème ascenseur, composé d’une entrée, ' +
        'un vaste séjour, une chambre avec rangements, une cuisine indépendante, ' +
        'une salle de bains, wc indépendant, immeuble bourgeois, proche commodités. ' +
        '731 € + 60 €, Dg 731 €, hono : constitution de dossier : 565.50 € + 188.33 (edl)',
      price: 731,
      charges: 60,
      chargesIncluded: false,
      area: 56.5,
      rooms: 2,
      city: 'nice',
      postalCode: '06000',
      address: '9 Avenue Denis Séméria',
      contact: makeContact({
        agencyName: 'Acropolis’immo',
        phone: '+33493265000',
        email: 'contact@acropolisimmo.com',
        reference: '6005099',
      }),
    });

    expect(flags(listing)).toHaveLength(0);
    expect(scoreRisk(listing, options).value).toBe(0);
  });
});
