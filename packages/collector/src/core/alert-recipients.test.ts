import { describe, expect, it } from 'vitest';
import {
  acceptsRecipients,
  addressesIn,
  forwardingToken,
  tokenFromAddress,
} from './alert-recipients.js';

const TEMPLATE = 'alertes+{token}@exemple.invalid';

describe('tokenFromAddress', () => {
  it('lit le jeton du sous-adressage', () => {
    expect(tokenFromAddress('alertes+a1b2c3@exemple.invalid', TEMPLATE)).toBe('a1b2c3');
    // La casse d'une adresse n'a pas de sens : on compare en minuscules.
    expect(tokenFromAddress('Alertes+A1B2C3@Exemple.Invalid', TEMPLATE)).toBe('a1b2c3');
  });

  /**
   * C'EST UNE PORTE, PAS UNE ÉTIQUETTE. La boîte du projet reçoit tout ce qu'on
   * lui envoie ; accepter une adresse voisine reviendrait à laisser n'importe
   * qui déverser des annonces dans la base commune.
   */
  it('refuse tout ce qui n’est pas exactement le gabarit', () => {
    expect(tokenFromAddress('alertes@exemple.invalid', TEMPLATE)).toBeNull();
    expect(tokenFromAddress('alertes+@exemple.invalid', TEMPLATE)).toBeNull();
    expect(tokenFromAddress('alertes+jeton@autre.invalid', TEMPLATE)).toBeNull();
    expect(tokenFromAddress('bonjour+jeton@exemple.invalid', TEMPLATE)).toBeNull();
    // Un jeton doit ressembler à un jeton : pas d'adresse imbriquée.
    expect(tokenFromAddress('alertes+a@b.c@exemple.invalid', TEMPLATE)).toBeNull();
  });

  it('refuse un gabarit sans emplacement pour le jeton', () => {
    expect(tokenFromAddress('alertes@exemple.invalid', 'alertes@exemple.invalid')).toBeNull();
  });
});

describe('addressesIn', () => {
  it('extrait les adresses d’un en-tête, forme longue comprise', () => {
    expect(addressesIn('Maïoun <alertes+abc@exemple.invalid>, autre@ex.invalid')).toEqual([
      'alertes+abc@exemple.invalid',
      'autre@ex.invalid',
    ]);
    expect(addressesIn(null)).toEqual([]);
    expect(addressesIn('')).toEqual([]);
  });
});

describe('forwardingToken', () => {
  it('retient le premier destinataire qui porte un jeton', () => {
    expect(forwardingToken(['moi@laposte.invalid', 'alertes+xyz@exemple.invalid'], TEMPLATE)).toBe(
      'xyz',
    );
  });

  it('rend null quand aucun destinataire ne correspond', () => {
    expect(forwardingToken(['moi@laposte.invalid'], TEMPLATE)).toBeNull();
  });
});

describe('acceptsRecipients', () => {
  /**
   * TANT QUE RIEN N'EST CONFIGURÉ, RIEN N'EST EXIGÉ. Refuser tout faute de
   * gabarit couperait l'import chez qui lit simplement sa propre boîte — ce que
   * fait le collecteur depuis le début.
   */
  it('laisse tout passer sans gabarit', () => {
    expect(acceptsRecipients(['nimporte@qui.invalid'], '')).toBe(true);
    expect(acceptsRecipients([], '   ')).toBe(true);
  });

  it('n’accepte, avec gabarit, que ce qui lui est adressé', () => {
    expect(acceptsRecipients(['alertes+abc@exemple.invalid'], TEMPLATE)).toBe(true);
    expect(acceptsRecipients(['inconnu@exemple.invalid'], TEMPLATE)).toBe(false);
    expect(acceptsRecipients([], TEMPLATE)).toBe(false);
  });

  /**
   * POSER LE GABARIT NE DOIT RIEN COUPER. Les alertes déjà configurées chez les
   * portails visent l'adresse simple de la boîte : les refuser le jour où l'on
   * renseigne le gabarit ferait disparaître la source en silence.
   */
  it('accepte ce qui vise la boîte elle-même, sans jeton', () => {
    expect(
      acceptsRecipients(['alertes@exemple.invalid'], TEMPLATE, 'alertes@exemple.invalid'),
    ).toBe(true);
    expect(
      acceptsRecipients([' Alertes@Exemple.Invalid '], TEMPLATE, 'alertes@exemple.invalid'),
    ).toBe(true);
    expect(
      acceptsRecipients(['inconnu@exemple.invalid'], TEMPLATE, 'alertes@exemple.invalid'),
    ).toBe(false);
  });

  it('n’attribue aucun jeton à ce qui vise la boîte simple', () => {
    expect(forwardingToken(['alertes@exemple.invalid'], TEMPLATE)).toBeNull();
  });
});
