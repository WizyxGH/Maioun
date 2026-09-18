import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { EMPTY_CONTACT, SHORT_TERM_LEASE_FEATURE, STUDENT_HOUSING_FEATURE } from '@maioun/shared';
import {
  bestAddress,
  cleanAddress,
  dedupeStreetAddress,
  normalizeListing,
  rederiveFromText,
} from './normalize.js';

describe('district (quartier)', () => {
  it('reprend le quartier de extra.quartier (ex. Orpi)', () => {
    const n = normalizeListing(
      raw({ cityText: 'nice', extra: { reference: 'r1', quartier: 'Madeleine' } }),
      OPTIONS,
    );
    expect(n?.district).toBe('Madeleine');
  });

  it('district null quand la source ne publie pas de quartier', () => {
    const n = normalizeListing(raw({ cityText: 'nice' }), OPTIONS);
    expect(n?.district).toBeNull();
  });
});

describe('bestAddress — la plus précise gagne', () => {
  it('préfère la voie NUMÉROTÉE du texte à la voie nue de la source', () => {
    // Relevé sur ici-immobilier : le champ dédié dit « avenue Sainte Colette »,
    // la description « 31, avenue Sainte Colette ». C'est le numéro qui place le
    // point sur la carte ; sans lui le géocodeur vise le milieu de la voie.
    expect(bestAddress('avenue Sainte Colette', '31, avenue Sainte Colette')).toBe(
      '31, avenue Sainte Colette',
    );
    expect(bestAddress('impasse Guidotti', '7, impasse Guidotti')).toBe('7, impasse Guidotti');
  });

  it('préfère une vraie voie à un QUARTIER rangé dans le champ adresse', () => {
    // « Californie, Nice » a l'air d'une adresse et ne situe rien de plus précis
    // que le quartier, déjà connu par ailleurs.
    expect(bestAddress('Californie, Nice', '230 avenue de la Californie')).toBe(
      '230 avenue de la Californie',
    );
  });

  it('préfère une voie numérotée du texte à une AUTRE voie nue', () => {
    // Orpi range son secteur, « Promenade des Anglais », dans le champ adresse.
    expect(bestAddress('Promenade des Anglais', '17 AV DE LA FICTIVE')).toBe('17 AV DE LA FICTIVE');
  });

  it('ne recolle jamais le numéro d’une voie à une autre', () => {
    expect(bestAddress('avenue Sainte Colette', '31 rue Barla')).not.toMatch(/31.*colette/i);
  });

  it('retire l’accroche qu’une ancienne extraction avait gardée après un tiret', () => {
    expect(bestAddress('39 BD FICTIF - NICE RIQUIER Votre conseiller', '39 BD FICTIF')).toBe(
      '39 BD FICTIF',
    );
    expect(bestAddress('4 RUE FICTIVE -', '4 RUE FICTIVE')).toBe('4 RUE FICTIVE');
    // Sans tiret, la suite peut appartenir au nom : on garde la stockée.
    expect(bestAddress('4 Avenue des Rives Soleil Levant', '4 AVENUE DES RIVES')).toBe(
      '4 Avenue des Rives Soleil Levant',
    );
  });

  it('garde le champ dédié quand il est aussi précis', () => {
    expect(
      bestAddress('16 Avenue Alfred Borriglione 06100 Nice FR', '16 Avenue Alfred Borriglione'),
    ).toBe('16 Avenue Alfred Borriglione 06100 Nice FR');
    expect(bestAddress('192 Av. de la Californie, 06200 Nice', 'AVENUE DE LA CALIFORNIE')).toBe(
      '192 Av. de la Californie, 06200 Nice',
    );
  });

  it('termine un mot coupé, sans se laisser prolonger par une accroche', () => {
    // « 132 corniche fle » est amputée : la suite ne commence pas par un espace.
    expect(bestAddress('132 corniche fle', '132 corniche fleurie')).toBe('132 corniche fleurie');
    // « avenue Malaussena » est entière : ce qui suit est de la publicité.
    expect(bestAddress('avenue Malaussena', 'avenue Malaussena très bien placé')).toBe(
      'avenue Malaussena',
    );
  });
});

describe('cleanAddress — restes qui ne situent pas le bien', () => {
  const nice = { city: 'nice', postalCode: '06000', text: '' };

  it('retire la ville et le code postal de l’annonce en queue', () => {
    expect(cleanAddress('130 Boulevard Fictif Nice', nice)).toBe('130 Boulevard Fictif');
    expect(cleanAddress('61 RUE FICTIVE 06000 NICE', nice)).toBe('61 RUE FICTIVE');
    expect(cleanAddress('4 RUE FICTIVE, Nice -', nice)).toBe('4 RUE FICTIVE');
    expect(
      cleanAddress('89 chemin fictif saint andré de la roche', {
        ...nice,
        city: 'saint andre de la roche',
      }),
    ).toBe('89 chemin fictif');
  });

  it('retire aussi un code postal d’un autre secteur', () => {
    expect(cleanAddress('2 avenue Fictive 06100 NICE', nice)).toBe('2 avenue Fictive');
  });

  it('garde la ville quand elle fait partie du nom de voie', () => {
    expect(cleanAddress('12 avenue de Nice', nice)).toBe('12 avenue de Nice');
    expect(cleanAddress('Promenade de Nice', nice)).toBe('Promenade de Nice');
    expect(cleanAddress('06000 Nice', nice)).toBe('06000 Nice');
  });

  it('retire une année prise pour un numéro, si le texte la date', () => {
    const text = 'BAIL du 1er septembre au 31 mai 2027 Boulevard Fictif - 3 pièces';
    expect(cleanAddress('2027 Boulevard Fictif -', { ...nice, text })).toBe('Boulevard Fictif');
  });

  it('garde un grand numéro que le texte ne date pas', () => {
    const text = 'Maison au 2000 route Fictive, calme';
    expect(cleanAddress('2000 route Fictive', { ...nice, text })).toBe('2000 route Fictive');
  });
});

describe('dedupeStreetAddress — voie saisie en double par la source', () => {
  it('supprime la voie répétée et garde le numéro', () => {
    expect(dedupeStreetAddress('Rue Edouard Scoffier 28 Rue Edouard Scoffier')).toBe(
      '28 Rue Edouard Scoffier',
    );
  });

  it('garde la moitié numérotée quand la source colle DEUX voies', () => {
    // Relevé dans le JSON-LD de climmo le 2026-09-04 : la voie de l'agence
    // collée à celle du bien. Le géocodeur n'y retrouvait rien — donc ni point
    // sur la carte, ni temps de trajet.
    expect(dedupeStreetAddress("Rue de l'Industrie 17 rue des Comptoirs du Littoral")).toBe(
      '17 rue des Comptoirs du Littoral',
    );
  });

  it('ne coupe pas une adresse dont le numéro suit la voie', () => {
    // « Rue de la Paix 12 » n'est pas deux adresses : la moitié gardée doit
    // elle-même commencer par un numéro SUIVI d'un type de voie (§17).
    expect(dedupeStreetAddress('Rue de la Paix 12')).toBe('Rue de la Paix 12');
    expect(dedupeStreetAddress('Avenue Jean Médecin 06000 Nice')).toBe(
      'Avenue Jean Médecin 06000 Nice',
    );
  });

  it('laisse une adresse normale intacte', () => {
    expect(dedupeStreetAddress('28 Rue Edouard Scoffier')).toBe('28 Rue Edouard Scoffier');
    expect(dedupeStreetAddress('12 Avenue de la Californie')).toBe('12 Avenue de la Californie');
  });

  it('tranche entre deux voies distinctes en faveur de la NUMÉROTÉE', () => {
    // DÉCISION RETOURNÉE le 2026-09-04. On gardait la chaîne entière, par
    // prudence : ne pas choisir entre deux voies. Mais la chaîne entière n'est
    // une adresse pour personne — aucun géocodeur ne la résout, donc ni point
    // sur la carte ni temps de trajet, et c'est elle qui s'affiche.
    //
    // Le numéro, lui, ne modifie qu'UNE voie : celle qui le suit. La moitié
    // numérotée est donc une adresse complète et cohérente. Vérifié sur climmo,
    // dont la description confirmait « 17 rue des Comptoirs du Littoral ».
    expect(dedupeStreetAddress('Avenue de la Gare 12 Boulevard Victor Hugo')).toBe(
      '12 Boulevard Victor Hugo',
    );
  });

  it('gère null', () => {
    expect(dedupeStreetAddress(null)).toBeNull();
  });
});

const OPTIONS = { sourceId: 'test', nowMs: Date.parse('2026-08-19T12:00:00Z') };

function raw(over: Partial<RawListing>): RawListing {
  return {
    sourceRef: 'ref1',
    sourceUrl: 'https://exemple.fr/location/nice/ref1',
    ...over,
  } as RawListing;
}

describe('normalizeListing — adresse de la source nettoyée', () => {
  it('retire la ville que le champ adresse répète', () => {
    const n = normalizeListing(
      raw({ addressText: '7 Rue Fictive NICE', cityText: 'Nice', postalCodeText: '06000' }),
      OPTIONS,
    );
    expect(n?.address).toBe('7 Rue Fictive');
  });
});

describe('normalizeListing — description', () => {
  it('garde les paragraphes publiés par la source', () => {
    // Aplatie en une ligne, la description s'affichait d'un seul bloc.
    const n = normalizeListing(
      raw({ description: 'Rue Exemple, proche du tram.  \n\n\n\nSéjour.\r\n- Cave\n- Balcon  ' }),
      OPTIONS,
    );
    expect(n?.description).toBe('Rue Exemple, proche du tram.\n\nSéjour.\n- Cave\n- Balcon');
  });

  it('rend null une description faite de blancs', () => {
    expect(normalizeListing(raw({ description: ' \n \n' }), OPTIONS)?.description).toBeNull();
  });
});

describe('normalizeListing — exclusion des ventes (§3)', () => {
  it('garde une location normale', () => {
    const result = normalizeListing(
      raw({ title: 'Appartement à louer 2 pièces', priceText: '700 € / mois' }),
      OPTIONS,
    );
    expect(result).not.toBeNull();
  });

  it('garde une location CHÈRE (loyer élevé, pas une vente)', () => {
    const result = normalizeListing(
      raw({ title: 'Villa à louer avec piscine', priceText: '8500 € / mois' }),
      OPTIONS,
    );
    expect(result).not.toBeNull();
  });

  it('écarte un bien à vendre (URL de vente)', () => {
    const result = normalizeListing(
      raw({ sourceUrl: 'https://exemple.fr/vente/nice/ref9', title: 'Appartement 3 pièces' }),
      OPTIONS,
    );
    expect(result).toBeNull();
  });

  it('écarte un bien à vendre (texte explicite, sans marqueur de location)', () => {
    const result = normalizeListing(
      raw({ title: 'Maison à vendre', description: 'Frais de notaire en sus' }),
      OPTIONS,
    );
    expect(result).toBeNull();
  });

  it('ne se laisse pas piéger : « proche des commerces » n’est pas une vente', () => {
    const result = normalizeListing(
      raw({
        title: 'Studio à louer',
        description: 'Proche des commerces et de la vente à emporter',
      }),
      OPTIONS,
    );
    expect(result).not.toBeNull();
  });
});

describe('normalizeListing — tarifs à courte période', () => {
  it('écarte un loyer à la semaine ou à la nuit, quelle que soit la source', () => {
    for (const priceText of ['700 €/semaine', '95 € la nuit', '1 200 € / sem.', '450 per week']) {
      expect(normalizeListing(raw({ title: 'T2 Nice', priceText }), OPTIONS)).toBeNull();
    }
  });

  it('garde le loyer au mois, et le bail étudiant de neuf mois qui cite son tarif d’été', () => {
    const student = normalizeListing(
      raw({
        title: 'Studio meublé',
        priceText: '650 € / mois',
        description: 'Bail étudiant de septembre à juin, saisonnier en juillet : 500 €/semaine.',
      }),
      OPTIONS,
    );
    expect(student?.price).toBe(650);
    expect(student?.features).toContain(SHORT_TERM_LEASE_FEATURE);
  });
});

describe('normalizeListing — loyers de prestige', () => {
  it('admet une villa à 25 000 €/mois quand la surface la rend plausible', () => {
    const villa = normalizeListing(
      raw({ title: 'Villa vue mer', priceText: '25 000 € / Mois', areaText: '450 m²' }),
      OPTIONS,
    );
    expect(villa?.price).toBe(25_000);
  });

  it('refuse un prix de vente pris pour un loyer', () => {
    const studio = normalizeListing(
      raw({ title: 'Studio', priceText: '85 000 €', areaText: '22 m²' }),
      OPTIONS,
    );
    expect(studio?.price).toBeNull();
    const sansSurface = normalizeListing(raw({ title: 'Villa', priceText: '25 000 €' }), OPTIONS);
    expect(sansSurface?.price).toBeNull();
    const vente = normalizeListing(
      raw({ title: 'Villa', priceText: '1 250 000 €', areaText: '900 m²' }),
      OPTIONS,
    );
    expect(vente?.price).toBeNull();
  });
});

describe('rederiveFromText — rattrapage des annonces déjà en base', () => {
  /** Une occurrence telle qu'elle revient de la base. */
  const stored = (over: Record<string, unknown> = {}): never =>
    ({
      id: 'dinamy:30',
      title: 'Location meublée Appartement 1 pièce',
      description: 'Rue Smolett, tout proche du port, ce grand studio meublé.',
      address: null,
      propertyType: 'studio',
      features: ['Ascenseur', '2e étage'],
      ...over,
    }) as never;

  it('nettoie l’adresse STOCKÉE : ville en queue, année prise pour un numéro', () => {
    expect(
      rederiveFromText(
        stored({ address: '130 Boulevard Fictif Nice', city: 'nice', postalCode: '06000' }),
      )?.address,
    ).toBe('130 Boulevard Fictif');
    expect(
      rederiveFromText(
        stored({
          address: '2027 Boulevard Fictif -',
          title: 'COLOCATION',
          description: 'BAIL du 1er septembre au 31 mai 2027 Boulevard Fictif - 3 pièces',
        }),
      )?.address,
    ).toBe('Boulevard Fictif');
  });

  it('retrouve la rue restée dans la description', () => {
    // Le cas qui laissait 86 fiches sur 93 sans adresse : l'extraction ne
    // savait pas lire une voie sans numéro le jour de la collecte.
    expect(rederiveFromText(stored())?.address).toBe('Rue Smolett');
  });

  it('remplace une adresse AMPUTÉE que le texte prolonge', () => {
    // Relevé le 2026-09-09 : la description était tronquée à cent vingt signes
    // avant la recherche, et le 120e tombait au milieu du nom de voie. « 132
    // corniche fle » a toutes les apparences d’une rue — ni parking, ni prose —
    // donc elle passait chaque contrôle et le rejeu la gardait à jamais.
    // Corriger l’extraction ne suffisait pas : les fiches en base restaient
    // fausses, sans point sur la carte ni temps de trajet.
    const rejoue = rederiveFromText(
      stored({
        address: '132 corniche fle',
        title: 'Fabron 06200 Nice - Studio avec terrasse',
        description:
          'Nice Ouest , studio de 23 m² au rez de chaussée avec terrasse et place de ' +
          "parking en sous-sol, situé au 132 corniche fleurie, 06200 Nice au sein d'une copropriété",
      }),
    );
    expect(rejoue?.address).toBe('132 corniche fleurie');
  });

  it('ne remplace pas une adresse par une AUTRE, seulement par sa version entière', () => {
    // Hors du cas « le texte prolonge la stockée », la stockée prime : elle
    // vient souvent d’un champ structuré que le texte n’égale pas.
    expect(
      rederiveFromText(
        stored({ address: '12 Avenue de la Californie', description: '45 Rue Smolett, au port.' }),
      ),
    ).toBeNull();
  });

  it('n’écrase JAMAIS une adresse publiée par la source', () => {
    expect(rederiveFromText(stored({ address: '12 Avenue de la Californie' }))).toBeNull();
  });

  it('lit la voie écrite dans le TITRE, faute de description', () => {
    // Plusieurs agences n'écrivent la voie que là : « STUDIO VIDE - 1 BIS AV
    // PATRIMOINE - NICE GORBELLA ». On ne la cherchait que dans la description,
    // et ces annonces n'avaient donc aucune adresse — ni point sur la carte, ni
    // les trente points d'une adresse commune au dédoublonnage.
    expect(
      rederiveFromText(
        stored({
          title: 'STUDIO MEUBLE - 71 BD DELFINO - NICE RIQUIER',
          description: 'Studio agréable, bon état.',
        }),
      )?.address,
    ).toContain('71 BD DELFINO');
  });

  it('ne prend pas un QUARTIER pour une adresse (§17)', () => {
    // « STUDIO SAINT SYLVESTRE » nomme un quartier, pas une voie : deux studios
    // du même quartier ne sont pas le même studio. L'extracteur exige un type
    // de voie, et c'est ce qui rend cette lecture du titre sûre.
    expect(
      rederiveFromText(stored({ title: 'STUDIO SAINT SYLVESTRE', description: 'Studio agréable.' }))
        ?.address ?? null,
    ).toBeNull();
  });

  it('ajoute le bail 9 mois sans perdre les atouts venus du scraper', () => {
    // Recalculer la liste entière les perdrait : « 2e étage » et « Ascenseur »
    // viennent d'attributs bruts que la base ne conserve pas.
    const corrected = rederiveFromText(
      stored({
        address: 'Rue Smolett',
        description: 'Etudiant de Septembre à juin au prix de 600 € cc',
      }),
    );
    // L'annonce dit « Étudiant de septembre à juin » : les deux atouts se
    // lisent dans le texte conservé, et le rejeu pose donc les deux.
    expect(corrected?.features).toEqual([
      'Ascenseur',
      '2e étage',
      SHORT_TERM_LEASE_FEATURE,
      STUDENT_HOUSING_FEATURE,
    ]);
  });

  it('efface une adresse qui a mordu sur la phrase suivante', () => {
    // Elle reste fausse quelle qu'en soit la provenance : mieux vaut aucune
    // rue qu'une rue introuvable sur une carte (§17, §20).
    expect(
      rederiveFromText(
        stored({
          address: "10 Avenue Sainte-MargueriteAu sein d'une résidence",
          description: 'Studio calme et lumineux.',
        }),
      )?.address,
    ).toBeNull();
  });

  it('reclasse un logement que le mot « parking » avait fait écarter', () => {
    // 22 fiches sur 59 typées « parking » au 2026-09-03 étaient des logements.
    const corrected = rederiveFromText(
      stored({
        address: 'Rue Smolett',
        propertyType: 'parking',
        title: 'Studette de 20m² avec parking',
        description: 'Studio calme et lumineux.',
      }),
    );
    expect(corrected?.propertyType).toBe('studio');
  });

  it('reclasse un « autre » que le titre dit professionnel', () => {
    const corrected = rederiveFromText(
      stored({
        address: 'Rue Smolett',
        propertyType: 'other',
        title: 'Licence IV 4 - Grande Licence à louer',
      }),
    );
    expect(corrected?.propertyType).toBe('commercial');
  });

  it('ne dégrade pas un logement typé par la source', () => {
    const kept = rederiveFromText(
      stored({
        address: 'Rue Smolett',
        propertyType: 'apartment',
        title: 'Location Bureau - Jean Medecin',
        description: 'Studio calme et lumineux.',
      }),
    );
    expect(kept?.propertyType ?? 'apartment').toBe('apartment');
  });

  it('ne rend rien quand il n’y a rien à corriger', () => {
    expect(
      rederiveFromText(
        stored({ address: 'Rue Smolett', description: 'Studio calme et lumineux.' }),
      ),
    ).toBeNull();
  });
});

describe('nature du bailleur', () => {
  it('une agence nommée tranche', () => {
    const n = normalizeListing(raw({ cityText: 'nice', agencyName: 'Cabinet Martin' }), OPTIONS);
    expect(n?.contact.kind).toBe('agency');
  });

  /**
   * ON N'AVAIT JAMAIS DÉTECTÉ UN SEUL PARTICULIER : sur mille cent fiches, zéro.
   * La déduction ne reposait que sur le mot « particulier » dans le texte — or
   * les deux tiers des annonces viennent des digests de portails, qui n'ont
   * AUCUNE description à fouiller. Le filtre « particuliers seuls » ne pouvait
   * donc rien isoler.
   *
   * PAP ne publie que du particulier à particulier : c'est un fait sur la
   * source, pas une supposition sur l'annonce.
   */
  it('la source tranche quand le texte ne dit rien', () => {
    const muet = raw({ cityText: 'nice', title: 'Studio 25 m²' });
    expect(normalizeListing(muet, OPTIONS)?.contact.kind).toBe('unknown');
    expect(normalizeListing(muet, { ...OPTIONS, landlord: 'private' })?.contact.kind).toBe(
      'private',
    );
  });

  it('une agence nommée l’emporte sur la nature déclarée par la source', () => {
    const n = normalizeListing(raw({ cityText: 'nice', agencyName: 'Cabinet Martin' }), {
      ...OPTIONS,
      landlord: 'private',
    });
    expect(n?.contact.kind).toBe('agency');
  });

  it('sans aucun indice, on ne suppose rien (§17)', () => {
    expect(normalizeListing(raw({ cityText: 'nice' }), OPTIONS)?.contact.kind).toBe('unknown');
  });

  /**
   * UNE SOURCE QUI LE DIT ANNONCE PAR ANNONCE. Bien'ici publie le type de
   * compte du déposant : c'est la première fois qu'un particulier peut être
   * reconnu SANS que le mot figure dans une prose que la plupart des annonces
   * n'ont pas. Le `landlord` du descripteur ne pouvait pas rendre ce service :
   * il vaut pour toute la source, or ce portail porte les deux.
   */
  it('la nature déclarée par l’annonce prime sur tout le reste', () => {
    const declared = raw({
      cityText: 'nice',
      title: 'Studio 25 m²',
      extra: { reference: 'r1', landlord: 'private' },
    });
    expect(normalizeListing(declared, OPTIONS)?.contact.kind).toBe('private');
    // Même face à une agence nommée : la source sait ce qu'elle dit, et une
    // enseigne au champ « agence » ne doit pas la contredire.
    expect(
      normalizeListing({ ...declared, agencyName: 'Cabinet Martin' }, OPTIONS)?.contact.kind,
    ).toBe('private');
  });

  it('une valeur inattendue dans extra.landlord ne trouble rien', () => {
    const bizarre = raw({
      cityText: 'nice',
      title: 'Studio 25 m²',
      extra: { reference: 'r1', landlord: 'société civile' },
    });
    expect(normalizeListing(bizarre, OPTIONS)?.contact.kind).toBe('unknown');
  });
});

/**
 * LE MEUBLÉ SE RATTRAPE AU REJEU, et il ne se rattrapait pas.
 *
 * La détection reconnaît « location vide » ; ce qui manquait, c'est le TEXTE
 * qu'on lui donne. Chaque source décide de ce qu'elle passe au détecteur, et
 * celles qui ne joignent pas la description ne laissent rien à lire. Relevé sur
 * huit annonces disant « location vide » : une restait sans statut.
 */
describe('meublé rattrapé par le rejeu', () => {
  it('lit « location vide » dans la description conservée', () => {
    const stored = normalizeListing(
      raw({ cityText: 'nice', title: 'Appartement 3 pièces', description: 'Location vide.' }),
      OPTIONS,
    );
    expect(stored).not.toBeNull();
    // Une occurrence enregistrée SANS statut — la source ne l'avait pas passé.
    const blind = { ...stored!, furnished: null };
    expect(rederiveFromText(blind)?.furnished).toBe(false);
  });

  it('ne réécrit pas un statut déjà établi', () => {
    const stored = normalizeListing(
      raw({ cityText: 'nice', title: 'Studio meublé', furnishedText: 'Studio meublé' }),
      OPTIONS,
    );
    expect(stored?.furnished).toBe(true);
    // Rien à rattraper : le rejeu ne rend rien plutôt que de réécrire.
    expect(rederiveFromText(stored!)).toBeNull();
  });
});

describe('faux positifs relevés le 2026-09-14', () => {
  const normalize = (over: Partial<RawListing>) =>
    normalizeListing(
      { sourceRef: '1', sourceUrl: 'https://exemple.invalid/1', priceText: '690 €', ...over },
      { sourceId: 'test', nowMs: Date.parse('2026-09-14T12:00:00Z') },
    );

  it('un titre qui nomme un box ou un garage est un parking, quoi que dise la catégorie', () => {
    expect(
      normalize({
        title: 'BOX HAUT MALAUSSENA LIBERATION',
        propertyTypeText: 'Appartement',
        areaText: '10 m²',
      })?.propertyType,
    ).toBe('parking');
    expect(
      normalize({ title: 'Le Fenice - Garage à louer', propertyTypeText: 'Appartement' })
        ?.propertyType,
    ).toBe('parking');
    // Un garage cité dans le titre d'un logement reste un atout.
    expect(
      normalize({ title: '3 Pièces Garage', propertyTypeText: 'Appartement', areaText: '70 m²' })
        ?.propertyType,
    ).toBe('apartment');
    // Relevé du 2026-09-15 : trois logements écartés comme parkings, une cave gardée.
    expect(
      normalize({ title: 'STUDIO MEUBLÉ AVEC TERRASSE ET PARKING À LOUER', areaText: '19 m²' })
        ?.propertyType,
    ).toBe('studio');
    expect(
      normalize({ title: '3P ETAGE ELEVE GARAGE', propertyTypeText: 'Parking', areaText: '73 m²' })
        ?.propertyType,
    ).toBe('apartment');
    expect(normalize({ title: 'Cave 5 m²', areaText: '5 m²' })?.propertyType).toBe('parking');
  });

  it('le rejeu range en parking un titre qui en nomme un', () => {
    const corrected = rederiveFromText({
      ...normalize({ title: 'x' })!,
      propertyType: 'apartment',
      title: 'BOX HAUT MALAUSSENA LIBERATION',
      area: 10,
    });
    expect(corrected?.propertyType).toBe('parking');
  });

  it('« 3 PIÈCES MEUBLÉ » en titre l’emporte sur une case « non » de la source', () => {
    expect(
      normalize({ title: '2 PIECES MEUBLE NICE CARABACEL', furnishedText: 'non meublé' })
        ?.furnished,
    ).toBe(true);
    expect(
      normalize({ title: 'Deux pièces Carabacel', furnishedText: 'non meublé' })?.furnished,
    ).toBe(false);
  });

  it('un titre qui nomme un local commercial l’emporte sur « pièces » et la catégorie', () => {
    expect(
      normalize({
        title: 'Louer commerce de 2 pièces 68 m² 1 200 € à Nice (06300)',
        roomsText: '2 pièces',
      })?.propertyType,
    ).toBe('commercial');
    expect(
      normalize({
        title: 'Location local commercial Nice Joffre / Longchamp',
        propertyTypeText: 'Appartement',
      })?.propertyType,
    ).toBe('commercial');
    // Un bureau DANS un logement n'en fait pas un local.
    expect(
      normalize({ title: 'Appartement 3 pièces avec bureau', propertyTypeText: 'Appartement' })
        ?.propertyType,
    ).toBe('apartment');
  });

  it('« possibilité colocation » décrit un logement entier', () => {
    expect(
      normalize({
        title: '2P meublé',
        description: 'Grand 2P rénové. Possibilité colocation, canapé lit.',
      })?.flatShare,
    ).toBe(false);
  });
});

describe('contact.reference — publiée, ou rien (§17)', () => {
  it('garde la référence que la source PUBLIE', () => {
    const n = normalizeListing(raw({ extra: { reference: 'LA2495' } }), OPTIONS);
    expect(n?.contact.reference).toBe('LA2495');
  });

  it('laisse la référence VIDE quand la source n’en publie aucune', () => {
    // Le repli sur `sourceRef` faisait afficher « Réf. agence : ref1 » — un
    // numéro tiré de l'URL par nous, que l'agence ne reconnaît pas au
    // téléphone. Trois occurrences actives sur quatre le portaient.
    const n = normalizeListing(raw({ sourceRef: '565' }), OPTIONS);
    expect(n?.contact.reference).toBeNull();
  });

  it('ne recopie pas l’identifiant d’URL même quand `extra` porte d’autres clés', () => {
    const n = normalizeListing(raw({ sourceRef: '565', extra: { quartier: 'Riquier' } }), OPTIONS);
    expect(n?.contact.reference).toBeNull();
    expect(n?.district).toBe('Riquier');
  });

  it('traite une référence vide comme absente', () => {
    expect(normalizeListing(raw({ extra: { reference: '  ' } }), OPTIONS)?.contact.reference).toBe(
      null,
    );
  });
});

describe('rederiveFromText — la référence imprimée dans le texte déjà stocké', () => {
  /** Une occurrence BEP telle qu'elle revient de la base. */
  const bep = (reference: string | null, description: string): never =>
    ({
      id: 'bep:87116070',
      sourceId: 'bep',
      sourceRef: '87116070',
      title: 'Studio proche Magnan',
      description,
      address: null,
      propertyType: 'studio',
      features: [],
      contact: { ...EMPTY_CONTACT, agencyName: 'BEP Logement', reference },
    }) as never;

  // L'APOSTROPHE EST TYPOGRAPHIQUE dans les données : « l’annonce », pas
  // « l'annonce ». Un motif qui n'accepte que la droite ne trouve rien, et les
  // 113 fiches BEP qui impriment cette ligne resteraient sur leur faux numéro.
  const COURBE = 'Studio rénové. Référence de l’annonce : 0603220 ';

  it('remplace le numéro tiré de l’URL par la référence imprimée', () => {
    expect(rederiveFromText(bep('87116070', COURBE))?.contact.reference).toBe('0603220');
  });

  it('lit aussi bien l’apostrophe droite', () => {
    expect(
      rederiveFromText(bep(null, "Studio rénové. Référence de l'annonce : 0603220"))?.contact
        .reference,
    ).toBe('0603220');
  });

  it('remplit une référence absente', () => {
    expect(rederiveFromText(bep(null, COURBE))?.contact.reference).toBe('0603220');
  });

  it('laisse le champ VIDE quand le texte n’imprime aucune référence', () => {
    // La référence ne se fabrique jamais : une annonce muette garde le silence
    // plutôt que d'afficher notre identifiant interne.
    const muette = rederiveFromText(bep(null, 'Studio meublé proche commodités.'));
    expect(muette?.contact.reference ?? null).toBeNull();
  });

  it('ne touche pas une référence que la source a publiée dans un champ dédié', () => {
    // Le bulletin abonné BEP imprime sa référence en tête d'annonce, pas dans le
    // descriptif : son texte est muet, et son champ doit survivre au rejeu.
    const bulletin = {
      id: 'bep-abonnes:1131634',
      sourceId: 'bep-abonnes',
      sourceRef: '1131634',
      title: 'STUDIO MEUBLE — NICE EST ACROPOLIS',
      description: 'STUDIO MEUBLE , 18 M², BAIL A L ANNEE LIBRE DE SUITE. LOYER : 750.00 €',
      address: null,
      propertyType: 'studio',
      features: [],
      contact: { ...EMPTY_CONTACT, agencyName: 'BEP Logement', reference: '1131634' },
    } as never;
    expect(rederiveFromText(bulletin)?.contact.reference ?? '1131634').toBe('1131634');
    expect(rederiveFromText(bep('LA2495', COURBE))?.contact.reference ?? 'LA2495').toBe('LA2495');
  });

  it('ne réannonce pas une correction déjà écrite', () => {
    expect(rederiveFromText(bep('0603220', COURBE))).toBeNull();
  });
});
