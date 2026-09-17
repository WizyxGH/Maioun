import { describe, expect, it } from 'vitest';
import { photoOrigin } from './photo-origin.js';

/**
 * PARUVENDU TRANSPORTE L'ADRESSE DE L'AGENCE DANS LA SIENNE. Tant qu'on lisait
 * son adresse à lui, aucune de ses 291 annonces illustrées ne partageait de
 * fichier avec le site de l'agence qui les lui confie.
 */
describe('photoOrigin', () => {
  it('rend le fichier de l’agence caché dans l’adresse du portail', () => {
    expect(
      photoOrigin(
        'https://img.paruvendu.fr/media_ext/_https_/media.agence.example.invalid/17/fe/' +
          'L2NhY2hlLzhmM2MyMWQwYWE0N2JiMTlfMmM3ZTViXzE2MDAtYmlnLmpwZz8yMDI2MDkxNw_rct' +
          '?func=crop&w=320&gravity=auto',
      ),
    ).toBe(
      'https://media.agence.example.invalid/cache/8f3c21d0aa47bb19_2c7e5b_1600-big.jpg?20260917',
    );
  });

  // Quelques hôtes sont servis sans préfixe de protocole.
  it('accepte une adresse sans préfixe de protocole', () => {
    expect(
      photoOrigin(
        'https://img.paruvendu.fr/media_ext/box.agence.example.invalid/5b/c3/' +
          'L3Bob3Rvcy80NDcxMjAzL2VudHJlZS1zdWQuanBn_rct?func=crop&w=320',
      ),
    ).toBe('https://box.agence.example.invalid/photos/4471203/entree-sud.jpg');
  });

  it('rend telle quelle une adresse qui n’enveloppe rien', () => {
    const directe = 'https://media.agence.example.invalid/cache/abc_1600-original.jpg';
    expect(photoOrigin(directe)).toBe(directe);
    expect(photoOrigin('pas une adresse')).toBe('pas une adresse');
  });

  /**
   * Un contenu qui se décode mais ne donne pas un chemin ne désigne rien :
   * mieux vaut garder l'adresse reçue qu'inventer une clé de rapprochement.
   */
  it('garde l’original quand le contenu décodé n’est pas un chemin', () => {
    const bancale =
      'https://img.paruvendu.fr/media_ext/_https_/h.example.invalid/aa/bb/Zm9vYmFy_rct';
    expect(photoOrigin(bancale)).toBe(bancale);
  });
});
