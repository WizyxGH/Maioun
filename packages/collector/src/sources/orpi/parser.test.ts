import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import {
  dpeLetterOfIndex,
  extractAreaText,
  extractPriceText,
  extractRoomsText,
  isWithdrawnDetail,
  parseDetail,
  parseEulerianData,
  parseListingUrl,
  parseSearchPage,
} from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/orpi');
const PAGE_URL = 'https://www.orpi.com/location-immobiliere-nice/';

const nominal = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const degraded = readFileSync(join(FIXTURES, 'nice-degraded.html'), 'utf8');
const repli = readFileSync(join(FIXTURES, 'repli-departement.html'), 'utf8');

describe('parseListingUrl', () => {
  it('décompose une URL à référence agence', () => {
    const parsed = parseListingUrl(
      'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-x-000001-101/',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.postalCode).toBe('06000');
    expect(parsed?.reference).toBe('x-000001-101');
    expect(parsed?.typeAndCitySlug).toBe('appartement-t1-nice');
    expect(parsed?.nonResidential).toBe(false);
  });

  it('prend le PREMIER groupe de 5 chiffres comme code postal, même si la référence UUID en contient', () => {
    const parsed = parseListingUrl(
      'https://www.orpi.com/annonce-location-appartement-t2-nice-06100-00000000-0000-4000-8000-000000000202/',
    );
    expect(parsed?.postalCode).toBe('06100');
    expect(parsed?.reference).toBe('00000000-0000-4000-8000-000000000202');
  });

  it('canonise en retirant query et fragment', () => {
    const parsed = parseListingUrl(
      'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-x-000001-101/?contact=true',
    );
    expect(parsed?.canonicalUrl).toBe(
      'https://www.orpi.com/annonce-location-appartement-t1-nice-06000-x-000001-101/',
    );
  });

  it('marque les biens non résidentiels', () => {
    const parsed = parseListingUrl(
      'https://www.orpi.com/annonce-location-stationnement-nice-06300-x-000000-901/',
    );
    expect(parsed?.nonResidential).toBe(true);
  });

  it('rejette les liens qui ne sont pas des fiches', () => {
    expect(parseListingUrl('https://www.orpi.com/location-immobiliere-nice/')).toBeNull();
    expect(parseListingUrl('https://www.orpi.com/location-immobiliere-nice/?page=2')).toBeNull();
    expect(parseListingUrl('https://www.orpi.com/agence-fictive-nice/')).toBeNull();
  });
});

describe('parseEulerianData', () => {
  it('rejette un JSON dont la référence ne correspond pas', () => {
    expect(parseEulerianData('{"prdref":"autre-ref","prdamount":690}', 'x-000001-101')).toBeNull();
  });

  it('rejette un JSON corrompu sans lever', () => {
    expect(parseEulerianData('{"prdref":"x-1","surfa', 'x-1')).toBeNull();
  });
});

describe('extracteurs de texte', () => {
  it('extrait le prix de la bannière', () => {
    expect(extractPriceText('690 € par mois Location')).toBe('690 € par mois');
    expect(extractPriceText('1 280 € par mois')).toBe('1 280 € par mois');
  });

  it('extrait la surface même collée (« m2 », rendu texte de m<sup>2</sup>)', () => {
    expect(extractAreaText('Location Appartement 1 pièce 13,50 m2')).toBe('13,50 m2');
    expect(extractAreaText('appartement 20 m ²')).toBe('20 m ²');
  });

  it('extrait le nombre de pièces', () => {
    expect(extractRoomsText('Location Appartement 2 pièces 34 m 2')).toBe('2 pièces');
  });
});

describe('parseSearchPage — fixture nominale', () => {
  const page = parseSearchPage(nominal, PAGE_URL);

  it('extrait les logements et ignore le stationnement', () => {
    // 5 cartes dont 1 stationnement → 4 logements.
    expect(page.listings).toHaveLength(4);
    expect(page.listings.map((l) => l.sourceRef)).not.toContain('x-000000-901');
  });

  it("n'émet aucun warning quand la structure est saine", () => {
    expect(page.warnings).toHaveLength(0);
  });

  it('laisse le carrousel « communes à proximité » hors de l’inventaire', () => {
    // Ses six annonces reviennent sur CHAQUE page de Nice et appartiennent à
    // d'autres communes : comptées, elles gonflaient l'inventaire niçois de
    // dix-huit doublons sur quatre pages.
    expect(page.listings.map((l) => l.sourceRef)).not.toContain('x-000090-990');
    expect(page.cardRefs).not.toContain('x-000090-990');
  });

  it('lit le total que le site annonce, et lui seul', () => {
    // 3 appartements + 1 maison + 1 stationnement. Les liens de QUARTIER
    // portent le même attribut avec un typeBien vide : les additionner
    // compterait deux fois les mêmes biens.
    expect(page.announcedTotal).toBe(5);
    expect(page.cardRefs).toHaveLength(5);
  });

  it('rend le chemin canonique, qui seul dit quelle page a été servie', () => {
    expect(page.canonicalPath).toBe('/location-immobiliere-nice/');
  });

  it('détecte la page suivante via rel="next"', () => {
    expect(page.hasNextPage).toBe(true);
  });

  it('ignore les liens de quartiers du dropdown', () => {
    for (const listing of page.listings) {
      expect(listing.sourceUrl).toContain('/annonce-location-');
    }
  });

  it('extrait le studio complet avec enrichissement JSON', () => {
    const studio = page.listings.find((l) => l.sourceRef === 'x-000001-101');
    expect(studio).toBeDefined();
    expect(studio?.priceText).toBe('690 € par mois');
    expect(studio?.areaText).toBe('13,50 m2');
    expect(studio?.roomsText).toBe('1 pièce');
    expect(studio?.propertyTypeText).toBe('appartement');
    expect(studio?.cityText).toBe('Nice');
    // codePostal null dans le JSON → repli sur celui de l'URL.
    expect(studio?.postalCodeText).toBe('06000');
    expect(studio?.latitude).toBeCloseTo(43.7017875);
    expect(studio?.longitude).toBeCloseTo(7.2628625);
    expect(studio?.agencyName).toBe('Orpi — Agence Fictive Azur');
    expect(studio?.extra?.['quartier']).toBe('Quartier Fictif Nord');
    expect(studio?.imageUrls).toEqual([
      'https://img.example.invalid/fixture-orpi/photo-101.jpg?p=estate-result-item',
    ]);
  });

  it('préfère le code postal du JSON quand il est renseigné', () => {
    const t2 = page.listings.find((l) => l.sourceRef === '00000000-0000-4000-8000-000000000202');
    expect(t2?.postalCodeText).toBe('06100');
    expect(t2?.extra?.['dpe']).toBe('D');
  });

  it('fonctionne sans JSON de tracking (carte maison)', () => {
    const house = page.listings.find((l) => l.sourceRef === 'x-000004-404');
    expect(house?.priceText).toBe('1 900 € par mois');
    expect(house?.areaText).toBe('95 m2');
    expect(house?.propertyTypeText).toBe('maison');
    expect(house?.agencyName).toBe('Orpi');
    expect(house?.latitude).toBeUndefined();
  });
});

describe('parseSearchPage — chaîne complète avec la normalisation', () => {
  const page = parseSearchPage(nominal, PAGE_URL);
  const NOW = Date.parse('2026-08-15T12:00:00.000Z');

  it('produit un studio meublé typé et dans les critères', () => {
    const raw = page.listings.find((l) => l.sourceRef === 'x-000001-101');
    expect(raw).toBeDefined();
    if (raw === undefined) return;
    const normalized = normalizeListing(raw, { sourceId: 'orpi', nowMs: NOW });
    expect(normalized).not.toBeNull();
    expect(normalized?.price).toBe(690);
    expect(normalized?.area).toBe(13.5);
    expect(normalized?.rooms).toBe(1);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.propertyType).toBe('apartment');
    // Le tag visible « Meublé » fait foi, pas le champ JSON contradictoire.
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.latitude).toBeCloseTo(43.7017875);
  });

  it('ne date PAS la parution sur la liste, dont la date est celle du rendu', () => {
    // Le 2026-09-16, les cinquante-sept cartes niçoises portaient toutes
    // `dateCreation: "2026-09-16"` — y compris un bien en ligne depuis le
    // 8 juillet selon sa fiche. Prise pour une parution, elle faisait paraître
    // tout le stock Orpi publié du jour.
    for (const raw of page.listings) expect(raw.publishedAtText).toBeUndefined();
  });

  it('type correctement le T3 hors budget', () => {
    const raw = page.listings.find((l) => l.sourceRef === 'x-000003-303');
    if (raw === undefined) throw new Error('T3 absent de la fixture');
    const normalized = normalizeListing(raw, { sourceId: 'orpi', nowMs: NOW });
    expect(normalized?.price).toBe(1280);
    expect(normalized?.area).toBe(62);
    expect(normalized?.bedrooms).toBe(2);
  });
});

describe('parseSearchPage — fixture dégradée', () => {
  const page = parseSearchPage(degraded, PAGE_URL);

  it('extrait les trois cartes sans lever', () => {
    expect(page.listings).toHaveLength(3);
  });

  it('omet le prix et la surface quand ils sont absents partout', () => {
    const bare = page.listings.find((l) => l.sourceRef === 'x-000010-110');
    expect(bare?.priceText).toBeUndefined();
    expect(bare?.areaText).toBeUndefined();
  });

  it('se replie sur le HTML quand le JSON est corrompu', () => {
    const broken = page.listings.find((l) => l.sourceRef === 'x-000011-111');
    expect(broken?.priceText).toBe('650 € par mois');
    expect(broken?.areaText).toBe('20 m2');
    expect(broken?.latitude).toBeUndefined();
  });

  it("canonise l'URL même quand seul le lien ?contact=true existe", () => {
    const contactOnly = page.listings.find((l) => l.sourceRef === 'x-000012-112');
    expect(contactOnly?.sourceUrl).toBe(
      'https://www.orpi.com/annonce-location-appartement-t2-nice-06200-x-000012-112/',
    );
  });

  it("n'émet pas de warning quand 2 annonces sur 3 gardent un prix", () => {
    // 67 % au-dessus du seuil de 50 % : le warning ne doit pas crier au loup
    // à la moindre annonce incomplète (« en cours de saisie », ça existe).
    expect(page.warnings).toHaveLength(0);
  });

  it('ne voit pas de page suivante sur la dernière page', () => {
    expect(page.hasNextPage).toBe(false);
  });
});

describe('parseSearchPage — page entièrement sans prix (§61)', () => {
  it('émet le warning de structure modifiée', () => {
    // On retire tous les prix de la fixture dégradée : bannières et JSON.
    const stripped = degraded
      .replace(/<span class="h4 font-bold">[^<]*<\/span> par mois/g, '')
      .replace(/&quot;prdamount&quot;:\d+,/g, '');
    const page = parseSearchPage(stripped, PAGE_URL);
    expect(page.listings.length).toBeGreaterThan(0);
    expect(page.warnings.some((w) => w.includes('structure probablement modifiée'))).toBe(true);
  });
});

describe('parseDetail — la description entière, lue sur la fiche', () => {
  const fiche = readFileSync(
    join(import.meta.dirname, '../../../../../tests/fixtures/orpi/fiche-description.html'),
    'utf8',
  );

  it('rend bien plus que les 152 caractères auxquels la carte coupe', () => {
    const description = parseDetail(fiche)?.description ?? '';
    expect(description.length).toBeGreaterThan(600);
  });

  it('garde l’adresse de rue, que la liste ne donne jamais', () => {
    // Elle seule permet de placer le bien sur la carte (§20) et de le
    // reconnaître sur une autre source (§14).
    expect(parseDetail(fiche)?.description).toContain('22bis BOULEVARD MONTREAL');
  });

  it('garde les conditions de revenu, absentes de la carte', () => {
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toContain('Revenu minimum');
    expect(description).toContain("CDI hors période d'essai");
  });

  it('sépare les lignes marquées par un <br>', () => {
    expect(parseDetail(fiche)?.description).toContain('\n');
  });

  it('rend null quand la fiche ne porte pas le bloc attendu (§17)', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
    expect(parseDetail('<div class="s-cms"></div>')).toBeNull();
  });
});

describe('parseDetail — montants, DPE et agence du bien (data-estate)', () => {
  const fiche = readFileSync(join(FIXTURES, 'fiche-estate.html'), 'utf8');

  it('lit dépôt, charges, honoraires et la classe affichée', () => {
    const draft = parseDetail(fiche);
    expect(draft?.depositText).toBe('894 €');
    expect(draft?.chargesText).toBe('56 €');
    expect(draft?.feesText).toBe('385 €');
    expect(draft?.extra?.['dpe']).toBe('D');
  });

  it('prend le contact de l’agence, jamais celui de l’agent', () => {
    const draft = parseDetail(fiche);
    expect(draft?.phoneText).toBe('06 00 00 00 31');
    expect(draft?.emailText).toBe('agence@example.invalid');
  });

  it('donne les CHAMBRES, que la liste ne publie jamais', () => {
    // `nbChambres` est `null` sur les cinquante-sept cartes niçoises du
    // 2026-09-16 ; aucune des cinquante-cinq occurrences Orpi en base n'avait
    // de chambres. Elles n'existent que dans le JSON de la fiche.
    expect(parseDetail(fiche)?.roomsText).toBe('2 pièces 1 chambres');
  });

  it('donne étage, ascenseur, balcon et parking, tous absents de la liste', () => {
    const extra = parseDetail(fiche)?.extra;
    expect(extra?.['etage']).toBe('3');
    expect(extra?.['ascenseur']).toBe('1');
    expect(extra?.['nbBalcons']).toBe('1');
    expect(extra?.['nbParking']).toBe('1');
    expect(extra?.['features']).toContain('Cave');
    expect(extra?.['features']).toContain('Meublé');
  });

  it('date la parution sur `onMarketSince`, la seule date vraie d’Orpi', () => {
    expect(parseDetail(fiche)?.publishedAtText).toBe('2026-07-08T00:00:00+02:00');
  });

  it('prend toutes les photos de la fiche, là où la carte n’en donne qu’une', () => {
    expect(parseDetail(fiche)?.imageUrls).toHaveLength(3);
  });

  it('ne reprend NI le loyer NI les tags de la fiche', () => {
    // Ce que la fiche apprend est gardé une semaine : repris ici, le loyer
    // figerait pendant sept jours le seul chiffre que la liste republie à
    // chaque passage.
    const draft = parseDetail(fiche);
    expect(draft?.priceText).toBeUndefined();
    expect(draft?.furnishedText).toBeUndefined();
  });

  it('démontre le « charges comprises » par la somme des montants', () => {
    // 950 = 894 (loyer de base) + 56 (provisions) : c'est ce que le site
    // affiche, et la seule preuve dont on dispose. Sans elle, toute la source
    // laissait indéterminé ce que son loyer recouvre.
    expect(parseDetail(fiche)?.extra?.['orpiChargesComprises']).toBe('1');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const card = { sourceRef: 'x', sourceUrl: PAGE_URL, priceText: '950 € par mois' };
    const normalized = normalizeListing(
      { ...card, ...parseDetail(fiche) },
      { sourceId: 'orpi', nowMs: Date.parse('2026-09-15T00:00:00Z') },
    );
    expect(normalized?.deposit).toBe(894);
    expect(normalized?.charges).toBe(56);
    expect(normalized?.tenantFees).toBe(385);
    expect(normalized?.dpe).toBe('D');
    expect(normalized?.bedrooms).toBe(1);
    expect(normalized?.publishedAt).toBe('2026-07-07T22:00:00.000Z');
    expect(normalized?.contact.phone).not.toBeNull();
  });

  it('traduit l’indice du tracking en lettre', () => {
    expect(dpeLetterOfIndex(4)).toBe('D');
    expect(dpeLetterOfIndex('7')).toBe('G');
    expect(dpeLetterOfIndex(0)).toBeUndefined();
    expect(dpeLetterOfIndex(null)).toBeUndefined();
  });
});

describe('isWithdrawnDetail — la fiche qu’Orpi rend en 200 sans rien dire', () => {
  const retiree = readFileSync(join(FIXTURES, 'fiche-retiree.html'), 'utf8');
  const vivante = readFileSync(join(FIXTURES, 'fiche-estate.html'), 'utf8');

  it('reconnaît le canonique « biens loués »', () => {
    expect(isWithdrawnDetail(retiree)).toBe(true);
  });

  it('ne retire rien d’une fiche qui porte encore ses données', () => {
    expect(isWithdrawnDetail(vivante)).toBe(false);
  });

  it('ne retire rien d’une page simplement inconnue (§17)', () => {
    // Un 200 ne prouve rien par lui-même : sans la déclaration du site, une
    // page qu'on ne sait pas lire laisse l'annonce intacte.
    expect(isWithdrawnDetail('<html><body><p>rien</p></body></html>')).toBe(false);
  });
});

describe('parseSearchPage — le repli départemental qu’Orpi sert en 200', () => {
  const page = parseSearchPage(repli, 'https://www.orpi.com/location-immobiliere-cap-d-ail/');

  it('se trahit par son canonique, jamais par son statut', () => {
    expect(page.canonicalPath).toBe('/location-immobiliere-alpes-maritimes/');
  });

  it('porte bien des annonces — d’autres communes', () => {
    // C'est tout le piège : la page n'est ni vide ni en erreur. Sans la
    // vérification du canonique, ses biens cannois entraient dans l'inventaire
    // de la commune demandée.
    expect(page.listings.length).toBeGreaterThan(0);
  });
});
