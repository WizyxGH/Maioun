import { describe, expect, it } from 'vitest';
import { locationFromUrl, parseAlertEmail, referenceFromUrl, resolvePortalUrl } from './parser.js';

describe('resolvePortalUrl', () => {
  it('reconnaît un lien Leboncoin direct', () => {
    const r = resolvePortalUrl('https://www.leboncoin.fr/ad/locations/2812345678');
    expect(r?.portal.id).toBe('leboncoin');
  });

  it('dénoue un lien de tracking qui enveloppe l’URL du portail', () => {
    const wrapped =
      'https://clic.leboncoin-mail.fr/redirect?u=' +
      encodeURIComponent(
        'https://www.seloger.com/annonces/locations/appartement/nice/123456789.htm',
      );
    const r = resolvePortalUrl(wrapped);
    expect(r?.portal.id).toBe('seloger');
    expect(r?.url.hostname).toBe('www.seloger.com');
  });

  it('ignore un lien hors portail', () => {
    expect(resolvePortalUrl('https://exemple.fr/aide')).toBeNull();
  });

  it('déplie l’URL Bien’ici encodée en base64 dans le lien de tracking', () => {
    // Bien'ici enveloppe la vraie URL en base64url dans le dernier segment.
    const real = 'https://www.bienici.com/annonce/ag123456-789?at_canal=CRM';
    const b64 = Buffer.from(real).toString('base64url');
    const wrapped = `https://link.bienici.com/lnk/AAAA/8/HASH/${b64}`;
    const r = resolvePortalUrl(wrapped);
    expect(r?.portal.id).toBe('bienici');
    expect(r?.url.hostname).toBe('www.bienici.com');
    expect(r?.canonical).toBe(true);
  });

  it('reconnaît un lien de tracking SeLoger opaque sans URL réelle', () => {
    const r = resolvePortalUrl('https://click.by.seloger.com/?qs=ABB7InYiOjEsImQ9');
    expect(r?.portal.id).toBe('seloger');
    expect(r?.canonical).toBe(false); // sous-domaine de tracking → pas canonique
  });
});

const EMAIL = `
<html><body>
  <table>
    <tr>
      <td>
        <a href="https://clic.lbc.fr/r?u=${encodeURIComponent(
          'https://www.leboncoin.fr/ad/locations/2812345678',
        )}">
          <img src="https://img.leboncoin.fr/photo1.jpg" alt="photo">
          Bel appartement T2 à Nice — 680 € — 32 m²
        </a>
      </td>
    </tr>
    <tr>
      <td>
        <a href="https://www.seloger.com/annonces/locations/appartement/nice/987654321.htm">
          Studio meublé Nice centre
        </a>
        <div>Loyer 590 € CC · 24 m²</div>
      </td>
    </tr>
    <tr><td><a href="https://aide.exemple.fr/faq">Se désabonner</a></td></tr>
    <tr><td><a href="https://www.leboncoin.fr/ad/locations/2812345678">doublon</a></td></tr>
  </table>
</body></html>`;

describe('parseAlertEmail', () => {
  const listings = parseAlertEmail(EMAIL);

  it('extrait une annonce par portail, dédoublonnée sur la référence', () => {
    expect(listings).toHaveLength(2);
    const refs = listings.map((l) => l.sourceRef).sort();
    expect(refs).toEqual(['leboncoin:2812345678', 'seloger:987654321']);
  });

  it('déplie le lien de tracking et garde l’URL canonique du portail', () => {
    const lbc = listings.find((l) => l.extra?.['portal'] === 'leboncoin');
    expect(lbc?.sourceUrl).toBe('https://www.leboncoin.fr/ad/locations/2812345678');
    expect(lbc?.priceText).toContain('680');
    expect(lbc?.areaText).toBe('32 m²');
    expect(lbc?.imageUrls?.[0]).toContain('photo1.jpg');
  });

  it('récupère prix/surface depuis le bloc voisin (SeLoger)', () => {
    const sl = listings.find((l) => l.extra?.['portal'] === 'seloger');
    expect(sl?.priceText).toContain('590');
    expect(sl?.areaText).toBe('24 m²');
    expect(sl?.title).toContain('Studio');
  });

  it('ignore les liens hors annonce (désabonnement, aide)', () => {
    expect(
      listings.every((l) => l.sourceUrl.includes('leboncoin') || l.sourceUrl.includes('seloger')),
    ).toBe(true);
  });
});

// Gabarit RÉEL des digests SeLoger : chaque annonce est un bloc « tableau » où
// image, titre et prix sont des liens de TRACKING distincts (click.by.seloger),
// et la ligne ville « Nice, 06000 » précède le prix « 570 € ».
const SELOGER_DIGEST = `
<table>
  <tbody>
    <tr>
      <td style="background-image: url('https://mms.seloger.com/a/b/c/photo.jpg?ci_seal=xyz'); width:250px">
        <a href="https://click.by.seloger.com/?qs=IMG001"><img src="https://mms.seloger.com/static/logo.png" /></a>
      </td>
    </tr>
    <tr>
      <td><a href="https://click.by.seloger.com/?qs=TITLE01">Appartement • 1 pièce • 12 m² <br /> Nice, 06000</a></td>
      <td align="right"><a href="https://click.by.seloger.com/?qs=PRICE01">570 €</a></td>
    </tr>
  </tbody>
</table>`;

describe('parseAlertEmail — digest SeLoger réel (liens de tracking)', () => {
  const [listing, ...rest] = parseAlertEmail(SELOGER_DIGEST);

  it('produit une seule annonce malgré les 3 liens de tracking distincts', () => {
    expect(rest).toHaveLength(0);
    expect(listing?.extra?.['portal']).toBe('seloger');
  });

  it('lit le prix sans avaler le code postal collé (« 06000 570 € » → « 570 € »)', () => {
    expect(listing?.priceText).toBe('570 €');
    expect(listing?.areaText).toBe('12 m²');
    expect(listing?.cityText).toBe('Nice');
    expect(listing?.postalCodeText).toBe('06000');
  });

  it('garde le lien de tracking comme URL (il redirige vers l’annonce)', () => {
    expect(listing?.sourceUrl).toContain('click.by.seloger.com');
    // Faute d'identifiant exposé, la référence est dérivée du contenu.
    expect(listing?.sourceRef).toMatch(/^seloger:/);
  });

  it('ne prend pas la ligne de prix pour un nom de commune', () => {
    /**
     * Relevé tel quel le 2026-09-10 : une annonce de Fabron était rangée dans la
     * commune « mois charges comprises fabron ».
     *
     * La ville préfixe les clés du dédoublonnage — ainsi située, l'annonce ne
     * pouvait plus être rapprochée d'aucune autre, et ressortait en double.
     */
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T2">Studio • 22 m² <br /> 790 € / mois charges comprises Fabron 06200 Nice</a></td>
</tr></tbody></table>`;
    const [trouvee] = parseAlertEmail(digest);
    expect(trouvee?.cityText).toBe('Fabron');
    expect(trouvee?.postalCodeText).toBe('06200');
  });

  it('garde une commune en plusieurs mots, particules comprises', () => {
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T3">Appartement • 40 m² <br /> 900 € Cagnes sur Mer 06800</a></td>
</tr></tbody></table>`;
    expect(parseAlertEmail(digest)[0]?.cityText).toBe('Cagnes sur Mer');
  });

  it('n’invente aucune commune quand rien n’en porte la marque (§17)', () => {
    // Tout en minuscules : le code postal suffit, l'URL porte souvent la ville.
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T4">Studio • 18 m² <br /> 600 € charges comprises 06000</a></td>
</tr></tbody></table>`;
    const [trouvee] = parseAlertEmail(digest);
    expect(trouvee?.cityText).toBeUndefined();
    expect(trouvee?.postalCodeText).toBe('06000');
  });

  it('retient le loyer PRÉCÉDENT quand le digest annonce une baisse', () => {
    /**
     * Gabarit RELEVÉ TEL QUEL dans un message « Baisse de prix » de SeLoger, le
     * 2026-09-10 : l'ancien loyer est barré dans un lien portant un attribut
     * `name` qui commence par `adpricechange`.
     *
     * C'est le seul signal de ce genre : partout ailleurs, une baisse ne se
     * découvre qu'en comparant deux collectes — donc jamais sur une annonce vue
     * pour la première fois, ni sur celles qui n'arrivent QUE par ces digests.
     */
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T5">Studio • 25 m² <br /> Nice, 06000</a></td>
  <td>
    <span>
      <a href="https://click.by.seloger.com/?qs=P5" name="adpricechange1_1"><s>750 €</s> &#8600;&nbsp;7%</a>
    </span>
    <a href="https://click.by.seloger.com/?qs=P6">697 €</a>
  </td>
</tr></tbody></table>`;
    const [trouvee] = parseAlertEmail(digest);
    expect(trouvee?.extra?.['previousPrice']).toBe('750 €');
  });

  it('n’invente pas de baisse là où il n’y en a pas', () => {
    // Un `<s>` isolé peut être n'importe quoi dans un e-mail composé en
    // tableaux ; c'est l'attribut `name` qui fait foi, et il ne se pose pas par
    // hasard.
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T6">Studio • 25 m² <br /> Nice, 06000</a></td>
  <td><s>750 €</s> <a href="https://click.by.seloger.com/?qs=P7">697 €</a></td>
</tr></tbody></table>`;
    expect(parseAlertEmail(digest)[0]?.extra?.['previousPrice']).toBeUndefined();
  });

  it('extrait la photo depuis background-image et ignore le logo', () => {
    // SeLoger met la vraie photo en CSS `background-image`, pas en <img> ;
    // le seul <img> présent est un logo (à écarter).
    expect(listing?.imageUrls?.[0]).toBe('https://mms.seloger.com/a/b/c/photo.jpg?ci_seal=xyz');
  });

  it('déduit le type et les pièces depuis le titre', () => {
    expect(listing?.propertyTypeText).toBe('appartement');
    expect(listing?.roomsText).toContain('1 pièce');
    // Ce digest n'indique pas « cc » → le prix reste brut.
    expect(listing?.priceText).toBe('570 €');
  });
});

// Cas piège : « 2 pièces • 1 chambre » SANS le mot « Appartement » — la
// normalisation prenait « chambre » (nb de chambres) pour une location de
// CHAMBRE. Le parseur doit typer « appartement » (présence de pièces) et
// exposer les chambres pour le comptage.
const SELOGER_ROOMS = `
<table><tbody>
  <tr><td><a href="https://click.by.seloger.com/?qs=T">2 pièces • 1 chambre • 24 m² <br /> Nice, 06300</a></td>
  <td><a href="https://click.by.seloger.com/?qs=P">635 € CC</a></td></tr>
</tbody></table>`;

describe('parseAlertEmail — pièces/chambres sans mot « Appartement »', () => {
  const [l] = parseAlertEmail(SELOGER_ROOMS);
  it('type « appartement » (pas « chambre ») et chambres exposées', () => {
    expect(l?.propertyTypeText).toBe('appartement');
    expect(l?.roomsText).toContain('2 pièces');
    expect(l?.roomsText).toContain('1 chambre');
    expect(l?.priceText).toBe('635 € cc');
  });
});

// Bien'ici : titre « Appartement meublé 4 pièces 67 m² ».
const BIENICI_FURNISHED = `
<table><tbody>
  <tr><td style="background-image:url('https://file.bienici.com/photo/x_photos_1.jpg?w=200')"></td></tr>
  <tr><td><a href="https://www.bienici.com/annonce/ag99-88">Appartement meublé 4 pièces 67 m² 06000 Nice</a></td>
  <td><a href="https://www.bienici.com/annonce/ag99-88">567 € par mois charges comprises</a></td></tr>
</tbody></table>`;

// Piège image : SeLoger insère des ASSETS de gabarit (badge « exclusivité »,
// flèche « voir l'annonce ») sur image.by.seloger.com/lib/… AVANT la vraie
// photo. On ne doit jamais les prendre pour la photo de l'annonce.
const SELOGER_BADGE = `
<table><tbody>
  <tr><td>
    <img src="https://image.by.seloger.com/lib/abc/m/1/badge-exclusivite.png" />
    <div style="background-image:url('https://mms.seloger.com/x/y/z/photo.jpg?ci_seal=s')"></div>
  </td></tr>
  <tr><td><a href="https://click.by.seloger.com/?qs=T">1 pièce • 20 m² <br /> Nice, 06000</a></td>
  <td><a href="https://click.by.seloger.com/?qs=P">600 €</a></td></tr>
</tbody></table>`;

describe('parseAlertEmail — ignore les assets de gabarit SeLoger', () => {
  const [l] = parseAlertEmail(SELOGER_BADGE);
  it('prend la vraie photo mms.seloger, pas le badge image.by.seloger', () => {
    expect(l?.imageUrls?.[0]).toBe('https://mms.seloger.com/x/y/z/photo.jpg?ci_seal=s');
    expect(l?.imageUrls?.[0]).not.toContain('image.by.seloger');
  });
});

describe('parseAlertEmail — Bien’ici meublé', () => {
  const [l] = parseAlertEmail(BIENICI_FURNISHED);
  it('détecte « meublé » et 4 pièces', () => {
    expect(l?.furnishedText).toBe('meublé');
    expect(l?.roomsText).toContain('4 pièces');
    expect(l?.propertyTypeText).toBe('appartement');
    expect(l?.imageUrls?.[0]).toContain('file.bienici.com');
  });
});

describe('referenceFromUrl', () => {
  it('lit l’identifiant SeLoger moderne, alphanumérique', () => {
    // Les URL canoniques actuelles ne sont plus numériques : l'ancien
    // extracteur ne les reconnaissait pas.
    expect(referenceFromUrl('https://www.seloger.com/annonce/262DQEQC5SVU')).toBe(
      'seloger:262DQEQC5SVU',
    );
    expect(
      referenceFromUrl(
        'https://www.seloger.com/annonce/location/provence-alpes-cote-d-azur/alpes-maritimes-06/nice-06000/26DFQW7W1VRY',
      ),
    ).toBe('seloger:26DFQW7W1VRY');
  });

  it('reconnaît encore les anciens identifiants numériques', () => {
    expect(
      referenceFromUrl(
        'https://www.seloger.com/annonces/locations/appartement/nice-06/123456789.htm',
      ),
    ).toBe('seloger:123456789');
  });

  it('gère les autres portails et rend null hors portail connu', () => {
    expect(referenceFromUrl('https://www.leboncoin.fr/locations/2938451209.htm')).toBe(
      'leboncoin:2938451209',
    );
    expect(referenceFromUrl('https://exemple.invalid/annonce/1')).toBeNull();
    expect(referenceFromUrl('pas une url')).toBeNull();
  });
});

describe('locationFromUrl', () => {
  it('lit la commune ET le quartier de la forme courte', () => {
    expect(
      locationFromUrl(
        'https://www.seloger.com/annonces/locations/appartement/nice-06/baumettes/26A8CE41HBAQ.htm',
      ),
    ).toEqual({ cityText: 'nice', districtText: 'baumettes' });
  });

  it('préfère la COMMUNE au département quand les deux figurent', () => {
    // « /alpes-maritimes-06/nice-06000/ » : prendre le premier segment rendait
    // « alpes maritimes » comme ville.
    expect(
      locationFromUrl(
        'https://www.seloger.com/annonce/location/provence-alpes-cote-d-azur/alpes-maritimes-06/nice-06000/26AUM6K',
      ),
    ).toEqual({ cityText: 'nice', postalCodeText: '06000' });
  });

  it('rend un objet vide quand l’URL ne porte aucune localisation (§17)', () => {
    expect(locationFromUrl('https://www.seloger.com/annonce/262DQEQC5SVU')).toEqual({});
    expect(locationFromUrl('pas une url')).toEqual({});
  });
});
