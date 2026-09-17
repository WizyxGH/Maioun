import { describe, expect, it } from 'vitest';
import { rentExcludingCharges } from '@maioun/shared';
import { normalizeListing } from '../../normalization/normalize.js';
import { isEmptyList, parseDetail, parseListPage } from './parser.js';

const PAGE = 'https://www.morningcroissant.fr/location/nice';

/**
 * Gabarit réel d'une page de résultats, réduit à trois cartes et ANONYMISÉ :
 * un logement entier de particulier, un logement entier de loueur
 * professionnel, une chambre privée.
 */
const LIST = `
<ul class="flats-list">
  <li id="list-flat-10001" data-flat-id="10001" class="flats-list-item">
    <div class="img-container">
      <img data-index="1" src="/medialibrary/flats/1/a.jpg" alt="Deux pièces" />
      <div class="flat-carousel-list" style="display: none;">
        <span data-index="1" data-url="/medialibrary/flats/1/a.jpg"></span>
        <span data-index="2" data-url="/medialibrary/flats/1/b.jpg"></span>
      </div>
    </div>
    <div class="infos-container">
      <a class="flat-link" href="/appartement/deux-pieces-quartier-nord-10001">Deux pièces quartier nord</a>
      <div class="infos">
        <div class="flat-price"><span class="amount">680€</span><span class="label-period">/mois</span></div>
        <div class="flat-details">
          <span class="hometiptip furnished-tag">Meublé</span>
          <span class="hometiptip rooms" data-content="Type">2 pièces</span>
          <div>
            <span class="hometiptip">42 m²</span>
            <span class="hometiptip" data-content="Lit(s)">2</span>
            <span class="hometiptip" data-content="Capacité">2</span>
          </div>
        </div>
      </div>
      <div class="flat-location"><span>Logement entier</span><i>-</i><span>Nice, 06300</span></div>
      <div class="owner-data-wrapper"><div class="owner-data"><div class="owner-name">Par Camille D.</div></div></div>
    </div>
  </li>
  <li id="list-flat-10002" data-flat-id="10002" class="flats-list-item">
    <div class="infos-container">
      <a class="flat-link" href="/appartement/studio-bord-de-mer-10002">Studio bord de mer</a>
      <div class="infos">
        <div class="flat-price"><span class="amount">1519€</span><span class="label-period">/mois</span></div>
        <div class="flat-details">
          <span class="hometiptip furnished-tag">Meublé</span>
          <span class="hometiptip rooms" data-content="Type">1 pièce</span>
          <div><span class="hometiptip">27 m²</span></div>
        </div>
      </div>
      <div class="flat-location"><span>Logement entier</span><i>-</i><span>Villefranche-sur-Mer, 06230</span></div>
      <div class="owner-data-wrapper"><div class="owner-data"><div class="pro-tag">Loueur professionnel</div></div></div>
    </div>
  </li>
  <li id="list-flat-10003" data-flat-id="10003" class="flats-list-item">
    <div class="infos-container">
      <a class="flat-link" href="/appartement/chambre-secteur-ouest-10003">Chambre secteur ouest</a>
      <div class="infos">
        <div class="flat-price"><span class="amount">640€</span><span class="label-period">/mois</span></div>
        <div class="flat-details">
          <span class="hometiptip furnished-tag">Meublé</span>
          <div><span class="hometiptip">12 m²</span></div>
        </div>
      </div>
      <div class="flat-location"><span>Chambre privée</span><i>-</i><span>Nice, 06200</span></div>
      <div class="owner-data-wrapper"><div class="owner-data"><div class="owner-name">Par Léa M.</div></div></div>
    </div>
  </li>
</ul>`;

/** Fiche anonymisée d'un logement entier loué par un particulier. */
const FICHE_PARTICULIER = `
<section id="product_description" class="product-section">
  <h3>Description</h3>
  <div class="txt"><p>Bel appartement refait à neuf, cuisine ouverte équipée.</p></div>
</section>
<section id="product_details" class="product-section"><div class="container">
  <ul>
    <li><div class="left">Catégorie</div><div class="right">Appartement</div></li>
    <li><div class="left">Type de location</div><div class="right">Logement entier</div></li>
    <li><div class="left">Meublé / non meublé</div><div class="right">Meublé</div></li>
    <li><div class="left">Superficie</div><div class="right">42 m²</div></li>
    <li><div class="left">Chambres</div><div class="right">1</div></li>
  </ul>
</div></section>
<section id="product_pricing" class="product-section"><div class="container"><ul>
  <li><div class="left">Loyer mensuel hors charges</div>
      <div class="right"><span class="price"><span class="amount">650</span><span class="currency">€</span></span></div></li>
  <li><div class="left">Charges mensuelles <span class="hometiptip bubble" data-content="forfait">?</span></div>
      <div class="right"><span class="price"><span class="amount">30</span><span class="currency">€</span></span></div></li>
  <li><div class="left"><b>Loyer mensuel charges comprises</b></div>
      <div class="right"><span class="price"><span class="amount">680</span><span class="currency">€</span></span></div></li>
  <li><div class="left">Dépôt de garantie</div><div class="right">N/A</div></li>
</ul></div></section>
<section id="product_modalities" class="product-section"><div class="container"><ul>
  <li><div class="left">Durée minimum</div><div class="right">3 mois</div></li>
  <li><div class="left">Durée maximum</div><div class="right">1 an</div></li>
  <li><div class="left">Durée du préavis</div><div class="right">1 mois</div></li>
</ul></div></section>
<div class="informations"><div class="ref">Référence: 10001</div></div>
<section id="product_diagnostics" class="product-section">
  <div class="dpe"><ul>
    <li class="line " data-label="D"><div class="display"><span class="letter">D</span></div></li>
    <li class="line active" data-label="E"><div class="display"><span class="letter">E</span></div></li>
  </ul></div>
  <div class="ges"><ul>
    <li class="line active" data-label="C"><div class="display"><span class="letter">C</span></div></li>
  </ul></div>
</section>
<div id="host-contact"><div class="content"><div class="contact">
  <a href="/profil/1" class="profile">Camille D.</a>
  <div class="information"><div class="since">Membre depuis mars 2019</div><div class="type">Particulier</div></div>
</div></div></div>`;

/** Fiche anonymisée d'une CHAMBRE PRIVÉE — une colocation, donc. */
const FICHE_CHAMBRE = `
<section id="product_description"><div class="txt"><p>Chambre meublée avec bureau, cuisine partagée.</p></div></section>
<section id="product_details"><div class="container"><ul>
  <li><div class="left">Catégorie</div><div class="right">Appartement</div></li>
  <li><div class="left">Type de location</div><div class="right">Chambre privée</div></li>
  <li><div class="left">Superficie</div><div class="right">12 m²</div></li>
  <li><div class="left">Chambres</div><div class="right">N/A</div></li>
</ul></div></section>
<section id="product_pricing"><div class="container"><ul>
  <li><div class="left">Loyer mensuel hors charges</div><div class="right"><span class="amount">550</span>€</div></li>
  <li><div class="left">Charges mensuelles</div><div class="right"><span class="amount">90</span>€</div></li>
</ul></div></section>
<section id="product_modalities"><div class="container"><ul>
  <li><div class="left">Durée minimum</div><div class="right">3 mois</div></li>
  <li><div class="left">Durée maximum</div><div class="right">9 mois</div></li>
</ul></div></section>
<div id="host-contact"><div class="contact">
  <a href="/profil/2" class="profile">Léa M.</a>
  <div class="information"><div class="type">Particulier</div></div>
</div></div>`;

describe('parseListPage (MorningCroissant)', () => {
  const { listings } = parseListPage(LIST, PAGE);
  const byRef = (ref: string) => listings.find((l) => l.sourceRef === ref);

  it('rend une annonce par carte, référencée par l’identifiant de l’URL', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['10001', '10002', '10003']);
  });

  it('lit loyer, surface, pièces, meublé, commune et code postal du BIEN', () => {
    const l = byRef('10001');
    expect(l?.priceText).toBe('680€ CC');
    expect(l?.areaText).toBe('42 m²');
    expect(l?.roomsText).toBe('2 pièces');
    expect(l?.furnishedText).toBe('Meublé');
    expect(l?.cityText).toBe('Nice');
    expect(l?.postalCodeText).toBe('06300');
  });

  /**
   * Le premier passage n'avait enregistré AUCUNE photo sur 92 annonces : le
   * carrousel de la carte n'était pas lu. Sans photo, le dédoublonnage est
   * aveugle et la fiche est vide à l'écran.
   */
  it('remonte les photos du carrousel, en adresses absolues', () => {
    expect(byRef('10001')?.imageUrls).toEqual([
      'https://www.morningcroissant.fr/medialibrary/flats/1/a.jpg',
      'https://www.morningcroissant.fr/medialibrary/flats/1/b.jpg',
    ]);
    // Une carte sans carrousel n'en invente pas.
    expect(byRef('10002')?.imageUrls).toBeUndefined();
  });

  it('garde la commune voisine telle qu’elle est publiée', () => {
    expect(byRef('10002')?.cityText).toBe('Villefranche-sur-Mer');
    expect(byRef('10002')?.postalCodeText).toBe('06230');
  });

  it('déclare « logement entier » comme NON colocation, et la chambre comme colocation', () => {
    expect(byRef('10001')?.extra?.['flatShare']).toBe('false');
    expect(byRef('10003')?.extra?.['flatShare']).toBe('true');
  });

  it('ne dit « agence » que sur le `pro-tag` de la carte', () => {
    expect(byRef('10002')?.extra?.['landlord']).toBe('agency');
    expect(byRef('10002')?.agencyName).toBe('Loueur professionnel');
    // La carte d'un particulier ne porte qu'un prénom dans `owner-name` : elle
    // ne CLASSE rien, c'est la fiche qui tranche. On ne devance pas.
    expect(byRef('10001')?.extra?.['landlord']).toBeUndefined();
    expect(byRef('10001')?.agencyName).toBeUndefined();
  });

  it('n’invente aucune référence : la carte n’en imprime pas', () => {
    expect(listings.every((l) => l.extra?.['reference'] === undefined)).toBe(true);
  });

  it('reconnaît la page que le site déclare vide', () => {
    expect(isEmptyList('<p>0 résultats</p>')).toBe(true);
    expect(isEmptyList(LIST)).toBe(false);
  });
});

describe('parseDetail (MorningCroissant)', () => {
  /**
   * LIRE LA FICHE NE DOIT PAS FAIRE BAISSER LE LOYER. La carte annonce 680 €
   * charges comprises ; la fiche décompose 650 € + 30 €, et imprime le même
   * total. C'est ce total qu'on garde, sinon la même source afficherait deux
   * bases selon qu'une annonce a été visitée ou non.
   */
  it('garde la base de la carte : le total charges comprises, et la provision', () => {
    const detail = parseDetail(FICHE_PARTICULIER);
    expect(detail?.priceText).toBe('680€ CC');
    expect(detail?.chargesText).toBe('30€');
    // « N/A » n'est pas un montant : le dépôt reste absent.
    expect(detail?.depositText).toBeUndefined();
  });

  /** Sans la ligne « charges comprises », on ne réécrit pas le loyer de la carte. */
  it('laisse le loyer de la carte quand la fiche ne donne pas le total', () => {
    const sansTotal = FICHE_PARTICULIER.replace(
      /<li><div class="left"><b>Loyer mensuel charges comprises<\/b><\/div>[\s\S]*?<\/li>/,
      '',
    );
    const detail = parseDetail(sansTotal);
    expect(detail?.priceText).toBeUndefined();
    expect(detail?.chargesText).toBe('30€');
  });

  it('rapporte les durées du bail en toutes lettres', () => {
    const detail = parseDetail(FICHE_PARTICULIER);
    expect(detail?.description).toContain('durée minimum : 3 mois');
    expect(detail?.description).toContain('durée maximum : 1 an');
  });

  it('lit le bailleur que la source CLASSE, et son nom public', () => {
    expect(parseDetail(FICHE_PARTICULIER)?.extra?.['landlord']).toBe('private');
    expect(parseDetail(FICHE_PARTICULIER)?.contactName).toBe('Camille D.');
    expect(parseDetail(FICHE_PARTICULIER)?.agencyName).toBeUndefined();
  });

  it('lit les deux étiquettes, DPE et GES, sans déduire l’une de l’autre', () => {
    const detail = parseDetail(FICHE_PARTICULIER);
    expect(detail?.extra?.['dpe']).toBe('E');
    expect(detail?.extra?.['ges']).toBe('C');
  });

  it('reprend la référence que la FICHE imprime, et elle seule', () => {
    expect(parseDetail(FICHE_PARTICULIER)?.extra?.['reference']).toBe('10001');
    // La fiche de la chambre n'en imprime aucune : rien n'est fabriqué.
    expect(parseDetail(FICHE_CHAMBRE)?.extra?.['reference']).toBeUndefined();
  });

  it('ajoute les chambres aux pièces de la carte plutôt que de les remplacer', () => {
    const detail = parseDetail(FICHE_PARTICULIER, {
      sourceRef: '10001',
      sourceUrl: PAGE,
      roomsText: '2 pièces',
    });
    expect(detail?.roomsText).toBe('2 pièces 1 chambre');
  });

  it('déclare la chambre privée comme colocation', () => {
    const detail = parseDetail(FICHE_CHAMBRE);
    expect(detail?.extra?.['flatShare']).toBe('true');
    expect(detail?.propertyTypeText).toBe('Chambre privée');
  });

  it('ne conclut rien d’une page qui n’est pas une fiche', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
  });
});

describe('normalisation (MorningCroissant)', () => {
  const options = { sourceId: 'morningcroissant', nowMs: Date.parse('2026-09-16T10:00:00Z') };
  const { listings } = parseListPage(LIST, PAGE);
  const merge = (ref: string, detail: ReturnType<typeof parseDetail>) => {
    const listing = listings.find((l) => l.sourceRef === ref);
    if (listing === undefined || detail === null) throw new Error('fixture');
    return normalizeListing(
      { ...listing, ...detail, extra: { ...listing.extra, ...detail.extra } },
      options,
    );
  };

  it('porte un logement entier de particulier : hors colocation, loyer décomposé', () => {
    const n = merge('10001', parseDetail(FICHE_PARTICULIER));
    expect(n?.flatShare).toBe(false);
    expect(n?.contact.kind).toBe('private');
    // La carte disait 680 € charges comprises : la fiche ne la contredit pas.
    expect(n?.price).toBe(680);
    expect(n?.charges).toBe(30);
    expect(n?.chargesIncluded).toBe(true);
    expect(rentExcludingCharges(n!)).toBe(650);
    expect(n?.area).toBe(42);
    expect(n?.rooms).toBe(2);
    expect(n?.bedrooms).toBe(1);
    expect(n?.propertyType).toBe('apartment');
    expect(n?.furnished).toBe(true);
    expect(n?.dpe).toBe('E');
    expect(n?.ges).toBe('C');
    expect(n?.postalCode).toBe('06300');
  });

  it('marque la CHAMBRE comme colocation, même sans le mot dans le texte', () => {
    const n = merge('10003', parseDetail(FICHE_CHAMBRE));
    expect(n?.flatShare).toBe(true);
    expect(n?.propertyType).toBe('room');
    expect(n?.contact.kind).toBe('private');
  });

  it('classe le loueur professionnel en agence', () => {
    const l = listings.find((x) => x.sourceRef === '10002');
    const n = normalizeListing(l as never, options);
    expect(n?.contact.kind).toBe('agency');
    expect(n?.flatShare).toBe(false);
  });

  it('lit le loyer de la CARTE comme charges comprises tant que la fiche n’a pas parlé', () => {
    const l = listings.find((x) => x.sourceRef === '10001');
    const n = normalizeListing(l as never, options);
    expect(n?.price).toBe(680);
    expect(n?.chargesIncluded).toBe(true);
    // ET SANS PROVISION FABRIQUÉE. Écrit « 680€ charges comprises », le texte du
    // prix se relisait comme « 680 € DE charges » : le loyer entier recopié
    // dans un champ qui dit autre chose. La carte ne décompose rien, et la
    // fiche est la seule à le faire.
    expect(n?.charges).toBeNull();
  });
});
