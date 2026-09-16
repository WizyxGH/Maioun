/**
 * AFEDIM, sur la liste des Alpes-Maritimes et deux fiches prélevées le
 * 2026-09-14 : l'une à candidatures suspendues (Nice), l'autre ouvertes
 * (Mouans-Sartoux). Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import {
  announcedCount,
  floorOf,
  parseDetail,
  parseFicheUrl,
  parseListPage,
  readScriptJson,
} from './parser.js';

const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../tests/fixtures/afedim/${name}`, import.meta.url)),
    'utf8',
  );
const LISTE = fixture('liste-06.html');
const SUSPENDUE = fixture('fiche-nice-candidatures-suspendues.html');
const OUVERTE = fixture('fiche-candidatures-ouvertes.html');

describe('readScriptJson', () => {
  it('suit les chaînes : une accolade dans un texte ne ferme rien', () => {
    const html = `$dv.I('C:X.DonneesBien',function(){this._json={"a":"} ]","b":[1]};\nfoo();`;
    expect(readScriptJson(html, 'DonneesBien')).toEqual({ a: '} ]', b: [1] });
  });

  it('rend undefined sans le script', () => {
    expect(readScriptJson('<html></html>', 'allProduits')).toBeUndefined();
  });
});

describe('parseListPage', () => {
  const { items, warnings } = parseListPage(LISTE, 'AFEDIM');
  const nice = items?.find((item) => item.listing.sourceRef === '0028370')?.listing;

  it('lit les cinq biens du département, autant qu’annoncé', () => {
    expect(items).toHaveLength(5);
    expect(announcedCount(LISTE)).toBe(5);
    expect(warnings).toEqual([]);
    expect(items?.map((item) => item.citySlug).sort()).toEqual([
      'la-trinite',
      'le-cannet',
      'mouans-sartoux',
      'nice',
      'nice',
    ]);
  });

  it('tire de la liste loyer, surface, pièces, lieu et DPE', () => {
    expect(nice).toMatchObject({
      sourceUrl:
        'https://www.afedim.fr/fr/location/annonces/Appartement/nice-06/2-pieces/0028370/Fiche',
      title: 'Appartement 2 pièces à NICE',
      priceText: '824 € CC',
      areaText: '40.3 m²',
      roomsText: '2 pièces',
      propertyTypeText: 'Appartement',
      cityText: 'NICE',
      postalCodeText: '06100',
      latitude: 43.733285,
      furnishedText: 'Non meublé',
      publishedAtText: '2026-09-07T22:00:00.000Z',
      extra: { reference: '0028370', etage: '3', dpe: 'B' },
    });
    expect(nice?.imageUrls).toHaveLength(1);
  });

  it('laisse le DPE inconnu quand la liste ne le donne pas', () => {
    const sansDpe = items?.find((item) => item.listing.sourceRef === '0070421')?.listing;
    expect(sansDpe?.extra?.['dpe']).toBeUndefined();
  });

  it('distingue une page changée d’un stock vide', () => {
    expect(parseListPage('<html><body></body></html>', 'AFEDIM').items).toBeNull();
    const vide = `$dv.I('C:AllProduitsScript.allProduits',function(){this._json=[];`;
    expect(parseListPage(vide, 'AFEDIM').items).toEqual([]);
  });
});

describe('parseFicheUrl et floorOf', () => {
  it('lit commune, département et référence', () => {
    expect(
      parseFicheUrl('/fr/location/annonces/Appartement/la-trinite-06/2-pieces/0061649/Fiche'),
    ).toEqual({ citySlug: 'la-trinite', department: '06', reference: '0061649' });
    expect(parseFicheUrl('/fr/louer.html')).toBeNull();
  });

  it('rend l’étage en chiffre', () => {
    expect(floorOf('3ème étage')).toBe('3');
    expect(floorOf('1er étage')).toBe('1');
    expect(floorOf('Rez-de-chaussée')).toBe('0');
    expect(floorOf(null)).toBeUndefined();
  });
});

describe('parseDetail', () => {
  const detail = parseDetail(SUSPENDUE, '0028370');

  it('apprend adresse, texte entier, charges, conditions et photos', () => {
    expect(detail).toMatchObject({
      title: 'SUNSET VILLA - Appartement - 2 pièces',
      addressText: '439 AVENUE DE PESSICART',
      chargesText: '120 €',
      depositText: '704 €',
      // 406 € de location et 122 € d'état des lieux.
      feesText: '528 €',
      availableAtText: 'Disponible dès le 05/10/2026',
      phoneText: '0 809 102 880',
    });
    expect(detail?.description?.startsWith('A Nice, nous vous proposons')).toBe(true);
    expect(detail?.description).toContain('\n');
    expect(detail?.imageUrls).toHaveLength(3);
    expect(detail?.extra).toMatchObject({
      reference: '0028370',
      dpe: 'B',
      ges: 'B',
      etage: '3',
      ascenseur: '1',
      loyerHorsCharges: '704 €',
      plafondRessources: 'oui',
    });
    expect(detail?.extra?.['features']).toContain('Location soumise à un plafond de ressources');
  });

  it('additionne honoraires de location et d’état des lieux', () => {
    expect(parseDetail(OUVERTE, '0070421')).toMatchObject({
      depositText: '762 €',
      feesText: '546 €',
    });
  });

  it('ne reprend pas le loyer : la mémoire des fiches le figerait', () => {
    expect(detail?.priceText).toBeUndefined();
  });

  it('lit l’état de la candidature en ligne', () => {
    expect(detail?.extra?.['applicationStatus']).toBe('full');
    expect(parseDetail(OUVERTE, '0070421')?.extra?.['applicationStatus']).toBe('open');
  });

  it('laisse le DPE et le GES inconnus quand la fiche n’en a pas', () => {
    expect(parseDetail(OUVERTE, '0070421')?.extra?.['dpe']).toBeUndefined();
    expect(parseDetail(OUVERTE, '0070421')?.extra?.['ges']).toBeUndefined();
  });

  it('rend null pour une autre référence ou une page « bien non trouvé »', () => {
    expect(parseDetail(OUVERTE, '0028370')).toBeNull();
    expect(parseDetail('<html><body>Bien non trouvé</body></html>', '0028370')).toBeNull();
  });

  it('se normalise, liste et fiche réunies, en une annonce complète', () => {
    const liste = parseListPage(LISTE, 'AFEDIM').items?.find(
      (item) => item.listing.sourceRef === '0028370',
    )?.listing;
    if (liste === undefined || detail === null) throw new Error('fixture incomplète');
    const draft = Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== undefined));
    const annonce = normalizeListing(
      { ...liste, ...draft, extra: { ...liste.extra, ...detail.extra } },
      { sourceId: 'afedim', nowMs: Date.parse('2026-09-14T10:00:00Z') },
    );
    expect(annonce?.price).toBe(824);
    expect(annonce?.chargesIncluded).toBe(true);
    expect(annonce?.charges).toBe(120);
    expect(annonce?.area).toBe(40.3);
    expect(annonce?.rooms).toBe(2);
    expect(annonce?.propertyType).toBe('apartment');
    expect(annonce?.furnished).toBe(false);
    expect(annonce?.dpe).toBe('B');
    expect(annonce?.city?.toLowerCase()).toBe('nice');
    expect(annonce?.availableAt?.slice(0, 10)).toBe('2026-10-05');
    expect(annonce?.contact.phone).toBeTruthy();
  });
});
