import { describe, expect, it } from 'vitest';
import { directionsUrl } from './directions.js';
import type { StoredReferencePoint } from '@maioun/shared';

const TRAVAIL: StoredReferencePoint = {
  label: 'Travail',
  address: '12 rue de la République, 06300 Nice',
  mode: 'transit',
};

const LOGEMENT = '5 avenue Jean Médecin, 06000, Nice';

describe('lien d’itinéraire', () => {
  it('porte le point de référence comme ORIGINE et le logement comme destination', () => {
    const url = directionsUrl(LOGEMENT, TRAVAIL, 'transit');
    expect(url).toContain('origin=12+rue+de+la+R%C3%A9publique%2C+06300+Nice');
    expect(url).toContain('destination=5+avenue+Jean+M%C3%A9decin%2C+06000%2C+Nice');
  });

  it('traduit le mode de déplacement', () => {
    expect(directionsUrl(LOGEMENT, TRAVAIL, 'cycling')).toContain('travelmode=bicycling');
    expect(directionsUrl(LOGEMENT, TRAVAIL, 'transit')).toContain('travelmode=transit');
    expect(directionsUrl(LOGEMENT, TRAVAIL, 'walking')).toContain('travelmode=walking');
    expect(directionsUrl(LOGEMENT, TRAVAIL, 'driving')).toContain('travelmode=driving');
  });

  it('rend `null` quand une extrémité manque', () => {
    // Sans destination — l'annonce n'est située que par sa commune, et
    // `mapsQueryOf` rend alors une chaîne vide — ou sans point de référence, le
    // lien ouvrirait une carte inutile : mieux vaut ne pas le proposer (§17).
    expect(directionsUrl('', TRAVAIL, 'walking')).toBeNull();
    expect(directionsUrl('   ', TRAVAIL, 'walking')).toBeNull();
    expect(directionsUrl(LOGEMENT, undefined, 'walking')).toBeNull();
    expect(directionsUrl(LOGEMENT, { ...TRAVAIL, address: '  ' }, 'walking')).toBeNull();
  });
});
