import { describe, expect, it } from 'vitest';
import { parseList } from './parser.js';

const SAMPLE_HTML = `
<html>
<body>
  <div class="relative group">
    <a href="https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33829487.htm">
      <img src="https://media.studio-net.fr/biens/33829487/x6aaacbc42ee97?width=330&height=250" />
    </a>
    <div>
      Appartement | 1 pièces 700 € /mois Nice 06000
      À louer, grande chambre meublée de 14,05 m², au sein d’un appartement entièrement aménagé.
    </div>
  </div>
  <div class="relative group">
    <a href="/annonces/location/appartement/nice-06300/33247007.htm">
      <img src="https://media.studio-net.fr/biens/33247007/x6a0c386859ca1?width=330&height=250" />
    </a>
    <div>
      Appartement | 3 pièces | 70 m² 2 400 € /mois Nice 06300
      En Résidence Séniors Autonomes à Nice Riquier.
    </div>
  </div>
</body>
</html>
`;

describe('arthurimmo parser', () => {
  it('extrait les annonces depuis la liste HTML', () => {
    const { listings, warnings } = parseList(SAMPLE_HTML);
    expect(warnings).toEqual([]);
    expect(listings).toHaveLength(2);

    const first = listings[0]!;
    expect(first.sourceRef).toBe('33829487');
    expect(first.sourceUrl).toBe(
      'https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33829487.htm',
    );
    expect(first.priceText).toBe('700');
    expect(first.areaText).toBe('14,05');
    expect(first.roomsText).toBe('1');
    expect(first.postalCodeText).toBe('06000');
    expect(first.cityText).toBe('Nice');
    expect(first.agencyName).toBe('Arthurimmo.com');
    expect(first.propertyTypeText).toBe('apartment');
    expect(first.imageUrls).toEqual([
      'https://media.studio-net.fr/biens/33829487/x6aaacbc42ee97?width=1920&height=1440',
    ]);

    const second = listings[1]!;
    expect(second.sourceRef).toBe('33247007');
    expect(second.priceText).toBe('2400');
    expect(second.areaText).toBe('70');
    expect(second.roomsText).toBe('3');
    expect(second.postalCodeText).toBe('06300');
  });

  it('gère une page vide sans lever d’erreur', () => {
    const { listings, warnings } = parseList('<html><body></body></html>');
    expect(warnings).toEqual([]);
    expect(listings).toEqual([]);
  });
});
