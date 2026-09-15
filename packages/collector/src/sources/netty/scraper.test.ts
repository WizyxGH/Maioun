import { describe, expect, it } from 'vitest';
import { makeNettyDescriptor } from './scraper.js';

const BASE = {
  id: 'netty-test',
  name: 'Agence Test',
  domain: 'exemple.fr',
  sitemapUrl: 'https://www.exemple.fr/sitemap.xml',
  citySlugs: ['nice'],
};

describe('makeNettyDescriptor', () => {
  it('transmet les coordonnées de l’agence au descripteur', () => {
    const agencyContact = {
      phone: '04 00 00 00 00', // secret-scan-ignore
      address: { street: '1 rue de Test', postalCode: '06000', city: 'Nice' },
    };
    expect(makeNettyDescriptor({ ...BASE, agencyContact }).agencyContact).toEqual(agencyContact);
  });

  it('n’ajoute pas de clé vide quand l’agence n’en donne pas', () => {
    expect('agencyContact' in makeNettyDescriptor(BASE)).toBe(false);
  });
});
