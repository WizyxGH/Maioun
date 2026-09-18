import { describe, expect, it } from 'vitest';
import { ALERT_SENDER_MATCHES } from '@maioun/shared';
import { expediteursSuivis, fragmentsDeRecherche, vientDUnPortail } from './senders.js';

const fragments = (...agences: { email?: string | null; nom?: string | null }[]): string[] => [
  ...fragmentsDeRecherche(expediteursSuivis(agences)),
];

describe('expediteursSuivis', () => {
  it('garde les portails même sans aucune agence', () => {
    expect(fragments()).toEqual([...ALERT_SENDER_MATCHES]);
  });

  it('suit le domaine entier d’une agence qui a son propre nom de domaine', () => {
    const suivis = fragments({ email: 'Contact <LOCATION@agence-test.invalid>', nom: 'Agence T' });
    expect(suivis).toContain('agence-test.invalid');
    expect(suivis).not.toContain('location@agence-test.invalid');
  });

  /**
   * Le garde-fou central : `gmail.com` dans la liste, et la recherche IMAP
   * descend la correspondance privée hébergée là.
   */
  it('ne suit une messagerie grand public que par l’adresse entière', () => {
    const suivis = fragments(
      { email: 'agence.exemple@gmail.com' },
      { email: 'gerance@orange.fr' },
      { email: 'location@wanadoo.fr' },
    );
    expect(suivis).toContain('agence.exemple@gmail.com');
    expect(suivis).toContain('gerance@orange.fr');
    expect(suivis).toContain('location@wanadoo.fr');
    expect(suivis).not.toContain('gmail.com');
    expect(suivis).not.toContain('orange.fr');
    expect(suivis).not.toContain('wanadoo.fr');
  });

  it('n’ajoute rien pour une adresse illisible ou absente', () => {
    expect(fragments({ email: null }, { email: '  ' }, { email: 'pas-une-adresse' })).toEqual([
      ...ALERT_SENDER_MATCHES,
    ]);
  });

  it('ne réinscrit pas une agence déjà couverte par un portail', () => {
    expect(fragments({ email: 'annonces@seloger.com' })).toEqual([...ALERT_SENDER_MATCHES]);
  });

  it('ne double pas une adresse dont le domaine est déjà suivi', () => {
    const suivis = fragments(
      { email: 'contact@agence-test.invalid' },
      { email: 'julie@agence-test.invalid' },
    );
    expect(suivis.filter((f) => f.includes('agence-test.invalid'))).toEqual([
      'agence-test.invalid',
    ]);
  });

  /** Le domaine de l'utilisateur dans la liste ouvrirait sa boîte entière. */
  it('refuse ce que l’appelant interdit explicitement', () => {
    const suivis = fragmentsDeRecherche(
      expediteursSuivis([{ email: 'moi@mon-domaine.invalid' }], {
        jamais: ['mon-domaine.invalid'],
      }),
    );
    expect(suivis).toEqual([...ALERT_SENDER_MATCHES]);
  });

  it('rend un ordre stable quel que soit l’ordre des agences', () => {
    const a = fragments({ email: 'a@b-immo.invalid' }, { email: 'c@d-immo.invalid' });
    const b = fragments({ email: 'c@d-immo.invalid' }, { email: 'a@b-immo.invalid' });
    expect(a).toEqual(b);
  });

  it('dit d’où vient chaque expéditeur', () => {
    const suivis = expediteursSuivis([
      { email: 'contact@agence-test.invalid', nom: 'Agence Test' },
      { email: 'agence.exemple@gmail.com', nom: 'Agence Exemple' },
    ]);
    expect(suivis.find((s) => s.match === 'agence-test.invalid')).toMatchObject({
      origine: 'agence-domaine',
      label: 'Agence Test',
    });
    expect(suivis.find((s) => s.match === 'agence.exemple@gmail.com')).toMatchObject({
      origine: 'agence-adresse',
    });
  });
});

describe('vientDUnPortail', () => {
  it('reconnaît un portail et rejette une agence', () => {
    expect(vientDUnPortail('alertes@mail.seloger.com')).toBe(true);
    expect(vientDUnPortail('Agence <contact@agence-test.invalid>')).toBe(false);
    expect(vientDUnPortail(null)).toBe(false);
  });
});
