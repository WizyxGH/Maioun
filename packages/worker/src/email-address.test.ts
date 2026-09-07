/**
 * Les adresses de ce fichier sont FABRIQUÉES pour éprouver la validation, et
 * plusieurs doivent porter un domaine précis — jetable, réservé, malformé —
 * sans quoi il n'y aurait rien à vérifier. Les lignes concernées portent donc
 * `secret-scan-ignore` : aucune ne désigne quiconque.
 */
import { describe, expect, it } from 'vitest';
import { emailProblem, normalizeEmail } from './email-address.js';

describe('normalizeEmail', () => {
  it('retire les espaces et abaisse la casse des DEUX côtés', () => {
    // La norme ne l'autorise qu'à droite de l'arobase ; aucun fournisseur ne
    // fait la distinction, et la garder créerait deux comptes là où
    // l'utilisateur croit n'en avoir qu'un.
    expect(normalizeEmail('  Jean.Dupont@Example.COM ')).toBe('jean.dupont@example.com');
  });
});

describe('emailProblem', () => {
  it('accepte ce que portent les vraies boîtes', () => {
    expect(emailProblem('jean.dupont@example.com')).toBeNull();
    expect(emailProblem('j+annonces@example.org')).toBeNull();
    expect(emailProblem('contact@sous.domaine.example.com')).toBeNull();
    expect(emailProblem('a1@b2.example.com')).toBeNull();
  });

  it('refuse ce qui ne peut recevoir aucun message', () => {
    expect(emailProblem('pasdarobase.example.com')).toBe('shape');
    expect(emailProblem('jean@sanspoint')).toBe('shape');
    expect(emailProblem('jean@example.f')).toBe('shape');
    expect(emailProblem('jean espace@example.com')).toBe('shape');
    expect(emailProblem('@example.com')).toBe('shape');
    expect(emailProblem(`${'a'.repeat(250)}@example.com`)).toBe('shape');
  });

  it('refuse les domaines RÉSERVÉS, qui n’existent pas sur Internet', () => {
    // Un compte créé là est un compte à qui l'on ne pourra jamais écrire —
    // donc un compte sans recours le jour où son mot de passe sera perdu.
    expect(emailProblem('jean@quelquepart.test')).toBe('shape'); // secret-scan-ignore
    expect(emailProblem('jean@quelquepart.invalid')).toBe('shape');
    expect(emailProblem('jean@serveur.local')).toBe('shape'); // secret-scan-ignore
  });

  it('refuse les boîtes jetables, SOUS-DOMAINES COMPRIS', () => {
    // Se contenter d'une égalité stricte se contournerait en une seconde.
    expect(emailProblem('truc@yopmail.com')).toBe('disposable'); // secret-scan-ignore
    expect(emailProblem('truc@mail.yopmail.com')).toBe('disposable'); // secret-scan-ignore
    expect(emailProblem('truc@mailinator.com')).toBe('disposable'); // secret-scan-ignore
    expect(emailProblem('truc@sharklasers.com')).toBe('disposable'); // secret-scan-ignore
  });

  it('ne confond pas un domaine légitime avec un domaine jetable', () => {
    // `montempmail.example` n'est pas `tempmail.com` : le suffixe doit tomber
    // sur une frontière de domaine, pas au milieu d'un nom.
    expect(emailProblem('jean@montempmail.example.com')).toBeNull();
    expect(emailProblem('jean@notyopmail.example.com')).toBeNull();
  });
});
