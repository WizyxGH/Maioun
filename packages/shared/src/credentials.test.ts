/**
 * CE QUI COMPTE ICI N'EST PAS « ÇA CHIFFRE », mais ce que devient un secret
 * qu'on ne sait plus lire : il doit disparaître, pas revenir de travers.
 */

import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './credentials.js';

const CLE = 'une-cle-de-plateforme-tiree-au-hasard';

describe('encryptSecret / decryptSecret', () => {
  it('rend le secret à qui a la clé', async () => {
    const chiffre = await encryptSecret('mon-mot-de-passe-abonne', CLE);
    expect(await decryptSecret(chiffre, CLE)).toBe('mon-mot-de-passe-abonne');
  });

  it('ne laisse pas le secret en clair dans ce qu’il écrit', async () => {
    const chiffre = await encryptSecret('mon-mot-de-passe-abonne', CLE);
    expect(chiffre).not.toContain('mon-mot-de-passe-abonne');
  });

  it('chiffre deux fois différemment le même secret', async () => {
    // Le vecteur d'initialisation est tiré à chaque fois : deux colonnes
    // identiques trahiraient que deux comptes ont le même abonnement.
    const a = await encryptSecret('identique', CLE);
    const b = await encryptSecret('identique', CLE);
    expect(a).not.toBe(b);
  });

  it('refuse plutôt que de rendre n’importe quoi', async () => {
    const chiffre = await encryptSecret('secret', CLE);
    // Mauvaise clé : GCM authentifie, donc le déchiffrement échoue au lieu de
    // rendre une chaîne fausse dont on ne saurait rien (§17).
    expect(await decryptSecret(chiffre, 'une-autre-cle')).toBeNull();
    expect(await decryptSecret('pas-du-base64-!!', CLE)).toBeNull();
    expect(await decryptSecret('', CLE)).toBeNull();
  });

  it('détecte une valeur altérée en base', async () => {
    const chiffre = await encryptSecret('secret', CLE);
    const altere = `${chiffre.slice(0, -4)}AAAA`;
    expect(await decryptSecret(altere, CLE)).toBeNull();
  });
});
