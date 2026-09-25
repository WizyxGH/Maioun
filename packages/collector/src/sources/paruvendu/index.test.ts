/**
 * Le rattrapage de ParuVendu, et le plafond qui pourrait l'étouffer.
 *
 * Vingt fiches par passage, 221 annonces actives : onze cycles pour tout lire,
 * alors qu'une fiche se périme au bout d'une semaine — le rattrapage courait
 * après lui-même (relevé du 2026-09-25 : 20 fiches lues sur 221).
 *
 * LE PIÈGE N'EST PAS LE NOMBRE, C'EST LE BUDGET. Le descripteur borne les pages
 * d'un passage ; relever le plafond des fiches sans relever celui-là fait
 * couper `shouldStop()` au milieu, et le rattrapage rend la main sans avoir
 * rien rattrapé de plus. Aucun accès réseau ici.
 */

import { describe, expect, it } from 'vitest';
import { fichesParPassage, PARUVENDU_DESCRIPTOR } from './index.js';

describe('fichesParPassage', () => {
  it('lit tout le stock en rattrapage, un paquet en passage ordinaire', () => {
    expect(fichesParPassage('backfill')).toBeGreaterThan(fichesParPassage('live'));
    // 221 annonces actives au relevé : le rattrapage doit toutes les couvrir.
    expect(fichesParPassage('backfill')).toBeGreaterThanOrEqual(221);
  });

  it('laisse le budget de pages couvrir un rattrapage entier, listes comprises', () => {
    expect(PARUVENDU_DESCRIPTOR.budget.maxPagesPerRun).toBeGreaterThan(
      fichesParPassage('backfill'),
    );
  });
});
