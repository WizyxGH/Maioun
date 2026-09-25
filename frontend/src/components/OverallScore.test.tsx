/**
 * UN SEUL SCORE SE LIT, LES TROIS MESURES SE DÉPLIENT.
 *
 * La fiche montrait quatre scores à égalité de taille — « Correspondance 71 »,
 * « Urgence 48 », « Facilité de contact 60 », « Signaux d'alerte 12 » — sans
 * dire lequel regarder ni ce qu'il fallait en conclure. Et elle triait la
 * liste sur un CINQUIÈME chiffre qui ne s'affichait nulle part.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverallScore } from './Scores.js';
import { PRIORITY_HOT, PRIORITY_WORTH_SEEING } from '@maioun/shared';

describe('le score de la fiche', () => {
  it('affiche UN chiffre, sur cent, en tête', () => {
    render(<OverallScore value={64}>{null}</OverallScore>);
    expect(screen.getByText('64/100')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Score Maïoun' })).toBeInTheDocument();
  });

  /**
   * LE RANG PLUTÔT QUE LA NOTE. Mesuré le 2026-09-22 sur les 350 annonces
   * actives dans les critères : la meilleure est à 74 et la moyenne à 53.
   * « 53 sur 100 » se lit « médiocre » alors qu'il veut dire « au milieu de ce
   * qui existe ».
   */
  it('dit ce que le chiffre vaut PAR RAPPORT aux autres annonces', () => {
    render(<OverallScore value={PRIORITY_HOT}>{null}</OverallScore>);
    expect(screen.getByText(/tiers le mieux placé/)).toBeInTheDocument();
  });

  it('change de palier au seuil, et le nomme', () => {
    const { unmount } = render(<OverallScore value={PRIORITY_WORTH_SEEING}>{null}</OverallScore>);
    expect(screen.getByText(/À voir/)).toBeInTheDocument();
    unmount();
    render(<OverallScore value={PRIORITY_WORTH_SEEING - 1}>{null}</OverallScore>);
    expect(screen.getByText(/Dans la liste/)).toBeInTheDocument();
  });

  /**
   * UN SEUL DÉPLIANT SOUS LA NOTE. « Comment il est calculé » et « Ce qui a
   * fait ce score » se suivaient, chacun avec sa flèche : deux gestes pour une
   * seule question — d'où vient ce chiffre. Le barème a rejoint le détail, en
   * tête, parce qu'on ne comprend « 590 € ≤ 700 € de budget » qu'en sachant
   * que la correspondance pèse 30 %.
   */
  it('ne garde qu’un dépliant sous la note', () => {
    const { container } = render(<OverallScore value={64}>{null}</OverallScore>);
    expect(container.querySelectorAll('details')).toHaveLength(0);
    expect(screen.queryByText('Comment il est calculé')).toBeNull();
  });

  it('garde le détail des mesures sous le score', () => {
    render(
      <OverallScore value={64}>
        <p>Correspondance</p>
      </OverallScore>,
    );
    expect(screen.getByText('Correspondance')).toBeInTheDocument();
  });
});
