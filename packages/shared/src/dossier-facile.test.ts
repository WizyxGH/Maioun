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

  it('exige HTTPS : un lien en clair s’intercepte', () => {
    expect(dossierFacileLink('http://www.dossierfacile.logement.gouv.fr/file/abc')).toBeNull();
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
