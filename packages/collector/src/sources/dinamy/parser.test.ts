import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  detailDraft,
  parseDetailPage,
  parseListPage,
  parsePageCount,
  parsePhotoSlug,
  splitLocality,
} from './parser.js';

const HTML = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/dinamy/liste.html', import.meta.url)),
  'utf8',
);
const FICHE = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/dinamy/fiche.html', import.meta.url)),
  'utf8',
);
const PAGE = 'https://www.dinamyimmobilier.com/index.php?transactions=5';
const FICHE_URL = 'https://www.dinamyimmobilier.com/index.php?controleur=fiche&idBien=30';

describe('parsePhotoSlug (Dinamy)', () => {
  it('lit pièces et surface dans le dossier photo', () => {
    expect(parsePhotoSlug('Vues/Images/photosBiens/Ap3P-53-Nice-Cimiez-51/x.jpg')).toEqual({
      rooms: '3 pièces',
      area: '53 m²',
    });
  });

  it('ne rend rien si le dossier ne suit pas le format (§17)', () => {
    expect(parsePhotoSlug('Vues/Images/photosBiens/divers/x.jpg')).toEqual({});
  });
});

describe('parseListPage (Dinamy)', () => {
  const listings = parseListPage(HTML, PAGE, 'Dinamy Immobilier');

  it('écarte la location SAISONNIÈRE (prix à la nuitée)', () => {
    // La fixture contient 4 cartes dont une saisonnière à 90 € : sans ce filtre,
    // elle polluerait les notifications avec un faux « bon plan ».
    expect(listings.map((l) => l.sourceRef).sort()).toEqual(['13', '16', '33', '42', '51']);
  });

  it('lit prix, surface, pièces, ville, quartier et meublé', () => {
    const l = listings.find((x) => x.sourceRef === '33');
    expect(l?.priceText).toBe('700 €');
    expect(l?.areaText).toBe('23 m²');
    expect(l?.roomsText).toBe('1 pièces');
    expect(l?.cityText).toBe('Nice');
    expect(l?.extra?.['quartier']).toBe('Carras');
    expect(l?.furnishedText).toBe('meublé');
    expect(l?.extra?.['agencyRef']).toBe('500227');
  });

  it('distingue la location VIDE de la meublée', () => {
    expect(listings.find((x) => x.sourceRef === '51')?.furnishedText).toBe('non meublé');
  });

  it('tolère un dossier photo sans quartier', () => {
    const l = listings.find((x) => x.sourceRef === '42');
    expect(l?.areaText).toBe('78 m²');
    expect(l?.extra?.['quartier']).toBeUndefined();
  });
});

describe('parsePageCount (Dinamy)', () => {
  it('lit le nombre de pages, 1 par défaut', () => {
    expect(parsePageCount(HTML)).toBe(2);
    expect(parsePageCount('<html></html>')).toBe(1);
  });
});

describe('splitLocality (Dinamy)', () => {
  it('lit les trois niveaux quand la carte les publie', () => {
    // « Nice - Carré d'Or - Rue de France » : la VOIE occupait le troisième
    // niveau et était purement et simplement jetée.
    expect(splitLocality("Nice - Carré d'Or - Rue de France")).toEqual({
      city: 'Nice',
      district: "Carré d'Or",
      street: 'Rue de France',
    });
  });

  it('ne coupe pas un quartier sur son tiret interne', () => {
    // Sur `\s*-\s*`, « Vieux-Nice » devenait « Vieux ».
    expect(splitLocality('Nice - Vieux-Nice')).toEqual({ city: 'Nice', district: 'Vieux-Nice' });
  });

  it('tolère la commune seule', () => {
    expect(splitLocality('Nice')).toEqual({ city: 'Nice' });
  });
});

describe('parseDetailPage (Dinamy)', () => {
  const detail = parseDetailPage(FICHE, FICHE_URL);

  it('lit la description, seul endroit où la RUE est nommée', () => {
    expect(detail.description).toMatch(/^Rue Smolett, tout proche du port/);
  });

  it('lit la description jusqu’à sa dernière ligne, sans la date de mise à jour', () => {
    expect(detail.description).toContain('Libre de Suite.\nGaranties exigées.\nA bientôt.');
    expect(detail.description).toMatch(/A bientôt\.$/);
    expect(detail.description).not.toContain('Mise à jour');
  });

  it('prend tout le diaporama, et pas la reprise du gabarit d’impression', () => {
    // La liste ne donne qu'une photo : c'est ici que le carrousel se remplit.
    expect(detail.imageUrls).toHaveLength(3);
    expect(detail.imageUrls?.[0]).toMatch(/^https:\/\/www\.dinamyimmobilier\.com\/Vues\/Images\//);
    expect(detail.imageUrls?.every((url) => !url.endsWith('-4.jpg'))).toBe(true);
  });

  it('déduit le DPE de la seule image non « vide » du tableau', () => {
    expect(detail.dpe).toBe('DPE C');
  });

  it('ne rend rien d’une page sans fiche, plutôt que d’inventer (§17)', () => {
    expect(parseDetailPage('<html></html>', FICHE_URL)).toEqual({});
  });
});

describe('detailDraft (Dinamy)', () => {
  const draft = detailDraft(parseDetailPage(FICHE, FICHE_URL));

  it('n’apporte que ce que la liste n’a pas', () => {
    expect(draft?.description).toMatch(/Rue Smolett/);
    expect(draft?.imageUrls).toHaveLength(3);
    expect(draft?.extra).toEqual({ dpe: 'DPE C' });
    expect(draft?.priceText).toBeUndefined();
    expect(draft?.areaText).toBeUndefined();
  });

  it('ne rend rien d’une fiche vide', () => {
    expect(detailDraft({})).toBeNull();
  });
});
