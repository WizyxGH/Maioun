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

  it('ne prend pas la ligne de prix pour un lieu, et met le quartier à sa place', () => {
    /**
     * Relevé tel quel le 2026-09-10 : une annonce de Fabron était rangée dans la
     * commune « mois charges comprises fabron ».
     *
     * La ville préfixe les clés du dédoublonnage — ainsi située, l'annonce ne
     * pouvait plus être rapprochée d'aucune autre, et ressortait en double.
     *
     * LE PREMIER CORRECTIF S'ARRÊTAIT À MI-CHEMIN : il rendait « Fabron », qui
     * n'est pas une commune mais un QUARTIER de Nice — la commune, elle, est
     * écrite juste APRÈS le code postal. Rangée dans la commune « Fabron »,
     * l'annonce restait incomparable à toutes celles de Nice. On lit donc les
     * deux, chacun à sa place.
     */
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T2">Studio • 22 m² <br /> 790 € / mois charges comprises Fabron 06200 Nice</a></td>
</tr></tbody></table>`;
    const [trouvee] = parseAlertEmail(digest);
    expect(trouvee?.cityText).toBe('Nice');
    expect(trouvee?.extra?.['quartier']).toBe('Fabron');
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

/**
 * GABARIT RÉEL D'UN DIGEST SELOGER « STANDARD », relevé le 2026-09-16 et rendu
 * anonyme (liens de tracking raccourcis, aucune donnée personnelle).
 *
 * La ligne de lieu s'y écrit « Quartier, Commune (CP) ». C'est la forme
 * MAJORITAIRE — et elle ne rendait rien : la lecture remontait mot à mot depuis
 * le code postal, butait sur la parenthèse et abandonnait. Sur quatorze jours
 * de digests, 1 % des annonces SeLoger portaient une commune, aucune un
 * quartier, alors que le message écrit les deux en toutes lettres.
 */
const SELOGER_QUARTIER = `
<table><tbody>
  <tr><td><a href="https://click.by.seloger.com/?qs=P1">700 €/mois charges comprises</a></td></tr>
  <tr><td><a href="https://click.by.seloger.com/?qs=T1">RUE DE FRANCE/STUDIO MEUBLE</a></td></tr>
  <tr><td><a href="https://click.by.seloger.com/?qs=D1">1 pièce · 20 m²</a></td></tr>
  <tr><td><a href="https://click.by.seloger.com/?qs=L1">Magnan, Nice (06000)</a></td></tr>
</tbody></table>`;

describe('parseAlertEmail — « Quartier, Commune (CP) », la forme majoritaire', () => {
  const [l, ...autres] = parseAlertEmail(SELOGER_QUARTIER);

  it('sépare le quartier de la commune', () => {
    expect(l?.cityText).toBe('Nice');
    expect(l?.extra?.['quartier']).toBe('Magnan');
    expect(l?.postalCodeText).toBe('06000');
  });

  it('garde le titre rédigé, pas la ligne de caractéristiques', () => {
    expect(l?.title).toBe('RUE DE FRANCE/STUDIO MEUBLE');
    expect(l?.priceText).toBe('700 € cc');
    expect(l?.areaText).toBe('20 m²');
    // Les quatre liens de tracking d'une même annonce n'en font qu'une.
    expect(autres).toHaveLength(0);
  });

  it('accepte un quartier composé, tirets et espaces compris', () => {
    const digest = `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T">4 pièces · 70 m² — 690 € — Roquebillière - Bon Voyage, Nice (06300)</a></td>
</tr></tbody></table>`;
    const [trouvee] = parseAlertEmail(digest);
    expect(trouvee?.cityText).toBe('Nice');
    expect(trouvee?.extra?.['quartier']).toBe('Roquebillière - Bon Voyage');
  });
});

/**
 * GABARIT RÉEL D'UNE ALERTE BIEN'ICI, relevé le 2026-09-16 et rendu anonyme.
 * Le lieu s'y écrit « CP Commune », et le corps imprime la référence de
 * l'annonceur — que rien ne lisait.
 */
const BIENICI_ALERTE = `
<table><tbody>
  <tr><td><a href="https://link.bienici.com/lnk/AAA/9">Appartement meublé 1 pièce 20 m²</a></td></tr>
  <tr><td><a href="https://link.bienici.com/lnk/AAA/1">06000 Nice</a></td></tr>
  <tr><td><a href="https://link.bienici.com/lnk/AAA/1">630 €par mois charges comprises</a></td></tr>
  <tr><td><a href="https://link.bienici.com/lnk/AAA/1">RÉFÉRENCE : 87354095</a></td></tr>
</tbody></table>`;

describe('parseAlertEmail — Bien’ici : « CP Commune » et référence d’annonceur', () => {
  const [l] = parseAlertEmail(BIENICI_ALERTE);

  it('lit la commune écrite APRÈS le code postal', () => {
    expect(l?.cityText).toBe('Nice');
    expect(l?.postalCodeText).toBe('06000');
  });

  it('retient la référence que l’annonceur imprime', () => {
    // C'est le numéro que porte la même annonce chez l'agence : de quoi la
    // rapprocher d'une source directe. Ce n'est PAS l'identifiant du portail,
    // qui vit dans l'URL — la référence de collecte n'en dépend pas.
    expect(l?.extra?.['reference']).toBe('87354095');
    expect(l?.sourceRef).toMatch(/^bienici:/);
  });
});

/**
 * GABARIT RÉEL D'UN DIGEST « EXCLUSIVITÉ » SELOGER, rendu anonyme. Ces
 * messages — dix-neuf sur cent trente-sept en quatorze jours — NOMMENT
 * l'agence, ce qu'aucune alerte ordinaire ne fait. Aucune annonce d'alerte
 * e-mail n'avait jamais porté de nom d'annonceur.
 */
const SELOGER_EXCLUSIVITE = `
<div>
  <p>Annonce exclusive Nice</p>
  <p><b>AGENCE DU LITTORAL</b> vous propose une nouvelle annonce en partenariat avec SeLoger.</p>
  <table><tbody>
    <tr><td><a href="https://click.by.seloger.com/?qs=PX">563 €/mois charges comprises</a></td></tr>
    <tr><td><a href="https://click.by.seloger.com/?qs=TX">A LOUER STUDIO ACROPOLIS</a></td></tr>
    <tr><td><a href="https://click.by.seloger.com/?qs=DX">1 pièce · 21,9 m²</a></td></tr>
    <tr><td><a href="https://click.by.seloger.com/?qs=LX">Riquier, Nice (06300)</a></td></tr>
  </tbody></table>
</div>`;

describe('parseAlertEmail — digest « exclusivité » : l’agence se nomme', () => {
  const [l] = parseAlertEmail(SELOGER_EXCLUSIVITE);

  it('retient le nom de l’agence annoncé en tête', () => {
    expect(l?.agencyName).toBe('AGENCE DU LITTORAL');
  });

  it('lit la surface à la virgule et le quartier', () => {
    expect(l?.areaText).toBe('21,9 m²');
    expect(l?.cityText).toBe('Nice');
    expect(l?.extra?.['quartier']).toBe('Riquier');
  });

  it('n’invente pas d’agence dans une alerte ordinaire (§17)', () => {
    expect(parseAlertEmail(SELOGER_QUARTIER)[0]?.agencyName).toBeUndefined();
  });
});

describe('parseAlertEmail — la référence de repli ne bouge pas avec la mise en page', () => {
  /**
   * C'EST LA SEULE IDENTITÉ DE CES ANNONCES : SeLoger ne laisse ni lien
   * dénouable (redirecteur interdit aux robots) ni fiche lisible (403). Une
   * référence qui change avec l'écriture du digest republie donc le même
   * studio sous plusieurs identités — quinze groupes portaient ainsi de deux à
   * cinq références pour un seul bien (relevé du 2026-09-16).
   */
  const digest = (mesures: string): string => `
<table><tbody><tr>
  <td><a href="https://click.by.seloger.com/?qs=T">Studio ${mesures} — Nice (06300)</a></td>
</tr></tbody></table>`;

  it('« 21m² » et « 21 m² » désignent la même annonce', () => {
    const serré = parseAlertEmail(digest('21m² 620 € CC'))[0]?.sourceRef;
    const aéré = parseAlertEmail(digest('21 m² 620 € CC'))[0]?.sourceRef;
    expect(serré).toBe(aéré);
  });

  it('la virgule décimale ne crée pas une seconde annonce', () => {
    expect(parseAlertEmail(digest('21,5 m² 620 €'))[0]?.sourceRef).toBe(
      parseAlertEmail(digest('21.5 m² 620 €'))[0]?.sourceRef,
    );
  });

  it('« charges comprises » ou non ne change pas l’identité, seul le montant compte', () => {
    expect(parseAlertEmail(digest('21 m² 620 € charges comprises'))[0]?.sourceRef).toBe(
      parseAlertEmail(digest('21 m² 620 €'))[0]?.sourceRef,
    );
  });

  it('deux biens distincts gardent des références distinctes', () => {
    expect(parseAlertEmail(digest('21 m² 620 €'))[0]?.sourceRef).not.toBe(
      parseAlertEmail(digest('24 m² 620 €'))[0]?.sourceRef,
    );
  });
});

describe('parseAlertEmail — ce qu’on jette se compte', () => {
  /**
   * LE SILENCE ÉTAIT LE DÉFAUT. La table ne connaît que trois hôtes ; tout lien
   * d'annonce menant ailleurs disparaissait sans compteur ni journal. Un
   * expéditeur suivi pouvait envoyer des annonces illisibles pendant des mois
   * sans que rien ne le dise — c'est ce qu'on a soupçonné pour BEP Logement, et
   * qu'aucune trace ne permettait de confirmer ni d'écarter.
   */
  const digest = (href: string): string =>
    `<table><tbody><tr><td><a href="${href}">Appartement • 2 pièces • 41 m² — Nice (06000) 780 €</a></td></tr></tbody></table>`;

  it('compte un lien d’annonce dont l’hôte n’est aucun portail connu', () => {
    const inconnus = new Map<string, number>();
    expect(parseAlertEmail(digest('https://www.beplogement.com/location/12345'), inconnus)).toEqual(
      [],
    );
    expect(inconnus.get('www.beplogement.com')).toBe(1);
  });

  it('additionne les liens d’un même hôte', () => {
    const inconnus = new Map<string, number>();
    const deux = `${digest('https://www.exemple-portail.invalid/a')}${digest('https://www.exemple-portail.invalid/b')}`;
    parseAlertEmail(deux, inconnus);
    expect(inconnus.get('www.exemple-portail.invalid')).toBe(2);
  });

  it('nomme la destination, pas le routeur d’e-mails qui l’enveloppe', () => {
    // Journaliser « link.routeur.invalid » n'apprendrait rien : c'est le
    // portail caché derrière la redirection qu'il faut pouvoir nommer.
    const inconnus = new Map<string, number>();
    const cible = encodeURIComponent('https://www.exemple-portail.invalid/annonce/77');
    parseAlertEmail(digest(`https://link.routeur.invalid/r?u=${cible}`), inconnus);
    expect([...inconnus.keys()]).toEqual(['www.exemple-portail.invalid']);
  });

  it('ne compte ni les liens reconnus ni ceux qui ne visent aucune annonce', () => {
    const inconnus = new Map<string, number>();
    parseAlertEmail(EMAIL, inconnus);
    // `EMAIL` porte un lien d'aide et un lien de désabonnement : leur texte ne
    // ressemble pas à un titre d'annonce, ils ne sont donc rien de perdu.
    expect([...inconnus.keys()]).toEqual([]);
  });

  it('un `mailto:` de contact ne compte pour aucun hôte', () => {
    const inconnus = new Map<string, number>();
    parseAlertEmail(digest('mailto:agence@example.invalid'), inconnus);
    expect([...inconnus.keys()]).toEqual([]);
  });

  it('le compteur reste facultatif : l’appel à un seul argument marche', () => {
    expect(() => parseAlertEmail(digest('https://www.beplogement.com/location/1'))).not.toThrow();
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
