/**
 * LES CAS SONT RELEVÉS TELS QUELS sur les annonces actives du 2026-09-10.
 * Une condition mal lue écarte un logement accessible, ou fait espérer un
 * logement inaccessible : les deux coûtent cher.
 */

import { describe, expect, it } from 'vitest';
import { parseRequirements } from './parse-requirements.js';

describe('revenu minimum exigé', () => {
  it('lit les quatre tournures rencontrées', () => {
    expect(parseRequirements('Revenus minimum requis : 1 971 € nets / mois.').minIncome).toBe(1971);
    expect(parseRequirements('GARANTIE LOYERS IMPAYES : Revenu minimum de 4 540€').minIncome).toBe(
      4540,
    );
    expect(
      parseRequirements('soumis à la garantie loyers impayés : revenus minimum requis de 4 216 EUR')
        .minIncome,
    ).toBe(4216);
    expect(parseRequirements('Revenu minimum NET de 3 530€ CDI hors période').minIncome).toBe(3530);
  });

  it('ne prend pas un dépôt de garantie pour un revenu exigé', () => {
    // Le piège : 441 descriptions contiennent « dépôt de garantie », et aucune
    // ne parle des revenus du candidat.
    expect(parseRequirements('Dépôt de garantie : 1180€').minIncome).toBeNull();
    expect(
      parseRequirements('Honoraires à la charge du locataire : 220 € TTC').minIncome,
    ).toBeNull();
    expect(parseRequirements('état des lieux d’entrée : 91 euros').minIncome).toBeNull();
  });

  it('refuse un montant hors des bornes plausibles', () => {
    // En dessous de 500 € on lit des honoraires ; au-dessus de 20 000 €, un
    // revenu annuel ou un prix de vente.
    expect(parseRequirements('Revenu minimum de 200 €').minIncome).toBeNull();
    expect(parseRequirements('Revenu minimum de 45 000 €').minIncome).toBeNull();
  });

  it('lit les tournures que la phrase de GLI emploie ailleurs', () => {
    expect(
      parseRequirements(
        'Il faut un minimum de 1858€ net/mois sans heures supplémentaires, ' +
          'ni primes (assurance garantie des loyers impayés).',
      ).minIncome,
    ).toBe(1858);
    expect(
      parseRequirements(
        'Location soumise à la garantie des loyers impayés : revenu minimum pour y accéder : 3800€',
      ).minIncome,
    ).toBe(3800);
    expect(
      parseRequirements('Revenus minimum exigés (Garantie des Loyers Impayés) : 1850 €/mois')
        .minIncome,
    ).toBe(1850);
    expect(
      parseRequirements('Dossier en Garantie loyers impayés, revenus exigés de 2.430 € par mois.')
        .minIncome,
    ).toBe(2430);
    expect(
      parseRequirements('Selon la GLI il faut avoir des revenus nets de 4050 €').minIncome,
    ).toBe(4050);
  });

  it('ne prend pas « un minimum de X € » pour un revenu sans le mot « net »', () => {
    expect(parseRequirements('Il faut un minimum de 1 200 € de travaux').minIncome).toBeNull();
  });
});

describe('revenu exigé en multiple du loyer', () => {
  it('lit les tournures rencontrées sous GLI', () => {
    expect(
      parseRequirements(
        'Appartement soumis à la GLI, de ce fait il faut percevoir 3 fois le montant du loyer.',
      ).incomeMultiplier,
    ).toBe(3);
    expect(
      parseRequirements('Bien soumis à la GLI, revenus 2,7 x supérieurs au loyer exigés')
        .incomeMultiplier,
    ).toBe(2.7);
    expect(
      parseRequirements(
        'Assurance loyers impayés : revenu net mensuel imposable impérativement ' +
          '2.7 fois supérieur au montant du loyer charges comprises.',
      ).incomeMultiplier,
    ).toBe(2.7);
    expect(
      parseRequirements(
        'devront justifier de revenus nets mensuels équivalents à trois fois le montant du loyer',
      ).incomeMultiplier,
    ).toBe(3);
  });

  it('n’attribue pas au candidat un multiple exigé du garant', () => {
    // « Garants avec des revenus 3 fois supérieurs au loyer » ne dit rien des
    // revenus du locataire : l'appliquer le déclarerait hors dossier à tort.
    expect(
      parseRequirements('Garants avec des revenus 3 fois supérieurs au loyer').incomeMultiplier,
    ).toBeNull();
    expect(
      parseRequirements('Ressources ou garant gagnant 2,5 fois le loyer requis.').incomeMultiplier,
    ).toBeNull();
  });

  it('s’efface devant un montant que l’annonce a calculé elle-même', () => {
    const texte = 'GARANTIE LOYERS IMPAYES : Revenu minimum de 2 400 € net, soit 3 fois le loyer';
    expect(parseRequirements(texte).minIncome).toBe(2400);
    expect(parseRequirements(texte).incomeMultiplier).toBeNull();
  });

  it('refuse un multiple hors des bornes plausibles', () => {
    expect(parseRequirements('ménage 1 fois le loyer').incomeMultiplier).toBeNull();
    expect(parseRequirements('10 fois le montant du loyer').incomeMultiplier).toBeNull();
  });
});

describe('assurance loyers impayés', () => {
  it('la reconnaît sous ses écritures courantes', () => {
    expect(parseRequirements('GARANTIE LOYERS IMPAYES : Revenu minimum').insuredRent).toBe(true);
    expect(parseRequirements('soumis à la garantie des loyers impayés').insuredRent).toBe(true);
    expect(parseRequirements('Profil éligible et accepté en GLI').insuredRent).toBe(true);
  });

  it('la reconnaît quand l’annonce n’écrit qu’« assurance »', () => {
    // Cinq annonces actives n'emploient jamais le mot « garantie ».
    expect(parseRequirements('PROXIMITE TRAMWAY / ASSURANCE LOYERS IMPAYES').insuredRent).toBe(
      true,
    );
    expect(
      parseRequirements('Assurance loyers impayés : le locataire doit gagner 3 fois le loyer')
        .insuredRent,
    ).toBe(true);
  });

  it('reste inconnue quand rien ne la mentionne (§17)', () => {
    expect(parseRequirements('Beau studio proche tram').insuredRent).toBeNull();
  });
});

describe('garanties refusées', () => {
  it('relève les refus nommés', () => {
    const texte =
      'dossier par mail complet avant toute visite garantie loyer impayé exigée, ' +
      'pas de visale, pas de garant.';
    expect(parseRequirements(texte).refusedGuarantees).toEqual(['visale', 'physical']);
    expect(
      parseRequirements('Nous n’acceptons pas les garanties Visale ou GarantMe.').refusedGuarantees,
    ).toEqual(['visale', 'garantme']);
  });

  it('ne compte pas une garantie refusée parmi les garanties acceptées', () => {
    // « pas de visale » contient « visale » : sans le retrait, l'annonce
    // passerait pour accueillante à l'inverse de ce qu'elle dit.
    expect(parseRequirements('garantie loyer impayé exigée, pas de visale').guarantees).toEqual([]);
  });

  it('ne prend pas une EXIGENCE de garant pour un refus', () => {
    // « inutile d'appeler si vous n'avez pas de garant » exige un garant.
    const texte = 'Caution obligatoire (inutile d’appeler si vous n’avez pas de garant)';
    expect(parseRequirements(texte).refusedGuarantees).toEqual([]);
  });

  it('ne refuse rien quand l’annonce ne refuse rien', () => {
    expect(
      parseRequirements('Garantie VISALE acceptée, bien soumis à la garantie des loyers impayés.')
        .refusedGuarantees,
    ).toEqual([]);
  });
});

describe('garanties nommées', () => {
  it('relève les dispositifs cités', () => {
    expect(parseRequirements('Garantie Visale ou GarantMe obligatoire.').guarantees).toEqual([
      'visale',
      'garantme',
    ]);
    expect(parseRequirements('une garantie (VISALE/STUDAPART/GARANTME)').guarantees).toEqual([
      'visale',
      'garantme',
      'studapart',
    ]);
  });

  it('exige une tournure qui EXIGE un garant physique', () => {
    // « dépôt de garantie » n'est pas une garantie de loyer.
    expect(parseRequirements('Dépôt de garantie : 750€').guarantees).toEqual([]);
    expect(parseRequirements('Garant obligatoire').guarantees).toEqual(['physical']);
    expect(parseRequirements('étudiant avec garants').guarantees).toEqual(['physical']);
    expect(parseRequirements('Nécessite une caution solidaire des parents').guarantees).toEqual([
      'physical',
    ]);
  });
});

describe('situations acceptées', () => {
  it('les lit dans la phrase de critères', () => {
    const texte =
      'GARANTIE LOYERS IMPAYES : Revenu minimum de 1 975€ net ' +
      'CDI hors période d’essai / indépendant depuis plus de 2 ans / étudiant avec garants';
    expect(parseRequirements(texte).situations).toEqual(['cdi', 'independant', 'etudiant']);
  });

  it('ne prend pas « idéal étudiant » pour un critère du bailleur', () => {
    // Le mot apparaît partout — « idéal étudiant », « quartier étudiant » — et
    // ne dit alors rien de ce que le bailleur accepte. Sans phrase de critères,
    // aucune situation n'est retenue.
    expect(parseRequirements('Studio idéal étudiant, proche fac').situations).toEqual([]);
  });

  it('ne cherche pas au-delà de la phrase de critères', () => {
    const texte =
      'Revenu minimum de 2 000 € net. CDI exigé. ' +
      'Lorem '.repeat(60) +
      'quartier étudiant très animé';
    expect(parseRequirements(texte).situations).toEqual(['cdi']);
  });
});

describe('une annonce ordinaire n’énonce rien', () => {
  it('rend un objet vide plutôt que des suppositions', () => {
    expect(parseRequirements('Studio de 25 m² avec parking, disponible immédiatement.')).toEqual({
      minIncome: null,
      incomeMultiplier: null,
      insuredRent: null,
      guarantees: [],
      refusedGuarantees: [],
      situations: [],
    });
    expect(parseRequirements(null).minIncome).toBeNull();
    expect(parseRequirements('').insuredRent).toBeNull();
  });
});
