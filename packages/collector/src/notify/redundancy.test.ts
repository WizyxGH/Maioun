import { describe, expect, it } from 'vitest';
import type { NotifiableListing } from '../db/repository.js';
import { dropRedundantNotifications } from './redundancy.js';

function listing(over: Partial<NotifiableListing> & { id: string }): NotifiableListing {
  return {
    title: null,
    price: 660,
    area: 29,
    rooms: 1,
    city: 'nice',
    postalCode: null,
    address: null,
    district: null,
    availableAt: null,
    actionPriority: 80,
    url: null,
    photoUrls: [],
    sourceId: 'savi-esteve',
    phone: null,
    ...over,
  };
}

const ids = (result: ReturnType<typeof dropRedundantNotifications>): string[] =>
  result.listings.map((l) => l.id);

/**
 * Deux photos de MorningCroissant : le MÊME fichier, servi sous deux entrées de
 * médiathèque. Aucune URL en commun, une seule et même galerie.
 */
const galerie = (mediaId: string): string[] => [
  `https://www.morningcroissant.fr/medialibrary/flats/${mediaId}/cache/crop.e7635649052c48f4bceea93ee9c23b02-14591_530x365.jpeg`,
  `https://www.morningcroissant.fr/medialibrary/flats/${mediaId}/cache/crop.6058aed8e0908ccadb7fd3a0575a8da8-14591_530x365.jpeg`,
];

describe('dropRedundantNotifications', () => {
  it('tait l’alerte e-mail quand une source directe est déjà en base', () => {
    const pending = [listing({ id: 'mail', sourceId: 'email-alerts', area: 29.4 })];
    // La clé arrondit la surface : 29,4 et 29 se rejoignent.
    expect(ids(dropRedundantNotifications(pending, new Set(['660|29|nice|1'])))).toEqual([]);
  });

  it('tait l’alerte e-mail quand la fiche directe arrive dans le MÊME lot', () => {
    // C'est le cas réel du 2026-09-03 : deux notifications à la même minute.
    const pending = [
      listing({ id: 'mail', sourceId: 'email-alerts', area: 29.4 }),
      listing({ id: 'direct', sourceId: 'savi-esteve', area: 29 }),
    ];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['direct']);
  });

  it('garde l’alerte e-mail quand aucune source directe ne décrit ce bien', () => {
    const pending = [listing({ id: 'mail', sourceId: 'email-alerts', price: 555 })];
    expect(ids(dropRedundantNotifications(pending, new Set(['660|29|nice|1'])))).toHaveLength(1);
  });

  it('rapproche aussi sans la ville — les e-mails ne la publient pas toujours', () => {
    const pending = [listing({ id: 'mail', sourceId: 'email-alerts', city: null })];
    expect(ids(dropRedundantNotifications(pending, new Set(['660|29|1'])))).toEqual([]);
  });

  it('ne tait JAMAIS deux fiches directes : elles peuvent être deux vrais biens', () => {
    const pending = [
      listing({ id: 'a', sourceId: 'citya' }),
      listing({ id: 'b', sourceId: 'fnaim' }),
    ];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['a', 'b']);
  });

  it('ne rapproche rien dans le vide : sans loyer ni surface, on notifie (§17)', () => {
    const pending = [listing({ id: 'mail', sourceId: 'email-alerts', price: null, area: null })];
    expect(ids(dropRedundantNotifications(pending, new Set(['660|29|nice|1'])))).toHaveLength(1);
  });
});

/**
 * L'ÉCHO D'UNE SOURCE SUR ELLE-MÊME. MorningCroissant publiait quatre annonces
 * à 590 € et 21 m², sous quatre titres, avec les mêmes vingt-deux photos : sans
 * ce filtre, quatre sonneries pour ce qui n'est, à l'écran, qu'une chose à
 * aller voir. Les quatre fiches restent entières — on ne fusionne rien.
 */
describe('dropRedundantNotifications, écho d’une même source', () => {
  const mc = (id: string, over: Partial<NotifiableListing> = {}): NotifiableListing =>
    listing({
      id,
      sourceId: 'morningcroissant',
      price: 590,
      area: 21,
      rooms: 1,
      photoUrls: galerie('499095'),
      ...over,
    });

  it('ne sonne qu’une fois pour quatre annonces à la même galerie', () => {
    const pending = [
      mc('30563'),
      mc('30567', { photoUrls: galerie('499185'), title: 'Studio à Nice' }),
      mc('30568', { photoUrls: galerie('499207'), title: 'Studio en résidence' }),
      mc('30569', { photoUrls: galerie('499231'), title: 'Studio à Nice' }),
    ];
    const result = dropRedundantNotifications(pending, new Set());
    expect(ids(result)).toEqual(['30563']);
    // Elles sont tues POUR la première : l'appelant ne les marquera signalées
    // que si cette première sonnerie part vraiment.
    expect(result.echoes).toEqual([
      { id: '30567', of: '30563' },
      { id: '30568', of: '30563' },
      { id: '30569', of: '30563' },
    ]);
  });

  it('sonne deux fois quand les galeries diffèrent, mêmes chiffres ou non', () => {
    const autre = [
      'https://www.morningcroissant.fr/medialibrary/flats/1/cache/crop.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-14591_530x365.jpeg',
      'https://www.morningcroissant.fr/medialibrary/flats/1/cache/crop.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-14591_530x365.jpeg',
    ];
    const pending = [mc('a'), mc('b', { photoUrls: autre })];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['a', 'b']);
  });

  it('sonne deux fois quand la galerie concorde mais pas les chiffres', () => {
    // Deux lots d'une résidence illustrés par les mêmes clichés d'ensemble :
    // ce sont deux logements, et deux loyers.
    const pending = [mc('a'), mc('b', { price: 720, photoUrls: galerie('499095') })];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['a', 'b']);
  });

  it('ne tait rien sur des noms de fichier qui ne désignent personne', () => {
    // « 1.jpg », « 2.jpg » : le gabarit de l'hébergeur, pas une galerie.
    const banal = ['https://exemple.invalid/a/1.jpg', 'https://exemple.invalid/b/2.jpg'];
    const pending = [mc('a', { photoUrls: banal }), mc('b', { photoUrls: banal })];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['a', 'b']);
  });

  it('ne tait rien sur une photo unique, ni sans photo du tout', () => {
    const seule = [galerie('499095')[0] as string];
    expect(
      ids(
        dropRedundantNotifications(
          [mc('a', { photoUrls: seule }), mc('b', { photoUrls: seule })],
          new Set(),
        ),
      ),
    ).toEqual(['a', 'b']);
    expect(
      ids(
        dropRedundantNotifications(
          [mc('a', { photoUrls: [] }), mc('b', { photoUrls: [] })],
          new Set(),
        ),
      ),
    ).toEqual(['a', 'b']);
  });

  it('ne rapproche pas DEUX SOURCES, même galerie : l’une peut mourir demain', () => {
    const pending = [mc('a'), mc('b', { sourceId: 'bienici', photoUrls: galerie('499095') })];
    expect(ids(dropRedundantNotifications(pending, new Set()))).toEqual(['a', 'b']);
  });
});
