import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeProxiedImage,
  isWithdrawnDraft,
  isWithdrawnPage,
  parseDetail,
  parseDetailResponse,
  parseListPage,
  WITHDRAWN_DRAFT,
} from './parser.js';

const HTML = readFileSync(
  fileURLToPath(new URL('../../../../../tests/fixtures/rentumo/liste.html', import.meta.url)),
  'utf8',
);
const PAGE = 'https://rentumo.com/rent-apartment/nice';

describe('decodeProxiedImage (Rentumo)', () => {
  it('rend l’adresse d’ORIGINE, encodée en base64 dans l’URL du proxy', () => {
    // C'est ce qui rend la source exploitable : la photo en pleine qualité, et
    // l'hébergeur du site d'où vient réellement l'annonce.
    expect(
      decodeProxiedImage(
        'https://img.rentumo.com/sig/s:366:311/rt:fill-down/aHR0cHM6Ly9leGVt/cGxlLmludmFsaWQv/cGhvdG8uanBn',
      ),
    ).toBe('https://exemple.invalid/photo.jpg');
  });

  it('ne devine rien d’une URL qui ne suit pas ce format (§17)', () => {
    expect(decodeProxiedImage('https://img.rentumo.com/logo.png')).toBeNull();
    expect(decodeProxiedImage('https://exemple.invalid/photo.jpg')).toBeNull();
  });
});

describe('parseListPage (Rentumo)', () => {
  const { listings, warnings, hasNext } = parseListPage(HTML, PAGE);

  it('lit chaque carte sans avertissement', () => {
    expect(listings).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it('lit les faits affichés tels quels : prix, surface, type, ville', () => {
    const first = listings[0];
    expect(first?.sourceRef).toBe('6536139');
    expect(first?.sourceUrl).toBe('https://rentumo.com/listings/nice-nord-studio-vide-6536139');
    expect(first?.priceText).toBe('€ 510');
    expect(first?.areaText).toBe('18 m²');
    expect(first?.cityText).toBe('Nice');
    // Le vocabulaire anglais part tel quel : `parsePropertyType` le comprend.
    expect(first?.propertyTypeText).toMatch(/Apartment/);
  });

  it('compte les CHAMBRES, jamais les pièces', () => {
    // « 1 Bedroom » n'est pas « 1 pièce » : les confondre décalerait la
    // typologie de tout l'inventaire.
    expect(listings[0]?.roomsText).toBe('1 Bedroom');
  });

  it('remplace la photo du proxy par son adresse d’origine', () => {
    const photos = listings[0]?.imageUrls ?? [];
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((url) => !url.includes('img.rentumo.com'))).toBe(true);
    expect(listings[0]?.extra?.['origine']).toBe('gtiorpi.staticlbi.com');
  });

  it('n’invente pas de titre quand l’annonce ouvre sur le loyer (§17)', () => {
    // La carte ne porte pas de titre : seulement un extrait de description.
    // « Loyer : » n'en est pas un.
    expect(listings[0]?.title).toMatch(/^NICE NORD/);
    expect(listings[1]?.title).toBeUndefined();
    expect(listings[1]?.description).toMatch(/Loyer/);
  });

  it('suit la pagination déclarée par le site', () => {
    expect(hasNext).toBe(true);
    expect(parseListPage('<html></html>', PAGE).hasNext).toBe(false);
  });
});

describe('parseDetail (Rentumo)', () => {
  const FICHE = readFileSync(
    fileURLToPath(new URL('../../../../../tests/fixtures/rentumo/fiche.html', import.meta.url)),
    'utf8',
  );

  it('prend le titre et le texte d’origine dans le JSON-LD', () => {
    const detail = parseDetail(FICHE);
    expect(detail?.title).toBe('Location Appartement 2 pièces 68m² NICE 06000');
    expect(detail?.description).toMatch(/^Loyer :\n1 600 €/);
    expect(detail?.description).toContain('Dépôt de garantie : 2 980 €');
  });

  it('ne reprend aucun champ « extrait par IA »', () => {
    const detail = parseDetail(FICHE);
    expect(detail?.roomsText).toBeUndefined();
    expect(detail?.areaText).toBeUndefined();
  });

  it('rend null sans JSON-LD d’annonce', () => {
    expect(parseDetail('<html><body></body></html>')).toBeNull();
  });
});

describe('parseDetail (Rentumo) — localisation affichée', () => {
  const FICHE = readFileSync(
    fileURLToPath(
      new URL('../../../../../tests/fixtures/rentumo/fiche-localisation.html', import.meta.url),
    ),
    'utf8',
  );
  const JSON_LD =
    '<script type="application/ld+json">{"@type":"Apartment","name":"T2","description":"Texte.","address":{"postalCode":"06000"}}</script>';

  it('prend la voie et le code postal affichés, pas ceux du JSON-LD', () => {
    const detail = parseDetail(FICHE);
    expect(detail?.addressText).toBe('AVENUE FICTIVE');
    expect(detail?.postalCodeText).toMatch(/\b06100\b/);
  });

  it('ne va pas chercher le numéro masqué ailleurs dans la page', () => {
    expect(parseDetail(FICHE)?.addressText).not.toMatch(/\d/);
  });

  it('lit le quartier d’une localisation sans voie', () => {
    const detail = parseDetail(`<html><head>${JSON_LD}</head><body>
      <span id='address'>Nice - Fleurs Gambetta</span></body></html>`);
    expect(detail?.extra).toEqual({ quartier: 'Gambetta' });
    expect(detail?.addressText).toBeUndefined();
    expect(detail?.postalCodeText).toBeUndefined();
  });

  it('sans localisation affichée, n’invente ni voie ni code postal', () => {
    const detail = parseDetail(`<html><head>${JSON_LD}</head><body></body></html>`);
    expect(detail).toEqual({ title: 'T2', description: 'Texte.' });
  });
});

describe('fiche retirée (Rentumo)', () => {
  const DESACTIVEE = readFileSync(
    fileURLToPath(
      new URL(
        '../../../../../tests/fixtures/rentumo/recherche-annonce-desactivee.html',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const FICHE = readFileSync(
    fileURLToPath(new URL('../../../../../tests/fixtures/rentumo/fiche.html', import.meta.url)),
    'utf8',
  );
  const ok = { status: 200, location: null };

  it('reconnaît la redirection vers la recherche de la commune', () => {
    const page = { status: 302, location: 'https://rentumo.com/rentals/nice' };
    expect(isWithdrawnPage('', page)).toBe(true);
    expect(parseDetailResponse('', page)).toBe(WITHDRAWN_DRAFT);
    expect(isWithdrawnDraft(parseDetailResponse('', page) ?? undefined)).toBe(true);
  });

  it('reconnaît le bandeau « the listing has been deactivated »', () => {
    expect(isWithdrawnPage(DESACTIVEE, ok)).toBe(true);
    expect(parseDetailResponse(DESACTIVEE, ok)).toBe(WITHDRAWN_DRAFT);
  });

  it('ne conclut rien d’une redirection vers une autre fiche, ni d’une fiche en ligne', () => {
    const versFiche = { status: 301, location: '/listings/appartement-nice-26131834' };
    expect(isWithdrawnPage('', versFiche)).toBe(false);
    expect(parseDetailResponse('', versFiche)).toBeNull();
    expect(isWithdrawnPage('', { status: 302, location: null })).toBe(false);
    // La fiche vivante porte « no longer available » dans son formulaire de
    // signalement : ce n'est pas un retrait.
    expect(isWithdrawnPage(FICHE, ok)).toBe(false);
    expect(isWithdrawnDraft(parseDetailResponse(FICHE, ok) ?? undefined)).toBe(false);
  });
});
