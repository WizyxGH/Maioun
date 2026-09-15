import { describe, expect, it } from 'vitest';
import {
  isCommercialSlug,
  parseApimoDetail,
  parseDetailPage,
  parseListingUrl,
  parseSitemap,
} from './parser.js';

const AGENCY = 'Agence Test';

/** Fiche résidentielle minimale (JSON-LD @graph Apartment + Offer). */
function residentialHtml(extra = ''): string {
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'RealEstateAgent', name: 'Agence' },
        {
          '@type': 'Apartment',
          name: 'Beau T2',
          numberOfRooms: 2,
          floorSize: { value: 30 },
          offers: { price: 650 },
          address: { addressLocality: 'Nice', postalCode: '06000' },
        },
      ],
    })}</script></head><body>${extra}</body></html>`;
}

const RESIDENTIAL_URL = 'https://exemple.fr/fr/propriete/location+appartement+nice+beau-t2+123456';
const COMMERCE_URL =
  'https://exemple.fr/fr/propriete/location+commerce+nice+local-atelier+84747869';

describe('parseDetailPage — garde-fous (§3, §17)', () => {
  it('garde une location résidentielle disponible', () => {
    const { listing } = parseDetailPage(residentialHtml(), RESIDENTIAL_URL, AGENCY);
    expect(listing).not.toBeNull();
    expect(listing?.priceText).toContain('650');
  });

  it('écarte un bien à usage commercial (slug d’URL)', () => {
    const { listing, warnings } = parseDetailPage(residentialHtml(), COMMERCE_URL, AGENCY);
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/commercial/i);
  });

  it('écarte un bien à usage commercial (type JSON-LD CommercialProperty)', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [{ '@type': 'CommercialProperty', name: 'Local', offers: { price: 560 } }],
    })}</script>`;
    const { listing } = parseDetailPage(html, RESIDENTIAL_URL, AGENCY);
    expect(listing).toBeNull();
  });

  it('écarte un bien affiché « déjà Loué »', () => {
    const html = residentialHtml(
      '<div class="propertySold"><p class="sticker">déjà Loué</p></div>',
    );
    const { listing, warnings } = parseDetailPage(html, RESIDENTIAL_URL, AGENCY);
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/lou[ée]|vendu/i);
  });
});

describe('titre « Sommaire » (relevé du 2026-09-14)', () => {
  // Adresse sans type : `/fr/propriété/{id}` (Groupe Picado, Cabinet Cordier).
  const url = {
    transaction: 'location' as const,
    typeSlug: '',
    citySlug: '',
    reference: '8188166',
    canonicalUrl: 'https://agence.invalid/fr/propri%C3%A9t%C3%A9/8188166',
  };

  it('écarte un local commercial dont seul le titre de la page dit la nature', () => {
    const html = `<html><head><meta property="og:title" content=" Local commercial Ariane"></head>
      <body><div class="module-property-info"><h2 class="title property-title-3"> Sommaire</h2>
      <span class="price">500 €</span></div></body></html>`;
    const { listing, warnings } = parseApimoDetail(html, url, 'Agence');
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/commercial/);
  });
});

describe('titre d’une fiche sans JSON-LD (garage, Eric Immo)', () => {
  const url = 'https://exemple.fr/fr/propriete/location+garage-parking+nice+garage-ferme+83539278';
  // Structure relevée le 2026-09-15 : og:title du site, h1 d'en-tête de module.
  const page = (heading: string) => `<html><head>
    <title>Propriété | AGENCE TEST</title>
    <meta property="og:title" content="Propriété | AGENCE TEST"></head><body>
    <div class="module-property-info"><h2 class="title property-title-2">Location
      Garage<br>Nice<br></h2><p>12 m²</p></div>
    <div class="module-property-info"><div class="module-header">
      <h1 class="module-header-title">Informations complémentaires</h1></div>
      ${heading}<span class="price">120 € / Mois</span></div></body></html>`;

  it('prend le h1 de la fiche, jamais le titre du site', () => {
    const html = page(
      '<h1 class="title property-title-4">NICE MADELEINE. A louer garage fermé</h1>',
    );
    const { listing } = parseDetailPage(html, url, AGENCY);
    expect(listing?.title).toBe('NICE MADELEINE. A louer garage fermé');
  });

  it('à défaut, type et commune de la fiche', () => {
    const html = page('').replace(/<h2[\s\S]*?<\/h2>/, '');
    const { listing } = parseDetailPage(html, url, AGENCY);
    expect(listing?.title).toBe('Garage parking Nice');
  });
});

describe('ameublement', () => {
  const services = (items: string) =>
    residentialHtml(
      `<div class="module-property-info"><div class="services"><ul>${items}</ul></div></div>`,
    );

  it('vient de la prestation dédiée, pas de la description', () => {
    const { listing } = parseDetailPage(
      services('<li>Ascenseur</li><li>Meublé</li>'),
      RESIDENTIAL_URL,
      AGENCY,
    );
    expect(listing?.furnishedText).toBe('Meublé');
  });

  it('reste inconnu sans prestation ni ligne dédiée', () => {
    const html = residentialHtml().replace(
      '"Beau T2"',
      '"Beau T2","description":"Cuisine meublée"',
    );
    const { listing } = parseDetailPage(html, RESIDENTIAL_URL, AGENCY);
    expect(listing?.description).toBe('Cuisine meublée');
    expect(listing?.furnishedText).toBeUndefined();
  });

  it('lit une ligne « Meublé : Non »', () => {
    const html = residentialHtml(
      '<div class="module-property-info"><ul><li>Meublé <span>Non</span></li></ul></div>',
    );
    expect(parseDetailPage(html, RESIDENTIAL_URL, AGENCY).listing?.furnishedText).toBe(
      'Non meublé',
    );
  });
});

describe('parseListingUrl — schéma « à barres » (Abyla Bosse)', () => {
  const url =
    'https://immobiliere-abc.com/fr/propriete/location/appartement/nice/t2-nice-gambetta/85264881';

  it('lit transaction, type, commune et référence', () => {
    expect(parseListingUrl(url)).toEqual({
      transaction: 'location',
      typeSlug: 'appartement',
      citySlug: 'nice',
      reference: '85264881',
      canonicalUrl: url,
    });
    expect(
      parseListingUrl('https://immobiliere-abc.com/fr/propriete/location/bureau/nice/85264882'),
    ).toMatchObject({ typeSlug: 'bureau', reference: '85264882' });
  });

  it('garde les locations du sitemap, sans vente ni page anglaise', () => {
    const xml = `<urlset>
      <url><loc><![CDATA[${url}]]></loc><lastmod>2026-09-07</lastmod></url>
      <url><loc><![CDATA[https://immobiliere-abc.com/fr/propriete/vente/appartement/nice/studio/8016660]]></loc></url>
      <url><loc><![CDATA[https://immobiliere-abc.com/en/property/rental/apartment/nice/t2/85264881]]></loc></url>
    </urlset>`;
    expect(parseSitemap(xml).map((entry) => [entry.url.reference, entry.lastmod])).toEqual([
      ['85264881', '2026-09-07'],
    ]);
  });

  it('se lit comme une fiche Apimo', () => {
    const { listing } = parseDetailPage(residentialHtml(), url, AGENCY);
    expect(listing).toMatchObject({ sourceRef: '85264881', propertyTypeText: 'appartement' });
    expect(listing?.extra?.['citySlug']).toBe('nice');
  });

  it('écarte d’avance les types non résidentiels', () => {
    expect(isCommercialSlug('bureau')).toBe(true);
    expect(isCommercialSlug('appartement')).toBe(false);
  });
});
