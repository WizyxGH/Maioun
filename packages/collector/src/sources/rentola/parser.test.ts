import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { listingReference, parseDetailPage, parseSearchPage } from './parser.js';

const SAMPLE_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "url": "https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82",
          "item": {
            "@type": "RealEstateListing",
            "name": "location appartement nice 1 pièce 23 m2 alpes maritimes (06000) - 450 € / mois",
            "url": "https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82",
            "image": "http://www.repimmo.com/upload/photos/sample1.jpg",
            "offers": {
              "@type": "Offer",
              "price": 450,
              "priceCurrency": "EUR",
              "validFrom": "2026-09-20T00:04:11Z",
              "itemOffered": {
                "@type": "Apartment",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "37 Avenue Jean Médecin, 06000 Nice, France",
                  "addressCountry": "FR",
                  "addressLocality": "Nice"
                },
                "geo": {
                  "@type": "GeoCoordinates",
                  "latitude": 43.7030602,
                  "longitude": 7.2662467
                },
                "floorSize": {
                  "@type": "QuantitativeValue",
                  "value": 23,
                  "unitCode": "MTK"
                },
                "numberOfBedrooms": {
                  "@type": "QuantitativeValue",
                  "value": 1
                }
              }
            }
          }
        },
        {
          "@type": "ListItem",
          "position": 2,
          "url": "https://rentola.fr/listings/appartement-3-pieces-nice-pb6f522",
          "item": {
            "@type": "RealEstateListing",
            "name": "Appartement 3 pièces Nice 50m2",
            "url": "https://rentola.fr/listings/appartement-3-pieces-nice-pb6f522",
            "image": "http://www.repimmo.com/upload/photos/sample2.jpg",
            "offers": {
              "@type": "Offer",
              "price": 850,
              "priceCurrency": "EUR",
              "itemOffered": {
                "@type": "Apartment",
                "address": {
                  "@type": "PostalAddress",
                  "streetAddress": "Rue de France, 06000 Nice",
                  "addressLocality": "Nice"
                },
                "floorSize": {
                  "@type": "QuantitativeValue",
                  "value": 50,
                  "unitCode": "MTK"
                },
                "numberOfBedrooms": {
                  "@type": "QuantitativeValue",
                  "value": 2
                }
              }
            }
          }
        }
      ]
    }
  }
  </script>
</head>
<body>
  <div>701 annonces</div>
  <a href="/location/nice?page=2">2</a>
</body>
</html>
`;

const SAMPLE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "name": "location appartement nice 1 pièce 23 m2 alpes maritimes (06000) - 450 € / mois",
    "description": "Joli studio meublé de 23 m² situé au cœur de Nice, Boulevard François Grosso. Idéal étudiant.",
    "datePosted": "2026-09-20T00:04:11Z",
    "url": "https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82",
    "image": [
      "http://www.repimmo.com/upload/photos/detail1.jpg",
      "http://www.repimmo.com/upload/photos/detail2.jpg"
    ],
    "offers": {
      "@type": "Offer",
      "price": 450,
      "priceCurrency": "EUR",
      "itemOffered": {
        "@type": "Apartment",
        "address": {
          "streetAddress": "Boulevard François Grosso, 06000 Nice",
          "addressLocality": "Nice"
        },
        "geo": {
          "latitude": 43.698,
          "longitude": 7.252
        },
        "floorSize": {
          "value": 23
        },
        "numberOfBedrooms": {
          "value": 1
        }
      }
    }
  }
  </script>
</head>
<body>
  <h1>Appartement Nice</h1>
</body>
</html>
`;

describe('Rentola parser', () => {
  it('extrait la référence d’une URL Rentola', () => {
    expect(
      listingReference(
        'https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82',
      ),
    ).toBe('p05ad82');
    expect(listingReference('https://rentola.fr/listings/studio-riquier-p91e80e')).toBe('p91e80e');
    expect(listingReference('https://rentola.fr/location/nice')).toBeNull();
  });

  it('parse une page de recherche JSON-LD avec plusieurs annonces', () => {
    const result = parseSearchPage(SAMPLE_SEARCH_HTML, 'https://rentola.fr/location/nice');
    expect(result.listings).toHaveLength(2);
    expect(result.hasNextPage).toBe(true);
    expect(result.warnings).toHaveLength(0);

    const first = result.listings[0];
    if (!first) throw new Error('La première annonce attendue manque.');
    expect(first.sourceRef).toBe('p05ad82');
    expect(first.priceText).toBe('450 € / mois');
    expect(first.areaText).toBe('23 m²');
    expect(first.roomsText).toBe('1 chambre');
    expect(first.cityText).toBe('Nice');
    expect(first.postalCodeText).toBe('06000');
    expect(first.latitude).toBeCloseTo(43.70306);
    expect(first.longitude).toBeCloseTo(7.26624);
    expect(first.imageUrls).toEqual(['http://www.repimmo.com/upload/photos/sample1.jpg']);
  });

  it('parse une page de détail avec description et photos multiples', () => {
    const detail = parseDetailPage(
      SAMPLE_DETAIL_HTML,
      'https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82',
    );
    expect(detail).not.toBeNull();
    expect(detail?.sourceRef).toBe('p05ad82');
    expect(detail?.description).toContain('Joli studio meublé');
    expect(detail?.furnishedText).toBe('Meublé');
    expect(detail?.imageUrls).toHaveLength(2);
    expect(detail?.imageUrls?.[0]).toBe('http://www.repimmo.com/upload/photos/detail1.jpg');
    expect(detail?.latitude).toBe(43.698);
  });

  it('normalise l’annonce Rentola pour la base de données Maïoun', () => {
    const { listings } = parseSearchPage(SAMPLE_SEARCH_HTML, 'https://rentola.fr/location/nice');
    const detail = parseDetailPage(
      SAMPLE_DETAIL_HTML,
      'https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-alpes-maritimes-06000-450-mois-p05ad82',
    );
    const listing = listings[0];
    if (!listing) throw new Error('La première annonce attendue manque.');
    if (!detail) throw new Error('La fiche détaillée attendue manque.');

    const merged = { ...listing, ...detail };
    const normalized = normalizeListing(merged, {
      sourceId: 'rentola',
      nowMs: Date.parse('2026-09-29T10:00:00Z'),
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.sourceId).toBe('rentola');
    expect(normalized?.sourceRef).toBe('p05ad82');
    expect(normalized?.price).toBe(450);
    expect(normalized?.area).toBe(23);
    expect(normalized?.bedrooms).toBe(1);
    expect(normalized?.furnished).toBe(true);
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06000');
    expect(normalized?.latitude).toBeCloseTo(43.698);
    expect(normalized?.longitude).toBeCloseTo(7.252);
    expect(normalized?.imageUrls).toHaveLength(2);
  });
});
