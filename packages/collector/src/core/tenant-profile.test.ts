/**
 * D'où vient le profil qui compose les messages envoyés aux agences.
 *
 * Ces tests existent parce qu'une divergence ne se voyait pas : l'écran écrit
 * dans la base, la commande de brouillons lisait un fichier local, et un
 * fichier rempli mais périmé produisait des brouillons portant un ancien
 * téléphone sans qu'aucune erreur ne soit levée. Le second domicile a été
 * supprimé ; ce qui reste à vérifier, c'est que la lecture de la base ne prend
 * jamais du vide pour un profil.
 */

import { describe, expect, it } from 'vitest';
import type { TenantProfile } from '@maioun/shared';
import { resolveTenantProfile, type ProfileReader } from './tenant-profile.js';

const reader = (value: string | null): ProfileReader => ({
  readSettingFor: () => Promise.resolve(value),
});

const profil = (firstName: string): TenantProfile =>
  ({ firstName, lastName: 'Durand', guarantors: [] }) as unknown as TenantProfile;

describe('provenance du profil locataire', () => {
  it('lit le profil réglé depuis l’écran', async () => {
    const resolved = await resolveTenantProfile(reader(JSON.stringify(profil('Écran'))));
    expect(resolved.profile?.firstName).toBe('Écran');
    expect(resolved.storedUnreadable).toBe(false);
  });

  it('rend `null` quand rien n’a été réglé', async () => {
    for (const vide of [null, '', '   ']) {
      const resolved = await resolveTenantProfile(reader(vide));
      expect(resolved.profile).toBeNull();
      expect(resolved.storedUnreadable).toBe(false);
    }
  });

  it('signale une valeur ILLISIBLE au lieu de la taire', async () => {
    // Sans ce drapeau, la commande dirait « profil non renseigné » à quelqu'un
    // qui a bel et bien rempli l'écran — et il chercherait au mauvais endroit.
    const resolved = await resolveTenantProfile(reader('{ceci n’est pas du json'));
    expect(resolved.storedUnreadable).toBe(true);
    expect(resolved.profile).toBeNull();
  });

  it('ne prend pas du JSON valide mais vide pour un profil', async () => {
    // « null » et « [] » se parsent sans erreur et ne portent aucun profil.
    for (const bidon of ['null', '[]', '"texte"']) {
      const resolved = await resolveTenantProfile(reader(bidon));
      expect(resolved.storedUnreadable).toBe(true);
      expect(resolved.profile).toBeNull();
    }
  });
});
