import { describe, expect, it } from 'vitest';
import { alertAddress, ownsReadMailbox, readMailbox } from './alert-address.js';

const TEMPLATE = 'alertes+{token}@exemple.invalid';

describe('alertAddress', () => {
  it('place le jeton du compte dans le gabarit', () => {
    expect(alertAddress(TEMPLATE, 'a1b2c3d4e5f6a7b8c9')).toBe(
      'alertes+a1b2c3d4e5f6a7b8c9@exemple.invalid',
    );
  });

  /**
   * Une adresse fausse serait PIRE que pas d'adresse : l'utilisateur poserait
   * une règle de transfert vers le vide et attendrait des alertes qui ne
   * viendraient jamais. Rien ne le lui dirait — un transfert qui n'aboutit pas
   * ne fait aucun bruit.
   */
  it('ne rend rien plutôt qu’une adresse à moitié (§17)', () => {
    expect(alertAddress(undefined, 'jeton')).toBeNull();
    expect(alertAddress('  ', 'jeton')).toBeNull();
    expect(alertAddress(TEMPLATE, null)).toBeNull();
    expect(alertAddress(TEMPLATE, '')).toBeNull();
    // Un gabarit sans emplacement pour le jeton donnerait la MÊME adresse à
    // tout le monde : mieux vaut n'en donner aucune.
    expect(alertAddress('alertes@exemple.invalid', 'jeton')).toBeNull();
  });
});

/**
 * LE PLUS SIMPLE EST DE NE RIEN DEMANDER. Le propriétaire de la boîte que le
 * collecteur lit n'a aucune règle à poser : ses alertes y arrivent déjà. Lui
 * réclamer une adresse de transfert vers lui-même était le meilleur moyen de
 * faire passer la fonctionnalité pour compliquée.
 */
describe('readMailbox', () => {
  it('retire le sous-adressage pour rendre la boîte réelle', () => {
    expect(readMailbox('alertes+{token}@exemple.invalid')).toBe('alertes@exemple.invalid');
    expect(readMailbox('Alertes+{token}@Exemple.Invalid')).toBe('alertes@exemple.invalid');
  });

  it('rend la boîte telle quelle quand il n’y a pas de « + »', () => {
    expect(readMailbox('alertes@exemple.invalid')).toBe('alertes@exemple.invalid');
  });

  it('ne conclut rien d’un gabarit vide ou sans arobase', () => {
    expect(readMailbox(undefined)).toBeNull();
    expect(readMailbox('   ')).toBeNull();
    expect(readMailbox('pasdarobase')).toBeNull();
    expect(readMailbox('@exemple.invalid')).toBeNull();
  });
});

describe('ownsReadMailbox', () => {
  const TEMPLATE = 'alertes+{token}@exemple.invalid';

  it('reconnaît le compte qui EST la boîte lue', () => {
    expect(ownsReadMailbox(TEMPLATE, 'alertes@exemple.invalid')).toBe(true);
    // La casse et les espaces ne changent pas la boîte.
    expect(ownsReadMailbox(TEMPLATE, '  Alertes@Exemple.Invalid ')).toBe(true);
  });

  it('ne confond pas un autre compte avec elle', () => {
    expect(ownsReadMailbox(TEMPLATE, 'quelquun@exemple.invalid')).toBe(false);
    // Sa propre adresse de transfert n'est PAS la boîte : c'est ce qui
    // distingue son compte, pas ce qui reçoit tout.
    expect(ownsReadMailbox(TEMPLATE, 'alertes+abc@exemple.invalid')).toBe(false);
  });

  it('ne conclut rien sans gabarit ni sans adresse (§17)', () => {
    expect(ownsReadMailbox(undefined, 'alertes@exemple.invalid')).toBe(false);
    expect(ownsReadMailbox(TEMPLATE, null)).toBe(false);
    expect(ownsReadMailbox(TEMPLATE, '')).toBe(false);
  });
});
