/**
 * Le verdict rendu à un dossier devant une annonce sous assurance loyers
 * impayés.
 *
 * L'ASSUREUR NE FAIT PAS D'EXCEPTION, et c'est ce qui rend l'erreur coûteuse
 * dans les deux sens : annoncer un dossier recevable là où il sera refusé fait
 * perdre une candidature, l'annoncer irrecevable là où il passait fait perdre
 * un logement.
 */

import { describe, expect, it } from 'vitest';
import type { TenantProfile } from './message.js';
import { NO_REQUIREMENTS, checkEligibility, type TenancyRequirements } from './requirements.js';

const PROFILE: TenantProfile = {
  firstName: 'Jean',
  lastName: 'Dupont',
  email: 'jean@example.invalid',
  phone: '06 00 00 00 01',
  situation: 'cdi',
  monthlyIncome: 2000,
  incomeKind: 'net',
  guarantors: [],
  moveInDate: null,
};

const conditions = (partial: Partial<TenancyRequirements>): TenancyRequirements => ({
  ...NO_REQUIREMENTS,
  ...partial,
});

describe('revenu exigé en multiple du loyer', () => {
  it('conclut quand le loyer est connu', () => {
    const gli = conditions({ insuredRent: true, incomeMultiplier: 3 });
    // 3 × 900 = 2 700 € exigés, 2 000 € déclarés : le dossier ne passe pas.
    const verdict = checkEligibility(gli, PROFILE, 900);
    expect(verdict.verdict).toBe('income');
    expect(verdict.reason).toBe('3 × le loyer, soit environ 2700 € exigés, 2000 € déclarés');
  });

  it('ne conclut rien sans le loyer : un multiple nu ne fait pas un seuil', () => {
    const gli = conditions({ insuredRent: true, incomeMultiplier: 3 });
    expect(checkEligibility(gli, PROFILE).verdict).toBe('eligible');
  });

  it('laisse la marge de la base incertaine : hors charges ou charges comprises', () => {
    // 2,7 × 800 = 2 160 € exigés. À 2 000 €, l'écart tient dans l'incertitude
    // de la base — on n'écarte pas le candidat sur une supposition.
    const gli = conditions({ insuredRent: true, incomeMultiplier: 2.7 });
    expect(checkEligibility(gli, PROFILE, 800).verdict).toBe('eligible');
  });

  it('écrit le multiple à la française', () => {
    const gli = conditions({ insuredRent: true, incomeMultiplier: 2.7 });
    expect(checkEligibility(gli, PROFILE, 1200).reason).toContain('2,7 × le loyer');
  });
});

describe('garanties refusées par l’annonce', () => {
  const sansVisale = conditions({ insuredRent: true, refusedGuarantees: ['visale', 'physical'] });

  it('le dit quand le dossier ne tient que par elles', () => {
    const visaleSeule = { ...PROFILE, guarantors: [{ kind: 'visale' as const }] };
    const verdict = checkEligibility(sansVisale, visaleSeule);
    expect(verdict.verdict).toBe('guarantee');
    expect(verdict.reason).toBe('l’annonce refuse Visale');
  });

  it('ne dit rien quand une garantie du dossier reste acceptée', () => {
    const gli = conditions({ insuredRent: true, refusedGuarantees: ['visale'] });
    const deux = {
      ...PROFILE,
      guarantors: [{ kind: 'visale' as const }, { kind: 'physical' as const }],
    };
    expect(checkEligibility(gli, deux).verdict).toBe('eligible');
  });

  it('ne conclut rien d’une garantie « autre », qu’on ne sait pas nommer', () => {
    const autre = { ...PROFILE, guarantors: [{ kind: 'other' as const, name: 'Loca-Pass' }] };
    expect(checkEligibility(sansVisale, autre).verdict).toBe('eligible');
  });

  it('cède le pas au revenu, plus décisif', () => {
    const gli = conditions({ minIncome: 3000, refusedGuarantees: ['visale'] });
    const visaleSeule = { ...PROFILE, guarantors: [{ kind: 'visale' as const }] };
    expect(checkEligibility(gli, visaleSeule).verdict).toBe('income');
  });
});

describe('ce qu’on ne sait pas reste inconnu', () => {
  it('ne conclut rien sans profil', () => {
    const gli = conditions({ insuredRent: true, incomeMultiplier: 3 });
    expect(checkEligibility(gli, null, 900).verdict).toBe('unknown');
  });

  it('ne conclut rien sur un revenu non déclaré', () => {
    const gli = conditions({ insuredRent: true, incomeMultiplier: 3 });
    const sansRevenu = { ...PROFILE, monthlyIncome: null };
    expect(checkEligibility(gli, sansRevenu, 900).verdict).toBe('eligible');
  });

  it('la seule mention de l’assurance ne condamne personne', () => {
    expect(checkEligibility(conditions({ insuredRent: true }), PROFILE, 900).verdict).toBe(
      'eligible',
    );
  });
});
