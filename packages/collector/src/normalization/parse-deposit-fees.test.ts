/** Dépôt de garantie et honoraires du locataire : champs dédiés et texte libre. */

import { describe, expect, it } from 'vitest';
import { makeOccurrence } from '../../../../tests/helpers/factories.js';
import { normalizeListing, rederiveFromText } from './normalize.js';
import {
  parseDepositField,
  parseDepositFromText,
  parseFeesField,
  parseFeesFromText,
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
});
