/**
 * D'où vient le profil qui compose les messages envoyés aux agences.
 *
 * Ces tests existent parce que la divergence ne se voyait pas : l'écran écrit
 * dans `app_settings`, `pnpm draft` lisait le `.env`, et un `.env` rempli mais
 * périmé produisait des brouillons portant un ancien téléphone sans qu'aucune
 * erreur ne soit levée.
 */

import { describe, expect, it } from 'vitest';
import type { TenantProfile } from '@rentfinder/shared';
import { resolveTenantProfile, type ProfileReader } from './tenant-profile.js';

const reader = (value: string | null): ProfileReader => ({
  readSettingFor: () => Promise.resolve(value),
});

const profil = (firstName: string): TenantProfile =>
  ({ firstName, lastName: 'Durand', guarantors: [] }) as unknown as TenantProfile;

describe('provenance du profil locataire', () => {
  it('préfère l’application au `.env`, même quand les deux existent', async () => {
    // LE CŒUR DU SUJET. Les deux sont remplies et se contredisent : c'est
    // l'écran qui a raison, puisque c'est là qu'on croit avoir corrigé.
    const resolved = await resolveTenantProfile(reader(JSON.stringify(profil('Écran'))), () =>
      profil('Env'),
    );
    expect(resolved.source).toBe('application');
    expect(resolved.profile?.firstName).toBe('Écran');
  });

  it('retombe sur le `.env` quand la base est vide', async () => {
    // Une machine qui collecte sans que personne ait ouvert l'écran.
    const resolved = await resolveTenantProfile(reader(null), () => profil('Env'));
    expect(resolved.source).toBe('env');
    expect(resolved.storedUnreadable).toBe(false);
  });

  it('signale une valeur ILLISIBLE au lieu de la taire', async () => {
    // Sans le drapeau, la commande semblerait avoir lu l'application alors
    // qu'elle ne l'a pas pu — et l'utilisateur ne saurait pas que ses
    // corrections ne sont pas parties.
    const resolved = await resolveTenantProfile(reader('{ceci n’est pas du json'), () =>
      profil('Env'),
    );
    expect(resolved.storedUnreadable).toBe(true);
    expect(resolved.source).toBe('env');
  });

  it('ne prend pas du JSON valide mais vide pour un profil', async () => {
    // `"null"` et `"[]"` se parsent sans erreur et ne portent aucun profil.
    for (const bidon of ['null', '[]', '"texte"']) {
      const resolved = await resolveTenantProfile(reader(bidon), () => profil('Env'));
      expect(resolved.storedUnreadable).toBe(true);
      expect(resolved.profile?.firstName).toBe('Env');
    }
  });

  it('rend `null` quand aucune des deux sources ne dit rien', async () => {
    const resolved = await resolveTenantProfile(reader(null), () => null);
    expect(resolved.profile).toBeNull();
    expect(resolved.source).toBeNull();
  });
});
