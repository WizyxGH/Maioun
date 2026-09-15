/**
 * Fiches Acropolis Immobilier (gabarit Apimo) : tout ce que la page publie,
 * relevé le 2026-09-15 sur deux annonces réelles, coordonnées d'agence
 * remplacées. Aucun accès réseau.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeListing } from '../../normalization/normalize.js';
import { parseDetailPage } from '../apimo/parser.js';

const FIXTURES = join(import.meta.dirname, '../../../../../tests/fixtures/acropolis-immo');
const NOW = Date.parse('2026-09-15T08:00:00.000Z');

function parse(file: string, url: string) {
  const { listing } = parseDetailPage(readFileSync(join(FIXTURES, file), 'utf8'), url, 'Acropolis');
  if (listing === null) throw new Error(`fiche illisible : ${file}`);
  return {
    raw: listing,
    normalized: normalizeListing(listing, { sourceId: 'acropolis-immo', nowMs: NOW }),
  };
}

describe('fiche 3 pièces (étiquette DPE récente)', () => {
  const { raw, normalized } = parse(
    'fiche-3-pieces.html',
    'https://acropolisimmo.com/fr/propriete/location+appartement+nice+liberation-miollis-3-pieces+86820474',
  );

  it('lit les montants des mentions légales', () => {
    expect(normalized?.price).toBe(820);
    expect(normalized?.charges).toBe(60);
    expect(normalized?.deposit).toBe(820);
    // Honoraires 620 € + état des lieux 143,04 €.
    expect(normalized?.tenantFees).toBe(763.04);
  });

  it('compte deux chambres, pas une par ligne du bloc Surfaces', () => {
    expect(normalized?.rooms).toBe(3);
    expect(normalized?.bedrooms).toBe(2);
    expect(normalized?.area).toBe(47.68);
  });

  it('lit la classe énergie dans le SVG, l’étage et les prestations', () => {
    expect(normalized?.dpe).toBe('D');
    expect(normalized?.features).toEqual(expect.arrayContaining(['1e étage', 'Ascenseur']));
    expect(raw.extra?.['features']).toContain('Prestations : Double vitrage, Ascenseur');
    expect(raw.extra?.['features']).not.toContain('Charges comprises');
  });

  it('garde la référence affichée par l’agence', () => {
    expect(normalized?.contact.reference).toBe('86820474');
  });
});

describe('fiche studio (ancienne étiquette DPE)', () => {
  const { normalized } = parse(
    'fiche-studio-ancien-dpe.html',
    'https://acropolisimmo.com/fr/propriete/location+appartement+nice+armee-des-alpes-studio-meuble+850900',
  );

  it('situe 203 kWh/m² dans la tranche « 151 - 230 » imprimée', () => {
    expect(normalized?.dpe).toBe('D');
  });

  it('lit dépôt, honoraires et ascenseur', () => {
    expect(normalized?.deposit).toBe(1100);
    expect(normalized?.tenantFees).toBe(337.27);
    expect(normalized?.bedrooms).toBeNull();
    expect(normalized?.features).toContain('Ascenseur');
  });
});
