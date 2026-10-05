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

/**
 * LE REPLI HTML, jamais couvert jusque-là.
 *
 * Il ne sert que quand le site ne sert plus de JSON-LD — et il ne servait que
 * dans ce cas, sur un chemin que rien n'éprouvait. Ces tests le tiennent ouvert.
 */
describe('le repli HTML, quand le site ne sert plus de JSON-LD', () => {
  // Le conteneur NE CORRESPOND à aucun des sélecteurs de l'ancien repli
  // (`article, li, [class*=card], [class*=listing]`) : c'est le gabarit pour
  // lequel `closest` remontait jusqu'au document entier, et où chaque annonce
  // héritait des photos, du prix et de la surface de toutes les autres.
  const SANS_JSONLD = `<!DOCTYPE html><html><body>
    <main class="results">
      <div class="result-item">
        <a href="/listings/studio-nice-23-m2-06100-700-mois-paaa11">
          <h3>Studio 23 m² à Nice</h3>
          <img src="https://rentola.fr/static/logo.svg" alt="Rentola">
          <img src="/static/arrow-right.png" alt="suivant">
          <img src="https://cdn.rentola.fr/photo1.jpg" alt="séjour">
          <img data-src="https://cdn.rentola.fr/photo2.jpg" alt="cuisine">
          <img src="https://rentola.fr/static/icon-heart.svg" alt="favori">
          <p>700 € / mois · 23 m² · 1 pièce · 06100 Nice</p>
        </a>
      </div>
      <div class="result-item">
        <a href="/listings/t2-cannes-45-m2-06000-900-mois-pbbb22">
          <h3>T2 à Cannes</h3>
          <img src="https://cdn.rentola.fr/photo3.jpg" alt="séjour">
          <p>900 € / mois · 45 m² · 2 pièces · 06000 Cannes</p>
        </a>
      </div>
    </main>
  </body></html>`;

  it('lit les annonces même sans JSON-LD', () => {
    const { listings } = parseSearchPage(SANS_JSONLD, 'https://rentola.fr/location/nice');
    expect(listings.map((one) => one.sourceRef).sort()).toEqual(['paaa11', 'pbbb22']);
  });

  it('ne prend PAS les images de la page pour celles des biens', () => {
    const { listings } = parseSearchPage(SANS_JSONLD, 'https://rentola.fr/location/nice');
    const studio = listings.find((one) => one.sourceRef === 'paaa11');

    // Le logo et la flèche du bandeau ne sont pas des photos d'appartement, et
    // l'icône de favori n'en est pas une non plus.
    expect(studio?.imageUrls).toEqual([
      'https://cdn.rentola.fr/photo1.jpg',
      'https://cdn.rentola.fr/photo2.jpg',
    ]);
  });

  it('N’ATTRIBUE PAS à une annonce les photos de sa voisine', () => {
    const { listings } = parseSearchPage(SANS_JSONLD, 'https://rentola.fr/location/nice');
    const t2 = listings.find((one) => one.sourceRef === 'pbbb22');

    // Ni le salon du studio, ni son prix, ni sa surface : le gabarit du site ne
    // correspondait pas à `article, li, [class*=card]`, et la carte remontait
    // jusqu'au conteneur commun aux deux annonces.
    expect(t2?.imageUrls).toEqual(['https://cdn.rentola.fr/photo3.jpg']);
    expect(t2?.priceText).not.toContain('700');
    expect(t2?.areaText).not.toContain('23');
  });

  it('NE FABRIQUE PAS de code postal quand la carte n’en porte pas', () => {
    const SANS_CP = SANS_JSONLD.replace(' · 06100 Nice', '');
    const { listings } = parseSearchPage(SANS_CP, 'https://rentola.fr/location/nice');
    const studio = listings.find((one) => one.sourceRef === 'paaa11');

    // Écrit en dur avant : toute fiche sans code postal devenait du 06000, donc
    // une annonce de Menton entrait à Nice.
    expect(studio?.postalCodeText).toBeUndefined();
  });

  it('NE FABRIQUE PAS de code postal sur une fiche non plus', () => {
    const SANS_CP_DETAIL = SAMPLE_DETAIL_HTML.replace(/\b06\d{3}\b/g, '');
    const detail = parseDetailPage(
      SANS_CP_DETAIL,
      'https://rentola.fr/listings/location-appartement-nice-1-piece-23-m2-p05ad82',
    );
    expect(detail?.postalCodeText).toBeUndefined();
  });
});

/**
 * LE CHEMIN JSON-LD RESPECTE LA MÊME RÈGLE QUE LE REPLI HTML.
 *
 * Le garde sur les images d'illustration n'existait que d'un côté : une annonce
 * dont la carte publie un bloc JSON passait son logo et son « pas de bien » en
 * photos du logement. Le repli HTML, lui, les écartait — si bien qu'une règle
 * appliquée à moitié avait l'air de fonctionner.
 *
 * Relevé sur 314 fiches du miroir local : 2 logos et 2 images par défaut.
 */
describe('les images du chemin JSON-LD sont filtrées comme celles du HTML', () => {
  const html = `<html><body>
    <script type="application/ld+json">
      ${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SearchResultsPage',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              url: 'https://rentola.fr/listings/parking-a-louer-nice-pc3257f',
              item: {
                '@type': 'RealEstateListing',
                name: 'Parking à louer',
                url: 'https://rentola.fr/listings/parking-a-louer-nice-pc3257f',
                image: [
                  'https://griguer-immobilier.com/wp-content/uploads/2022/10/Gabarit-PARKING-LogoColor-FondBlanc-Small.png',
                  'https://gtiorpi.staticlbi.com/original/images/no_bien.jpg',
                  'https://cdn.example.com/photos/façade-principale.jpg',
                ],
              },
            },
          ],
        },
      })}
    </script>
  </body></html>`;

  it('écarte le logo et l’image par défaut, garde la vraie photo', () => {
    const page = parseSearchPage(html, 'https://rentola.fr/recherche');
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0]?.imageUrls).toEqual([
      'https://cdn.example.com/photos/façade-principale.jpg',
    ]);
  });
});

/**
 * UNE VILLE GÉOCODÉE N'EST PAS UNE ADRESSE. Rentola publie « 06000 Nice,
 * France » ou « Nice-Ville, Parvis de la Gare » avec le point que son
 * géocodeur en tire : 118 logements au même point du centre, 22 à la gare
 * (relevé du 2026-10-05). On ne garde ni l'adresse ni la position.
 */
describe('parseSearchPage — adresse et position de Rentola', () => {
  const page = (streetAddress: string): string =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'SearchResultsPage',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [
          {
            '@type': 'ListItem',
            url: 'https://rentola.fr/listings/studio-nice-p0a0b0c',
            item: {
              '@type': 'RealEstateListing',
              name: 'Studio Nice',
              url: 'https://rentola.fr/listings/studio-nice-p0a0b0c',
              offers: {
                '@type': 'Offer',
                price: 600,
                itemOffered: {
                  '@type': 'Apartment',
                  address: { '@type': 'PostalAddress', streetAddress, addressLocality: 'Nice' },
                  geo: { '@type': 'GeoCoordinates', latitude: 43.7049, longitude: 7.2617 },
                },
              },
            },
          },
        ],
      },
    })}</script>`;

  it.each([
    'Nice, Maritime Alps, France',
    '06000 Nice, France',
    'Nice-Ville, Parvis de la Gare, 06000 Nice, France',
  ])('écarte « %s » et son point', (adresse) => {
    const [listing] = parseSearchPage(page(adresse), 'https://rentola.fr/location/nice').listings;
    expect(listing).toBeDefined();
    expect(listing).not.toHaveProperty('addressText');
    expect(listing).not.toHaveProperty('latitude');
    expect(listing).not.toHaveProperty('longitude');
  });

  it('garde une vraie rue, et sa position', () => {
    const [listing] = parseSearchPage(
      page('12 Rue Fictive, 06000 Nice, France'),
      'https://rentola.fr/location/nice',
    ).listings;
    expect(listing?.addressText).toContain('12 Rue Fictive');
    expect(listing?.latitude).toBe(43.7049);
  });
});
