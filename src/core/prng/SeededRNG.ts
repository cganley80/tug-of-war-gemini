/**
 * Deterministic Pseudo-Random Number Generator using the Mulberry32 algorithm.
 * Guarantees bit-by-bit identical sequences across any platform (Node, browser, workers).
 * Never relies on Math.random().
 */
export class SeededRNG {
  private state: number;

  /**
   * Initializes the PRNG with a 32-bit unsigned integer seed.
   * @param seed Numeric seed value
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Generates a pseudo-random floating-point number in the range [0, 1).
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic integer between min and max (inclusive).
   * @param min Inclusive minimum integer
   * @param max Inclusive maximum integer
   */
  public nextInt(min: number, max: number): number {
    const floorMin = Math.floor(min);
    const floorMax = Math.floor(max);
    if (floorMin > floorMax) {
      throw new Error(`min (${min}) cannot be greater than max (${max})`);
    }
    return floorMin + Math.floor(this.next() * (floorMax - floorMin + 1));
  }

  /**
   * Generates a deterministic floating-point number in the range [min, max).
   * @param min Minimum float
   * @param max Maximum float
   */
  public nextFloat(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Retrieves the current internal 32-bit state for serialization or snapshotting.
   */
  public getState(): number {
    return this.state;
  }

  /**
   * Restores the internal state for replay or deterministic branching.
   * @param state 32-bit unsigned integer state
   */
  public setState(state: number): void {
    this.state = state >>> 0;
  }
}
