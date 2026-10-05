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

/**
 * LE `@type` A CHANGÉ, et le parseur ne suivait pas.
 *
 * La plateforme Apimo/Cello publie aujourd'hui `RealEstateListing` là où elle
 * publiait `Apartment`. Le nœud n'était plus reconnu, tout le JSON-LD était
 * perdu — et avec lui les photos. Relevé du 2026-10-03 sur les pages vivantes :
 * Beaumont, Étude Lotte et Immobilier 2 Nice gardaient ZÉRO image sur une fiche
 * qui en publie trois à six.
 */
function ficheReelEstateListing(): string {
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'RealEstateAgent', name: 'Agence' },
        {
          '@type': 'RealEstateListing',
          name: 'Beau T2',
          numberOfRooms: 2,
          floorSize: { value: 30 },
          offers: { price: 650 },
          address: { addressLocality: 'Nice', postalCode: '06000' },
          image: [
            'https://cdn.exemple.fr/photo1.jpg',
            'https://cdn.exemple.fr/photo2.jpg',
            'https://cdn.exemple.fr/photo3.jpg',
            'https://cdn.exemple.fr/photo4.jpg',
          ],
        },
      ],
    })}</script></head><body></body></html>`;
}

describe('le `@type` de la plateforme', () => {
  it('lit un nœud `RealEstateListing` comme avant `Apartment`', () => {
    // SANS ce `@type` accepté, la fiche rend `listing: null` : tout le JSON-LD
    // est perdu — le prix, la surface, et les photos.
    const { listing } = parseDetailPage(ficheReelEstateListing(), RESIDENTIAL_URL, AGENCY);
    expect(listing).not.toBeNull();
    expect(listing?.priceText).toContain('650');
    expect(listing?.areaText).toContain('30');
  });

  it('en garde TOUTES les photos, pas zéro', () => {
    const { listing } = parseDetailPage(ficheReelEstateListing(), RESIDENTIAL_URL, AGENCY);
    // C'est le gain de la correction : quatre photos publiées, quatre gardées.
    expect(listing?.imageUrls).toEqual([
      'https://cdn.exemple.fr/photo1.jpg',
      'https://cdn.exemple.fr/photo2.jpg',
      'https://cdn.exemple.fr/photo3.jpg',
      'https://cdn.exemple.fr/photo4.jpg',
    ]);
  });
});

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

// Relevé du 2026-09-16 sur Vizcaya : trois champs que la plateforme publie et
// que l'adaptateur laissait tomber — position du bien, quartier, DPE en clair.
describe('parseDetailPage — position, quartier, DPE déclaré', () => {
  const url = 'https://exemple.fr/fr/propriete/location+appartement+nice+carabacel-3p+87331733';
  const page = (property: Record<string, unknown>, body = ''): string =>
    `<html><head><script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'RealEstateAgent', name: 'Agence' },
        {
          '@type': 'Apartment',
          name: 'Trois pièces Carabacel',
          offers: { price: 1900 },
          address: { addressLocality: 'Nice', postalCode: '06000' },
          ...property,
        },
      ],
    })}</script></head><body>${body}</body></html>`;

  it('lit la position du bien publiée en `geo`, chaîne comme nombre', () => {
    const asNumbers = parseDetailPage(
      page({ geo: { latitude: 43.70119, longitude: 7.27535 } }),
      url,
      AGENCY,
    ).listing;
    expect(asNumbers).toMatchObject({ latitude: 43.70119, longitude: 7.27535 });
    const asStrings = parseDetailPage(
      page({ geo: { latitude: '43.699825', longitude: '7.267790' } }),
      url,
      AGENCY,
    ).listing;
    expect(asStrings?.latitude).toBeCloseTo(43.699825, 5);
  });

  it('ignore une position absente ou hors bornes', () => {
    expect(parseDetailPage(page({}), url, AGENCY).listing?.latitude).toBeUndefined();
    const absurd = page({ geo: { latitude: 0, longitude: 7.27 } });
    expect(parseDetailPage(absurd, url, AGENCY).listing?.longitude).toBeUndefined();
  });

  it('lit le quartier du titre de partage, après la commune', () => {
    const body =
      '<div class="popup-module-share"><h2>Location Appartement, Nice Carabacel</h2></div>';
    expect(parseDetailPage(page({}, body), url, AGENCY).listing?.extra?.['quartier']).toBe(
      'Carabacel',
    );
  });

  it('ne prend pas pour un quartier un titre de partage qui décrit le bien', () => {
    const body =
      '<div class="popup-module-share"><h2>Location appartement Nice, 2 pièces, 41 m², 850 €</h2></div>';
    expect(
      parseDetailPage(page({}, body), url, AGENCY).listing?.extra?.['quartier'],
    ).toBeUndefined();
  });

  it('croit la lettre écrite en clair, et son absence (`class-none`)', () => {
    const withLetter =
      '<div class="custom-energy-diagnostics"><div class="regulation"><p>DPE : <span class="energy class-d">D</span></p></div></div>';
    expect(parseDetailPage(page({}, withLetter), url, AGENCY).listing?.extra?.['dpe']).toBe('D');
    const none =
      '<div class="custom-energy-diagnostics"><div class="regulation"><p>DPE : <span class="energy class-none"></span></p></div></div>';
    expect(parseDetailPage(page({}, none), url, AGENCY).listing?.extra?.['dpe']).toBeUndefined();
  });
});

/**
 * Une fiche retirée redirige (301) vers `/fr/not-found` : le client HTTP suit
 * le saut, et le parseur ne voyait alors qu'une page sans annonce. Il faut
 * qu'il dise POURQUOI, pour que l'occurrence s'éteigne au lieu d'attendre.
 */
describe('parseDetailPage — fiche que le site ne sert plus', () => {
  const url = 'https://exemple.fr/fr/propriete/location+appartement+nice+studio-gorbella+82625748';

  /** Page servie à la place de la fiche, avec sa propre canonique. */
  const remplacement = (canonical: string): string =>
    `<!DOCTYPE html><html><head><link rel="canonical" href="${canonical}" /></head><body>Introuvable</body></html>`;

  it('éteint la fiche remplacée par la page « introuvable »', () => {
    const parsed = parseDetailPage(remplacement('https://exemple.fr/fr/not-found'), url, AGENCY);
    expect(parsed.listing).toBeNull();
    expect(parsed.withdrawn).toBe(true);
  });

  it('éteint la fiche remplacée par l’accueil du site', () => {
    expect(parseDetailPage(remplacement('https://exemple.fr/fr'), url, AGENCY).withdrawn).toBe(
      true,
    );
  });

  it('n’éteint rien quand le site a seulement réécrit le slug', () => {
    const html = residentialHtml().replace(
      '<head>',
      '<head><link rel="canonical" href="https://exemple.fr/fr/propriete/location+appartement+nice+studio-gorbella-calme+82625748" />',
    );
    const parsed = parseDetailPage(html, url, AGENCY);
    expect(parsed.withdrawn).toBeFalsy();
    expect(parsed.listing).not.toBeNull();
  });

  it('n’éteint rien sur une page seulement illisible', () => {
    // Ni annonce ni canonique : on ne sait pas lire, on ne conclut pas.
    const parsed = parseDetailPage('<html><body>gabarit inconnu</body></html>', url, AGENCY);
    expect(parsed.listing).toBeNull();
    expect(parsed.withdrawn).toBeFalsy();
  });
});

/**
 * Les garages et parkings décrivent le bien en `Product`, pas en `Apartment` :
 * leur graphe n'était pas lu du tout, et l'occurrence sortait sans téléphone ni
 * e-mail — que la page porte pourtant.
 */
describe('parseDetailPage — bien décrit en Product', () => {
  const url =
    'https://exemple.fr/fr/propriete/location+garage-parking+nice+nice-chambrun-garage+86355041';
  const graphe = (id: string): string =>
    `<!DOCTYPE html><html><head><script type="application/ld+json">${JSON.stringify({
      '@graph': [
        {
          '@type': 'RealEstateAgent',
          name: 'Agence Fictive',
          telephone: '+33-600000012',
          email: 'contact@example.invalid',
        },
        {
          '@type': 'Product',
          '@id': id,
          name: 'Garage Chambrun',
          offers: { price: 115 },
          address: { addressLocality: 'Nice', postalCode: '06000' },
        },
      ],
    })}</script></head><body></body></html>`;

  it('lit le téléphone et l’e-mail de l’agence sur la fiche d’un garage', () => {
    const { listing } = parseDetailPage(graphe(`${url}#property`), url, AGENCY);
    expect(listing?.phoneText).toBe('+33-600000012');
    expect(listing?.emailText).toBe('contact@example.invalid');
  });

  it('ignore un Product de référencement, qui ne porte pas l’ancre du bien', () => {
    const { listing } = parseDetailPage(graphe(`${url}#organization`), url, AGENCY);
    expect(listing?.phoneText).toBeUndefined();
  });
});

/**
 * LA RÉFÉRENCE EST MASQUÉE SUR LA PLATEFORME, ET LES DEUX ANCIENS MOTIFS NE
 * LA VOYAIENT PAS.
 *
 * Les listes Apimo servent désormais des URL finissant par `874****7826`. Les
 * motifs exigeaient `\\d{6,}`, donc rien n'était reconnu : la source lisait ses
 * onze pages, n'en extrayait aucune, et le passage s'achevait en « completed ».
 * Deux agences relevées ainsi — Immo 3000, Étude des Vosges.
 */
describe('les URL de fiche a reference masquee', () => {
  it('reconnait la forme a + et garde la cle avant le masque', () => {
    const parsed = parseListingUrl(
      'https://immo3000.com/fr/propriete/location+appartement+nice+studio-vide-a-louer-proche-de-la-fac-de-lettres+874****7826',
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.transaction).toBe('location');
    expect(parsed?.citySlug).toBe('nice');
    // On ne garde QUE ce qui precede l'asterisque : les chiffres qui suivent
    // ne sont pas l'identifiant, et s'en servir ferait fusionner deux biens.
    expect(parsed?.reference).toBe('874');
  });

  it('reconnait aussi la forme a barres', () => {
    const parsed = parseListingUrl(
      'https://www.etudedesvosges.fr/fr/propriete/location/appartement/antibes/872****3838',
    );
    expect(parsed?.reference).toBe('872');
    expect(parsed?.citySlug).toBe('antibes');
  });

  it('laisse passer une reference en clair, et prend la forme ancienne', () => {
    expect(
      parseListingUrl('https://x.fr/fr/propriete/location+appartement+nice+studio+8188166')
        ?.reference,
    ).toBe('8188166');
  });

  /**
   * DEUX ANNONCES MASQUEES DE MEME PREFIXE NE DOIVENT PAS DEVENIR LA MEME.
   *
   * C'est le prix du masque : la clé n'est plus unique. On garde ce qu'on a,
   * et on ne pretend pas le contraire — deux biens differents qui partagent
   * leurs quatre premiers chiffres se rejoindront, ce que l'on assume
   * explicement plutot que de les perdre tous les deux.
   */
  it('assume la collision plutot que de perdre les deux annonces', () => {
    const a = parseListingUrl('https://x.fr/fr/propriete/location+appartement+nice+a+874****1111');
    const b = parseListingUrl('https://x.fr/fr/propriete/location+appartement+nice+b+874****2222');
    // Meme cle : c'est le prix du masque, et il est assume.
    expect(a?.reference).toBe(b?.reference);
  });
});

/**
 * LE CONSEILLER ET L'AGENCE, PAS SEULEMENT LE JSON-LD.
 *
 * Gabarit relevé le 2026-10-05 sur DG Immo et Palais Immobilier : la fiche
 * affiche la ligne directe, le portable et l'adresse du conseiller, puis le
 * standard de l'agence. Le JSON-LD n'en portait qu'un, et la fiche n'en
 * montrait qu'un. Le `href` masque les chiffres ; le texte est complet.
 */
describe('parseDetailPage — toutes les coordonnées affichées', () => {
  const blocs = `
    <div class="module module-1 user-template-1 module-user"><ul class="listing"><li>
      <h3>Conseiller <em>Gérant</em></h3>
      <span class="phone"><a href="tel:+334****0040">+33 4 00 00 00 40</a></span>
      <span class="mobile"><a href="tel:+336****0041">+33 6 00 00 00 41</a></span>
      <span class="email"><a href="mailto:conseiller@example.invalid">conseiller@example.invalid</a></span>
    </li></ul></div>
    <div class="module module-2 agency-template-1 module-agency simple">
      <span class="phone"><a href="tel:+33-400000040">+33 4 00 00 00 40</a></span>
      <span class="email"><a href="mailto:agence@example.invalid">agence@example.invalid</a></span>
    </div>`;

  it('appelle d’abord la ligne du conseiller, puis le standard de l’agence', () => {
    const { listing } = parseDetailPage(residentialHtml(blocs), RESIDENTIAL_URL, AGENCY);
    // Le portable n'est pas une ligne de l'agence : il est propre à l'annonce.
    expect(listing?.phoneText).toBe('+33 6 00 00 00 41');
    expect(listing?.phoneIsDirect).toBe(true);
    expect(listing?.otherPhonesText).toContain('+33 4 00 00 00 40');
    expect(listing?.emailText).toBe('conseiller@example.invalid');
    expect(listing?.emailIsDirect).toBe(true);
    expect(listing?.otherEmailsText).toContain('agence@example.invalid');
  });

  it('garde le standard quand le conseiller ne publie que lui', () => {
    const repete = `
      <div class="module-user"><span class="phone"><a>+33 4 00 00 00 40</a></span></div>
      <div class="module-agency"><span class="phone"><a>04 00 00 00 40</a></span></div>`;
    const { listing } = parseDetailPage(residentialHtml(repete), RESIDENTIAL_URL, AGENCY);
    expect(listing?.phoneText).toBe('04 00 00 00 40');
    expect(listing).not.toHaveProperty('phoneIsDirect');
  });

  it('ne dit rien quand la page ne publie aucun bloc', () => {
    const { listing } = parseDetailPage(residentialHtml(), RESIDENTIAL_URL, AGENCY);
    expect(listing).not.toBeNull();
    expect(listing).not.toHaveProperty('otherPhonesText');
    expect(listing).not.toHaveProperty('otherEmailsText');
    expect(listing).not.toHaveProperty('phoneIsDirect');
  });
});

/**
 * LE BIEN RANGÉ DANS `about`. Gabarit relevé le 2026-10-05 chez Oréa : le nœud
 * `RealEstateListing` porte l'annonce, et le logement — adresse, coordonnées,
 * pièces, surface — vit dans un nœud imbriqué que le parseur ignorait.
 */
describe('parseDetailPage — le bien imbriqué dans `about`', () => {
  const html = `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'RealEstateAgent', name: 'Agence' },
        {
          '@type': 'RealEstateListing',
          name: 'Studio cosy',
          description: 'Studio meublé.',
          image: ['https://cdn.exemple.fr/photo1.jpg'],
          offers: { '@type': 'Offer', price: 670 },
          about: {
            '@type': 'Apartment',
            numberOfRooms: 1,
            floorSize: { value: 27.05 },
            address: {
              '@type': 'PostalAddress',
              streetAddress: '15 impasse Fictive nice',
              addressLocality: 'Nice',
              postalCode: '06000',
            },
            geo: { '@type': 'GeoCoordinates', latitude: 43.71354, longitude: 7.26031 },
          },
        },
      ],
    })}</script></head><body></body></html>`;

  it('lit l’adresse, la position, les pièces et la surface du bien', () => {
    const { listing } = parseDetailPage(html, RESIDENTIAL_URL, AGENCY);
    expect(listing?.addressText).toContain('15 impasse Fictive');
    expect(listing?.postalCodeText).toBe('06000');
    expect(listing?.latitude).toBe(43.71354);
    expect(listing?.longitude).toBe(7.26031);
    expect(listing?.roomsText).toContain('1');
    expect(listing?.areaText).toContain('27');
    // L'annonce garde ce qu'elle dit elle-même.
    expect(listing?.title).toBe('Studio cosy');
    expect(listing?.imageUrls).toEqual(['https://cdn.exemple.fr/photo1.jpg']);
  });
});
