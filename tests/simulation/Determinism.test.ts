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

  it('3-minute full battle (3600 ticks, seed = 123456) with BOSS_ACT1 AI and Sprint 2 units produces 100% identical SHA-256 hash', { timeout: 30000 }, () => {
    const seed = 123456;
    const ticksToSimulate = 3600;

    function runBossBattle(): GameEngine {
      const engine = new GameEngine({
        seed,
        aiProfile: 'BOSS_ACT1',
        initialPlayerGold: 1000,
        initialEnemyGold: 200,
      });

      // Give high Citadel HP so battle runs the complete 3600 ticks for determinism comparison
      engine.citadels.PLAYER.currentHp = 50000;
      engine.citadels.ENEMY.currentHp = 50000;

      // Player builds structures covering all Sprint 2 lines
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      engine.buildStructure('PLAYER', 1, 'bldg_archery_1');
      engine.buildStructure('PLAYER', 2, 'bldg_stable_1');
      engine.buildStructure('PLAYER', 3, 'bldg_arcane_1');
      engine.buildStructure('PLAYER', 4, 'bldg_siege_1');

      for (let t = 0; t < ticksToSimulate; t++) {
        // Player upgrades structures across the battle
        if (t === 300) engine.upgradeStructure('PLAYER', 0); // Royal Knight
        if (t === 600) engine.upgradeStructure('PLAYER', 1); // Siege Crossbowman
        if (t === 900) engine.upgradeStructure('PLAYER', 2); // Dawn Paladin
        if (t === 1200) engine.upgradeStructure('PLAYER', 3); // Solar Archmage
        if (t === 1500) engine.upgradeStructure('PLAYER', 4); // Greek Fire Catapult

        if (t === 500 || t === 1000) {
          engine.upgradeMine('PLAYER');
        }

        engine.tick();
      }

      return engine;
    }

    const run1 = runBossBattle();
    const hash1 = run1.computeStateHash();
    const snap1 = run1.getSnapshot();

    const run2 = runBossBattle();
    const hash2 = run2.computeStateHash();
    const snap2 = run2.getSnapshot();

    expect(hash1).toBe(hash2);
    expect(snap1.tick).toBe(3600);
    expect(snap1.citadels.PLAYER.currentHp).toBe(snap2.citadels.PLAYER.currentHp);
    expect(snap1.citadels.ENEMY.currentHp).toBe(snap2.citadels.ENEMY.currentHp);
    expect(snap1.economy.PLAYER.gold).toBe(snap2.economy.PLAYER.gold);
    expect(snap1.economy.ENEMY.gold).toBe(snap2.economy.ENEMY.gold);
    expect(snap1.units.length).toBe(snap2.units.length);
    expect(snap1.units).toEqual(snap2.units);
    expect(snap1.hazards.length).toBe(snap2.hazards.length);
    expect(snap1.hazards).toEqual(snap2.hazards);
  });
});

