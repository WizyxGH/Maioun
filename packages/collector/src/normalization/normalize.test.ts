import { describe, expect, it } from 'vitest';
import type { RawListing } from '@maioun/shared';
import { SHORT_TERM_LEASE_FEATURE } from '@maioun/shared';
import {
  bestAddress,
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

  it('n’attribue pas à une voie le numéro d’une AUTRE', () => {
    // Le pire des deux : une adresse fausse et plausible.
    expect(bestAddress('avenue Sainte Colette', '31 rue Barla')).toBe('avenue Sainte Colette');
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
    expect(corrected?.features).toEqual(['Ascenseur', '2e étage', SHORT_TERM_LEASE_FEATURE]);
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
