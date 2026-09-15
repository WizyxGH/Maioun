/** Dépôt de garantie et honoraires du locataire : champs dédiés et texte libre. */

import { describe, expect, it } from 'vitest';
import { makeOccurrence } from '../../../../tests/helpers/factories.js';
import { normalizeListing, rederiveFromText } from './normalize.js';
import {
  parseDepositField,
  parseDepositFromText,
  parseFeesField,
  parseFeesFromText,
  rentExcludingCharges,
} from './parse-listing-fields.js';

describe('parseDepositField', () => {
  it('lit un montant seul, espaces et devise compris', () => {
    expect(parseDepositField('660 €', 690)).toBe(660);
    expect(parseDepositField('1 680 €', 890)).toBe(1680);
    expect(parseDepositField('704')).toBe(704);
  });

  it('rend null pour « NC », un vide, une durée ou zéro', () => {
    expect(parseDepositField('NC', 690)).toBeNull();
    expect(parseDepositField('', 690)).toBeNull();
    expect(parseDepositField(undefined)).toBeNull();
    expect(parseDepositField('1 mois de loyer', 690)).toBeNull();
    expect(parseDepositField('0 €', 690)).toBeNull();
  });

  it('refuse plus de trois loyers', () => {
    expect(parseDepositField('2 070 €', 690)).toBe(2070);
    expect(parseDepositField('2 071 €', 690)).toBeNull();
    expect(parseDepositField('250 000 €')).toBeNull();
  });
});

describe('parseFeesField', () => {
  it('lit les honoraires, TTC compris, et garde un zéro affiché', () => {
    expect(parseFeesField('220 €', 690)).toBe(220);
    expect(parseFeesField('775 € TTC', 1110)).toBe(775);
    expect(parseFeesField('0 €', 690)).toBe(0);
  });

  it('refuse « NC », un prix au m² et plus de deux loyers', () => {
    expect(parseFeesField('NC', 690)).toBeNull();
    expect(parseFeesField('13 €/m²', 690)).toBeNull();
    expect(parseFeesField('1 381 €', 690)).toBeNull();
  });
});

describe('parseDepositFromText', () => {
  it('reconnaît les tournures relevées', () => {
    expect(parseDepositFromText('Dépôt de garantie : 660euros', 690)).toBe(660);
    expect(parseDepositFromText('DEPOT DE GARANTIE 630 EUROS. CLASSE ENERGETIQUE D.')).toBe(630);
    expect(parseDepositFromText('Dépôt de garantie: 1 000€ Honoraires : 775€', 1110)).toBe(1000);
    expect(parseDepositFromText('- Dépôt de garantie : 1680.0 euros Location Meublée', 890)).toBe(
      1680,
    );
    expect(parseDepositFromText('Caution : 1 400 €', 700)).toBe(1400);
  });

  it('ne convertit pas une durée et ne prend pas le garant pour un dépôt', () => {
    expect(
      parseDepositFromText('Dépôt de garantie : 1 mois de loyer hors charges', 700),
    ).toBeNull();
    expect(parseDepositFromText('caution solidaire exigée, loyer 700 €', 700)).toBeNull();
  });

  it('écarte un montant invraisemblable au regard du loyer', () => {
    expect(parseDepositFromText('Dépôt de garantie : 25 000 €', 700)).toBeNull();
  });

  it('lit les tournures relevées le 2026-09-15', () => {
    expect(parseDepositFromText('Dépôt de garantie : 1 440 ? Honoraires', 800)).toBe(1440);
    expect(parseDepositFromText('Montant du dépôt de garantie : 1?200 €.', 1020)).toBe(1200);
    expect(parseDepositFromText('Dépôt de garantie ; 2 240€', 1280)).toBe(2240);
    expect(parseDepositFromText('Dépôts de garantie : 1 196 ,00€ * Honoraires', 700)).toBe(1196);
    expect(parseDepositFromText('Le dépôt de garantie est de 1 600 €, deux mois', 850)).toBe(1600);
    expect(parseDepositFromText('Dépôt de garantie : 6 800 . Honoraires', 3600)).toBe(6800);
    expect(parseDepositFromText('Loyer 700 euros C.C Caution 700 euros Honoraires', 700)).toBe(700);
    expect(parseDepositFromText('Chèque caution 1000 Euros', 710)).toBe(1000);
  });

  it('lit le montant écrit après une durée', () => {
    expect(
      parseDepositFromText('Dépôt de garantie : 2 mois de loyer hors charges, soit 880 euros', 475),
    ).toBe(880);
    expect(
      parseDepositFromText('CAUTION : 2 mois de loyer HC soit 1350€ (remboursable)', 885),
    ).toBe(1350);
    expect(parseDepositFromText('Caution 1 mois 980 € Direct avec Particulier', 980)).toBe(980);
  });

  it('convertit une durée seulement quand le loyer hors charges est connu', () => {
    const text = 'Dépôt de garantie : 2 mois de loyer hors charges. Honoraires : 574 €';
    expect(parseDepositFromText(text, 980, 930)).toBe(1860);
    expect(parseDepositFromText(text, 980)).toBeNull();
    expect(parseDepositFromText('Caution un mois.', 2250, 2100)).toBe(2100);
    expect(parseDepositFromText('1 mois de loyer pour dépôt de garantie', 1150, 1100)).toBe(1100);
    // Une durée « charges comprises » ne se rapporte pas au loyer hors charges.
    expect(
      parseDepositFromText('Caution : 1 mois de loyer charges comprises', 980, 930),
    ).toBeNull();
  });

  it('ne prend pas le garant ni les honoraires pour le dépôt', () => {
    expect(parseDepositFromText('caution visale exigée: 574€ TTC', 780)).toBeNull();
    expect(parseDepositFromText('Caution solidaire des parents, 2 garants', 780)).toBeNull();
  });
});

describe('rentExcludingCharges', () => {
  it('ne rend un loyer hors charges que s’il se déduit sans supposition', () => {
    expect(rentExcludingCharges(900, false, null)).toBe(900);
    expect(rentExcludingCharges(980, true, 50)).toBe(930);
    expect(rentExcludingCharges(980, true, null)).toBeNull();
    expect(rentExcludingCharges(980, null, 50)).toBeNull();
    expect(rentExcludingCharges(null, false, null)).toBeNull();
  });
});

describe('parseFeesFromText', () => {
  it('reconnaît les tournures relevées', () => {
    expect(parseFeesFromText('Honoraires : 300 €\nDépôt de garantie : 500 €', 564)).toBe(300);
    expect(parseFeesFromText('Honoraires charge locataire : 775€ TTC', 1110)).toBe(775);
    expect(
      parseFeesFromText(
        'Les honoraires charge locataire sont de 311,35 euros ( soit 13,00 euros/m² ) dont 72,57 euros pour état des lieux',
        664,
      ),
    ).toBe(311.35);
  });

  it('n’ajoute pas un état des lieux annoncé « dont »', () => {
    const text =
      'Honoraires locataires : 261.6 euros Dont : - Etablissement état des lieux : 60.41 euros ' +
      "Honoraires d'état des lieux : 60.41 euros";
    expect(parseFeesFromText(text, 890)).toBe(261.6);
  });

  it('additionne un état des lieux énoncé à part', () => {
    const text =
      'Honoraires de visite, dossier et bail : 260 €. Honoraires d’état des lieux : 78 €.';
    expect(parseFeesFromText(text, 900)).toBe(338);
  });

  it('refuse un barème au m², les honoraires du bailleur et un texte muet', () => {
    expect(parseFeesFromText('Honoraires TTC à la charge du locataire : 10 €/m²', 700)).toBeNull();
    expect(parseFeesFromText('Honoraires à la charge du bailleur : 500 €', 700)).toBeNull();
    expect(parseFeesFromText('Consultez nos barèmes d’honoraires sur le site', 700)).toBeNull();
    expect(parseFeesFromText(null)).toBeNull();
  });

  it('écarte plus de deux loyers', () => {
    expect(parseFeesFromText('Honoraires : 2 000 €', 700)).toBeNull();
  });
});

describe('normalisation', () => {
  const options = { sourceId: 'test', nowMs: Date.parse('2026-09-14T10:00:00Z') };

  it('préfère le champ dédié au texte', () => {
    const listing = normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://example.invalid/1',
        priceText: '690 € CC',
        depositText: '660 €',
        feesText: 'NC',
        description: 'Dépôt de garantie : 600 €. Honoraires : 220 € TTC.',
      },
      options,
    );
    expect(listing?.deposit).toBe(660);
    // « NC » dans le champ : on se rabat sur le texte.
    expect(listing?.tenantFees).toBe(220);
  });

  it('laisse null ce que l’annonce ne dit pas', () => {
    const listing = normalizeListing(
      { sourceRef: '2', sourceUrl: 'https://example.invalid/2', priceText: '690 €' },
      options,
    );
    expect(listing?.deposit).toBeNull();
    expect(listing?.tenantFees).toBeNull();
  });

  it('le rejeu remplit le silence, jamais une valeur publiée', () => {
    const description = 'Dépôt de garantie : 640 €. Honoraires : 200 €.';
    const vide = makeOccurrence({ id: 'test:1', sourceId: 'test', description });
    expect(rederiveFromText(vide)).toMatchObject({ deposit: 640, tenantFees: 200 });

    const publie = makeOccurrence({
      id: 'test:2',
      sourceId: 'test',
      description,
      deposit: 690,
      tenantFees: 210,
    });
    expect(rederiveFromText(publie)).toBeNull();
  });
  it('le rejeu convertit une durée avec les charges qu’il vient de lire', () => {
    const occurrence = makeOccurrence({
      id: 'test:3',
      sourceId: 'test',
      price: 980,
      chargesIncluded: true,
      description:
        'Loyer 930 € + 50 € de charges. Dépôt de garantie : 2 mois de loyer hors charges.',
    });
    expect(rederiveFromText(occurrence)).toMatchObject({ charges: 50, deposit: 1860 });
  });
});
