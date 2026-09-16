import { describe, expect, it } from 'vitest';
import { afterLabel, energyLabel, energyLabels, fieldMatching, firstMatch } from './labels.js';

describe('afterLabel', () => {
  it('lit un montant après son libellé, deux-points ou non', () => {
    expect(afterLabel('Dépôt de garantie : 1 008 €', 'Dépôt de garantie')).toBe('1 008 €');
    expect(afterLabel('Dépôt de garantie 830 €', 'Dépôt de garantie')).toBe('830 €');
  });
});

describe('firstMatch', () => {
  it('rend le premier groupe capturé, rogné', () => {
    expect(firstMatch('Surface :  45,5 m²', String.raw`Surface\s*:\s*([\d,]+)`)).toBe('45,5');
  });

  it('ignore la casse, comme les quatre parseurs dont il vient', () => {
    expect(firstMatch('RÉFÉRENCE : AB12', 'référence\\s*:\\s*(\\S+)')).toBe('AB12');
  });

  it('rend `undefined` quand le motif ne trouve rien', () => {
    expect(firstMatch('rien ici', 'Surface\\s*:\\s*(\\d+)')).toBeUndefined();
  });
});

describe('fieldMatching', () => {
  const fields = new Map([
    ['loyer cc', '1 200 €'],
    ['meublé', ''],
    ['dépôt de garantie', '1 100 €'],
  ]);

  it('rend la valeur du premier libellé qui correspond', () => {
    expect(fieldMatching(fields, /^loyer/)).toBe('1 200 €');
  });

  // Un libellé sans valeur sert de case à cocher : ce n'est pas une réponse.
  it('saute un libellé dont la valeur est vide', () => {
    expect(fieldMatching(fields, /meublé/)).toBeUndefined();
  });

  it('rend `undefined` quand aucun libellé ne correspond', () => {
    expect(fieldMatching(fields, /ascenseur/)).toBeUndefined();
  });
});

describe('energyLabel', () => {
  it('garde les sept lettres officielles', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      expect(energyLabel(letter)).toBe(letter);
    }
  });

  it('écarte les non-réponses que les sites écrivent au même endroit', () => {
    for (const value of ['', 'NA', 'Non communiqué', 'Vierge', 'H', 'AB', undefined]) {
      expect(energyLabel(value)).toBeUndefined();
    }
  });

  // Le filtre est volontairement sensible à la casse : une minuscule ne vient
  // jamais d'une étiquette officielle, et l'accepter rouvrirait les faux positifs.
  it('refuse la minuscule', () => {
    expect(energyLabel('c')).toBeUndefined();
  });
});

describe('energyLabels', () => {
  it('pose les deux clés quand les deux étiquettes sont valides', () => {
    expect(energyLabels('C', 'A')).toEqual({ dpe: 'C', ges: 'A' });
  });

  // Pas de `dpe: undefined` : la clé absente dit « pas de mesure publiée ».
  it('n’écrit pas la clé d’une étiquette absente', () => {
    expect(energyLabels('D', 'NA')).toEqual({ dpe: 'D' });
    expect(Object.keys(energyLabels('D', 'NA'))).toEqual(['dpe']);
    expect(energyLabels(undefined, undefined)).toEqual({});
  });

  it('ne recopie jamais le DPE dans le GES', () => {
    expect(energyLabels('C', undefined).ges).toBeUndefined();
  });
});
