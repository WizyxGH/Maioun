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
});

describe('assurance loyers impayés', () => {
  it('la reconnaît sous ses écritures courantes', () => {
    expect(parseRequirements('GARANTIE LOYERS IMPAYES : Revenu minimum').insuredRent).toBe(true);
    expect(parseRequirements('soumis à la garantie des loyers impayés').insuredRent).toBe(true);
    expect(parseRequirements('Profil éligible et accepté en GLI').insuredRent).toBe(true);
  });

  it('reste inconnue quand rien ne la mentionne (§17)', () => {
    expect(parseRequirements('Beau studio proche tram').insuredRent).toBeNull();
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
      insuredRent: null,
      guarantees: [],
      situations: [],
    });
    expect(parseRequirements(null).minIncome).toBeNull();
    expect(parseRequirements('').insuredRent).toBeNull();
  });
});
