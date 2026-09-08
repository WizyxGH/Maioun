/**
 * LES ANNONCES BEP ARRIVAIENT SANS IMAGE, et c'est l'accès PAYÉ qui en
 * souffrait le plus : leur bulletin publie ses clichés en `http`, qu'un service
 * worker ne charge pas. Le relais existait pour l'écran ; les notifications
 * étaient restées sur l'URL brute.
 */

import { describe, expect, it } from 'vitest';
import { imagePayload, notificationImage } from './photo.js';

const AVEC_API = { API_URL: 'https://api.exemple.invalid' } as NodeJS.ProcessEnv;
const SANS_API = {} as NodeJS.ProcessEnv;

describe('notificationImage', () => {
  it('laisse passer une photo déjà en https', () => {
    const url = 'https://cdn.exemple.invalid/photo.jpg';
    expect(notificationImage(url, AVEC_API)).toBe(url);
  });

  it('fait passer une photo http par le relais', () => {
    const relayee = notificationImage('http://vieux-serveur.invalid/a.jpg', AVEC_API);
    expect(relayee).toBe(
      'https://api.exemple.invalid/api/photo?url=http%3A%2F%2Fvieux-serveur.invalid%2Fa.jpg',
    );
  });

  it('ne promet pas d’image sans Worker pour la relayer (§17)', () => {
    // Annoncer une image qui ne chargera jamais ne rend service à personne.
    expect(notificationImage('http://vieux-serveur.invalid/a.jpg', SANS_API)).toBeNull();
  });

  it('ne conclut rien d’une annonce sans photo', () => {
    expect(notificationImage(undefined, AVEC_API)).toBeNull();
    expect(notificationImage('', AVEC_API)).toBeNull();
  });

  it('supporte une adresse d’API terminée par une barre', () => {
    const relayee = notificationImage('http://x.invalid/a.jpg', {
      API_URL: 'https://api.exemple.invalid/',
    } as NodeJS.ProcessEnv);
    expect(relayee).toContain('https://api.exemple.invalid/api/photo?url=');
  });
});

describe('imagePayload', () => {
  it('n’ajoute aucune clé quand il n’y a rien à montrer', () => {
    // `{ image: undefined }` mettrait une clé sans valeur dans la charge utile.
    expect(Object.keys(imagePayload(undefined))).toEqual([]);
  });
});
