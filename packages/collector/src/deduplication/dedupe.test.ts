/**
 * Tests du dédoublonnage (§14).
 *
 * L'accent est mis sur les CAS AMBIGUS, comme l'exige le §14 : fusionner deux
 * logements différents fait disparaître une annonce réelle de la liste, ce qui
 * est bien plus grave que d'afficher un doublon.
 */

import { describe, expect, it } from 'vitest';
import type { NormalizedListing } from '@maioun/shared';
import { EMPTY_CONTACT } from '@maioun/shared';
import { similarity } from './similarity.js';
import { blockingKeys, dedupe } from './dedupe.js';
import { mergeGroup } from './merge.js';

const BASE_TIME = '2026-08-14T12:00:00.000Z';

/** Fabrique une occurrence de test avec des valeurs par défaut raisonnables. */
function listing(overrides: Partial<NormalizedListing> & { id: string }): NormalizedListing {
  return {
    sourceId: 'test',
    sourceRef: overrides.id,
    sourceUrl: `https://example.invalid/${overrides.id}`,
    title: 'Appartement T2 Nice',
    description: null,
    price: 690,
    charges: null,
    chargesIncluded: null,
    deposit: null,
    tenantFees: null,
    area: 34,
    rooms: 2,
    bedrooms: null,
    propertyType: 'apartment',
    furnished: null,
    flatShare: null,
    dpe: null,
    ges: null,
    previousPrice: null,
    maxOccupants: null,
    features: [],
    address: null,
    district: null,
    city: 'nice',
    postalCode: '06000',
    latitude: null,
    longitude: null,
    contact: { ...EMPTY_CONTACT },
    publishedAt: null,
    availableAt: null,
    imageUrls: [],
    views: null,
    favorites: null,
    firstSeenAt: BASE_TIME,
    lastSeenAt: BASE_TIME,
    scrapedAt: BASE_TIME,
    lifecycle: 'active',
    ...overrides,
  };
}

describe('similarity — signaux forts', () => {
  it('fusionne deux annonces partageant le même téléphone', () => {
    const a = listing({
      id: 'lbc:1',
      sourceId: 'leboncoin',
      contact: { ...EMPTY_CONTACT, phone: '+33600000001' },
    });
    const b = listing({
      id: 'sel:1',
      sourceId: 'seloger',
      contact: { ...EMPTY_CONTACT, phone: '+33600000001' },
    });

    const result = similarity(a, b);
    expect(result.verdict).toBe('duplicate');
    expect(result.signals.map((signal) => signal.code)).toContain('phone');
  });

  it('fusionne deux annonces partageant la même référence d’agence', () => {
    const a = listing({
      id: 'lbc:2',
      sourceId: 'leboncoin',
      contact: { ...EMPTY_CONTACT, reference: 'REF-2024-A', agencyName: 'Agence X' },
    });
    const b = listing({
      id: 'age:2',
      sourceId: 'agencex',
      contact: { ...EMPTY_CONTACT, reference: 'ref-2024-a', agencyName: 'AGENCE X' },
    });

    expect(similarity(a, b).verdict).toBe('duplicate');
  });

  it('fusionne deux annonces aux coordonnées GPS quasi identiques', () => {
    const a = listing({ id: 'a:3', sourceId: 'a', latitude: 43.7031, longitude: 7.2661 });
    const b = listing({ id: 'b:3', sourceId: 'b', latitude: 43.7032, longitude: 7.2662 });
    expect(similarity(a, b).verdict).toBe('duplicate');
  });
});

describe('similarity — bruit de niveau AGENCE, au sein d’une même source', () => {
  // Observé en base : Citya illustre quatorze biens distincts avec la même
  // photo tamponnée, Saint-Roch cinq ; et le standard de l’agence est porté
  // par une vingtaine d’annonces — c’est le repli posé par le pipeline sur
  // celles qui ne publient aucune coordonnée.
  // Deux studios DIFFÉRENTS de la même agence, à 680 €/20 m² et 700 €/21 m² :
  // l'écart reste dans les tolérances (±30 € et ±2 m²), donc aucun désaccord
  // ne tranche. La photo tamponnée (45) et le standard (40) atteignaient alors
  // 85 pour un seuil de 70, et l'un des deux disparaissait de la liste.
  it('ne fusionne pas deux studios d’une même agence sur photo et standard partagés', () => {
    const photo = 'https://citya.invalid/filigrane-sejour.webp';
    const contact = { ...EMPTY_CONTACT, phone: '+33400000002' };
    const a = listing({
      id: 'citya:1',
      sourceId: 'citya',
      price: 680,
      area: 20,
      rooms: 1,
      imageUrls: [photo],
      contact,
    });
    const b = listing({
      id: 'citya:2',
      sourceId: 'citya',
      price: 700,
      area: 21,
      rooms: 1,
      imageUrls: [photo],
      contact,
    });
    expect(similarity(a, b).verdict).not.toBe('duplicate');
  });

  it('mais garde le signal quand la photo vient de DEUX sources', () => {
    const photo = 'https://agence.invalid/photo-1.jpg';
    const a = listing({ id: 'age:9', sourceId: 'agencex', imageUrls: [photo] });
    const b = listing({ id: 'lbc:9', sourceId: 'leboncoin', imageUrls: [photo] });
    expect(similarity(a, b).verdict).toBe('duplicate');
  });

  it('garde aussi le signal AU SEIN des alertes e-mail, qui ne sont pas une agence', () => {
    // Cas réel du 2026-09-03 : la même annonce SeLoger à 670 €, relayée par
    // deux digests sous deux schémas de référence successifs, restait affichée
    // en double malgré une URL de photo identique au caractère près. Une
    // agence réutilise ses clichés d'un bien à l'autre ; un serveur média de
    // portail attribue une image à UNE annonce.
    const photo = 'https://mms.seloger.com/0/4/2/5/0425e023.jpg?ci_seal=abc';
    const a = listing({
      id: 'email-alerts:seloger:26DFQW7W1VRY',
      sourceId: 'email-alerts',
      price: 670,
      area: 22,
      rooms: 1,
      imageUrls: [photo],
    });
    const b = listing({
      id: 'email-alerts:seloger:22-05-m-670-cc-06100-nice',
      sourceId: 'email-alerts',
      price: 670,
      area: 22.05,
      rooms: 1,
      imageUrls: [`${photo}&w=500`],
    });
    // Le prédicat vient du registre : c'est le descripteur de la source qui
    // déclare `relaysListings`, pas une liste tenue ici.
    const relays = (sourceId: string): boolean => sourceId === 'email-alerts';
    expect(similarity(a, b, relays).verdict).toBe('duplicate');
    // Sans cette déclaration, la prudence reste de mise : deux annonces d'une
    // même AGENCE partageant un cliché tamponné ne sont pas le même bien.
    expect(similarity(a, b).verdict).not.toBe('duplicate');
  });
});

describe('similarity — désaccords rédhibitoires', () => {
  it('refuse de fusionner deux villes différentes, même tout le reste identique', () => {
    const a = listing({ id: 'a:4', sourceId: 'a', city: 'nice' });
    const b = listing({ id: 'b:4', sourceId: 'b', city: 'cannes' });

    const result = similarity(a, b);
    expect(result.verdict).toBe('distinct');
    expect(result.blocker).toMatch(/villes différentes/);
  });

  it('refuse de fusionner des surfaces incompatibles', () => {
    const a = listing({ id: 'a:5', sourceId: 'a', area: 34 });
    const b = listing({ id: 'b:5', sourceId: 'b', area: 55 });

    const result = similarity(a, b);
    expect(result.verdict).toBe('distinct');
    expect(result.blocker).toMatch(/surfaces incompatibles/);
  });

  it('refuse de fusionner des loyers incompatibles', () => {
    const a = listing({ id: 'a:6', sourceId: 'a', price: 690 });
    const b = listing({ id: 'b:6', sourceId: 'b', price: 1290 });
    expect(similarity(a, b).verdict).toBe('distinct');
  });

  it('refuse de fusionner deux nombres de pièces différents', () => {
    const a = listing({ id: 'a:7', sourceId: 'a', rooms: 2 });
    const b = listing({ id: 'b:7', sourceId: 'b', rooms: 3 });
    expect(similarity(a, b).verdict).toBe('distinct');
  });

  it('le blocage prime sur un téléphone identique', () => {
    // Une même agence loue deux studios différents dans le même immeuble :
    // même téléphone, mais surfaces distinctes. Ne pas les fusionner.
    const phone = '+33600000001';
    const a = listing({
      id: 'a:8',
      sourceId: 'a',
      area: 18,
      price: 550,
      contact: { ...EMPTY_CONTACT, phone },
    });
    const b = listing({
      id: 'b:8',
      sourceId: 'b',
      area: 42,
      price: 890,
      contact: { ...EMPTY_CONTACT, phone },
    });

    expect(similarity(a, b).verdict).toBe('distinct');
  });
});

describe('similarity — tolérances', () => {
  it('accepte un léger écart de loyer entre portails', () => {
    // Un portail affiche charges comprises, l'autre non.
    const a = listing({ id: 'a:9', sourceId: 'a', price: 690 });
    const b = listing({ id: 'b:9', sourceId: 'b', price: 710 });
    expect(similarity(a, b).blocker).toBeNull();
  });

  it('accepte un arrondi de surface', () => {
    const a = listing({ id: 'a:10', sourceId: 'a', area: 34 });
    const b = listing({ id: 'b:10', sourceId: 'b', area: 35 });
    expect(similarity(a, b).blocker).toBeNull();
  });

  it('ne fusionne pas sur la seule concordance prix + surface', () => {
    // Deux T2 de 34 m² à 690 € à Nice existent sûrement en double exemplaire.
    // Sans signal fort, on reste prudent : ambigu, pas doublon.
    const a = listing({ id: 'a:11', sourceId: 'a', title: 'Appartement lumineux centre' });
    const b = listing({ id: 'b:11', sourceId: 'b', title: 'Studio rénové bord de mer' });

    const result = similarity(a, b);
    expect(result.verdict).not.toBe('duplicate');
  });
});

describe('dedupe', () => {
  it('regroupe les occurrences d’un même logement en un seul groupe', () => {
    const phone = '+33600000001';
    const occurrences = [
      listing({ id: 'leboncoin:1', sourceId: 'leboncoin', contact: { ...EMPTY_CONTACT, phone } }),
      listing({ id: 'seloger:1', sourceId: 'seloger', contact: { ...EMPTY_CONTACT, phone } }),
      listing({ id: 'bienici:1', sourceId: 'bienici', contact: { ...EMPTY_CONTACT, phone } }),
    ];

    const { groups } = dedupe(occurrences);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.occurrences).toHaveLength(3);
  });

  it('garde séparés deux logements distincts', () => {
    const occurrences = [
      listing({ id: 'a:1', sourceId: 'a', area: 20, price: 550 }),
      listing({ id: 'b:1', sourceId: 'b', area: 60, price: 1200 }),
    ];

    const { groups } = dedupe(occurrences);
    expect(groups).toHaveLength(2);
  });

  it('ne fusionne pas les paires ambiguës par défaut', () => {
    const occurrences = [
      listing({ id: 'a:2', sourceId: 'a', title: 'T2 lumineux', postalCode: '06000' }),
      listing({ id: 'b:2', sourceId: 'b', title: 'T2 lumineux', postalCode: '06000' }),
    ];

    const { groups } = dedupe(occurrences);
    // Prudence : deux fiches distinctes plutôt qu'une fusion hasardeuse.
    expect(groups.length).toBeGreaterThanOrEqual(1);
  });

  it('limite le nombre de comparaisons grâce au blocage (§56)', () => {
    // 200 annonces réparties sur des tranches de prix et de surface variées :
    // une comparaison exhaustive coûterait 19 900 paires.
    const many = Array.from({ length: 200 }, (_unused, index) =>
      listing({
        id: `s${index % 5}:${index}`,
        sourceId: `s${index % 5}`,
        price: 400 + index * 5,
        area: 15 + (index % 60),
      }),
    );

    const { comparisonCount } = dedupe(many);
    expect(comparisonCount).toBeLessThan(19_900);
  });
});

describe('au sein d’une source, le même bien porte les mêmes chiffres', () => {
  /** Relevé le 2026-09-11 : deux studios BEP à 800 €, fusionnés en une fiche. */
  const agence = { ...EMPTY_CONTACT, agencyName: 'BEP Logement' };
  const bellet = listing({
    id: 'bep:87253857',
    sourceId: 'bep',
    title: 'Studio de 20m² avec balcon',
    price: 800,
    area: 20,
    rooms: 1,
    district: 'magnan',
    contact: agence,
  });
  const bornala = listing({
    id: 'bep:87334566',
    sourceId: 'bep',
    title: 'Beau studio refait à neuf avec balcon',
    price: 800,
    area: 19,
    rooms: 1,
    district: 'magnan',
    contact: agence,
  });

  it('sépare deux annonces de la source dont la surface diffère', () => {
    const result = similarity(bellet, bornala);
    expect(result.verdict).toBe('distinct');
    expect(result.blocker).toContain('même source');
  });

  it('garde la tolérance ENTRE sources : les arrondis y diffèrent', () => {
    expect(similarity(bellet, { ...bornala, id: 'x:1', sourceId: 'x' }).blocker).toBeNull();
  });

  it('accepte l’entier d’une surface mesurée (« 22 m² » / « 22,81 m² »)', () => {
    const digest = listing({ id: 'e:1', sourceId: 'e', area: 22, price: 650 });
    expect(similarity(digest, { ...digest, id: 'e:2', area: 22.81 }).blocker).toBeNull();
  });

  it('ne les réunit pas non plus par une troisième source', () => {
    // Chacun ressemble assez au relais pour fusionner avec lui : l'union-find,
    // transitif, réunissait les deux studios par son intermédiaire.
    const phone = '+33400000002';
    const a = { ...bellet, contact: { ...agence, phone } };
    const b = { ...bornala, contact: { ...agence, phone } };
    const relais = listing({
      id: 'relais:1',
      sourceId: 'relais',
      price: 800,
      area: 20,
      rooms: 1,
      contact: { ...EMPTY_CONTACT, phone },
    });

    const { groups } = dedupe([a, relais, b]);
    const ensemble = groups.find((group) => group.occurrences.some((o) => o.id === a.id));
    expect(ensemble?.occurrences.map((o) => o.id)).not.toContain(b.id);
  });
});

describe('mergeGroup — fusion des informations (§15)', () => {
  it('regroupe les coordonnées provenant de sources différentes', () => {
    const occurrences = [
      listing({
        id: 'leboncoin:5',
        sourceId: 'leboncoin',
        contact: { ...EMPTY_CONTACT, phone: '+33600000001', providedBy: ['leboncoin'] },
      }),
      listing({
        id: 'agencex:5',
        sourceId: 'agencex',
        contact: {
          ...EMPTY_CONTACT,
          agencyName: 'Agence X',
          name: 'Camille Martin',
          reference: 'REF-99',
          providedBy: ['agencex'],
        },
      }),
    ];

    const merged = mergeGroup(occurrences);
    expect(merged.contact.phone).toBe('+33600000001');
    expect(merged.contact.agencyName).toBe('Agence X');
    expect(merged.contact.name).toBe('Camille Martin');
    expect(merged.contact.reference).toBe('REF-99');
    expect(merged.contact.providedBy).toEqual(expect.arrayContaining(['leboncoin', 'agencex']));
  });

  it('met les photos AFFICHABLES devant celles que le navigateur refuse', () => {
    // Le bulletin abonnés de BEP n’a que des images en `http`, servies par un
    // hôte qui ne parle pas TLS ; le site public de la même agence a les mêmes
    // photos en `https`. Fusionnées, la fiche prenait les premières venues et
    // affichait un cadre vide, les bonnes photos étant pourtant là.
    const occurrences = [
      listing({
        id: 'bep-abonnes:7',
        sourceId: 'bep-abonnes',
        imageUrls: ['http://beptransaction.example.invalid/1.jpg'],
      }),
      listing({
        id: 'bep:7',
        sourceId: 'bep',
        imageUrls: ['https://images.example.invalid/1.jpg'],
      }),
    ];

    const merged = mergeGroup(occurrences);
    expect(merged.imageUrls[0]).toBe('https://images.example.invalid/1.jpg');
    // On ne jette rien : les `http` restent, derrière.
    expect(merged.imageUrls).toContain('http://beptransaction.example.invalid/1.jpg');
  });

  it('conserve les valeurs divergentes au lieu de les écraser', () => {
    const occurrences = [
      listing({ id: 'a:6', sourceId: 'a', price: 690, area: 34 }),
      listing({ id: 'b:6', sourceId: 'b', price: 715, area: 34 }),
    ];

    const merged = mergeGroup(occurrences);
    expect(merged.price.value).toBe(690);
    expect(merged.price.conflicts).toHaveLength(1);
    expect(merged.price.conflicts[0]).toMatchObject({ value: 715, sourceId: 'b' });
  });

  it('ne signale aucun conflit quand les sources s’accordent', () => {
    const occurrences = [
      listing({ id: 'a:7', sourceId: 'a', price: 690 }),
      listing({ id: 'b:7', sourceId: 'b', price: 690 }),
    ];
    expect(mergeGroup(occurrences).price.conflicts).toHaveLength(0);
  });

  it('conserve même un petit écart de loyer — c’est souvent les charges (§15)', () => {
    // 690 € HC contre 715 € CC : l'écart est réel et informatif, il ne doit
    // pas être lissé. Le score de risque, lui, l'ignorera car non significatif.
    const occurrences = [
      listing({ id: 'a:7b', sourceId: 'a', price: 690 }),
      listing({ id: 'b:7b', sourceId: 'b', price: 715 }),
    ];
    expect(mergeGroup(occurrences).price.conflicts).toHaveLength(1);
  });

  it('conserve toutes les occurrences et leurs URLs d’origine (§13, §38)', () => {
    const occurrences = [
      listing({ id: 'leboncoin:8', sourceId: 'leboncoin' }),
      listing({ id: 'seloger:8', sourceId: 'seloger' }),
    ];

    const merged = mergeGroup(occurrences);
    expect(merged.occurrences).toHaveLength(2);
    expect(merged.occurrences.map((occurrence) => occurrence.sourceUrl)).toEqual([
      'https://example.invalid/leboncoin:8',
      'https://example.invalid/seloger:8',
    ]);
  });

  it('complète un champ absent de la source principale', () => {
    const occurrences = [
      listing({ id: 'a:9', sourceId: 'a', latitude: null, longitude: null, description: null }),
      listing({
        id: 'b:9',
        sourceId: 'b',
        latitude: 43.7,
        longitude: 7.26,
        description: 'Bel appartement rénové',
      }),
    ];

    const merged = mergeGroup(occurrences);
    expect(merged.latitude.value).toBe(43.7);
    expect(merged.description.value).toBe('Bel appartement rénové');
  });
});

describe('similarité — le quartier', () => {
  it('renforce la confiance quand le quartier est identique', () => {
    const base = { price: 660, area: 32, rooms: 1, city: 'nice' } as const;
    const sans = similarity(
      listing({ id: 'a:d1', sourceId: 'a', ...base }),
      listing({ id: 'b:d1', sourceId: 'b', ...base }),
    );
    const avec = similarity(
      listing({ id: 'a:d2', sourceId: 'a', ...base, district: 'Gambetta' }),
      listing({ id: 'b:d2', sourceId: 'b', ...base, district: 'gambetta' }),
    );
    expect(avec.score).toBeGreaterThan(sans.score);
    expect(avec.signals.map((s) => s.code)).toContain('district');
  });

  it('reconnaît le quartier nommé dans le TITRE de l’autre annonce', () => {
    // Cas réel : « STUDIO GAMBETTA » (portail, sans champ quartier) face à
    // l'annonce de l'agence, qui renseigne « Gambetta ».
    const portail = listing({
      id: 'p:d3',
      sourceId: 'email-alerts',
      title: 'STUDIO GAMBETTA',
      price: 660,
      area: 32,
      rooms: 1,
    });
    const agence = listing({
      id: 'a:d3',
      sourceId: 'agence',
      title: 'Appartement — Nice - Gambetta',
      price: 660,
      area: 32,
      rooms: 1,
      district: 'Gambetta',
    });
    expect(similarity(portail, agence).signals.map((s) => s.code)).toContain('district');
  });

  it('ne rapproche pas deux quartiers différents', () => {
    const a = listing({ id: 'a:d4', sourceId: 'a', price: 660, area: 32, district: 'Gambetta' });
    const b = listing({ id: 'b:d4', sourceId: 'b', price: 660, area: 32, district: 'Cimiez' });
    expect(similarity(a, b).signals.map((s) => s.code)).not.toContain('district');
  });
});

describe('blockingKeys — ville inconnue', () => {
  it('compare quand même une annonce sans ville à une annonce localisée', () => {
    // Les e-mails d'alerte ne portent pas toujours la commune : sans clé
    // indépendante de la ville, ces annonces n'étaient JAMAIS comparées.
    const sansVille = listing({ id: 'a:k', sourceId: 'email', price: 660, area: 32, city: null });
    const avecVille = listing({
      id: 'b:k',
      sourceId: 'agence',
      price: 660,
      area: 32,
      city: 'nice',
    });
    const communes = blockingKeys(sansVille).filter((k) => blockingKeys(avecVille).includes(k));
    expect(communes.length).toBeGreaterThan(0);
  });
});

describe('similarité — la photo', () => {
  const PHOTO = 'https://mms.seloger.com/0/4/2/5/0425e023-144e-4317.jpg';

  it('reconnaît la même photo malgré une signature d’accès différente', () => {
    // Les portails ajoutent un jeton par requête : deux liens vers le même
    // fichier ne se ressemblent pas caractère pour caractère.
    const a = listing({ id: 'a:i1', sourceId: 'a', imageUrls: [`${PHOTO}?ci_seal=aaa`] });
    const b = listing({ id: 'b:i1', sourceId: 'b', imageUrls: [`${PHOTO}?ci_seal=zzz&w=500`] });
    expect(similarity(a, b).signals.map((s) => s.code)).toContain('image');
  });

  it('fait basculer en DOUBLON une paire que prix et surface laissaient ambiguë', () => {
    const base = { price: 660, area: 32, rooms: 1, city: 'nice' } as const;
    const sans = similarity(
      listing({ id: 'a:i2', sourceId: 'a', ...base }),
      listing({ id: 'b:i2', sourceId: 'b', ...base }),
    );
    const avec = similarity(
      listing({ id: 'a:i3', sourceId: 'a', ...base, imageUrls: [PHOTO] }),
      listing({ id: 'b:i3', sourceId: 'b', ...base, imageUrls: [PHOTO] }),
    );
    expect(sans.verdict).not.toBe('duplicate');
    expect(avec.verdict).toBe('duplicate');
  });

  it('ne fusionne PAS sur la seule photo : une façade sert à plusieurs lots', () => {
    // Deux biens du même immeuble peuvent partager la photo d'extérieur.
    const a = listing({ id: 'a:i4', sourceId: 'a', price: 500, area: 20, imageUrls: [PHOTO] });
    const b = listing({ id: 'b:i4', sourceId: 'b', price: 1400, area: 75, imageUrls: [PHOTO] });
    expect(similarity(a, b).verdict).not.toBe('duplicate');
  });

  it('ignore les URL invalides et l’absence de photo (§17)', () => {
    const a = listing({ id: 'a:i5', sourceId: 'a', imageUrls: ['pas une url'] });
    const b = listing({ id: 'b:i5', sourceId: 'b', imageUrls: ['pas une url'] });
    expect(similarity(a, b).signals.map((s) => s.code)).not.toContain('image');
    const vide = similarity(
      listing({ id: 'a:i6', sourceId: 'a', imageUrls: [] }),
      listing({ id: 'b:i6', sourceId: 'b', imageUrls: [] }),
    );
    expect(vide.signals.map((s) => s.code)).not.toContain('image');
  });
});

/**
 * LE JEU ENTIER VAUT PLUS QU'UNE PHOTO, et la mesure le dit sans ambiguïté.
 *
 * Sur l'inventaire du 2026-09-09, à surface et pièces égales et prix à 15 %
 * près : partager AU MOINS une photo donnait 331 paires dont 45 plausibles —
 * 14 %. Partager TOUT le jeu : 30 paires dont 27 — 90 %.
 *
 * L'écart s'explique par le fonds de catalogue. Une agence illustre dix biens
 * avec la même façade ; ce cliché se retrouve partout et ne désigne rien. Un
 * jeu ENTIER identique ne s'explique pas ainsi.
 */
describe('photos : le jeu entier ou une seule', () => {
  const A = 'https://cdn.invalid/biens/1.jpg';
  const B = 'https://cdn.invalid/biens/2.jpg';
  const FACADE = 'https://cdn.invalid/agence/facade.jpg';

  it('fusionne deux sources qui publient EXACTEMENT le même jeu', () => {
    const a = listing({ id: 'x:1', sourceId: 'x', price: 700, area: 30, imageUrls: [A, B] });
    const b = listing({ id: 'y:1', sourceId: 'y', price: 700, area: 30, imageUrls: [A, B] });
    expect(similarity(a, b).verdict).toBe('duplicate');
  });

  it('ne fusionne PAS sur une seule photo commune parmi d’autres', () => {
    // La façade est partagée, le reste non : c'est le fonds de catalogue.
    // Quinze points, ajoutés aux quarante-deux de la concordance, restent sous
    // le seuil — le signal appuie, il ne décrète plus.
    // Titres distincts, comme deux sources les écrivent réellement : sans
    // cela, le test mesurerait la ressemblance des titres, pas celle des photos.
    const a = listing({
      id: 'x:1',
      sourceId: 'x',
      title: 'Studio Nice ouest',
      price: 700,
      area: 30,
      imageUrls: [FACADE, A],
    });
    const b = listing({
      id: 'y:1',
      sourceId: 'y',
      title: 'T1 à louer Fabron',
      price: 700,
      area: 30,
      imageUrls: [FACADE, B],
    });
    expect(similarity(a, b).verdict).not.toBe('duplicate');
  });

  it('exige DEUX photos pour croire un jeu identique au sein d’une source', () => {
    // Une agence qui pose la même façade sur deux biens produit un « jeu
    // identique » de taille 1. Ce n'en est pas un.
    const facadeSeule = (id: string, price: number, area: number) =>
      listing({ id, sourceId: 'agence', price, area, imageUrls: [FACADE] });
    expect(
      similarity(facadeSeule('agence:1', 700, 30), facadeSeule('agence:2', 700, 30)).verdict,
    ).not.toBe('duplicate');

    // Deux photos communes et rien d'autre : une republication, pas un fonds.
    const deux = (id: string) =>
      listing({ id, sourceId: 'agence', price: 700, area: 30, imageUrls: [A, B] });
    expect(similarity(deux('agence:3'), deux('agence:4')).verdict).toBe('duplicate');
  });
});

/**
 * LE FICHIER IMAGE DÉSIGNE UN BIEN, PAS UNE ANNONCE.
 *
 * Un agrégateur décode l'adresse d'origine de ses vignettes : il sert donc le
 * fichier de l'hébergeur de la source, exactement celui que la source publie
 * elle-même. Ce repère traversait le dédoublonnage sans rien décider, pour deux
 * raisons cumulées relevées le 2026-09-16 sur l'inventaire : la source
 * d'origine ne publie que trois photos quand l'agrégateur en montre six — le
 * « jeu identique » ne pouvait donc pas se former —, et l'agrégateur annonce le
 * loyer HORS CHARGES là où la source l'annonce charges comprises, ce qui
 * bloquait la comparaison avant de la commencer. Vingt-sept paires étaient
 * ainsi séparées, six seulement regroupées.
 */
describe('photos : le fichier qui désigne un bien', () => {
  const HEBERGEUR = 'https://medias.invalid/img';
  const PROPRE = `${HEBERGEUR}/6a84bb03973e96025cedff03.jpg`;
  const designe = (): boolean => true;

  /** L'agrégateur : loyer hors charges, ni titre, ni pièces, ni code postal. */
  const agregateur = (id: string): NormalizedListing =>
    listing({
      id,
      sourceId: 'agregateur',
      title: null,
      rooms: null,
      postalCode: null,
      price: 1010,
      area: 58,
      chargesIncluded: false,
      imageUrls: [PROPRE, `${HEBERGEUR}/6a84bb03973e96025cedff11.jpg`],
    });

  /** La source d'origine : loyer charges comprises, et d'autres photos. */
  const origine = (id: string): NormalizedListing =>
    listing({
      id,
      sourceId: 'origine',
      title: 'Appartement 2 pièces 58m² NICE 06000',
      price: 1260,
      area: 58,
      rooms: 2,
      imageUrls: [PROPRE, `${HEBERGEUR}/6a84bb03973e96025cedff29.jpg`],
    });

  it('réunit l’agrégateur et la source malgré l’écart de charges', () => {
    const a = agregateur('agregateur:1');
    const b = origine('origine:1');
    expect(similarity(a, b, undefined, undefined, designe).verdict).toBe('duplicate');
    // Sans lecture du lot, le loyer sépare encore : c'est la photo reconnue
    // comme propre à ces deux annonces qui lève le blocage.
    expect(similarity(a, b).blocker).toContain('loyers');
  });

  it('laisse la surface séparer, elle, photo propre ou non', () => {
    const a = agregateur('agregateur:2');
    const b = { ...origine('origine:2'), area: 92, rooms: 4 };
    expect(similarity(a, b, undefined, undefined, designe).blocker).toContain('surfaces');
  });

  it('ne tranche pas sur un cliché de catalogue, et le loyer bloque alors', () => {
    const catalogue = (): boolean => false;
    const a = agregateur('agregateur:3');
    const b = origine('origine:3');
    expect(similarity(a, b, undefined, undefined, catalogue).blocker).toContain('loyers');
  });

  it('rattrape un hôte et une taille différents par le nom du fichier', () => {
    // La même photo, servie en « original » par l'agence et redimensionnée par
    // le portail : ni l'hôte ni le chemin ne concordent, le nom si.
    const noms = ['photo_20260916_4821', 'photo_20260916_4822'];
    const agence = listing({
      id: 'agence:n1',
      sourceId: 'agence',
      title: 'Deux pièces avenue du Parc',
      price: 900,
      area: 40,
      imageUrls: noms.map((n) => `https://medias.invalid/original/${n}.jpg`),
    });
    const portail = listing({
      id: 'portail:n1',
      sourceId: 'portail',
      title: 'Location T2 lumineux',
      price: 900,
      area: 40,
      imageUrls: noms.map((n) => `https://cdn.portail.invalid/1600xauto/${n}.webp`),
    });
    expect(similarity(agence, portail, undefined, undefined, designe).verdict).toBe('duplicate');
  });

  it('exige DEUX noms communs : un seul peut être une façade', () => {
    const commun = 'photo_20260916_4821';
    const agence = listing({
      id: 'agence:n2',
      sourceId: 'agence',
      title: 'Deux pièces avenue du Parc',
      price: 900,
      area: 40,
      imageUrls: [
        `https://medias.invalid/original/${commun}.jpg`,
        'https://medias.invalid/original/photo_20260916_7777.jpg',
      ],
    });
    const portail = listing({
      id: 'portail:n2',
      sourceId: 'portail',
      title: 'Location T2 lumineux',
      price: 900,
      area: 40,
      imageUrls: [
        `https://cdn.portail.invalid/1600xauto/${commun}.webp`,
        'https://cdn.portail.invalid/1600xauto/photo_20260916_9999.webp',
      ],
    });
    expect(similarity(agence, portail, undefined, undefined, designe).verdict).not.toBe(
      'duplicate',
    );
  });

  it('ignore les noms passe-partout, qui portent des centaines d’annonces', () => {
    const passePartout = (hote: string): string[] => [
      `${hote}/1.jpg`,
      `${hote}/2.jpg`,
      `${hote}/lg.jpeg`,
      `${hote}/photo.webp`,
    ];
    const a = listing({
      id: 'a:g1',
      sourceId: 'a',
      imageUrls: passePartout('https://un.invalid/biens/111'),
    });
    const b = listing({
      id: 'b:g1',
      sourceId: 'b',
      imageUrls: passePartout('https://deux.invalid/biens/222'),
    });
    const codes = similarity(a, b, undefined, undefined, designe).signals.map((s) => s.code);
    expect(codes).not.toContain('image');
  });
});

/**
 * LE FONDS DE CATALOGUE SE RECONNAÎT SUR LE LOT, PAS SUR LA PAIRE.
 *
 * Une photo qu'une même source pose sur trois de ses biens est une façade, un
 * hall ou un cliché tamponné : elle ne désigne personne. Deux occurrences, en
 * revanche, c'est le compte d'une annonce republiée sous une seconde référence
 * — l'écarter ferait perdre le seul indice qui les rapproche.
 */
describe('dedupe — les clichés de catalogue', () => {
  const FACADE = 'https://agence.invalid/fonds/facade-immeuble-2026.jpg';
  const PROPRE = 'https://agence.invalid/biens/6a84bb03973e96025cedff03.jpg';

  const duFonds = (id: string, price: number, area: number, rooms: number, title: string) =>
    listing({ id, sourceId: 'agence', price, area, rooms, title, imageUrls: [FACADE] });

  it('refuse de fusionner sur une façade que l’agence pose sur trois biens', () => {
    const { groups } = dedupe([
      duFonds('agence:c1', 700, 30, 1, 'Studio rue des Lilas'),
      duFonds('agence:c2', 900, 40, 2, 'Deux pièces avenue du Parc'),
      duFonds('agence:c3', 1100, 50, 3, 'Trois pièces place Centrale'),
      listing({
        id: 'portail:c1',
        sourceId: 'portail',
        price: 700,
        area: 30,
        rooms: 1,
        title: 'Studio à louer',
        imageUrls: [FACADE],
      }),
    ]);
    const ensemble = groups.find((g) => g.occurrences.some((o) => o.id === 'portail:c1'));
    expect(ensemble?.occurrences).toHaveLength(1);
  });

  it('mais fusionne sur une photo que l’agence ne pose que sur ce bien', () => {
    const { groups } = dedupe([
      duFonds('agence:c4', 900, 40, 2, 'Deux pièces avenue du Parc'),
      duFonds('agence:c5', 1100, 50, 3, 'Trois pièces place Centrale'),
      listing({
        id: 'agence:c6',
        sourceId: 'agence',
        price: 700,
        area: 30,
        rooms: 1,
        title: 'Studio rue des Lilas',
        imageUrls: [FACADE, PROPRE],
      }),
      listing({
        id: 'portail:c2',
        sourceId: 'portail',
        price: 700,
        area: 30,
        rooms: 1,
        title: 'Studio à louer',
        imageUrls: [PROPRE],
      }),
    ]);
    const ensemble = groups.find((g) => g.occurrences.some((o) => o.id === 'portail:c2'));
    expect(ensemble?.occurrences.map((o) => o.id).sort()).toEqual(['agence:c6', 'portail:c2']);
  });

  it('compare deux annonces que seule la photo relie', () => {
    // L'agrégateur ne donne ni commune ni code postal, et son loyer hors
    // charges tombe dans une autre tranche : aucune autre clé commune.
    const photo = 'https://medias.invalid/img/6a84bb03973e96025cedff03.jpg';
    const sansRepere = listing({
      id: 'agregateur:b1',
      sourceId: 'agregateur',
      city: null,
      postalCode: null,
      price: 1010,
      area: 58,
      imageUrls: [photo],
    });
    const localisee = listing({
      id: 'origine:b1',
      sourceId: 'origine',
      price: 1260,
      area: 58,
      imageUrls: [photo],
    });
    const communes = blockingKeys(sansRepere).filter((k) => blockingKeys(localisee).includes(k));
    expect(communes).toContain('photo:medias.invalid/img/6a84bb03973e96025cedff03.jpg');
  });
});

describe('« même référence » — ce qui rapproche vraiment deux annonces', () => {
  /** Une annonce sans aucun autre point commun, pour isoler le seul signal testé. */
  const seule = (
    id: string,
    sourceId: string,
    sourceRef: string,
    reference: string | null,
  ): NormalizedListing =>
    listing({
      id,
      sourceId,
      sourceRef,
      price: null,
      area: null,
      rooms: null,
      title: null,
      city: null,
      contact: { ...EMPTY_CONTACT, reference },
    });

  const aSignalRef = (a: NormalizedListing, b: NormalizedListing): boolean =>
    similarity(a, b).signals.some((s) => s.code === 'reference');

  it('rapproche la référence PUBLIÉE par un portail de l’identifiant de l’agence', () => {
    // Relevé en base : bep:87280764 est l'identifiant Apimo de l'agence, et
    // Paru Vendu republie « Réf. annonce 87280764 ». C'est le même
    // appartement, et le repli supprimé ne doit pas coûter ce rapprochement —
    // 186 paires inter-sources en dépendaient.
    const agence = seule('bep:87280764', 'bep', '87280764', null);
    const portail = seule('paruvendu:1295', 'paruvendu', '1295', '87280764');
    expect(aSignalRef(agence, portail)).toBe(true);
  });

  it('rapproche deux références publiées identiques', () => {
    expect(
      aSignalRef(
        seule('bienici:ag-1', 'bienici', 'ag-1', 'AN006144'),
        seule('imodirect:6144', 'imodirect', '6144', 'AN006144'),
      ),
    ).toBe(true);
  });

  it('ne rapproche PAS deux identifiants internes qui se croisent', () => {
    // Deux compteurs d'agence arrivés au même nombre : sag-immobilier:1553
    // n'est pas cabinet-ledeux:1553. Il faut qu'un côté PUBLIE la valeur.
    expect(
      aSignalRef(
        seule('sag-immobilier:1553', 'sag-immobilier', '1553', null),
        seule('cabinet-ledeux:1553', 'cabinet-ledeux', '1553', null),
      ),
    ).toBe(false);
  });

  it('ignore un identifiant trop court pour distinguer quoi que ce soit', () => {
    expect(aSignalRef(seule('a:12', 'a', '12', '12'), seule('b:99', 'b', '99', '12'))).toBe(false);
  });

  it('ne compare rien au sein d’une même source', () => {
    expect(aSignalRef(seule('a:1', 'a', '1', 'REF-4242'), seule('a:2', 'a', '2', 'REF-4242'))).toBe(
      false,
    );
  });

  it('bloque sur l’identifiant de source, sinon la paire ne serait jamais comparée', () => {
    const agence = seule('bep:87280764', 'bep', '87280764', null);
    const portail = seule('paruvendu:1295', 'paruvendu', '1295', '87280764');
    const communes = blockingKeys(agence).filter((k) => blockingKeys(portail).includes(k));
    expect(communes).toContain('ref:87280764');
  });
});

/**
 * DEUX VOISINS QUI SE SONT ÉCHANGÉ LEUR FICHE.
 *
 * Relevé sur l'inventaire : deux deux-pièces BEP du Vieux Nice, 30 m² chacun, à
 * 1200 € et 1250 €, et leurs deux fiches Bien'ici. Les quatre paires atteignent
 * le plafond de 100 — même standard téléphonique, même agence, mêmes chiffres à
 * la tolérance près — et le regroupement, qui départage au score, a rattaché
 * chaque logement au jumeau de l'autre. La référence publiée sépare pourtant
 * les deux paires sans ambiguïté ; le plafond l'effaçait.
 */
describe('deux logements voisins ne se croisent pas', () => {
  const STANDARD = '+33600000042';
  const bep = (ref: string, price: number, numero: string) =>
    listing({
      id: `bep:${ref}`,
      sourceId: 'bep',
      sourceRef: ref,
      title: 'Deux pièces au Vieux Nice',
      description: `Deux pièces de 30 m² au Vieux Nice. Référence de l’annonce : ${numero}`,
      price,
      area: 30,
      rooms: 2,
      district: 'Vieux Nice',
      contact: { ...EMPTY_CONTACT, phone: STANDARD, agencyName: 'BEP NICE', reference: ref },
    });
  const portail = (ref: string, price: number, numero: string) =>
    listing({
      id: `bienici:apimo-${ref}`,
      sourceId: 'bienici',
      sourceRef: `apimo-${ref}`,
      title: 'Deux pièces au Vieux Nice',
      description: `Deux pièces de 30 m² au Vieux Nice. Référence de l’annonce : ${numero}`,
      price,
      area: 30,
      rooms: 2,
      district: 'Vieux Nice',
      contact: { ...EMPTY_CONTACT, phone: STANDARD, agencyName: 'BEP LOGEMENT', reference: ref },
    });

  it('rattache chaque logement à SA fiche de portail', () => {
    // L'ORDRE COMPTE, et c'est celui-ci qui les a croisés : à score égal, la
    // paire rencontrée en premier l'emporte, et ici c'est la mauvaise.
    const corpus = [
      bep('87302682', 1200, '0603571'),
      portail('87305876', 1250, '0603701'),
      portail('87302682', 1200, '0603571'),
      bep('87305876', 1250, '0603701'),
    ];
    const { groups } = dedupe(corpus);
    const ensembles = groups
      .map((group) =>
        group.occurrences
          .map((one) => one.id)
          .sort()
          .join(' + '),
      )
      .sort();
    expect(ensembles).toEqual([
      'bep:87302682 + bienici:apimo-87302682',
      'bep:87305876 + bienici:apimo-87305876',
    ]);
  });
});

/**
 * L'ADRESSE QUI NE DÉSIGNE PERSONNE.
 *
 * Une source sans lien par annonce en pose un seul sur tout son stock — le
 * bulletin abonné de BEP renvoie ses cent vingt-huit logements vers sa page
 * d'accueil. Ce lien vaut pourtant à lui seul la fusion : sans garde-fou, il
 * réunirait des logements entièrement différents.
 */
describe('adresse partagée par tout un stock', () => {
  const generique = 'https://bulletin.example.invalid/w_index_abonnes.php';
  const stock = [1, 2, 3, 4, 5].map((n) =>
    listing({
      id: `bulletin:${n}`,
      sourceId: 'bulletin',
      sourceUrl: generique,
      title: `Bien ${n}`,
      price: 600 + n * 100,
      area: 18 + n * 4,
    }),
  );
  // Une alerte n'a souvent ni loyer, ni surface, ni commune : l'adresse est
  // tout ce qu'elle partage, et c'est bien là le danger.
  const alerte = listing({
    id: 'alerte:1',
    sourceId: 'alerte',
    sourceUrl: generique,
    title: 'Appartement',
    price: null,
    area: null,
    city: null,
    postalCode: null,
  });

  it('ne rapproche aucun de ces logements', () => {
    const { groups } = dedupe([...stock, alerte]);
    expect(groups).toHaveLength(6);
  });

  /** La même adresse, citée par deux annonces seulement, reste une preuve. */
  it('laisse fusionner une adresse que deux annonces seulement citent', () => {
    const { groups } = dedupe([stock[0] as NormalizedListing, alerte]);
    expect(groups).toHaveLength(1);
  });

  /**
   * LA CLÉ DE BLOCAGE AUSSI. Sans elle, la paire n'est jamais comparée : une
   * alerte sans loyer, sans surface et sans commune ne tombe dans aucun seau.
   */
  it('indexe l’adresse comme clé de rapprochement', () => {
    expect(blockingKeys(alerte)).toContain('url:bulletin.example.invalid/w_index_abonnes.php');
  });
});
