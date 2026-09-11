import { describe, expect, it } from 'vitest';
import { ONE_SHOT_SOURCES } from '@maioun/shared';
import { ALL_SCRAPERS } from './index.js';

describe('ONE_SHOT_SOURCES', () => {
  it('suit les descripteurs : une source ajoutée ou retirée doit s’y refléter', () => {
    const declared = ALL_SCRAPERS.filter((s) => s.descriptor.oneShotListings === true)
      .map((s) => s.descriptor.id)
      .sort();
    expect([...ONE_SHOT_SOURCES].sort()).toEqual(declared);
  });
});
