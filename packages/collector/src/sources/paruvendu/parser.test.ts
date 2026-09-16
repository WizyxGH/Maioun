/**
 * ParuVendu, sur des pages PRÉLEVÉES et recopiées telles quelles, puis
 * anonymisées : pseudonymes inventés, aucune adresse électronique, aucun
 * numéro de téléphone — le portail n'en publie d'ailleurs aucun. Aucun accès
 * réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ScrapeContext } from '@maioun/shared';
import { MVP_CRITERIA } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { paruvenduScraper } from './index.js';
import { parseDetail, parseSearchPage, PRICE_BANDS, SEARCHES, searchUrl } from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/paruvendu/${name}`, import.meta.url)),
    'utf8',
  );
const PAGE = fixture('nice.html');
const REFERENCE = SEARCHES[0]!;
const URL_PAGE = searchUrl(REFERENCE, 1);

describe('parseSearchPage', () => {
  const { listings, hasNextPage } = parseSearchPage(PAGE, URL_PAGE);
  const particulier = listings.find((l) => l.sourceRef === '1295002360');

  it('suit la page suivante d’une bande de loyer', () => {
    const bande = SEARCHES.find((search) => search.maxPrice === 700)!;
    const page = PAGE.replace('?p=2', '?px0=501&amp;px1=700&amp;p=2');
    expect(searchUrl(bande, 2)).toContain('px0=501&px1=700&p=2');
    expect(parseSearchPage(page, searchUrl(bande, 1)).hasNextPage).toBe(true);
  });

  it('lit le nombre d’annonces que la recherche annonce, espaces compris', () => {
    const avecCompte = PAGE.replace(
      '</body>',
      '<span class="aff_nbann">1 165 annonces</span></body>',
    );
    expect(parseSearchPage(avecCompte, URL_PAGE).totalCount).toBe(1165);
    expect(parseSearchPage(PAGE, URL_PAGE).totalCount).toBeNull();
  });

  it('rend le titre de la page, seul garde-fou du repli départemental', () => {
    expect(parseSearchPage(PAGE, URL_PAGE).heading).toContain('Nice');
  });

  it('lit les trois cartes, et voit qu’il y a une page suivante', () => {
    expect(listings).toHaveLength(3);
    expect(hasNextPage).toBe(true);
  });

  it('reconnaît le PARTICULIER, la denrée rare de l’inventaire, et le nomme', () => {
    expect(particulier?.extra?.['landlord']).toBe('private');
    expect(particulier?.agencyName).toBeUndefined();
    // L'avatar porte le pseudonyme du déposant : de quoi le reconnaître d'une
    // annonce à l'autre, là où la carte ne disait que « Particulier ».
    expect(particulier?.contactName).toBe('Ravel T');
  });

  it('nomme l’agence d’une annonce professionnelle, par le logo', () => {
    const relayee = listings.find((l) => l.sourceRef === '1295223805');
    expect(relayee?.agencyName).toBe('LOCService');
    expect(relayee?.extra?.['landlord']).toBe('agency');
  });

  it('lit les CHAMBRES sur la bande d’étiquettes, que le titre ne donne pas', () => {
    const deuxPieces = listings.find((l) => l.sourceRef === '1295223805');
    expect(deuxPieces?.title).not.toContain('chambre');
    expect(deuxPieces?.extra?.['features']).toContain('1 chambre');
    const annonce = normalizeListing(deuxPieces!, {
      sourceId: 'paruvendu',
      nowMs: Date.parse('2026-09-16T10:00:00Z'),
    });
    expect(annonce?.bedrooms).toBe(1);
    expect(
      normalizeListing(
        listings.find((l) => l.sourceRef === '1295211797')!,
        {
          sourceId: 'paruvendu',
          nowMs: Date.parse('2026-09-16T10:00:00Z'),
        },
      )?.bedrooms,
    ).toBe(2);
  });

  it('ne colle pas le type de bien à la commune quand la surface manque', () => {
    // « Appartement Nice (06) » : sans surface, l'intitulé faisait une commune
    // de « Appartement Nice », qu'aucun filtre ne reconnaît.
    const sansSurface = PAGE.replace(
      'Appartement\n20 m<sup>2</sup>\nNice (06)',
      'Appartement Nice (06)',
    );
    expect(sansSurface).not.toBe(PAGE);
    const carte = parseSearchPage(sansSurface, URL_PAGE).listings.find(
      (l) => l.sourceRef === '1295002360',
    );
    expect(carte?.cityText).toBe('Nice');
  });

  it('prend TOUTES les photos, la première comprise, jamais le logo', () => {
    // La première est posée par un script, l'`<img>` ne portant qu'un pixel
    // transparent en attendant.
    expect(particulier?.imageUrls?.length).toBeGreaterThan(1);
    for (const photo of particulier?.imageUrls ?? []) {
      expect(photo).toMatch(/^https:\/\/img\.paruvendu\.fr\/media_ext\//);
      expect(photo).not.toContain('media-logo');
    }
  });

  it('se normalise en une annonce complète', () => {
    if (particulier === undefined) throw new Error('carte du particulier introuvable');
    const annonce = normalizeListing(particulier, {
      sourceId: 'paruvendu',
      nowMs: Date.parse('2026-09-11T10:00:00Z'),
    });
    expect(annonce?.price).toBe(420);
    expect(annonce?.chargesIncluded).toBe(true);
    expect(annonce?.area).toBe(20);
    expect(annonce?.rooms).toBe(1);
    expect(annonce?.dpe).toBe('B');
    expect(annonce?.furnished).toBe(true);
    expect(annonce?.contact.kind).toBe('private');
    // La date affichée est celle de la dernière MISE À JOUR : elle ne passe
    // pas pour une date de parution.
    expect(annonce?.publishedAt).toBeNull();
  });
});

/**
 * Fiches prélevées le 2026-09-14 et le 2026-09-16 : BEP (charges dans le bloc),
 * Century 21 (charges dans le texte seulement), un particulier (aucune), puis
 * deux fiches ENTIÈRES — une d'agence, une de particulier — qui portent la
 * localisation, les caractéristiques, le DPE et l'annonceur.
 */
describe('parseDetail', () => {
  const normaliser = (fiche: string, priceText: string) => {
    const draft = parseDetail(fixture(fiche), priceText);
    return normalizeListing(
      {
        sourceRef: '1',
        sourceUrl: 'https://www.paruvendu.fr/immobilier/location/appartement/1',
        title: 'Appartement - 1 pièce(s) - 18 m²',
        priceText,
        ...Object.fromEntries(Object.entries(draft ?? {}).filter(([, v]) => v !== undefined)),
      },
      { sourceId: 'paruvendu', nowMs: Date.parse('2026-09-14T10:00:00Z') },
    );
  };

  it('lit « Dont charges/mois » : la part des charges dans le loyer CC', () => {
    expect(parseDetail(fixture('fiche-1295274200.html'))?.chargesText).toBe('30 €');
    const annonce = normaliser('fiche-1295274200.html', '690 € CC*');
    expect(annonce?.price).toBe(690);
    expect(annonce?.chargesIncluded).toBe(true);
    expect(annonce?.charges).toBe(30);
  });

  it('sans ligne de charges, les lit dans le texte, point décimal compris', () => {
    const draft = parseDetail(fixture('fiche-1295275678.html'), '890 € CC*');
    // « 50.0 euros » : 50, pas 500.
    expect(draft?.chargesText).toBe('50 €');
    expect(draft?.description).toContain('dont charges mensuelles : 50.0 euros');
    // Le bloc caché de localisation n'est pas du texte d'annonce.
    expect(draft?.description).not.toContain('Lieu : Alpes-Maritimes');
    expect(normaliser('fiche-1295275678.html', '890 € CC*')?.charges).toBe(50);
  });

  it('n’invente pas de charges quand la fiche n’en donne pas', () => {
    const draft = parseDetail(fixture('fiche-1295199212.html'));
    expect(draft?.chargesText).toBeUndefined();
    expect(draft?.description).toBeDefined();
    expect(normaliser('fiche-1295199212.html', '1 550 € CC*')?.charges).toBeNull();
  });

  it('lit dépôt de garantie et honoraires dans le bloc prix', () => {
    const draft = parseDetail(fixture('fiche-1295274200.html'), '690 € CC*');
    expect(draft).toMatchObject({ depositText: '660 €', feesText: '220 €' });
    expect(normaliser('fiche-1295274200.html', '690 € CC*')).toMatchObject({
      deposit: 660,
      tenantFees: 220,
    });
    expect(normaliser('fiche-1295275678.html', '890 € CC*')).toMatchObject({
      deposit: 1680,
      tenantFees: 261,
    });
  });

  it('« NC » ou une fiche muette ne donnent ni dépôt ni honoraires', () => {
    const nc =
      '<div id="autoprix"><div class="opt19_hd_det"><span>Dépôt garantie :</span><strong>NC</strong></div>' +
      '<div class="opt19_hd_det"><span>Honoraires :</span><strong>NC</strong></div></div>' +
      '<div id="txtAnnonceTrunc">Studio lumineux.</div>';
    expect(parseDetail(nc)).toMatchObject({ depositText: undefined, feesText: undefined });
    expect(normaliser('fiche-1295199212.html', '1 550 € CC*')).toMatchObject({
      deposit: null,
      tenantFees: null,
    });
  });

  it('ne reprend pas le loyer : la mémoire des fiches le figerait', () => {
    expect(parseDetail(fixture('fiche-1295274200.html'))?.priceText).toBeUndefined();
  });

  it('rend null sur une page sans bloc prix ni texte', () => {
    expect(parseDetail('<html><body></body></html>')).toBeNull();
  });

  describe('la fiche entière', () => {
    const agence = parseDetail(fixture('fiche-agence-complete.html'), '959 € CC*');
    const part = parseDetail(fixture('fiche-particulier-complete.html'), '420 € CC*');

    it('donne le CODE POSTAL, que la carte ne porte nulle part', () => {
      expect(agence).toMatchObject({ cityText: 'Nice', postalCodeText: '06300' });
      expect(part).toMatchObject({ cityText: 'Nice', postalCodeText: '06000' });
      expect(normaliser('fiche-agence-complete.html', '959 € CC*')?.postalCode).toBe('06300');
    });

    it('lit l’étage, l’ascenseur et les chambres du bloc de caractéristiques', () => {
      expect(agence?.extra?.['etage']).toBe('5');
      expect(agence?.extra?.['ascenseur']).toBe('1');
      expect(agence?.extra?.['features']).toContain('1 chambre');
      const annonce = normaliser('fiche-agence-complete.html', '959 € CC*');
      expect(annonce?.bedrooms).toBe(1);
      expect(annonce?.features).toEqual(
        expect.arrayContaining(['5e étage', 'Ascenseur', 'Balcon']),
      );
    });

    it('n’invente rien des étiquettes à double sens (« Balcon / Terrasse »)', () => {
      // Le premier bloc nomme des FAMILLES : il ne dit pas lequel des deux le
      // bien possède. Seul le second, quand il existe, tranche.
      expect(part?.extra?.['features']).not.toContain('Parking');
      expect(part?.extra?.['features']).toContain('Meublé');
      expect(normaliser('fiche-particulier-complete.html', '420 € CC*')?.furnished).toBe(true);
    });

    it('garde la RÉFÉRENCE DE L’ANNONCEUR, pas le numéro de dépôt du portail', () => {
      expect(agence?.extra?.['reference']).toBe('EXM-42-0908');
      // « WI177894963 » est l'identifiant que ParuVendu donne à un dépôt de
      // particulier : il n'apprend rien de plus que `sourceRef`.
      expect(part?.extra?.['reference']).toBeUndefined();
    });

    it('nomme l’annonceur, et dit s’il est particulier ou professionnel', () => {
      expect(agence?.agencyName).toBe('Agence Exemple Baie - Exemple Helios');
      expect(agence?.extra?.['landlord']).toBe('agency');
      expect(part?.contactName).toBe('Ravel T.');
      expect(part?.extra?.['landlord']).toBe('private');
      expect(normaliser('fiche-particulier-complete.html', '420 € CC*')?.contact.kind).toBe(
        'private',
      );
    });

    it('reprend les photos en GRAND, jamais le logo de l’agence', () => {
      // La carte les sert en 320 pixels de large, la fiche en 480 ou 1 000.
      expect(agence?.imageUrls).toHaveLength(2);
      for (const photo of agence?.imageUrls ?? []) expect(photo).toContain('w=480');
      for (const photo of part?.imageUrls ?? []) expect(photo).toContain('w=1000');
      expect(agence?.imageUrls?.some((url) => url.includes('bG9nb'))).toBe(false);
    });

    it('lit le DPE de la fiche', () => {
      expect(agence?.extra?.['dpe']).toBe('D');
      expect(normaliser('fiche-agence-complete.html', '959 € CC*')?.dpe).toBe('D');
    });
  });
});

describe('le passage', () => {
  /** Les communes que le portail sert par un repli départemental. */
  const REPLI_DEPARTEMENTAL = '387 appartements à louer dans les Alpes-maritimes | Paruvendu';

  const titrer = (body: string, titre: string): string =>
    body.replace(/<title>[^<]*<\/title>/, `<title>${titre}</title>`);
  const compter = (body: string, total: number): string =>
    body.replace('</body>', `<span class="aff_nbann">${String(total)} annonces</span></body>`);
  /** Une seule page par recherche : les liens « page suivante » sont neutralisés. */
  const unePage = (body: string): string => body.replace(/\?p=\d/g, '?p=0');

  /** La recherche départementale que le portail sert pour une commune vide. */
  const DEPARTEMENT = PAGE.replace(/data-id="1295002360"/, 'data-id="8000000001"')
    .replace(/data-id="1295223805"/, 'data-id="8000000002"')
    .replace(/data-id="1295211797"/, 'data-id="8000000003"')
    .replace(/Nice \(06\)/g, 'Grasse (06)');

  /** Annonces de MAISON, hors périmètre pour la dernière (Cannes). */
  const MAISONS = ((): string => {
    let body = PAGE.replace(/data-id="1295002360"/, 'data-id="9000000001"')
      .replace(/data-id="1295223805"/, 'data-id="9000000002"')
      .replace(/data-id="1295211797"/, 'data-id="9000000003"');
    const dernier = body.lastIndexOf('Nice (06)');
    body = `${body.slice(0, dernier)}Cannes (06)${body.slice(dernier + 'Nice (06)'.length)}`;
    return body;
  })();

  const contexte = (options: {
    connues?: boolean;
    reference?: number;
    bande?: number;
    communesVides?: number;
  }) => {
    const { connues = true, reference = 15, bande = 3, communesVides = 4 } = options;
    const vues: string[] = [];
    let vides = 0;

    const corps = (url: string): string => {
      const adresse = new URL(url);
      if (!adresse.pathname.includes('/recherche/')) {
        return fixture('fiche-agence-complete.html');
      }
      if (adresse.pathname.includes('/maison/')) {
        return compter(titrer(unePage(MAISONS), '3 maisons à louer dans les Alpes-maritimes'), 3);
      }
      const commune = /\/appartement\/([^/]+)\//.exec(adresse.pathname)?.[1] ?? '';
      if (commune !== 'nice') {
        vides += 1;
        if (vides <= communesVides) {
          return compter(titrer(unePage(DEPARTEMENT), REPLI_DEPARTEMENTAL), 387);
        }
        const nom = commune.replace(/-\d{5}$/, '').replace(/-/g, ' ');
        return compter(titrer(unePage(PAGE), `3 appartements à louer à ${nom}`), 3);
      }
      const total =
        adresse.searchParams.has('px0') || adresse.searchParams.has('px1') ? bande : reference;
      return compter(titrer(unePage(PAGE), `${String(total)} appartements à louer à Nice`), total);
    };

    const ctx: ScrapeContext = {
      criteria: MVP_CRITERIA,
      mode: 'live',
      memo: null,
      fetch: (url) => {
        vues.push(url);
        return Promise.resolve({ status: 200, body: corps(url), headers: {}, notModified: false });
      },
      isKnown: () => connues,
      knownRefs: new Set(),
      lastFullPassAt: null,
      // Connues : fiches déjà lues, et récemment.
      detailMemory: {
        get: () => (connues ? { draft: {}, fetchedAt: new Date().toISOString() } : null),
        save: () => Promise.resolve(),
      },
      pageRefs: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
      log: () => undefined,
      credentials: null,
      shouldStop: () => false,
    };
    return { ctx, vues };
  };

  const listes = (vues: readonly string[]): string[] =>
    vues.filter((url) => url.includes('/recherche/'));

  it('interroge les treize communes, les deux types de bien et les cinq bandes', async () => {
    const { ctx, vues } = contexte({});
    const resultat = await paruvenduScraper.run(ctx);
    // TOUT EST CONNU, et on continue quand même : pas d'arrêt anticipé.
    expect(listes(vues)).toHaveLength(1 + PRICE_BANDS.length + 12 + 1);
    expect(listes(vues).filter((url) => url.includes('px0=') || url.includes('px1='))).toHaveLength(
      PRICE_BANDS.length,
    );
    expect(listes(vues).filter((url) => url.includes('/maison/'))).toHaveLength(1);
    expect(resultat.stopReason).toBe('completed');
  });

  it('la page de référence est TRONQUÉE : son total ne rend plus l’inventaire incomplet', async () => {
    // Trois annonces lues pour quinze annoncées — c'est le portail qui ne sert
    // que cinq pages. Ce sont les bandes, dont la somme retrouve le total, qui
    // font foi.
    const { ctx } = contexte({ reference: 15, bande: 3 });
    expect((await paruvenduScraper.run(ctx)).stopReason).toBe('completed');
  });

  it('une annonce hors de toute bande laisse la somme à côté : rien n’est retiré', async () => {
    const { ctx } = contexte({ reference: 16, bande: 3 });
    expect((await paruvenduScraper.run(ctx)).stopReason).toBe('incomplete');
  });

  it('une bande qui rend moins qu’elle n’annonce rend l’inventaire incomplet', async () => {
    const { ctx } = contexte({ reference: 20, bande: 4 });
    expect((await paruvenduScraper.run(ctx)).stopReason).toBe('incomplete');
  });

  it('une commune sans annonce : le portail sert le département, rien n’entre', async () => {
    const { ctx } = contexte({ connues: false });
    const resultat = await paruvenduScraper.run(ctx);
    const refs = new Set(resultat.listings.map((l) => l.sourceRef));
    // Trente annonces de Grasse ou de Cannes seraient entrées comme niçoises.
    for (const ref of ['8000000001', '8000000002', '8000000003']) {
      expect(refs.has(ref)).toBe(false);
    }
    // Une commune vide reste une réponse ordinaire : le passage conclut.
    expect(resultat.stopReason).toBe('completed');
  });

  it('le budget qui coupe au milieu ne laisse pas l’inventaire faire foi', async () => {
    const { ctx } = contexte({});
    let restant = 4;
    const court = { ...ctx, shouldStop: () => restant-- <= 0 };
    expect((await paruvenduScraper.run(court)).stopReason).toBe('incomplete');
  });

  it('un repli sur PLUS DE LA MOITIÉ des communes sent le gabarit changé', async () => {
    const { ctx } = contexte({ communesVides: 12 });
    expect((await paruvenduScraper.run(ctx)).stopReason).toBe('incomplete');
  });

  it('les maisons hors périmètre ne sont pas collectées', async () => {
    const { ctx } = contexte({ connues: false });
    const refs = new Set((await paruvenduScraper.run(ctx)).listings.map((l) => l.sourceRef));
    expect(refs.has('9000000001')).toBe(true);
    expect(refs.has('9000000002')).toBe(true);
    // La troisième maison est à Cannes.
    expect(refs.has('9000000003')).toBe(false);
  });

  /**
   * Une DEMANDE déposée parmi les offres, telle qu'on en a laissé entrer cinq :
   * la carte est celle d'une location, le texte dit le contraire.
   */
  it('n’entre pas la demande de logement, et ne lit pas sa fiche', async () => {
    const { ctx, vues } = contexte({ connues: false });
    const avecDemande = {
      ...ctx,
      fetch: (url: string) =>
        ctx.fetch(url).then((reponse) => ({
          ...reponse,
          body: reponse.body.replace(
            /line-clamp-5 min-h-19">\s*\n[^<]+/,
            'line-clamp-5 min-h-19">\nRetraitée cherche studio T1. ' +
              'Urgent, dame seule, revenus de retraite fiables, téléphone 06 00 00 00 03.',
          ),
        })),
    };
    const resultat = await paruvenduScraper.run(avecDemande);
    const refs = new Set(resultat.listings.map((listing) => listing.sourceRef));
    expect(refs.has('1295002360')).toBe(false);
    // Sa fiche n'est pas lue non plus : la carte suffisait à la reconnaître.
    expect(vues.filter((url) => url.includes('/appartement/1295002360'))).toHaveLength(0);
  });

  it('lit la fiche des annonces nouvelles, et en garde les charges', async () => {
    const { ctx, vues } = contexte({ connues: false });
    const resultat = await paruvenduScraper.run(ctx);
    expect(vues.filter((url) => !url.includes('/recherche/')).length).toBeGreaterThan(0);
    expect(resultat.listings.every((l) => l.chargesText === '29 €')).toBe(true);
  });
});
