import { describe, it, expect } from 'vitest';
import { FrontlineSystem } from '../../src/core/systems/FrontlineSystem';
import { MovementSystem } from '../../src/core/systems/MovementSystem';
import { GameEngine } from '../../src/core/GameEngine';
import { UnitState, CitadelState, TeamEconomyState, FrontlineState } from '../../src/core/types';
import {
  NEUTRAL_CENTER_X,
  VANGUARD_THRESHOLD_TICKS,
  VANGUARD_GOLD_INTERVAL_TICKS,
  DESPERATION_THRESHOLD_TICKS,
  DESPERATION_BALISTA_INTERVAL_TICKS,
  VANGUARD_MORALE_SPEED_MULTIPLIER,
  TICK_DURATION_SEC,
} from '../../src/core/config/ArenaConfig';
import { BattleEndedEvent } from '../../src/core/events/DomainEventBus';

function createDummyUnit(partial: Partial<UnitState> & { id: string; team: 'PLAYER' | 'ENEMY' }): UnitState {
  return {
    typeId: 'unit_squire',
    x: 1000,
    y: 300,
    currentHp: 380,
    maxHp: 380,
    targetUnitId: null,
    isTargetingCitadel: false,
    attackCooldownTicks: 0,
    ticksStationary: 0,
    isEngaged: false,
    hasRadiantMorale: false,
    attackCount: 0,
    hasCharged: false,
    stunTicksRemaining: 0,
    solarFlameTicksRemaining: 0,
    ...partial,
  };
}

describe('Frontline, Vanguard Momentum & Desperation Bulwark (GDD Section 2.1 & 7.3)', () => {
  describe('Frontline Coordinate Calculation (X_front)', () => {
    it('defaults to neutral center X (1000) when no units are actively engaged', () => {
      const units: UnitState[] = [
        createDummyUnit({ id: 'u1', team: 'PLAYER', x: 400, isEngaged: false }),
        createDummyUnit({ id: 'u2', team: 'ENEMY', x: 1600, isEngaged: false }),
      ];

      const frontX = FrontlineSystem.calculateFrontlineX(units);
      expect(frontX).toBe(NEUTRAL_CENTER_X); // 1000
    });

    it('calculates the exact arithmetic mean of X coordinates of actively engaged units', () => {
      const units: UnitState[] = [
        createDummyUnit({ id: 'u1', team: 'PLAYER', x: 1100, isEngaged: true }),
        createDummyUnit({ id: 'u2', team: 'PLAYER', x: 1150, isEngaged: true }),
        createDummyUnit({ id: 'u3', team: 'ENEMY', x: 1200, isEngaged: true }),
        createDummyUnit({ id: 'u4', team: 'ENEMY', x: 1250, isEngaged: true }),
        // Non-engaged unit in the back should NOT bias the frontline
        createDummyUnit({ id: 'u5', team: 'PLAYER', x: 200, isEngaged: false }),
      ];

      // Mean: (1100 + 1150 + 1200 + 1250) / 4 = 4700 / 4 = 1175.00
      const frontX = FrontlineSystem.calculateFrontlineX(units);
      expect(frontX).toBe(1175);
    });

    it('ignores dead units even if they were flagged engaged before death', () => {
      const units: UnitState[] = [
        createDummyUnit({ id: 'u1', team: 'PLAYER', x: 1300, isEngaged: true, currentHp: 100 }),
        createDummyUnit({ id: 'u2', team: 'ENEMY', x: 1400, isEngaged: true, currentHp: 0 }), // Dead
      ];

      const frontX = FrontlineSystem.calculateFrontlineX(units);
      expect(frontX).toBe(1300);
    });
  });

  describe('Vanguard Momentum & Radiant Morale (X > 1200 for > 5.0s / 100 ticks)', () => {
    it('activates Radiant Morale after sustaining X > 1200 for 100 ticks and resets on retreat', () => {
      const frontline: FrontlineState = {
        frontlineX: 1000,
        playerVanguardTicks: 0,
        playerDesperationTicks: 0,
        enemyVanguardTicks: 0,
        enemyDesperationTicks: 0,
        isPlayerVanguardActive: false,
        isPlayerDesperationActive: false,
        isEnemyVanguardActive: false,
        isEnemyDesperationActive: false,
      };

      const citadels: Record<'PLAYER' | 'ENEMY', CitadelState> = {
        PLAYER: { team: 'PLAYER', x: 0, currentHp: 2500, maxHp: 2500, armorType: 'FORTIFIED', flatReduction: 5, ballistaCooldownTicks: 40 },
        ENEMY: { team: 'ENEMY', x: 2000, currentHp: 2500, maxHp: 2500, armorType: 'FORTIFIED', flatReduction: 5, ballistaCooldownTicks: 40 },
      };

      const economy: Record<'PLAYER' | 'ENEMY', TeamEconomyState> = {
        PLAYER: { team: 'PLAYER', gold: 100, mineLevel: 0, incomeCycleTicksRemaining: 100, vanguardRewardTicksRemaining: 100 },
        ENEMY: { team: 'ENEMY', gold: 100, mineLevel: 0, incomeCycleTicksRemaining: 100, vanguardRewardTicksRemaining: 100 },
      };

      const playerUnit = createDummyUnit({ id: 'u_p1', team: 'PLAYER', x: 1300, isEngaged: true });
      const enemyUnit = createDummyUnit({ id: 'u_e1', team: 'ENEMY', x: 1300, isEngaged: true });
      const units = [playerUnit, enemyUnit];

      // Simulate 99 ticks in enemy territory (X = 1300 > 1200)
      for (let t = 0; t < VANGUARD_THRESHOLD_TICKS - 1; t++) {
        FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
        expect(frontline.isPlayerVanguardActive).toBe(false);
        expect(playerUnit.hasRadiantMorale).toBe(false);
      }

      // Exactly at tick 100 (5.0s), Vanguard Momentum triggers
      FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
      expect(frontline.playerVanguardTicks).toBe(100);
      expect(frontline.isPlayerVanguardActive).toBe(true);
      expect(playerUnit.hasRadiantMorale).toBe(true);

      // Verify that Radiant Morale provides +15% move speed bonus in MovementSystem
      const baseSpeed = 65; // Squire base speed
      const prevX = playerUnit.x;
      playerUnit.targetUnitId = null;
      playerUnit.isTargetingCitadel = false;
      MovementSystem.updateMovement([playerUnit]);
      const expectedStep = baseSpeed * VANGUARD_MORALE_SPEED_MULTIPLIER * TICK_DURATION_SEC;
      expect(playerUnit.x - prevX).toBeCloseTo(expectedStep, 4);

      // Simulate 100 more ticks in Vanguard: awards +1 extra Gold every 5.0s
      const goldBeforeReward = economy.PLAYER.gold;
      for (let t = 0; t < VANGUARD_GOLD_INTERVAL_TICKS; t++) {
        FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
      }
      expect(economy.PLAYER.gold).toBe(goldBeforeReward + 1);

      // Retreat: Frontline pulled back to neutral territory (X = 1100 <= 1200)
      playerUnit.x = 1100;
      enemyUnit.x = 1100;
      FrontlineSystem.updateFrontline(frontline, units, citadels, economy);

      expect(frontline.isPlayerVanguardActive).toBe(false);
      expect(frontline.playerVanguardTicks).toBe(0);
      expect(playerUnit.hasRadiantMorale).toBe(false);
    });
  });

  describe('Desperation Bulwark & Automated Citadel Balistas (X < 800 for > 5.0s / 100 ticks)', () => {
    it('activates automated balistas firing every 2.0s (40 ticks) targeting the most advanced enemy', () => {
      const frontline: FrontlineState = {
        frontlineX: 1000,
        playerVanguardTicks: 0,
        playerDesperationTicks: 0,
        enemyVanguardTicks: 0,
        enemyDesperationTicks: 0,
        isPlayerVanguardActive: false,
        isPlayerDesperationActive: false,
        isEnemyVanguardActive: false,
        isEnemyDesperationActive: false,
      };

      const citadels: Record<'PLAYER' | 'ENEMY', CitadelState> = {
        PLAYER: { team: 'PLAYER', x: 0, currentHp: 2500, maxHp: 2500, armorType: 'FORTIFIED', flatReduction: 5, ballistaCooldownTicks: 40 },
        ENEMY: { team: 'ENEMY', x: 2000, currentHp: 2500, maxHp: 2500, armorType: 'FORTIFIED', flatReduction: 5, ballistaCooldownTicks: 40 },
      };

      const economy: Record<'PLAYER' | 'ENEMY', TeamEconomyState> = {
        PLAYER: { team: 'PLAYER', gold: 100, mineLevel: 0, incomeCycleTicksRemaining: 100, vanguardRewardTicksRemaining: 100 },
        ENEMY: { team: 'ENEMY', gold: 100, mineLevel: 0, incomeCycleTicksRemaining: 100, vanguardRewardTicksRemaining: 100 },
      };

      // Two enemies invading player territory: one at X=300 (closer/more advanced), one at X=500
      const enemyClose = createDummyUnit({ id: 'u_e_close', team: 'ENEMY', x: 300, isEngaged: true, currentHp: 380 });
      const enemyFar = createDummyUnit({ id: 'u_e_far', team: 'ENEMY', x: 500, isEngaged: true, currentHp: 380 });
      const units = [enemyClose, enemyFar];

      // Simulate 99 ticks pushed behind X < 800
      for (let t = 0; t < DESPERATION_THRESHOLD_TICKS - 1; t++) {
        const result = FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
        expect(frontline.isPlayerDesperationActive).toBe(false);
        expect(result.balistaShots.length).toBe(0);
      }

      // Tick 100: Desperation Bulwark activates, decrements balistaCooldownTicks from 40 to 39
      const t100Result = FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
      expect(frontline.playerDesperationTicks).toBe(100);
      expect(frontline.isPlayerDesperationActive).toBe(true);
      expect(t100Result.balistaShots.length).toBe(0);
      expect(citadels.PLAYER.ballistaCooldownTicks).toBe(39);

      // Advance 38 more ticks (cooldown counts down from 39 to 1): no shot yet
      for (let t = 0; t < 38; t++) {
        const res = FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
        expect(res.balistaShots.length).toBe(0);
      }
      expect(citadels.PLAYER.ballistaCooldownTicks).toBe(1);

      // On the next tick (exactly 40 ticks since desperation activated): Balista fires at the closest enemy unit (X=300)
      const fireResult = FrontlineSystem.updateFrontline(frontline, units, citadels, economy);
      expect(fireResult.balistaShots.length).toBe(1);
      expect(fireResult.balistaShots[0].targetUnitId).toBe('u_e_close');
      expect(fireResult.balistaShots[0].attackerCitadelTeam).toBe('PLAYER');

      // Base damage is 60 Piercing vs Heavy armor (0.75x) with Squire passive (-20% ranged piercing = 0.8x)
      // and 1 flat reduction: floor(60 * 0.75 * 0.8 - 1) = floor(36 - 1) = 35
      expect(fireResult.balistaShots[0].damage).toBe(35);

      // Cooldown reset back to 40
      expect(citadels.PLAYER.ballistaCooldownTicks).toBe(DESPERATION_BALISTA_INTERVAL_TICKS);
    });
  });

  describe('Citadel Destruction & BattleEnded Event', () => {
    it('ends the battle with PLAYER victory when Enemy Citadel HP reaches 0', () => {
      const engine = new GameEngine();
      let battleEndedEvent: BattleEndedEvent | null = null;

      engine.eventBus.on('BattleEnded', (e) => {
        battleEndedEvent = e;
      });

      // Force Enemy Citadel HP to 0
      engine.citadels.ENEMY.currentHp = 0;
      engine.tick();

      expect(engine.getIsGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('PLAYER');
      expect(battleEndedEvent).not.toBeNull();
      const event = battleEndedEvent as unknown as BattleEndedEvent;
      expect(event.winnerTeam).toBe('PLAYER');
      expect(event.durationInTicks).toBe(engine.getTick());

      // Subsequent ticks should be ignored
      const finalTick = engine.getTick();
      engine.tick();
      expect(engine.getTick()).toBe(finalTick);
    });

    it('ends the battle with ENEMY victory when Player Citadel HP reaches 0', () => {
      const engine = new GameEngine();
      let battleEndedEvent: BattleEndedEvent | null = null;

      engine.eventBus.on('BattleEnded', (e) => {
        battleEndedEvent = e;
      });

      // Force Player Citadel HP to 0
      engine.citadels.PLAYER.currentHp = 0;
      engine.tick();

      expect(engine.getIsGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('ENEMY');
      expect(battleEndedEvent).not.toBeNull();
      const event = battleEndedEvent as unknown as BattleEndedEvent;
      expect(event.winnerTeam).toBe('ENEMY');
      expect(event.durationInTicks).toBe(engine.getTick());
    });
  });
});
