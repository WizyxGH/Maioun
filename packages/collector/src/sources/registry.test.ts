import { describe, expect, it } from 'vitest';
import { ALL_SCRAPERS } from './index.js';

// Une centaine de sources déclarées par configuration : un copier-coller raté
// donnerait deux sources au même identifiant, et l'une écraserait l'autre.
describe('ALL_SCRAPERS', () => {
  const descriptors = ALL_SCRAPERS.map((scraper) => scraper.descriptor);

  it('ne déclare jamais deux fois le même identifiant', () => {
    const ids = descriptors.map((d) => d.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('ne collecte jamais deux fois le même site d’agence', () => {
    const domains = descriptors
      .filter((d) => d.kind === 'localAgency' && d.domain !== undefined)
      .map((d) => d.domain);
    expect(domains.filter((domain, i) => domains.indexOf(domain) !== i)).toEqual([]);
  });

  it('pointe le logo d’une agence sur son propre site', () => {
    for (const d of descriptors) {
      if (d.logo === undefined || d.domain === undefined) continue;
      expect(new URL(d.logo).hostname.replace(/^www\./, ''), d.id).toBe(d.domain);
    }
  });
});
