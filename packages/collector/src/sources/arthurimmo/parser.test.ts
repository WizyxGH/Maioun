import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetail, parseList } from './parser.js';

const SAMPLE_LIST_HTML = `
<html>
<body>
  <div class="bg-white shadow-xl p-4 rounded-50">
    <div class="relative z-0 flex flex-col h-full justify-between">
      <div class="relative z-10 h-[235px]">
        <a href="https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33829487.htm">
          <img src="https://media.studio-net.fr/biens/33829487/x6aaacbc42ee97?width=330&height=250" />
        </a>
        3
      </div>
      <div>
        <h2>Appartement | 1 pièces</h2>
        <div>700 € /mois Nice 06000</div>
        <p>À louer, grande chambre meublée de 14,05 m², au sein d’un appartement entièrement aménagé en 3 studios privatifs.</p>
        <a href="https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33829487.htm">Voir</a>
      </div>
    </div>
  </div>
  <div class="bg-white shadow-xl p-4 rounded-50">
    <div class="relative z-0 flex flex-col h-full justify-between">
      <a href="/annonces/location/appartement/nice-06300/33247007.htm">
        <img src="https://media.studio-net.fr/biens/33247007/x6a0c386859ca1?width=330&height=250" />
      </a>
      <div>
        <h2>Appartement | 3 pièces | 70 m²</h2>
        <div>2 400 € /mois Nice 06300</div>
        <p>En Résidence Séniors Autonomes à Nice Riquier.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

const SAMPLE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Louer appartement de 2 pièces 44 m2 1 712 € à Nice (06000) : une annonce Arthurimmo.com</title>
  <meta name="description" content="Carré d'or - Immeuble Art Déco - étage élevé - 2 pièces avec balcons. Loyer mensuel : 1 642 € + 70 € de charges." />
</head>
<body>
  <h1>Location Appartement 2 pièces 44 m2 à Nice</h1>
  <div class="text-4xl">1 712 € /mois</div>

  <div class="text-gray-900">
    <p>Carré d'or - Immeuble Art Déco - étage élevé - 2 pièces avec balcons. Appartement rénové de 44 m², au troisième étage avec ascenseur. Cuisine équipée, double vitrage, cave.</p>
  </div>

  <h2>Caractéristiques de ce bien</h2>
  <div>
    <div>Etat général Bon</div>
    <div>Etage 3ème</div>
    <div>Ascenseur Oui</div>
    <div>Nombre de pièces 2</div>
    <div>Meublé Non</div>
  </div>

  <h2>À propos du prix</h2>
  <div>
    <div>Charges 70 € /mois</div>
    <div class="flex-1 text-right">70 €</div>
  </div>
  <div>
    <div>Dépôt de garantie 3 284 €</div>
    <div class="flex-1 text-right">3 284 €</div>
  </div>
  <div>
    <div>Honoraires locataire 583 € TTC</div>
    <div class="flex-1 text-right">583 €</div>
  </div>

  <h2>Bilan énergétique</h2>
  <div>Diagnostic de performance énergétique (DPE)
    <svg>
      <text font-size="25"><tspan>A</tspan></text>
      <text font-size="25"><tspan>B</tspan></text>
      <text font-size="54"><tspan>C</tspan></text>
      <text font-size="25"><tspan>D</tspan></text>
    </svg>
  </div>
  <div>Indice d'émission de gaz à effet de serre (GES)
    <svg>
      <text font-size="54"><tspan>B</tspan></text>
    </svg>
  </div>

  <h2>Ce bien vous est proposé par</h2>
  <div>
    <div>Arthurimmo.com Nice Transactions Nord</div>
    <div>proposé par Clara ANASTASI Commercial Arthurimmo</div>
  </div>

  <div>Référence 85418724 - Mise à jour le 29/09/2026</div>

  <img src="https://media.studio-net.fr/biens/33817128/photo1.jpg?width=330&height=250" />
  <img src="https://media.studio-net.fr/biens/33817128/photo2.jpg?width=330&height=250" />
</body>
</html>
`;

describe('arthurimmo parser', () => {
  it('extrait les annonces depuis la liste HTML sans être trompé par le badge photo', () => {
    const { listings, warnings } = parseList(SAMPLE_LIST_HTML);
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
    expect(first.description).toContain('grande chambre meublée');
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

  it('parse une fiche de détail Arthurimmo avec toutes ses rubriques', () => {
    const detail = parseDetail(
      SAMPLE_DETAIL_HTML,
      'https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33817128.htm',
    );
    expect(detail).not.toBeNull();
    expect(detail?.sourceRef).toBe('33817128');
    expect(detail?.title).toBe('Location Appartement 2 pièces 44 m2 à Nice');
    expect(detail?.priceText).toBe('1712');
    expect(detail?.chargesText).toBe('70');
    expect(detail?.depositText).toBe('3284');
    expect(detail?.areaText).toBe('44');
    expect(detail?.roomsText).toBe('2 pièces');
    expect(detail?.agencyName).toContain('Arthurimmo.com Nice Transactions Nord');
    expect(detail?.contactName).toContain('Clara ANASTASI');
    expect(detail?.extra?.['reference']).toBe('85418724');
    expect(detail?.extra?.['floor']).toBe('3ème');
    expect(detail?.extra?.['elevator']).toBe('true');
    expect(detail?.extra?.['dpe']).toBe('C');
    expect(detail?.extra?.['ges']).toBe('B');
    expect(detail?.extra?.['tenantFees']).toBe('583');
    expect(detail?.imageUrls).toHaveLength(2);
    expect(detail?.imageUrls?.[0]).toBe(
      'https://media.studio-net.fr/biens/33817128/photo1.jpg?width=1920&height=1440',
    );
  });

  it('normalise une annonce Arthurimmo complète pour Maïoun', () => {
    const detail = parseDetail(
      SAMPLE_DETAIL_HTML,
      'https://www.arthurimmo.com/annonces/location/appartement/nice-06000/33817128.htm',
    );
    const normalized = normalizeListing(
      {
        ...detail!,
        cityText: 'Nice',
        postalCodeText: '06000',
      },
      {
        sourceId: 'arthurimmo',
        nowMs: Date.parse('2026-09-29T10:00:00Z'),
      },
    );

    expect(normalized).not.toBeNull();
    expect(normalized?.sourceId).toBe('arthurimmo');
    expect(normalized?.sourceRef).toBe('33817128');
    expect(normalized?.price).toBe(1712);
    expect(normalized?.charges).toBe(70);
    expect(normalized?.deposit).toBe(3284);
    expect(normalized?.area).toBe(44);
    expect(normalized?.rooms).toBe(2);
    expect(normalized?.dpe).toBe('C');
    expect(normalized?.ges).toBe('B');
    expect(normalized?.city).toBe('nice');
    expect(normalized?.postalCode).toBe('06000');
    expect(normalized?.contact.agencyName).toContain('Arthurimmo');
  });
});
