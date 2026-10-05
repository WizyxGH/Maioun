/**
 * Le lien du dossier part dans des messages adressés à des agences : accepter
 * n'importe quelle adresse ferait de l'application un relais d'hameçonnage, au
 * nom de l'utilisateur.
 */

import { describe, expect, it } from 'vitest';
import { dossierFacileLink } from './dossier-facile.js';

describe('dossierFacileLink', () => {
  it('accepte le domaine officiel et ses sous-domaines', () => {
    expect(dossierFacileLink('https://www.dossierfacile.logement.gouv.fr/file/abc123')).toBe(
      'https://www.dossierfacile.logement.gouv.fr/file/abc123',
    );
    expect(dossierFacileLink('https://dossierfacile.logement.gouv.fr/')).toBe(
      'https://dossierfacile.logement.gouv.fr/',
    );
  });

  it('REFUSE un domaine qui imite l’officiel', () => {
    // Le piège classique : le domaine officiel en préfixe d'un autre.
    expect(
      dossierFacileLink('https://dossierfacile.logement.gouv.fr.exemple.invalid/f'),
    ).toBeNull();
    expect(dossierFacileLink('https://dossierfacile-logement-gouv.fr/file/abc')).toBeNull();
    expect(dossierFacileLink('https://exemple.invalid/dossierfacile.logement.gouv.fr')).toBeNull();
  });

  /**
   * LES BONNES ADRESSES PASSENT TOUTES, sous la forme qu'on enverra. Un vrai
   * dossier collé sans schéma, en clair, ou sous l'alias du service était
   * déclaré « pas une adresse DossierFacile ».
   */
  it('accepte le lien de partage tel que le service le donne', () => {
    const lien =
      'https://locataire.dossierfacile.logement.gouv.fr/public-file/960bfa5b-065b-4263-878c-048dacf7de17';
    expect(dossierFacileLink(lien)).toBe(lien);
    expect(dossierFacileLink(lien.replace('public-file', 'file'))).toBe(
      lien.replace('public-file', 'file'),
    );
  });

  it('ramène l’alias dossierfacile.fr au domaine officiel', () => {
    expect(dossierFacileLink('https://locataire.dossierfacile.fr/file/abc')).toBe(
      'https://locataire.dossierfacile.logement.gouv.fr/file/abc',
    );
    expect(dossierFacileLink('https://dossierfacile.fr/')).toBe(
      'https://dossierfacile.logement.gouv.fr/',
    );
  });

  it('accepte un lien collé sans https://, et le complète', () => {
    expect(dossierFacileLink('locataire.dossierfacile.logement.gouv.fr/file/abc')).toBe(
      'https://locataire.dossierfacile.logement.gouv.fr/file/abc',
    );
  });

  it('réécrit en HTTPS un lien en clair : ce qui part n’est jamais en clair', () => {
    expect(dossierFacileLink('http://www.dossierfacile.logement.gouv.fr/file/abc')).toBe(
      'https://www.dossierfacile.logement.gouv.fr/file/abc',
    );
  });

  it('refuse l’alias quand il ne fait que préfixer un autre domaine', () => {
    expect(dossierFacileLink('https://dossierfacile.fr.exemple.invalid/file/abc')).toBeNull();
    expect(dossierFacileLink('https://faux-dossierfacile.fr/file/abc')).toBeNull();
  });

  it('refuse les adresses qui cachent un autre hôte ou un autre schéma', () => {
    // Identifiant dans l'adresse : un faux hôte affiché, pas une adresse e-mail.
    expect(dossierFacileLink('https://pirate@dossierfacile.logement.gouv.fr/')).toBeNull(); // secret-scan-ignore
    expect(dossierFacileLink('https://dossierfacile.logement.gouv.fr:8443/file/a')).toBeNull();
    expect(dossierFacileLink('javascript:alert(1)//dossierfacile.logement.gouv.fr')).toBeNull();
    expect(dossierFacileLink('ftp://dossierfacile.logement.gouv.fr/file/a')).toBeNull();
  });

  it('rend `null` sur le vide et sur ce qui n’est pas une adresse', () => {
    expect(dossierFacileLink('')).toBeNull();
    expect(dossierFacileLink('   ')).toBeNull();
    expect(dossierFacileLink(null)).toBeNull();
    expect(dossierFacileLink(undefined)).toBeNull();
    expect(dossierFacileLink('mon dossier')).toBeNull();
  });

  it('tolère les espaces autour, qu’un copier-coller ajoute', () => {
    expect(dossierFacileLink('  https://www.dossierfacile.logement.gouv.fr/file/x  ')).toBe(
      'https://www.dossierfacile.logement.gouv.fr/file/x',
    );
  });
});
