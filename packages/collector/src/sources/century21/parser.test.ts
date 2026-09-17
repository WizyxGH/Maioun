import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { isSeasonalPrice, parseDetail, parseListingUrl, parseSearchPage } from './parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/century21');
const PAGE_URL = 'https://www.century21.fr/annonces/location-appartement/v-nice/';

const nominal = readFileSync(join(FIXTURES, 'nice-page1.html'), 'utf8');
const page2 = readFileSync(join(FIXTURES, 'nice-page2.html'), 'utf8');
const sansResultat = readFileSync(join(FIXTURES, 'sans-resultat.html'), 'utf8');
const fiche = readFileSync(join(FIXTURES, 'fiche-description.html'), 'utf8');
const saisonniere = readFileSync(join(FIXTURES, 'nice-saisonniere.html'), 'utf8');
const ficheComplete = readFileSync(join(FIXTURES, 'fiche-complete.html'), 'utf8');
const PAGE2_URL = 'https://www.century21.fr/annonces/location-appartement/v-nice/page-2/';

describe('parseListingUrl', () => {
  it('décompose une URL de fiche', () => {
    const parsed = parseListingUrl('https://www.century21.fr/trouver_logement/detail/16000000001/');
    expect(parsed?.reference).toBe('16000000001');
  });

  it('rejette les autres pages', () => {
    expect(parseListingUrl(PAGE_URL)).toBeNull();
  });
});

describe('parseSearchPage — la liste ne tient pas sur une page', () => {
  it('annonce son total et désigne sa page suivante', () => {
    // Le site écrit combien d'annonces il a. Vingt par page : sans ce chiffre,
    // une première page pleine passait pour tout le stock.
    const page = parseSearchPage(nominal, PAGE_URL);
    expect(page.announcedTotal).toBe(5);
    expect(page.hasNextPage).toBe(true);
    expect(page.nextPageUrl).toBe(PAGE2_URL);
    expect(page.headingCity).toBe('Nice');
    expect(page.empty).toBe(false);
  });

  it('s’arrête sur la dernière page, qui offre pourtant encore un numéro', () => {
    // Au-delà de sa dernière page, century21.fr RESSERT la page 1 : suivre les
    // liens numérotés ferait relire le début de la liste sans fin. Seule la
    // flèche « suivant » dit qu'il reste quelque chose, et la page 2 n'en a pas.
    const page = parseSearchPage(page2, PAGE2_URL);
    expect(page.listings.map((listing) => listing.sourceRef)).toEqual([
      '16000000004',
      '16000000005',
    ]);
    expect(page.nextPageUrl).toBeNull();
    expect(page.hasNextPage).toBe(false);
    expect(page.announcedTotal).toBe(5);
  });

  it('reconnaît une recherche sans aucun bien', () => {
    // Une commune sans stock répond 200 avec ce bandeau, et sans total. Le
    // marqueur la distingue d'un gabarit cassé : c'est un silence, pas un trou.
    const page = parseSearchPage(sansResultat, PAGE_URL);
    expect(page.empty).toBe(true);
    expect(page.listings).toHaveLength(0);
    expect(page.announcedTotal).toBeNull();
  });
});

describe('parseSearchPage — fixture nominale', () => {
  const page = parseSearchPage(nominal, PAGE_URL);

  it('extrait les trois cartes sans warning', () => {
    expect(page.listings).toHaveLength(3);
    expect(page.warnings).toHaveLength(0);
  });

  it('extrait la carte complète (prix, surface, pièces, réf agence, ville)', () => {
    const f3 = page.listings.find((l) => l.sourceRef === '16000000001');
    expect(f3?.priceText).toContain('3 000 € par mois charges comprises');
    expect(f3?.areaText).toBe('78,27 m2');
    expect(f3?.roomsText).toBe('3 pièces');
    expect(f3?.cityText).toBe('NICE');
    // « Ref : 90001 » est ce que l'agence AFFICHE : c'est la référence, et non
    // l'identifiant d'URL qui occupait la place.
    expect(f3?.extra?.['reference']).toBe('90001');
  });

  it('garde les photos écrites en chemin relatif, et laisse l’habillage', () => {
    // Century 21 écrit ses photos « /imagesBien/s3/… ». On n'acceptait que les
    // adresses commençant par `http` : TOUTES les fiches arrivaient sans photo.
    const bare = page.listings.find((l) => l.sourceRef === '16000000003');
    expect(bare?.imageUrls).toEqual([
      'https://www.century21.fr/imagesBien/s3/202/579/fixture-c21-photo-3.jpg',
    ]);
  });

  it('lit les photos CHARGÉES À LA DEMANDE, en `data-src`', () => {
    // Relevé sur la page réelle du 2026-09-10 : seule la première carte porte
    // un `src` ; les seize suivantes ont leur photo en `data-src`, et un
    // remplacement en `data:` à la place du `src`. Ne lire que `src` rendait
    // une photo sur dix-sept.
    const differee = `
      <div class="c-the-property-thumbnail-with-content" data-uid="16000000099">
        <a href="/trouver_logement/detail/16000000099/" aria-label="Appartement F1 à louer NICE">
          <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/imagesBien/s3/202/579/c21-differee.jpg" class="is-lazyload" alt="" />
        </a>
        <h3>NICE 06 25,22 m2 1 pièce Ref : 90099 602 € par mois charges comprises</h3>
      </div>`;
    const [carte] = parseSearchPage(differee, PAGE_URL).listings;
    expect(carte?.imageUrls).toEqual([
      'https://www.century21.fr/imagesBien/s3/202/579/c21-differee.jpg',
    ]);
  });

  it('omet les champs absents (§17)', () => {
    const bare = page.listings.find((l) => l.sourceRef === '16000000003');
    expect(bare?.priceText).toBeUndefined();
    expect(bare?.areaText).toBeUndefined();
  });
});

describe('chaîne complète avec la normalisation', () => {
  const NOW = Date.parse('2026-08-15T12:00:00.000Z');
  const page = parseSearchPage(nominal, PAGE_URL);

  it('produit un studio meublé charges comprises dans les critères', () => {
    const studio = page.listings.find((l) => l.sourceRef === '16000000002');
    if (studio === undefined) throw new Error('studio absent');
    const normalized = normalizeListing(studio, { sourceId: 'century21', nowMs: NOW });
    expect(normalized?.price).toBe(660);
    expect(normalized?.chargesIncluded).toBe(true);
    expect(normalized?.area).toBe(18);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.contact.reference).not.toBeNull();
  });
});

describe('parseDetail — la description entière, lue sur la fiche', () => {
  it('rend un texte bien plus long que le fragment de la carte', () => {
    const detail = parseDetail(fiche);
    expect(detail?.description).toBeDefined();
    expect(detail?.description?.length).toBeGreaterThan(300);
  });

  it('NE MÊLE PAS la traduction anglaise à la description française', () => {
    // Le bloc porte les deux versions dans deux `span` montrés à tour de rôle.
    // Les lire ensemble donnait un texte bilingue, deux fois trop long.
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toContain("L'appartement se compose");
    expect(description).not.toContain('bedroom apartment');
    expect(description).not.toContain('without delay');
  });

  it('garde l’adresse de rue que la fiche met en tête', () => {
    // C'est elle qui permet de géocoder le bien (§20) et de le rapprocher de
    // ses jumelles (§14) — la carte ne la donnait jamais.
    expect(parseDetail(fiche)?.description).toContain('23 boulevard saint Roch');
  });

  it('sépare les lignes que le site marque par un <br>', () => {
    const description = parseDetail(fiche)?.description ?? '';
    expect(description).toContain('\n');
    // Sans rupture, « saint Roch » et « Appartement » se collaient en un mot
    // introuvable, et l'extraction d'adresse butait dessus.
    expect(description).not.toContain('RochAppartement');
  });

  it('rend null quand la fiche ne porte pas de bloc description (§17)', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
    expect(parseDetail('<section class="c-the-property-detail-description"></section>')).toBeNull();
  });
});

describe('parseDetail — « À savoir », DPE et téléphone de l’agence', () => {
  const fiche = readFileSync(join(FIXTURES, 'fiche-a-savoir.html'), 'utf8');

  it('lit charges, dépôt, honoraires et disponibilité', () => {
    const draft = parseDetail(fiche);
    expect(draft?.chargesText).toBe('80 €');
    expect(draft?.depositText).toBe('1400 €');
    expect(draft?.feesText).toBe('299 €');
    expect(draft?.availableAtText).toBe('15 septembre 2026');
  });

  it('prend la classe surlignée sur l’étiquette dessinée', () => {
    expect(parseDetail(fiche)?.extra).toEqual({ dpe: 'D' });
  });

  it('préfère le numéro du bandeau d’actions à celui du bloc agence', () => {
    expect(parseDetail(fiche)?.phoneText).toBe('06 00 00 00 21');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://www.century21.fr/trouver_logement/detail/1/',
        priceText: '780 € par mois charges comprises',
        ...parseDetail(fiche),
      },
      { sourceId: 'century21', nowMs: Date.parse('2026-09-01T00:00:00Z') },
    );
    expect(normalized?.deposit).toBe(1400);
    expect(normalized?.charges).toBe(80);
    expect(normalized?.tenantFees).toBe(299);
    expect(normalized?.dpe).toBe('D');
    expect(normalized?.availableAt?.slice(0, 10)).toBe('2026-09-15');
    expect(normalized?.contact.phone).not.toBeNull();
  });
});

describe('les locations à la semaine sont écartées, et le disent', () => {
  const LISTE = 'https://www.century21.fr/annonces/location-maison/v-nice/';

  it('ne retient pas la villa louée à la semaine', () => {
    // Le motif de prix n'acceptait que « par mois » : « 6 800 € par semaine »
    // ne correspondait à rien, l'annonce entrait sans loyer, et la règle du
    // projet sur les tarifs de vacances n'avait rien à lire. Résultat, une
    // maison de 243 m² en location saisonnière dans les critères.
    const page = parseSearchPage(saisonniere, LISTE);
    expect(page.listings.map((l) => l.sourceRef)).toEqual(['16000000011']);
    expect(page.excluded).toEqual([
      { sourceRef: '16000000012', reason: 'loyer « 6 800 € par semaine »' },
    ]);
  });

  it('nomme l’annonce écartée et son motif : rien ne part en silence', () => {
    const page = parseSearchPage(saisonniere, LISTE);
    expect(page.warnings).toHaveLength(1);
    expect(page.warnings[0]).toContain('/trouver_logement/detail/16000000012/');
    expect(page.warnings[0]).toContain('par semaine');
  });

  it('garde le loyer mensuel avec sa période, charges comprises', () => {
    const [mensuelle] = parseSearchPage(saisonniere, LISTE).listings;
    expect(mensuelle?.priceText).toContain('5 000 € par mois charges comprises');
    const normalized = normalizeListing(
      { ...mensuelle!, sourceRef: '16000000011' },
      { sourceId: 'century21', nowMs: Date.parse('2026-09-17T12:00:00Z') },
    );
    expect(normalized?.price).toBe(5000);
    expect(normalized?.chargesIncluded).toBe(true);
  });

  it('reconnaît un tarif de vacances quel qu’en soit le libellé', () => {
    expect(isSeasonalPrice('6 800 € par semaine')).toBe(true);
    expect(isSeasonalPrice('120 € par nuit')).toBe(true);
    expect(isSeasonalPrice('1 250 € par mois charges comprises')).toBe(false);
    expect(isSeasonalPrice(undefined)).toBe(false);
  });
});

describe('parseDetail — tout ce que la fiche publie', () => {
  const draft = parseDetail(ficheComplete);

  it('recolle le prix et sa période, que le gabarit sépare', () => {
    // C'est ce couple qui permet de reconnaître une location de vacances
    // même quand la carte de la liste n'a rien donné.
    expect(draft?.priceText).toBe('1 250 € par mois charges comprises');
  });

  it('nomme l’AGENCE, et non le réseau', () => {
    // Les quarante-six annonces portaient « Century 21 » : le nom que trois
    // cents agences se partagent, et qui ne dit pas qui appeler.
    expect(draft?.agencyName).toBe('CENTURY 21 Agence Fictive du Port');
  });

  it('prend les photos du carrousel, et rien que celles du bien', () => {
    // La carte n'en porte qu'une ; la fiche en publie vingt à trente. La
    // vitrine de l'agence et les vignettes « Nos offres » restent dehors.
    expect(draft?.imageUrls).toEqual([
      'https://www.century21.fr/imagesBien/s3/202/579/fixture-c21-fiche-1.jpg',
      'https://www.century21.fr/imagesBien/s3/202/579/fixture-c21-fiche-2.jpg',
      'https://www.century21.fr/imagesBien/s3/202/579/fixture-c21-fiche-3.jpg',
    ]);
  });

  it('lit les DEUX étiquettes : énergie et climat', () => {
    // Le GES a son propre SVG et sa propre gamme de couleurs. Faute de le
    // lire, la source était vide à cent pour cent sur ce champ.
    expect(draft?.extra?.['dpe']).toBe('C');
    expect(draft?.extra?.['ges']).toBe('B');
  });

  it('lit l’étage et la nature du bail dans « Vue globale »', () => {
    expect(draft?.extra?.['etage']).toBe('2');
    expect(draft?.furnishedText).toBe('Location meublée');
  });

  it('compte les chambres dans le détail des pièces', () => {
    // Century 21 ne publie aucun total, mais publie la liste des pièces :
    // compter ses « Chambre » n'est pas les deviner.
    expect(draft?.extra?.['features']).toContain('2 chambres');
  });

  it('garde les équipements déclarés, absents de la description', () => {
    const features = draft?.extra?.['features'] ?? '';
    expect(features).toContain('Ascenseur');
    expect(features).toContain('Balcon');
    expect(features).toContain('Terrasse');
  });

  it('va jusqu’à la fiche normalisée', () => {
    const normalized = normalizeListing(
      {
        sourceRef: '90042',
        sourceUrl: 'https://www.century21.fr/trouver_logement/detail/16000000042/',
        agencyName: 'Century 21',
        ...draft,
      },
      { sourceId: 'century21', nowMs: Date.parse('2026-09-17T12:00:00Z') },
    );
    expect(normalized?.price).toBe(1250);
    expect(normalized?.charges).toBe(100);
    expect(normalized?.deposit).toBe(2300);
    expect(normalized?.bedrooms).toBe(2);
    expect(normalized?.dpe).toBe('C');
    expect(normalized?.ges).toBe('B');
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.contact.agencyName).toBe('CENTURY 21 Agence Fictive du Port');
    expect(normalized?.imageUrls).toHaveLength(3);
    expect(normalized?.features).toContain('Ascenseur');
    expect(normalized?.features).toContain('2e étage');
    // La fiche ne publie pas le code postal DU BIEN : le « 06300 » qu'on y lit
    // est celui de l'agence, et le fil d'Ariane donne le même pour tout Nice.
    expect(normalized?.postalCode).toBeNull();
  });
});
