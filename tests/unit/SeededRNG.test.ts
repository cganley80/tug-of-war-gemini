import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../../src/core/prng/SeededRNG';

describe('SeededRNG (Mulberry32 PRNG)', () => {
  it('generates deterministic float sequences given the same seed', () => {
    const rng1 = new SeededRNG(123456);
    const rng2 = new SeededRNG(123456);

    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('generates integers within inclusive [min, max] bounds', () => {
    const rng = new SeededRNG(999);
    const min = 150;
    const max = 450;

    for (let i = 0; i < 200; i++) {
      const val = rng.nextInt(min, max);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('restores state reliably via getState and setState', () => {
    const rng = new SeededRNG(777);

    // Advance 25 steps
    for (let i = 0; i < 25; i++) {
      rng.next();
    }

    const savedState = rng.getState();
    const nextThree1 = [rng.next(), rng.next(), rng.next()];

    // Restore state
    rng.setState(savedState);
    const nextThree2 = [rng.next(), rng.next(), rng.next()];

    expect(nextThree1).toEqual(nextThree2);
  });
});
