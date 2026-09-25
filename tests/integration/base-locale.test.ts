/**
 * QUELLE BASE LOCALE `pnpm query --local` LIT.
 *
 * Il ne connaissait que le miroir, et refusait donc la base que `pnpm local`
 * venait de remplir — la seule disponible la semaine où le quota Turso est
 * épuisé, puisque l'export l'est avec le reste. « Aucun miroir local. Tirez-en
 * un » : impossible, justement.
 *
 * L'ordre doit rester celui de `serve.ts` et de `dump.ts` : lire une base et en
 * servir une autre est la façon la plus sûre de conclure de travers.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — script Node en JavaScript, sans déclaration de types.
import { baseLocale, cheminLocal, cheminMiroir } from '../../packages/collector/scripts/env.mjs';

type Choix = { chemin: string; nom: string; url: string } | null;

const choisir = (
  presents: readonly string[],
  env: Record<string, string | undefined> = {},
): Choix =>
  (baseLocale as (e: unknown, existe: (c: string) => boolean) => Choix)(env, (chemin) =>
    presents.includes(chemin),
  );

const MIROIR = cheminMiroir as string;
const LOCAL = cheminLocal as string;

describe('baseLocale', () => {
  it('préfère le miroir quand les deux sont là', () => {
    expect(choisir([MIROIR, LOCAL])?.chemin).toBe(MIROIR);
  });

  // LE CAS QUI MANQUAIT : quota épuisé, aucun miroir possible, mais une base
  // remplie ici.
  it('se rabat sur la base collectée ici', () => {
    const choix = choisir([LOCAL]);
    expect(choix?.chemin).toBe(LOCAL);
    expect(choix?.nom).toMatch(/collectée ici/);
  });

  it('ne rend rien quand il n’y a rien à lire', () => {
    expect(choisir([])).toBeNull();
  });

  it('obéit à MAIOUN_LOCAL_DB, même si le miroir existe', () => {
    const choix = choisir([MIROIR, LOCAL], { MAIOUN_LOCAL_DB: 'data/local.db' });
    expect(choix?.chemin).toBe(LOCAL);
  });

  // Un miroir est une PHOTO de la production, `local.db` ce qu'on a collecté
  // ici : le nom doit les distinguer, sinon on conclut de l'un sur l'autre.
  it('nomme différemment le miroir et la base locale', () => {
    expect(choisir([MIROIR])?.nom).not.toBe(choisir([LOCAL])?.nom);
  });

  // « Ma%C3%AFoun » pour le « ï » du chemin : la liaison native de libsql ne le
  // redécode pas et rend « os error 123 ».
  it('rend une adresse file: sans percent-encodage ni barre inversée', () => {
    const url = choisir([LOCAL])?.url ?? '';
    expect(url.startsWith('file:')).toBe(true);
    expect(url).not.toMatch(/%[0-9A-F]{2}|\\/);
  });
});
