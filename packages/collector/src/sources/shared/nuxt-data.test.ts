import { describe, expect, it } from 'vitest';
import { readNuxtData, unflattenNuxtPayload } from './nuxt-data.js';

describe('unflattenNuxtPayload', () => {
  it('suit les indices, enveloppes réactives comprises', () => {
    const flat = [
      ['ShallowReactive', 1],
      { data: 2, count: 4 },
      ['Reactive', 3],
      { items: 5 },
      2,
      [6, 6],
    ];
    // Le même indice partagé donne la même valeur, ici `"a"` deux fois.
    flat.push('a');
    expect(unflattenNuxtPayload(flat)).toEqual({ data: { items: ['a', 'a'] }, count: 2 });
  });

  it('rend les valeurs spéciales et les types étiquetés', () => {
    const flat = [
      { nul: -2, absent: -1, date: 1, set: 2, map: 4 },
      ['Date', '2026-09-15T00:00:00.000Z'],
      ['Set', 3],
      'x',
      ['Map', 3, 5],
      7,
    ];
    expect(unflattenNuxtPayload(flat)).toEqual({
      nul: null,
      absent: undefined,
      date: '2026-09-15T00:00:00.000Z',
      set: ['x'],
      map: { x: 7 },
    });
  });

  it('tient sur une référence cyclique et ignore `__proto__`', () => {
    // JSON.parse garde `__proto__` comme clé ordinaire, comme le ferait la page.
    const flat: unknown = JSON.parse('[{"self":0,"__proto__":1},{"polluted":2},true]');
    const root = unflattenNuxtPayload(flat) as Record<string, unknown>;
    expect(root['self']).toBe(root);
    expect(Object.getPrototypeOf(root)).toBe(Object.prototype);
    expect(root['polluted']).toBeUndefined();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rend null sur ce qui n’est pas un tableau devalue', () => {
    expect(unflattenNuxtPayload({})).toBeNull();
    expect(unflattenNuxtPayload([])).toBeNull();
  });
});

describe('readNuxtData', () => {
  it('lit le script de la page, et null s’il manque ou se lit mal', () => {
    const page = (json: string) =>
      `<script type="application/json" data-nuxt-data="nuxt-app" id="__NUXT_DATA__">${json}</script>`;
    expect(readNuxtData(page('[{"a":1},"\\u003Cb>"]'))).toEqual({ a: '<b>' });
    expect(readNuxtData(page('[{'))).toBeNull();
    expect(readNuxtData('<html></html>')).toBeNull();
  });
});
