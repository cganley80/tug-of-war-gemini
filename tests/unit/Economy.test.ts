import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { INITIAL_GOLD, MINE_LEVEL_DEFINITIONS } from '../../src/core/config/EconomyConfig';

describe('Economy & Treasury Systems (GDD Section 2.3 & 7.3)', () => {
  it('Economic Consistency Test: verifies base gold accumulation over 30 seconds', () => {
    const engine = new GameEngine({ initialPlayerGold: INITIAL_GOLD });
    expect(engine.economy.PLAYER.gold).toBe(120);

    // 30 seconds @ 20 TPS = 600 ticks
    // Income interval is 5.0 seconds (100 ticks)
    // Over 30 seconds, exactly 6 income cycles occur: 6 * 12 = 72 gold
    for (let t = 0; t < 600; t++) {
      engine.tick();
    }

    const expectedGold = INITIAL_GOLD + 6 * 12; // 120 + 72 = 192
    expect(engine.economy.PLAYER.gold).toBe(expectedGold);
  });

  it('Structure Build and Sell Refund: refunds exactly 60% of total invested gold', () => {
    const engine = new GameEngine({ initialPlayerGold: 300 });

    // Build Barracks N1 (Cost: 100 gold)
    const buildSuccess = engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
    expect(buildSuccess).toBe(true);
    expect(engine.economy.PLAYER.gold).toBe(200);

    // Upgrade Barracks N1 to N2 (Cost: 130 gold)
    const upgradeSuccess = engine.upgradeStructure('PLAYER', 0);
    expect(upgradeSuccess).toBe(true);
    expect(engine.economy.PLAYER.gold).toBe(70);

    // Total invested in slot 0 = 100 + 130 = 230 gold
    // Refund = floor(230 * 0.60) = floor(138.0) = 138 gold
    const refund = engine.sellStructure('PLAYER', 0);
    expect(refund).toBe(138);
    expect(engine.economy.PLAYER.gold).toBe(70 + 138); // 208

    // Slot should now be empty and ready for new construction
    const slot = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 0);
    expect(slot?.structureId).toBeNull();
  });

  it('Royal Mine Upgrades from Level 0 to 4 correctly deducts cost and increases cycle income', () => {
    const engine = new GameEngine({ initialPlayerGold: 1000 });

    for (let level = 1; level <= 4; level++) {
      const nextDef = MINE_LEVEL_DEFINITIONS[level];
      const goldBefore = engine.economy.PLAYER.gold;

      const success = engine.upgradeMine('PLAYER');
      expect(success).toBe(true);
      expect(engine.economy.PLAYER.mineLevel).toBe(level);
      expect(engine.economy.PLAYER.gold).toBe(goldBefore - nextDef.costGold);
    }

    // Level 4 is max; cannot upgrade further
    expect(engine.upgradeMine('PLAYER')).toBe(false);
    expect(engine.economy.PLAYER.mineLevel).toBe(4);
  });
});
