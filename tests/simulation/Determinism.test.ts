import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { sha256Hex } from '../../src/core/hash/sha256';

describe('Bit-by-Bit Determinism & SHA-256 State Hash (GDD Section 7.3.2)', () => {
  it('SHA-256 implementation matches known NIST test vectors', () => {
    // Known NIST test vectors
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('3-minute battle (3600 ticks @ 20 TPS, seed = 123456) with active structures produces 100% identical SHA-256 state hash across independent runs', () => {
    const seed = 123456;
    const ticksToSimulate = 3600; // Exactly 3 minutes (180.0s) @ 20 TPS

    function runSimulation(): GameEngine {
      const engine = new GameEngine({
        seed,
        initialPlayerGold: 400,
        initialEnemyGold: 400,
      });

      // Ensure Citadels withstand the full 3600 ticks of heavy combat without early sudden-death
      engine.citadels.PLAYER.currentHp = 10000;
      engine.citadels.ENEMY.currentHp = 10000;

      // Active structures on both sides: Barracks and Archery
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      engine.buildStructure('PLAYER', 1, 'bldg_archery_1');
      engine.buildStructure('ENEMY', 0, 'bldg_barracks_1');
      engine.buildStructure('ENEMY', 1, 'bldg_archery_1');

      for (let t = 0; t < ticksToSimulate; t++) {
        // Scheduled upgrades and royal mines on both sides
        if (t === 200) {
          engine.upgradeMine('PLAYER');
          engine.upgradeMine('ENEMY');
        }
        if (t === 500) {
          // Upgrade Barracks N1 -> N2
          engine.upgradeStructure('PLAYER', 0);
          engine.upgradeStructure('ENEMY', 0);
        }
        if (t === 900) {
          // Upgrade Archery N1 -> N2
          engine.upgradeStructure('PLAYER', 1);
          engine.upgradeStructure('ENEMY', 1);
        }
        if (t === 1400) {
          // Upgrade Mine Level 2
          engine.upgradeMine('PLAYER');
          engine.upgradeMine('ENEMY');
        }

        engine.tick();
      }

      return engine;
    }

    // RUN 1
    const engine1 = runSimulation();
    const hash1 = engine1.computeStateHash();
    const snapshot1 = engine1.getSnapshot();

    // RUN 2
    const engine2 = runSimulation();
    const hash2 = engine2.computeStateHash();
    const snapshot2 = engine2.getSnapshot();

    // Verification of bit-by-bit determinism
    expect(hash1).toBe(hash2);
    expect(snapshot1.tick).toBe(3600);
    expect(snapshot1.timeSeconds).toBe(180);
    expect(snapshot1.citadels.PLAYER.currentHp).toBe(snapshot2.citadels.PLAYER.currentHp);
    expect(snapshot1.citadels.ENEMY.currentHp).toBe(snapshot2.citadels.ENEMY.currentHp);
    expect(snapshot1.economy.PLAYER.gold).toBe(snapshot2.economy.PLAYER.gold);
    expect(snapshot1.economy.ENEMY.gold).toBe(snapshot2.economy.ENEMY.gold);
    expect(snapshot1.units.length).toBe(snapshot2.units.length);
    expect(snapshot1.units.length).toBeGreaterThan(0);

    // Units must match exactly in order, IDs, coordinates, and current HP
    expect(snapshot1.units).toEqual(snapshot2.units);
    expect(snapshot1.stateHash).toBe(snapshot2.stateHash);
  });

  it('Standard citadel battle reaching resolution preserves exact determinism and end conditions', () => {
    const seed = 123456;
    const ticksToSimulate = 3600;

    function runSimulation(): GameEngine {
      const engine = new GameEngine({
        seed,
        initialPlayerGold: 400,
        initialEnemyGold: 400,
      });

      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      engine.buildStructure('PLAYER', 1, 'bldg_archery_1');
      engine.buildStructure('ENEMY', 0, 'bldg_barracks_1');
      engine.buildStructure('ENEMY', 1, 'bldg_archery_1');

      for (let t = 0; t < ticksToSimulate; t++) {
        if (t === 200) {
          engine.upgradeMine('PLAYER');
          engine.upgradeMine('ENEMY');
        }
        if (t === 500) {
          engine.upgradeStructure('PLAYER', 0);
          engine.upgradeStructure('ENEMY', 0);
        }
        engine.tick();
      }

      return engine;
    }

    const engine1 = runSimulation();
    const engine2 = runSimulation();

    expect(engine1.getTick()).toBe(engine2.getTick());
    expect(engine1.getIsGameOver()).toBe(engine2.getIsGameOver());
    expect(engine1.getWinner()).toBe(engine2.getWinner());
    expect(engine1.computeStateHash()).toBe(engine2.computeStateHash());
    expect(engine1.citadels.PLAYER.currentHp).toBe(engine2.citadels.PLAYER.currentHp);
    expect(engine1.citadels.ENEMY.currentHp).toBe(engine2.citadels.ENEMY.currentHp);
  });
});
