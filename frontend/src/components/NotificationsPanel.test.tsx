/**
 * L'historique des alertes, et son geste « tout marquer comme lu ».
 *
 * Le repère « non lue » ne vient pas d'un drapeau posé sur l'annonce : il se
 * DÉDUIT de la date d'alerte comparée à l'instant de la visite précédente.
 * C'est ce qui garantit que la pastille de la cloche et les lignes de la page
 * ne peuvent pas se contredire — mais cela veut dire qu'aucun test ne le
 * vérifie par accident.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsPanel } from './NotificationsPanel.js';
import { MOCK_LISTINGS } from '../api/mock-data.js';
import type { ListingView } from '../types.js';

const NOW = Date.parse('2026-09-05T18:00:00.000Z');

/**
 * Une alerte, bâtie sur une VRAIE fiche de démonstration.
 *
 * La ligne d'historique lit plus de champs qu'il n'y paraît — photo, adresse,
 * code postal, quartier, sources. Un objet bâti à la main en oublie toujours
 * un, et le test échoue alors pour une raison qui n'a rien à voir avec ce
 * qu'il vérifie.
 */
function alert(id: string, notifiedAt: string): ListingView {
  const base = MOCK_LISTINGS[0]!;
  return {
    ...base,
    id,
    title: { ...base.title, value: `Annonce ${id}` },
    notifiedAt,
  };
}

const LISTINGS = [
  alert('recente', '2026-09-05T17:00:00.000Z'),
  alert('ancienne', '2026-09-04T09:00:00.000Z'),
];

/** Instant de la visite précédente : hier midi. Une seule alerte est postérieure. */
const SEEN_AT = Date.parse('2026-09-04T12:00:00.000Z');

describe('tout marquer comme lu', () => {
  it('disparaît quand tout est déjà lu', () => {
    // Il est resté un temps grisé, pour qu'on sache qu'il existe. Mais un
    // bouton éteint occupe la place et l'œil sans rien offrir : on le lit, on
    // comprend qu'il ne sert pas, et on recommence à chaque visite. L'en-tête
    // dit déjà combien d'alertes sont en attente (décision du 2026-09-07).
    render(
      <NotificationsPanel
        listings={LISTINGS}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={NOW}
        onMarkAllRead={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /tout marquer comme lu/i })).toBeNull();
  });

  it('s’affiche dès qu’une alerte est non lue', () => {
    render(
      <NotificationsPanel
        listings={LISTINGS}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={SEEN_AT}
        onMarkAllRead={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /tout marquer comme lu/i })).toBeEnabled();
  });

  it('ne s’affiche pas au-dessus d’un historique vide', () => {
    render(
      <NotificationsPanel
        listings={[]}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={SEEN_AT}
        onMarkAllRead={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /tout marquer comme lu/i })).toBeNull();
  });

  it('apparaît dès qu’une alerte est arrivée depuis la dernière visite', () => {
    render(
      <NotificationsPanel
        listings={LISTINGS}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={SEEN_AT}
        onMarkAllRead={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /tout marquer comme lu/i })).toBeInTheDocument();
  });

  it('prévient l’appelant, à qui appartient la mémoire', async () => {
    const user = userEvent.setup();
    const onMarkAllRead = vi.fn();
    render(
      <NotificationsPanel
        listings={LISTINGS}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={SEEN_AT}
        onMarkAllRead={onMarkAllRead}
      />,
    );
    await user.click(screen.getByRole('button', { name: /tout marquer comme lu/i }));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  /**
   * MARQUER COMME LU N'EST PAS ÉCARTER. Écarter range la ligne hors de
   * l'historique ; marquer comme lu la laisse en place. C'est la distinction
   * qui justifie un bouton à côté du glissement, et non à sa place.
   */
  it('laisse les lignes dans l’historique', async () => {
    const user = userEvent.setup();
    render(
      <NotificationsPanel
        listings={LISTINGS}
        nowMs={NOW}
        onOpen={() => {}}
        seenAtMs={SEEN_AT}
        onMarkAllRead={() => {}}
      />,
    );
    // Le compteur de l'historique fait foi : la ligne n'affiche pas son titre,
    // mais un prix, une surface et un lieu.
    expect(screen.getByText('Historique (2)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tout marquer comme lu/i }));
    expect(screen.getByText('Historique (2)')).toBeInTheDocument();
  });

  it('sans geste fourni, aucun bouton n’est proposé', () => {
    render(
      <NotificationsPanel listings={LISTINGS} nowMs={NOW} onOpen={() => {}} seenAtMs={SEEN_AT} />,
    );
    expect(screen.queryByRole('button', { name: /tout marquer comme lu/i })).toBeNull();
  });
});
