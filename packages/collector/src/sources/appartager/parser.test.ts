import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { isEmptyList, parseDetail, parseListPage } from './parser.js';

const PAGE = 'https://www.appartager.com/colocations/nice';

/** Gabarit réel de deux cartes, ANONYMISÉ : une Premium, une Basic. */
const LIST = `
<ul class="results-list">
  <li class="results-list__item">
    <article aria-labelledby="adTitle0 adLocation0" class="result-card result-card--premium">
      <div class="result-card-media"><div class="result-card-media__container">
        <img src="//photos.example.invalid/images/1.jpg" class="result-card-media__image" alt="Photo principale">
        <span class="result-card-media__rent">
          <span>€620</span>
          <span class="result-card-media__rent-frequency">par mois</span>
        </span>
        <span class="result-card-media__contact-status">Contacter gratuitement</span>
      </div></div>
      <div class="result-card-info">
        <h2 class="result-card-info__main-heading"><span id="adLocation0">Nice (06000 Nice)</span></h2>
        <ul class="result-card-info__summary">
          <li class="result-card-info__summary-item result-card-info__summary-item--membership">Membre Premium</li>
          <li class="result-card-info__summary-item result-card-info__summary-item--availability">Disponible le 1er oct.</li>
          <li class="result-card-info__summary-item">Chambre simple</li>
        </ul>
        <h2 id="adTitle0" class="result-card-info__heading">Chambre lumineuse centre-ville</h2>
        <p class="result-card-info__description">Belle chambre dans un appartement clair, proche du tram...</p>
      </div>
      <a class="result-card__link" href="/colocations/alpes-maritimes/nice/3000000001"><span class="sr-only">Voir</span></a>
    </article>
  </li>
  <li class="results-list__item">
    <article class="result-card">
      <div class="result-card-media"><div class="result-card-media__container">
        <span class="result-card-media__rent">
          <span>€697</span>
          <span class="result-card-media__rent-frequency">par mois</span>
        </span>
        <span class="result-card-media__contact-status">Passez à Premium pour contacter</span>
      </div></div>
      <div class="result-card-info">
        <h2 class="result-card-info__main-heading"><span id="adLocation1">Pasteur (06000 Nice)</span></h2>
        <ul class="result-card-info__summary">
          <li class="result-card-info__summary-item">Appartement à 3 lit(s)</li>
        </ul>
        <h2 id="adTitle1" class="result-card-info__heading">Grande chambre avec terrasse</h2>
      </div>
      <a class="result-card__link" href="/colocations/alpes-maritimes/pasteur/3000000002"><span class="sr-only">Voir</span></a>
    </article>
  </li>
</ul>`;

/** Fiche anonymisée, avec la mention de durée que la carte ne portait pas. */
const FICHE = `
<div class="listing-detail__content-box">
  <h2 class="listing-detail__heading heading">A propos de la colocation</h2>
  <div class="property-feature-list">
    <div class="property-feature-list__item">
      <div class="property-feature-list__icon-wrapper"><span class="sr-only">Appartement</span></div>
      <div class="property-feature-list__text">Appartement</div>
    </div>
    <div class="property-feature-list__item">
      <div class="property-feature-list__icon-wrapper"><span class="sr-only">Chambres total</span></div>
      <div class="property-feature-list__text">5 chambres total</div>
    </div>
    <div class="property-feature-list__item">
      <div class="property-feature-list__icon-wrapper"><span class="sr-only">Locations à court terme acceptées</span></div>
      <div class="property-feature-list__text">Locations à court terme acceptées</div>
    </div>
    <div class="property-feature-list__item">
      <div class="property-feature-list__icon-wrapper"><span class="sr-only">Durée maximum</span></div>
      <div class="property-feature-list__text">3 mois maximum</div>
    </div>
    <div class="property-feature-list__item">
      <div class="property-feature-list__icon-wrapper"><span class="sr-only">Ameublement</span></div>
      <div class="property-feature-list__text">Meublé</div>
    </div>
  </div>
</div>
<div class="listing-detail__content-box">
  <h2 class="heading listing__heading">Description de l'annonce</h2>
  Belle chambre ensoleillée dans un appartement partagé, proche des transports.
</div>
<div class="listing-detail__content-box">Référence de l'annonce #3000000001</div>`;

describe('parseListPage (Appartager)', () => {
  const { listings } = parseListPage(LIST, PAGE);
  const byRef = (ref: string) => listings.find((l) => l.sourceRef === ref);

  it('rend une annonce par carte, référencée par l’identifiant de l’URL', () => {
    expect(listings.map((l) => l.sourceRef)).toEqual(['3000000001', '3000000002']);
  });

  it('lit loyer mensuel, commune, code postal, type de chambre et dispo', () => {
    const l = byRef('3000000001');
    expect(l?.priceText).toBe('€620 par mois');
    expect(l?.cityText).toBe('Nice');
    expect(l?.postalCodeText).toBe('06000');
    expect(l?.propertyTypeText).toBe('Chambre simple');
    expect(l?.availableAtText).toBe('Disponible le 1er oct.');
    expect(l?.title).toBe('Chambre lumineuse centre-ville');
  });

  it('déclare TOUTE annonce comme colocation : c’est ce que la source publie', () => {
    expect(listings.every((l) => l.extra?.['flatShare'] === 'true')).toBe(true);
  });

  it('ne prend pas le LOGEMENT D’ACCUEIL pour le bien loué', () => {
    // « Appartement à 3 lit(s) » décrit le logement, pas ce qu'on prend : la
    // fiche de cette annonce répartit le loyer entre trois chambres.
    const l = byRef('3000000002');
    expect(l?.propertyTypeText).toBe('Chambre en colocation');
    expect(l?.description).toContain('Appartement à 3 lit(s)');
  });

  it('ne prend pas non plus un LOT de chambres pour un type de bien', () => {
    // « 2 simples + double », « 4 doubles » : quatre annonces sur vingt-deux
    // tombaient ainsi en « appartement » ou « autre ».
    const { listings: lots } = parseListPage(
      LIST.replace('Appartement à 3 lit(s)', '2 simples + double'),
      PAGE,
    );
    expect(lots.find((l) => l.sourceRef === '3000000002')?.propertyTypeText).toBe(
      'Chambre en colocation',
    );
  });

  it('conserve l’état du contact tel que la carte l’affiche', () => {
    expect(byRef('3000000001')?.extra?.['contactStatus']).toBe('Contacter gratuitement');
    expect(byRef('3000000002')?.extra?.['contactStatus']).toBe('Passez à Premium pour contacter');
  });

  it('n’invente ni surface, ni charges, ni dépôt : la source n’en publie aucun', () => {
    const l = byRef('3000000001');
    expect(l?.areaText).toBeUndefined();
    expect(l?.chargesText).toBeUndefined();
    expect(l?.depositText).toBeUndefined();
  });

  it('n’invente aucune référence : la carte n’en imprime pas', () => {
    expect(listings.every((l) => l.extra?.['reference'] === undefined)).toBe(true);
  });

  it('reconnaît la page que le site déclare vide', () => {
    expect(isEmptyList('<p>0 résultats</p>')).toBe(true);
  });
});

describe('parseDetail (Appartager)', () => {
  const detail = parseDetail(FICHE);

  it('met la DURÉE en tête : trois mois maximum n’est pas un logement à l’année', () => {
    expect(detail?.description).toContain('Locations à court terme acceptées');
    expect(detail?.description).toContain('3 mois maximum');
  });

  it('reprend le texte de l’annonce sans son titre de section', () => {
    expect(detail?.description).toContain('Belle chambre ensoleillée');
    expect(detail?.description).not.toContain("Description de l'annonce");
  });

  it('lit l’ameublement', () => {
    expect(detail?.furnishedText).toBe('Meublé');
  });

  it('ne fait pas passer les 5 chambres du LOGEMENT pour celles du bien loué', () => {
    expect(detail?.roomsText).toBeUndefined();
  });

  it('reprend la référence que la FICHE imprime, et elle seule', () => {
    expect(detail?.extra?.['reference']).toBe('3000000001');
  });

  it('ne conclut rien d’une page qui n’est pas une fiche', () => {
    expect(parseDetail('<html><body><p>rien</p></body></html>')).toBeNull();
  });
});

describe('normalisation (Appartager)', () => {
  const options = { sourceId: 'appartager', nowMs: Date.parse('2026-09-16T10:00:00Z') };
  const { listings } = parseListPage(LIST, PAGE);

  it('marque la colocation et le type « chambre », loyer mensuel lu', () => {
    const listing = listings[0];
    const detail = parseDetail(FICHE);
    if (listing === undefined || detail === null) throw new Error('fixture');
    const n = normalizeListing(
      { ...listing, ...detail, extra: { ...listing.extra, ...detail.extra } },
      options,
    );
    expect(n?.flatShare).toBe(true);
    expect(n?.propertyType).toBe('room');
    expect(listings.map((x) => normalizeListing(x, options)?.propertyType)).toEqual([
      'room',
      'room',
    ]);
    expect(n?.price).toBe(620);
    // Rien ne dit si les charges sont comprises : la question reste ouverte.
    expect(n?.chargesIncluded).toBeNull();
    expect(n?.charges).toBeNull();
    expect(n?.area).toBeNull();
    expect(n?.city).toBe('nice');
  });
});
