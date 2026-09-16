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
   * Le même seuil écrit en MULTIPLE DU LOYER : « il faut percevoir 3 fois le
   * montant du loyer », « revenus 2,7 x supérieurs au loyer ».
   *
   * C'est la forme la plus courante là où la GLI est nommée, et elle ne donne
   * aucun montant : seul le loyer de l'annonce permet de la convertir, ce que
   * fait `checkEligibility` — et seulement si le loyer est connu.
   */
  readonly incomeMultiplier: number | null;
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
  /**
   * Garanties que l'annonce REFUSE nommément — « pas de visale, pas de
   * garant », « nous n'acceptons pas les garanties Visale ou GarantMe ».
   *
   * Un refus n'est pas l'absence d'une mention : il rend le logement
   * inaccessible à un dossier qui ne tient que par cette garantie-là, et c'est
   * précisément ce qu'on veut dire avant le clic. Vide = rien n'est refusé
   * explicitement, ce qui est le cas de presque toutes les annonces.
   */
  readonly refusedGuarantees: readonly GuaranteeKind[];
  /** Situations professionnelles nommées. Vide = rien n'est dit. */
  readonly situations: readonly AcceptedSituation[];
}

/** Aucune condition connue : ce que rend une annonce qui n'en énonce aucune. */
export const NO_REQUIREMENTS: TenancyRequirements = {
  minIncome: null,
  incomeMultiplier: null,
  insuredRent: null,
  guarantees: [],
  refusedGuarantees: [],
  situations: [],
};

/** `true` si l'annonce énonce au moins une condition. */
export function hasRequirements(requirements: TenancyRequirements): boolean {
  return (
    requirements.minIncome !== null ||
    requirements.incomeMultiplier !== null ||
    requirements.insuredRent !== null ||
    requirements.guarantees.length > 0 ||
    requirements.refusedGuarantees.length > 0 ||
    requirements.situations.length > 0
  );
}

/** Ce qu'on peut dire d'un dossier face à une annonce. */
export type EligibilityVerdict = 'unknown' | 'eligible' | 'income' | 'situation' | 'guarantee';

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
 * Le seuil de revenu, en euros, tel qu'on peut l'établir.
 *
 * Écrit en euros, il vaut tel quel. Écrit en multiple du loyer — la forme la
 * plus courante sous GLI —, il ne vaut que multiplié par le loyer, et l'on ne
 * tranche donc rien quand le loyer est inconnu.
 *
 * `approximate` retient que la BASE du multiple est incertaine : les annonces
 * disent tantôt « 3 fois le loyer hors charges », tantôt « 2,7 fois le loyer
 * charges comprises », et notre loyer n'est pas toujours celui-là.
 */
function requiredIncome(
  requirements: TenancyRequirements,
  rent: number | null,
): { readonly amount: number; readonly approximate: boolean } | null {
  if (requirements.minIncome !== null) {
    return { amount: requirements.minIncome, approximate: false };
  }
  if (requirements.incomeMultiplier === null || rent === null || rent <= 0) return null;
  return { amount: requirements.incomeMultiplier * rent, approximate: true };
}

/** Les garanties du profil, dans le vocabulaire des annonces. */
function profileGuarantees(profile: TenantProfile): readonly GuaranteeKind[] {
  const kinds: GuaranteeKind[] = [];
  for (const guarantor of profile.guarantors) {
    // « autre » n'est comparable à rien : on ne sait pas de quel dispositif il
    // s'agit, et le compter pour refusé condamnerait un dossier à tort.
    if (guarantor.kind !== 'other') kinds.push(guarantor.kind);
  }
  return kinds;
}

/**
 * Ce que ce dossier peut espérer de cette annonce.
 *
 * QUATRE RÉPONSES SEULEMENT, et « on ne sait pas » en est une. Elle domine :
 * la plupart des annonces n'énoncent aucune condition, et prétendre trancher
 * reviendrait à écarter des logements sur une supposition.
 *
 * LE DOUTE PROFITE AU CANDIDAT. Un revenu à un pour cent du seuil ne se déclare
 * pas insuffisant : le calcul brut → net est approximatif, les primes ne sont
 * pas dans le profil, et un refus affiché à tort coûte un logement.
 *
 * @param rent loyer de l'annonce, seul moyen de convertir « 3 fois le loyer »
 *             en euros. Absent, un seuil écrit sous cette forme ne conclut rien.
 */
export function checkEligibility(
  requirements: TenancyRequirements,
  profile: TenantProfile | null,
  rent: number | null = null,
): Eligibility {
  if (profile === null || !hasRequirements(requirements)) {
    return { verdict: 'unknown', reason: null };
  }

  const income = netMonthlyIncome(profile);
  const required = requiredIncome(requirements, rent);
  if (required !== null && income !== null) {
    // Cinq pour cent de marge : le passage du brut au net est approximatif, et
    // le profil ne porte ni prime ni treizième mois. Quinze pour cent quand le
    // seuil vient d'un multiple, dont la base — avec ou sans les charges —
    // n'est pas dite.
    const margin = required.approximate ? 0.85 : 0.95;
    if (income < required.amount * margin) {
      const seuil = required.approximate
        ? `${formatMultiplier(requirements.incomeMultiplier)} × le loyer, soit environ ${Math.round(required.amount)} €`
        : `${Math.round(required.amount)} € net`;
      return {
        verdict: 'income',
        reason: `${seuil} exigés, ${Math.round(income)} € déclarés`,
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

  /**
   * TOUTES LES GARANTIES DU DOSSIER REFUSÉES, ET RIEN D'AUTRE POUR TENIR.
   *
   * En dernier, parce qu'un revenu insuffisant est plus décisif. Et seulement
   * si le refus les couvre TOUTES : un candidat dont la Visale est refusée
   * mais qui a un garant physique reste un candidat.
   */
  const mine = profileGuarantees(profile);
  if (
    requirements.refusedGuarantees.length > 0 &&
    mine.length > 0 &&
    mine.every((kind) => requirements.refusedGuarantees.includes(kind))
  ) {
    return {
      verdict: 'guarantee',
      reason: `l’annonce refuse ${[...new Set(mine)].map(guaranteeLabel).join(', ')}`,
    };
  }

  return { verdict: 'eligible', reason: null };
}

/** « 2,7 » et non « 2.7 » : un multiple s'écrit à la française. */
export function formatMultiplier(multiplier: number | null): string {
  return multiplier === null ? '' : String(multiplier).replace('.', ',');
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
