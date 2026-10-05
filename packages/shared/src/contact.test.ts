import { describe, expect, it } from 'vitest';
import { rangerCoordonnees } from './contact.js';

describe('rangerCoordonnees', () => {
  it('garde le principal et retire ses copies parmi les autres', () => {
    expect(rangerCoordonnees('a', ['b', 'a', null, 'b', 'c'])).toEqual({
      principal: 'a',
      autres: ['b', 'c'],
    });
  });

  it('promeut le premier autre quand le principal manque', () => {
    expect(rangerCoordonnees(null, [undefined, 'b', 'c'])).toEqual({
      principal: 'b',
      autres: ['c'],
    });
  });

  it("n'invente pas de liste vide", () => {
    expect(rangerCoordonnees('a', ['a', null])).toEqual({ principal: 'a' });
    expect(rangerCoordonnees(null, [])).toEqual({ principal: null });
  });
});
