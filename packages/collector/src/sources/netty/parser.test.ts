import { describe, expect, it } from 'vitest';
import {
  chargesFromMentions,
  matchesCity,
  parseDetailPage,
  parseListingUrl,
  parseSitemap,
} from './parser.js';

const AGENCY = 'Agence Test';
const URL = 'https://www.exemple.fr/location/appartement-t2-2-pieces-nice-06200,LA1920';

/**
 * Fiche reproduisant la STRUCTURE réellement observée le 2026-09-05 : blocs
 * `[data-author="Netty.fr"]`, classes CSS hachées, JSON-LD `Product` dont le
 * bien tient sous `offers.itemOffered`, et mentions légales en fin de page.
 *
 * Les classes sont volontairement absurdes (`_1o6jcyu`) : c'est ce que Netty
 * engendre, et le test échouerait si le parser s'y accrochait.
 */
function nettyHtml(
  options: {
    mentions?: string;
    descriptif?: string;
    name?: string;
    price?: number | string;
    priceSpecification?: Record<string, string>;
    extraCriterion?: [string, string];
  } = {},
): string {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: options.name ?? 'Location étudiante - SEPTEMBRE A JUIN 2025',
    image: 'https://img.netty.immo/product/c/LA1920/photo_1.jpg',
    offers: {
      url: 'www.exemple.fr/location/appartement-t2-2-pieces-nice-06200,LA1920',
      price: options.price ?? 880,
      priceCurrency: 'EUR',
      ...(options.priceSpecification !== undefined
        ? { priceSpecification: options.priceSpecification }
        : {}),
      itemOffered: {
        '@type': 'Apartment',
        numberOfRooms: 2,
        floorSize: { '@type': 'QuantitativeValue', unitCode: 'MTK', value: 30 },
        address: { '@type': 'PostalAddress', addressLocality: 'Nice', postalCode: '06200' },
        photo: [
          { '@type': 'ImageObject', url: 'https://img.netty.immo/product/c/LA1920/photo_2.jpg' },
        ],
      },
    },
  };
  const descriptif =
    options.descriptif ??
    '<h1>Charmant et lumineux T2 sur Nice Ouest</h1>Entièrement meublé, séjour de 19 m².<br />Type de bail : Etudiant de septembre à fin mai.';
  const mentions =
    options.mentions ??
    "Honoraires de 398 € TTC à la charge du locataire comprenant 92 € TTC pour l'état des lieux. Loyer de base 780 €/mois. 100 €/mois de charges forfaitaires. Dépôt de garantie 1 560 €. Classe énergie C, Classe climat A";
  return `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body>
    <div data-author="Netty.fr"><h2 class="_gc0idj textblock">Descriptif<span> du bien</span></h2></div>
    <div data-author="Netty.fr"><p class="_pvkhi3 textblock">${descriptif}</p></div>
    <div data-author="Netty.fr"><h2 class="_ntqxz7 textblock">Caractéristiques techniques</h2></div>
    <div data-author="Netty.fr"><ul class="_1j2fg6o">
      <li class="_s2u4i5"><div><div>
        <span class="_1o6jcyu _j9mn9r  textblock ">Étage</span><div class="_9qq8ya"></div>
        <span class="_w60sek _alu17h  textblock ">3</span></div></div></li>
      <li class="_s2u4i5"><div><div>
        <span class="_1o6jcyu _j9mn9r  textblock ">Ameublement</span><div class="_9qq8ya"></div>
        <span class="_w60sek _alu17h  textblock ">Entièrement meublé</span></div></div></li>
      <li class="_s2u4i5"><div><div>
        <span class="_1o6jcyu _j9mn9r  textblock ">Type de bien :</span>
        <span class="_w60sek _alu17h  textblock ">Appartement</span></div></div></li>
      ${
        options.extraCriterion !== undefined
          ? `<li><div><span class="textblock">${options.extraCriterion[0]}</span><span class="textblock">${options.extraCriterion[1]}</span></div></li>`
          : ''
      }
    </ul></div>
    <div data-author="Netty.fr"><h2 class="textblock">Informations juridiques &amp; financières</h2></div>
    <div data-author="Netty.fr"><span class="_kf37h1 textblock">${mentions}</span></div>
    <a href="tel:+33600000001">Appeler</a>
    </body></html>`;
}

describe('parseListingUrl', () => {
  it('lit transaction, code postal et référence', () => {
    const parsed = parseListingUrl(URL);
    expect(parsed).toMatchObject({
      transaction: 'location',
      slug: 'appartement-t2-2-pieces-nice',
      typeSlug: 'appartement',
      postalCode: '06200',
      reference: 'LA1920',
    });
  });

  it('accepte une URL sans code postal (relevée sur ferrero-immobilier.fr)', () => {
    const parsed = parseListingUrl(
      'https://www.ferrero-immobilier.fr/location/location-appartement-nice,LA1968',
    );
    expect(parsed).toMatchObject({
      slug: 'appartement-nice',
      typeSlug: 'appartement',
      postalCode: null,
      reference: 'LA1968',
    });
  });

  it('n’est pas trompée par une page de liste', () => {
    expect(parseListingUrl('https://www.exemple.fr/location/appartement')).toBeNull();
    expect(parseListingUrl('https://www.exemple.fr/location/appartement/nice/06100')).toBeNull();
  });
});

describe('matchesCity', () => {
  /**
   * Le nom de commune termine le slug, collé au reste : le découper au tiret
   * donnerait « var » pour Saint-Laurent-du-Var. On compare donc par la fin.
   */
  it('reconnaît une commune en plusieurs mots', () => {
    const url = parseListingUrl(
      'https://www.exemple.fr/location/maison-4-pieces-saint-laurent-du-var-06700,LA12',
    );
    expect(url).not.toBeNull();
    expect(matchesCity(url!, ['nice', 'saint-laurent-du-var'])).toBe(true);
    expect(matchesCity(url!, ['nice'])).toBe(false);
  });

  it('ne prend pas « nice » pour une autre commune finissant pareil', () => {
    const url = parseListingUrl(
      'https://www.exemple.fr/location/appartement-2-pieces-venice-06000,LA13',
    );
    expect(matchesCity(url!, ['nice'])).toBe(false);
  });
});

describe('parseSitemap', () => {
  it('ne garde que les locations, sans lastmod à attendre', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.exemple.fr/location/appartement-t2-2-pieces-nice-06200,LA1920</loc></url>
      <url><loc>https://www.exemple.fr/vente/appartement-t3-3-pieces-nice-06000,VA77</loc></url>
      <url><loc>https://www.exemple.fr/location/appartement</loc></url>
    </urlset>`;
    const entries = parseSitemap(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url.reference).toBe('LA1920');
  });
});

describe('parseDetailPage', () => {
  it('lit le bien sous offers.itemOffered, et non à la racine', () => {
    const { listing } = parseDetailPage(nettyHtml(), URL, AGENCY);
    expect(listing?.priceText).toContain('880');
    expect(listing?.areaText).toContain('30');
    expect(listing?.roomsText).toContain('2');
    expect(listing?.cityText).toBe('Nice');
    expect(listing?.postalCodeText).toBe('06200');
    expect(listing?.imageUrls).toEqual([
      'https://img.netty.immo/product/c/LA1920/photo_1.jpg',
      'https://img.netty.immo/product/c/LA1920/photo_2.jpg',
    ]);
  });

  /**
   * Le `name` du JSON-LD n'est pas toujours remis à jour : sur la fiche relevée
   * le 2026-09-05, il annonçait « SEPTEMBRE A JUIN 2025 » là où la page disait
   * 2027. Le titre visible fait foi quand il existe.
   */
  it('préfère le titre affiché au nom du JSON-LD', () => {
    const { listing } = parseDetailPage(nettyHtml(), URL, AGENCY);
    expect(listing?.title).toBe('Charmant et lumineux T2 sur Nice Ouest');
  });

  it('retombe sur le nom du JSON-LD quand la page n’affiche pas de titre', () => {
    const html = nettyHtml({
      descriptif: 'Studio calme avec jardin, cuisine américaine, proche tramway et commerces.',
    });
    const { listing } = parseDetailPage(html, URL, AGENCY);
    expect(listing?.title).toBe('Location étudiante - SEPTEMBRE A JUIN 2025');
  });

  it('garde la structure du descriptif, seul porteur du type de bail', () => {
    const { listing } = parseDetailPage(nettyHtml(), URL, AGENCY);
    expect(listing?.description).toContain('Type de bail');
    expect(listing?.description).toContain('\n');
  });

  /**
   * Les classes CSS de Netty sont hachées et changent à chaque reconstruction
   * du thème : un parser qui s'y accrocherait casserait sans prévenir.
   */
  it('survit à un changement complet des classes CSS', () => {
    const html = nettyHtml().replace(/_[a-z0-9]{5,7}/g, '_zzzzzz');
    const { listing } = parseDetailPage(html, URL, AGENCY);
    expect(listing?.priceText).toContain('880');
    expect(listing?.description).toContain('Entièrement meublé');
  });

  it('verse critères et mentions légales dans les features fouillées ensuite', () => {
    const { listing } = parseDetailPage(nettyHtml(), URL, AGENCY);
    const features = listing?.extra?.['features'] ?? '';
    expect(features).toContain('Étage : 3');
    expect(features).toContain('Ameublement : Entièrement meublé');
    // Le DPE et le dépôt de garantie ne vivent QUE dans les mentions légales.
    expect(features).toContain('Classe énergie C');
    expect(features).toContain('Dépôt de garantie');
  });

  it('lit le téléphone du lien tel:, jamais deviné (§17)', () => {
    const { listing } = parseDetailPage(nettyHtml(), URL, AGENCY);
    expect(listing?.phoneText).toBe('+33600000001');
    const withoutPhone = nettyHtml().replace(/<a href="tel:[^"]*">[^<]*<\/a>/, '');
    expect(parseDetailPage(withoutPhone, URL, AGENCY).listing?.phoneText).toBeUndefined();
  });

  it('écarte un bien non résidentiel', () => {
    const commerce = 'https://www.exemple.fr/location/local-commercial-nice-06000,LA99';
    const { listing, warnings } = parseDetailPage(nettyHtml(), commerce, AGENCY);
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/commercial/i);
  });

  it('ne fabrique pas de fiche fantôme quand la page ne porte plus de bien (§17)', () => {
    const { listing, warnings } = parseDetailPage(
      '<html><body>Introuvable</body></html>',
      URL,
      AGENCY,
    );
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/exploitable/i);
  });

  /**
   * LOYER NON PUBLIÉ : LA FICHE RESTE.
   *
   * Elle était écartée — « 0 € », ou pas de prix du tout dans le JSON-LD. Mais
   * le bien est décrit, situé, photographié, et le scoring a sa voie pour ce
   * cas : « Loyer non publié », qui ne retire pas l'annonce des critères. Les
   * jeter ici rendait cette voie morte pour Netty et faisait disparaître des
   * annonces réelles, sans que rien ne le dise.
   */
  it.each([[0], ['0'], ['0.00']])('garde une fiche à « %s € », sans loyer', (price) => {
    const { listing, warnings } = parseDetailPage(nettyHtml({ price }), URL, AGENCY);
    expect(listing).not.toBeNull();
    // UN CHAMP ABSENT RESTE ABSENT : surtout pas « 0 € » affiché comme un loyer.
    expect(listing?.priceText).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/sans loyer publié/i);
  });

  it('garde une fiche dont le JSON-LD ne porte aucun prix', () => {
    const sansPrix = nettyHtml().replace(/"price": ?"?[\d.]+"?,/, '');
    const { listing } = parseDetailPage(sansPrix, URL, AGENCY);
    expect(listing).not.toBeNull();
    expect(listing?.priceText).toBeUndefined();
    // Le reste du bien est bien là : ce n'est pas une fiche fantôme.
    expect(listing?.title).toBeDefined();
  });

  it('écarte encore une page sans aucun JSON-LD : il n’y a rien à montrer', () => {
    const { listing, warnings } = parseDetailPage('<html><body>rien</body></html>', URL, AGENCY);
    expect(listing).toBeNull();
    expect(warnings.join(' ')).toMatch(/exploitable/i);
  });

  describe('location saisonnière', () => {
    const LONG_TERM_TEXT =
      '<h1>T2 lumineux à Nice</h1>Appartement vide au calme, proche des commerces, idéal après les vacances. Bail de 3 ans.';
    const longTerm = { name: 'Appartement T2 Nice', descriptif: LONG_TERM_TEXT };

    function rejected(html: string): string | null {
      const { listing, warnings } = parseDetailPage(html, URL, AGENCY);
      return listing === null ? warnings.join(' ') : null;
    }

    it('écarte un prix par nuit ou par semaine du JSON-LD', () => {
      expect(rejected(nettyHtml({ ...longTerm, priceSpecification: { unitCode: 'DAY' } }))).toMatch(
        /saisonnière/,
      );
      expect(
        rejected(nettyHtml({ ...longTerm, priceSpecification: { unitText: 'semaine' } })),
      ).toMatch(/saisonnière/);
    });

    it('écarte un type de location saisonnier dans les critères', () => {
      const html = nettyHtml({ ...longTerm, extraCriterion: ['Type de location', 'Saisonnière'] });
      expect(rejected(html)).toMatch(/Saisonnière/);
    });

    it('écarte un titre « Location saisonnière » ou « location de vacances »', () => {
      expect(
        rejected(nettyHtml({ ...longTerm, name: 'Location saisonnière - T2 vue mer' })),
      ).toMatch(/saisonnière/);
      const h1 = LONG_TERM_TEXT.replace('T2 lumineux à Nice', 'Location de vacances T2 Nice');
      expect(rejected(nettyHtml({ ...longTerm, descriptif: h1 }))).toMatch(/saisonnière/);
    });

    it('écarte un tarif à la nuit ou à la semaine', () => {
      const perNight = `${LONG_TERM_TEXT}<br />Tarif : 95 €/nuit, ménage inclus.`;
      expect(rejected(nettyHtml({ ...longTerm, descriptif: perNight }))).toMatch(/nuit/);
      const mentions = 'Loyer de base 650 € la semaine. Classe énergie C, Classe climat A';
      expect(rejected(nettyHtml({ ...longTerm, mentions }))).toMatch(/saisonnière/);
    });

    it('garde une location à l’année qui parle de vacances en passant', () => {
      const text = `${LONG_TERM_TEXT}<br />Location saisonnière interdite par le règlement de copropriété.`;
      const { listing } = parseDetailPage(
        nettyHtml({ ...longTerm, descriptif: text }),
        URL,
        AGENCY,
      );
      expect(listing?.priceText).toContain('880');
    });

    it('laisse passer le bail étudiant de neuf mois, signalé plus loin', () => {
      const text = `${LONG_TERM_TEXT}<br />Location étudiante de septembre à juin, puis saisonnier en juillet : 700 €/semaine.`;
      expect(rejected(nettyHtml({ ...longTerm, descriptif: text }))).toBeNull();
    });
  });
});

describe('chargesFromMentions', () => {
  /**
   * Les charges n'apparaissent NULLE PART ailleurs sur une fiche Netty : ni
   * dans les caractéristiques, ni dans le JSON-LD. La phrase légale est la
   * seule source, et sa formulation varie d'une agence à l'autre.
   */
  it('lit les deux formulations rencontrées', () => {
    expect(
      chargesFromMentions('Loyer de base 780 €/mois. 100 €/mois de charges forfaitaires.'),
    ).toBe('100 €/mois de charges forfaitaires');
    expect(
      chargesFromMentions(
        'Loyer de base 558.00 €/mois. Provision sur charges 112 €/mois, régularisation annuelle.',
      ),
    ).toBe('Provision sur charges 112 €/mois');
  });

  it('ne rend rien plutôt qu’un montant pris au hasard', () => {
    expect(chargesFromMentions(undefined)).toBeUndefined();
    expect(
      chargesFromMentions('Honoraires de 398 € TTC à la charge du locataire.'),
    ).toBeUndefined();
  });
});
