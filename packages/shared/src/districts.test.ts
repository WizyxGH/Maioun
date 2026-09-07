import { describe, expect, it } from 'vitest';
import { canonicalDistrict, districtLabel, NICE_DISTRICTS } from './districts.js';

describe('canonicalDistrict', () => {
  it('range les GRAPHIES d’un même quartier sous un seul slug', () => {
    // Cent une valeurs distinctes en base pour une quarantaine de lieux réels :
    // cocher « Le Port » aurait raté trente et une annonces rangées « PORT ».
    expect(canonicalDistrict('Vieux Nice')).toBe('vieux-nice');
    expect(canonicalDistrict('Vieux-Nice')).toBe('vieux-nice');
    expect(canonicalDistrict('PORT')).toBe('port');
    expect(canonicalDistrict('Le Port')).toBe('port');
    expect(canonicalDistrict('Liberation')).toBe('liberation');
    expect(canonicalDistrict('Libération')).toBe('liberation');
    expect(canonicalDistrict('- MONT BORON')).toBe('mont-boron');
    expect(canonicalDistrict('Mont-Boron')).toBe('mont-boron');
    expect(canonicalDistrict('Saint Antoine')).toBe('saint-antoine');
  });

  it('retient le quartier le plus PRÉCIS d’un libellé composé', () => {
    // « Nice Ouest » est un secteur qui contient une demi-douzaine de
    // quartiers : le nommer à la place de Madeleine perdrait l'information.
    expect(canonicalDistrict('OUEST MADELEINE')).toBe('madeleine');
    expect(canonicalDistrict('Bas Fabron')).toBe('bas-fabron');
    expect(canonicalDistrict('CENTRE LES MUSICIENS')).toBe('musiciens');
    expect(canonicalDistrict('Gambetta - Fleurs')).toBe('gambetta');
    expect(canonicalDistrict('COLLINES ST PIERRE DE FERIC')).toBe('saint-pierre-de-feric');
  });

  it('garde les secteurs quand rien de plus précis n’est nommé', () => {
    expect(canonicalDistrict('Nice Ouest')).toBe('nice-ouest');
    expect(canonicalDistrict('Nice Nord')).toBe('nice-nord');
  });

  it('n’invente RIEN pour ce qui n’est pas un quartier de Nice (§17)', () => {
    // Ces valeurs traînent bel et bien dans les données : ce sont des communes
    // voisines, ou tout autre chose.
    expect(canonicalDistrict('Cros de Cagnes')).toBeNull();
    expect(canonicalDistrict('LA BOCCA')).toBeNull();
    expect(canonicalDistrict('CROISETTE')).toBeNull();
    expect(canonicalDistrict('Stations VéloBleu')).toBeNull();
    expect(canonicalDistrict('Route de la Baronne')).toBeNull();
    expect(canonicalDistrict(null)).toBeNull();
    expect(canonicalDistrict('')).toBeNull();
  });

  it('exige des MOTS ENTIERS', () => {
    // « Port » est court, et c'est ce qui permet de l'accepter sans récolter
    // n'importe quoi.
    expect(canonicalDistrict('aéroport')).toBeNull();
    expect(canonicalDistrict('reportage')).toBeNull();
  });
});

describe('table des quartiers', () => {
  it('n’a ni slug ni libellé en double', () => {
    const slugs = NICE_DISTRICTS.map((district) => district.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const labels = NICE_DISTRICTS.map((district) => district.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('rend le slug tel quel pour un quartier inconnu', () => {
    expect(districtLabel('riquier')).toBe('Riquier');
    expect(districtLabel('inexistant')).toBe('inexistant');
  });

  it('range chaque slug sous son propre libellé', () => {
    // Un quartier que sa propre étiquette ne retrouve pas serait invisible :
    // l'écran l'afficherait, le filtre ne le reconnaîtrait pas.
    for (const district of NICE_DISTRICTS) {
      expect(canonicalDistrict(district.label)).toBe(district.slug);
    }
  });
});
