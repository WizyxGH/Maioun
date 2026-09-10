/**
 * Les conditions qu'un bailleur pose AVANT la visite.
 *
 * CE QUI FAIT ÉCHOUER UNE CANDIDATURE N'EST PRESQUE JAMAIS LE LOGEMENT. C'est
 * un revenu minimum qu'on ne connaissait pas, un CDI qu'on n'a pas, une
 * garantie que le bailleur n'accepte pas. L'information est écrite dans la
 * description — « GARANTIE LOYERS IMPAYES : Revenu minimum de 1 975 € net /
 * CDI hors période d'essai / indépendant depuis plus de 2 ans » — et personne
 * ne la lit avant d'avoir appelé, attendu, envoyé son dossier et reçu un refus.
 *
 * ON LA LIT DONC, ET ON LA COMPARE au profil déjà saisi. Le résultat n'est pas
 * un filtre imposé mais un AVERTISSEMENT : le bailleur peut faire une
 * exception, l'annonce peut être mal rédigée, et une candidature écartée
 * d'office est une candidature perdue à coup sûr.
 *
 * RIEN N'EST DEVINÉ. Une condition absente de la description reste `null`, et
 * l'annonce est alors traitée comme accessible — c'est le cas de l'immense
 * majorité (§17).
 */

import type { TenantProfile } from './message.js';

/** Une forme de garantie que le bailleur nomme explicitement. */
export type GuaranteeKind = 'visale' | 'garantme' | 'studapart' | 'physical';

/** Une situation professionnelle que le bailleur nomme explicitement. */
export type AcceptedSituation = 'cdi' | 'independant' | 'etudiant' | 'fonctionnaire';

export interface TenancyRequirements {
  /**
   * Revenu mensuel NET minimum exigé, en euros.
   *
   * Presque toujours le seuil de l'assurance loyers impayés — trois fois le
   * loyer charges comprises, parfois trois fois et demie.
   */
  readonly minIncome: number | null;
  /**
   * `true` si le bailleur a souscrit une assurance loyers impayés.
   *
   * Ce n'est pas un détail administratif : c'est l'ASSUREUR qui fixe alors les
   * critères, et il n'accorde pas d'exception. Un dossier qui ne passe pas la
   * grille est refusé avant même d'arriver au bailleur.
   */
  readonly insuredRent: boolean | null;
  /** Garanties nommées dans l'annonce. Vide = rien n'est dit. */
  readonly guarantees: readonly GuaranteeKind[];
  /** Situations professionnelles nommées. Vide = rien n'est dit. */
  readonly situations: readonly AcceptedSituation[];
}

/** Aucune condition connue : ce que rend une annonce qui n'en énonce aucune. */
export const NO_REQUIREMENTS: TenancyRequirements = {
  minIncome: null,
  insuredRent: null,
  guarantees: [],
  situations: [],
};

/** `true` si l'annonce énonce au moins une condition. */
export function hasRequirements(requirements: TenancyRequirements): boolean {
  return (
    requirements.minIncome !== null ||
    requirements.insuredRent !== null ||
    requirements.guarantees.length > 0 ||
    requirements.situations.length > 0
  );
}

/** Ce qu'on peut dire d'un dossier face à une annonce. */
export type EligibilityVerdict = 'unknown' | 'eligible' | 'income' | 'situation';

export interface Eligibility {
  readonly verdict: EligibilityVerdict;
  /** Ce qui coince, en une phrase. `null` quand rien ne coince. */
  readonly reason: string | null;
}

/** La correspondance entre nos situations de profil et celles des annonces. */
const SITUATION_MAP: Readonly<Record<string, AcceptedSituation>> = {
  cdi: 'cdi',
  // Une période d'essai N'EST PAS un CDI aux yeux d'un assureur : c'est
  // précisément la formule « CDI hors période d'essai » qu'ils écrivent tous.
  fonctionnaire: 'fonctionnaire',
  independant: 'independant',
  liberal: 'independant',
  dirigeant: 'independant',
  etudiant: 'etudiant',
  alternance: 'etudiant',
};

/**
 * Le revenu mensuel net du candidat, garants compris ?
 *
 * NON : LES GARANTS NE S'ADDITIONNENT PAS AU REVENU. Un assureur compare son
 * seuil au revenu du LOCATAIRE, et demande au garant de couvrir le sien
 * séparément. Compter les deux ensemble ferait passer pour éligible un dossier
 * qui sera refusé, ce qui est exactement l'erreur qu'on veut éviter.
 *
 * Le profil peut déclarer un brut : on le ramène au net par le coefficient
 * usuel du secteur privé (÷ 1,23). C'est une approximation, et le verdict en
 * tient compte — voir `checkEligibility`.
 */
function netMonthlyIncome(profile: TenantProfile): number | null {
  if (profile.monthlyIncome === null) return null;
  return profile.incomeKind === 'gross' ? profile.monthlyIncome / 1.23 : profile.monthlyIncome;
}

/**
 * Ce que ce dossier peut espérer de cette annonce.
 *
 * TROIS RÉPONSES SEULEMENT, et « on ne sait pas » en est une. Elle domine :
 * la plupart des annonces n'énoncent aucune condition, et prétendre trancher
 * reviendrait à écarter des logements sur une supposition.
 *
 * LE DOUTE PROFITE AU CANDIDAT. Un revenu à un pour cent du seuil ne se déclare
 * pas insuffisant : le calcul brut → net est approximatif, les primes ne sont
 * pas dans le profil, et un refus affiché à tort coûte un logement.
 */
export function checkEligibility(
  requirements: TenancyRequirements,
  profile: TenantProfile | null,
): Eligibility {
  if (profile === null || !hasRequirements(requirements)) {
    return { verdict: 'unknown', reason: null };
  }

  const income = netMonthlyIncome(profile);
  if (requirements.minIncome !== null && income !== null) {
    // Cinq pour cent de marge : le passage du brut au net est approximatif, et
    // le profil ne porte ni prime ni treizième mois.
    if (income < requirements.minIncome * 0.95) {
      return {
        verdict: 'income',
        reason: `${Math.round(requirements.minIncome)} € net exigés, ${Math.round(income)} € déclarés`,
      };
    }
  }

  if (requirements.situations.length > 0 && profile.situation !== '') {
    const mine = SITUATION_MAP[profile.situation];
    if (mine === undefined || !requirements.situations.includes(mine)) {
      return {
        verdict: 'situation',
        // On nomme ce qui est ACCEPTÉ, pas ce qui est refusé : c'est la seule
        // chose que l'annonce dit réellement.
        reason: `l’annonce demande : ${requirements.situations.map(situationLabel).join(', ')}`,
      };
    }
  }

  return { verdict: 'eligible', reason: null };
}

/** L'intitulé d'une situation acceptée, tel qu'on l'écrit à l'écran. */
export function situationLabel(situation: AcceptedSituation): string {
  switch (situation) {
    case 'cdi':
      return 'CDI hors période d’essai';
    case 'independant':
      return 'indépendant établi';
    case 'etudiant':
      return 'étudiant avec garant';
    case 'fonctionnaire':
      return 'fonctionnaire';
  }
}

/** L'intitulé d'une garantie, tel qu'on l'écrit à l'écran. */
export function guaranteeLabel(guarantee: GuaranteeKind): string {
  switch (guarantee) {
    case 'visale':
      return 'Visale';
    case 'garantme':
      return 'Garantme';
    case 'studapart':
      return 'Studapart';
    case 'physical':
      return 'garant physique';
  }
}
