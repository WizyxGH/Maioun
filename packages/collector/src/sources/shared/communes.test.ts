/**
 * La fabrique des slugs de commune : les règles, les exceptions, et le fait
 * que le périmètre reste le même quelle que soit l'écriture demandée.
 */

import { describe, expect, it } from 'vitest';
import {
  NICE_AREA_SLUGS,
  PERIMETER_COMMUNES,
  portalCommuneSlugs,
  portalCommunes,
} from './communes.js';

describe('le périmètre', () => {
  it('compte treize communes, Nice d’abord', () => {
    expect(PERIMETER_COMMUNES).toHaveLength(13);
    expect(NICE_AREA_SLUGS[0]).toBe('nice');
  });

  it('n’écrit les slugs canoniques ni en accents ni en apostrophes', () => {
    for (const slug of NICE_AREA_SLUGS) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('donne à chaque commune un code postal du département', () => {
    for (const commune of PERIMETER_COMMUNES) expect(commune.postalCode).toMatch(/^06\d{3}$/);
  });

  it('ne nomme jamais deux fois la même commune', () => {
    expect(new Set(NICE_AREA_SLUGS).size).toBe(NICE_AREA_SLUGS.length);
  });
});

describe('portalCommunes', () => {
  it('rend les slugs canoniques quand le portail écrit comme nous', () => {
    expect(portalCommuneSlugs()).toEqual(NICE_AREA_SLUGS);
  });

  it('colle le code postal quand le portail en attend un', () => {
    const slugs = portalCommuneSlugs({ withPostalCode: true });
    expect(slugs).toContain('cagnes-sur-mer-06800');
    expect(slugs).toContain('nice-06000');
  });

  it('abrège « saint » en « st » quand le portail l’abrège', () => {
    const slugs = portalCommuneSlugs({ abbreviateSaint: true });
    expect(slugs).toContain('st-laurent-du-var');
    expect(slugs).toContain('st-andre-de-la-roche');
    expect(slugs.filter((slug) => slug.startsWith('saint-'))).toEqual([]);
  });

  it('n’abrège que le mot entier : « sainte » n’est pas « saint »', () => {
    // La règle s'applique sur des mots entiers ; aucune commune du périmètre ne
    // s'appelle « Sainte-… » aujourd'hui, mais la règle doit tenir le jour où.
    const communes = portalCommunes({ abbreviateSaint: true });
    expect(communes.every((commune) => !commune.name.includes('sainte-'))).toBe(true);
  });

  it('laisse l’exception l’emporter sur la règle, code postal compris', () => {
    const communes = portalCommunes({
      abbreviateSaint: true,
      withPostalCode: true,
      exceptions: { 'saint-andre-de-la-roche': 'st-andre' },
    });
    const andre = communes.find((commune) => commune.commune === 'saint-andre-de-la-roche');
    expect(andre?.name).toBe('st-andre');
    expect(andre?.slug).toBe('st-andre-06730');
    // Les autres communes ne bougent pas pour autant.
    expect(communes.map((commune) => commune.slug)).toContain('st-laurent-du-var-06700');
  });

  it('écarte les communes demandées, et elles seules', () => {
    const slugs = portalCommuneSlugs({ omit: ['nice'] });
    expect(slugs).not.toContain('nice');
    expect(slugs).toHaveLength(NICE_AREA_SLUGS.length - 1);
  });

  it('garde le slug canonique sous la main, quelle que soit l’écriture', () => {
    // C'est lui qui permet de retrouver la commune du périmètre à partir d'une
    // réponse du portail, sans défaire l'abréviation.
    const communes = portalCommunes({ abbreviateSaint: true, withPostalCode: true });
    expect(communes.map((commune) => commune.commune)).toEqual(NICE_AREA_SLUGS);
  });

  it('garde l’ordre de collecte, Nice en tête', () => {
    expect(portalCommuneSlugs({ withPostalCode: true })[0]).toBe('nice-06000');
  });
});
