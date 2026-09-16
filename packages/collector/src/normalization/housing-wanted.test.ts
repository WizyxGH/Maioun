/**
 * Reconnaître une DEMANDE de logement sans jeter les offres qui lui
 * ressemblent. Les textes ci-dessous sont recopiés de la base du 2026-09-16,
 * coordonnées remplacées.
 */

import { describe, expect, it } from 'vitest';
import { isHousingWanted } from './housing-wanted.js';
import { normalizeAll } from './normalize.js';

describe('une demande de logement', () => {
  it('reconnaît les cinq que ParuVendu nous avait fait entrer', () => {
    const demandes: readonly [string, string][] = [
      [
        'Appartement - 1 pièce(s) - 30 m²',
        'URGENT. RETRAITEE DU CORPS MEDICAL CHERCHE STUDIO T1 SUR NICE OU COMMUNES ' +
          'AGGLOMERANTES SI TRANSPORTS ET COMMERCES PROXIMITE. DAME VALIDE. ' +
          'TELEPHONE 06 00 00 00 01.',
      ],
      [
        'Appartement - 3 pièce(s) - 55 m²',
        'Recherche 3 pièces sur Nice,plus particulièrement Nice nord.Infirmiere ' +
          'travaillant au chu de Nice .CDI garants',
      ],
      [
        'Appartement - 2 pièce(s) - 40 m²',
        'Bonjour.\nJe recherche un appartement autour de Rochefort-du-Gard, ' +
          'Villeneuve les Avignon, les Angles. Un appartement 2 pièces.',
      ],
      [
        'Appartement - 1 pièce(s) - 20 m²',
        "Homme senior retraité de la fonction publique CHERCHE une location d'un T1 " +
          'meublé sur Nice Nord ( mais pas obligatoire ) pour un loyer de 650 € maximum.',
      ],
      [
        'Appartement - 3 pièce(s) - 100 m²',
        'Je suis retraitée et une personne très respectueuse et fiable\n' +
          'Je recherche un appartement en location pour une longue durée UNIQUEMENT.',
      ],
    ];
    for (const [titre, texte] of demandes) expect(isHousingWanted(titre, texte)).toBe(true);
  });

  it('se dit aussi en anglais, et sans détour', () => {
    expect(isHousingWanted('Looking for a studio in Nice', null)).toBe(true);
    expect(isHousingWanted('Room wanted', 'Erasmus student, écrire à moi@example.invalid')).toBe(
      true,
    );
    expect(isHousingWanted('Demande de location', 'Couple avec garants.')).toBe(true);
  });
});

describe('une offre qui parle de recherche', () => {
  it('« je cherche un locataire » : LocService écrit ainsi ses offres', () => {
    expect(
      isHousingWanted(
        'Studio meublé à louer',
        'Je cherche un locataire pour un studio de 22 m².\n\nLocalisé à Nice.',
      ),
    ).toBe(false);
    expect(
      isHousingWanted('Chambre meublée à louer', 'Recherche locataire pour chambre meublée.'),
    ).toBe(false);
    expect(
      isHousingWanted(
        'Colocation',
        'Nous recherchons uniquement des locataires sérieux et propres.',
      ),
    ).toBe(false);
  });

  it('« recherché » : l’adjectif que l’absence d’accent rend identique au verbe', () => {
    expect(
      isHousingWanted('Appartement 3P', 'Situé dans un secteur calme et recherché, le bien est…'),
    ).toBe(false);
    expect(
      isHousingWanted(
        'Chambre',
        'Idéal pour étudiants, secteur très recherché pour la colocation.',
      ),
    ).toBe(false);
    expect(isHousingWanted('Studio', 'Votre recherche est terminée : visitez sans tarder.')).toBe(
      false,
    );
  });

  it('« à la recherche de » quand c’est le lecteur qu’on décrit', () => {
    expect(
      isHousingWanted(
        '2 pièces meublé',
        "Vous êtes à la recherche d'un appartement spacieux et lumineux à Nice ?",
      ),
    ).toBe(false);
    expect(
      isHousingWanted(
        'Studio',
        "Idéal pour une personne seule ou un étudiant à la recherche d'un logement pratique.",
      ),
    ).toBe(false);
    expect(
      isHousingWanted('Colocation', 'PROFIL RECHERCHÉ\n\nColocation calme et respectueuse.'),
    ).toBe(false);
    expect(
      isHousingWanted('Studio', 'Merci de joindre votre demande de location au dossier.'),
    ).toBe(false);
  });

  it('la signature d’agence collée en fin d’annonce ne condamne pas l’offre', () => {
    const offre =
      'Bel appartement de 2 pièces au calme, cuisine équipée, balcon plein sud. ' +
      'Chauffage individuel, cave et parking. Disponible immédiatement. ' +
      'Résidence sécurisée avec interphone et local à vélos, à deux pas du tramway, ' +
      'des commerces de proximité, des écoles et de la coulée verte. ' +
      'Double vitrage, volets roulants, salle d’eau refaite à neuf et rangements. ' +
      'Loyer 780 € charges comprises, dépôt de garantie 700 €, honoraires 250 €. ' +
      'Visites sur rendez-vous au 06 00 00 00 02 ou par courriel à agence@example.invalid. ' +
      'Notre agence recherche en permanence des appartements à louer pour sa clientèle.';
    expect(offre.indexOf('Notre agence recherche')).toBeGreaterThan(400);
    expect(isHousingWanted('Appartement 2 pièces - 45 m²', offre)).toBe(false);
  });
});

/**
 * Intitulés RECOPIÉS de la rubrique des demandes de ParuVendu
 * (`/immobilier/demande-de-location/`, relevée le 2026-09-16). Ceux qui sont
 * reconnus, et surtout ceux qui ne le sont pas — parce qu'ils ne disent rien
 * qu'une offre ne dirait.
 */
describe('la rubrique des demandes, en vrai', () => {
  it('reconnaît ceux qui nomment ce qu’ils cherchent', () => {
    const reconnus = [
      'Recherche studio meublé alpes-maritimes',
      'Contractuel au département (55 ans) cherche studio a nice',
      'Recherche studio ou petit 2 pièces sur nice',
      'Retraite recherche un t 3 avec ascenseur ou de plein pied',
      'Recherche logement 3 pièces / 2 chambres',
      'Je cherches un appartement 2 chambres',
      'Cherche logement t2',
      'Recherche appartement une chambre le mans louer',
      'Demande de maison individuelle',
      'Couple recherche',
    ];
    for (const titre of reconnus) expect(isHousingWanted('', titre)).toBe(true);
  });

  it('en laisse passer la moitié, et c’est voulu', () => {
    // Ces intitulés-là sont indiscernables de ceux d'une offre : les
    // reconnaître coûterait de vraies annonces.
    const manques = ['Maison', 'T 2 vide', 'Appartement 3 pièces', 'Urgent', 'Recherche'];
    for (const titre of manques) expect(isHousingWanted('', titre)).toBe(false);
  });
});

describe('le lot normalisé', () => {
  const brute = (title: string, description: string) => ({
    sourceRef: '1292785316',
    sourceUrl: 'https://www.paruvendu.fr/immobilier/location/appartement/1292785316',
    title,
    description,
    priceText: '700 € CC',
    areaText: '30 m²',
  });
  const DEMANDE = brute(
    'Appartement - 1 pièce(s) - 30 m²',
    'RETRAITEE CHERCHE STUDIO T1 SUR NICE. URGENT. Téléphone 06 00 00 00 04.',
  );
  const OFFRE = brute(
    'Appartement - 1 pièce(s) - 30 m²',
    'Studio meublé, secteur recherché, libre de suite.',
  );

  it('retire la demande de la source qui en héberge, et dit laquelle', () => {
    const vus: { ref: string; motif: string; retiree: boolean }[] = [];
    const lot = normalizeAll([DEMANDE, OFFRE], {
      sourceId: 'paruvendu',
      nowMs: Date.parse('2026-09-16T10:00:00Z'),
      hostsWantedAds: true,
      onWantedAd: (raw, motif, retiree) => vus.push({ ref: raw.sourceRef, motif, retiree }),
    });
    expect(lot).toHaveLength(1);
    expect(lot[0]?.price).toBe(700);
    expect(vus).toEqual([{ ref: '1292785316', motif: 'cherche studio', retiree: true }]);
  });

  it('ailleurs, elle est signalée mais GARDÉE : une agence n’en publie pas', () => {
    const vus: boolean[] = [];
    const lot = normalizeAll([DEMANDE], {
      sourceId: 'laforet',
      nowMs: Date.parse('2026-09-16T10:00:00Z'),
      onWantedAd: (_raw, _motif, retiree) => vus.push(retiree),
    });
    expect(lot).toHaveLength(1);
    expect(vus).toEqual([false]);
  });

  it('une offre ne fait rien dire du tout', () => {
    const vus: string[] = [];
    normalizeAll([OFFRE], {
      sourceId: 'paruvendu',
      nowMs: Date.parse('2026-09-16T10:00:00Z'),
      hostsWantedAds: true,
      onWantedAd: (_raw, motif) => vus.push(motif),
    });
    expect(vus).toEqual([]);
  });
});
