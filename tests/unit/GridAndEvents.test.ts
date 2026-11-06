import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import {
  UnitSpawnedEvent,
  UnitAttackedEvent,
  UnitDiedEvent,
  StructureBuiltEvent,
  StructureUpgradedEvent,
  NexusDamagedEvent,
  BattleEndedEvent,
} from '../../src/core/events/DomainEventBus';
import { SLOTS_PER_TEAM, TICK_RATE } from '../../src/core/config/ArenaConfig';
import { getStructureDefinition } from '../../src/core/config/StructuresCatalog';

describe('4x3 Building Grid & Domain Events (GDD Section 3 & 7.1)', () => {
  describe('Grid 4x3 Slot Rules & Construction Constraints', () => {
    it('initializes 12 slots (indices 0..11) for both Player and Enemy', () => {
      const engine = new GameEngine();

      const playerSlots = engine.slots.filter((s) => s.team === 'PLAYER');
      const enemySlots = engine.slots.filter((s) => s.team === 'ENEMY');

      expect(playerSlots.length).toBe(SLOTS_PER_TEAM); // 12
      expect(enemySlots.length).toBe(SLOTS_PER_TEAM); // 12

      // All indices 0 to 11 are present and initially unoccupied
      for (let i = 0; i < SLOTS_PER_TEAM; i++) {
        expect(playerSlots.some((s) => s.slotIndex === i && s.structureId === null)).toBe(true);
        expect(enemySlots.some((s) => s.slotIndex === i && s.structureId === null)).toBe(true);
      }
    });

    it('rejects out-of-bounds slot indices (< 0 or >= 12)', () => {
      const engine = new GameEngine({ initialPlayerGold: 1000 });

      expect(engine.buildStructure('PLAYER', -1, 'bldg_barracks_1')).toBe(false);
      expect(engine.buildStructure('PLAYER', 12, 'bldg_barracks_1')).toBe(false);
      expect(engine.buildStructure('PLAYER', 99, 'bldg_barracks_1')).toBe(false);
      expect(engine.upgradeStructure('PLAYER', -1)).toBe(false);
      expect(engine.upgradeStructure('PLAYER', 12)).toBe(false);
      expect(engine.sellStructure('PLAYER', -1)).toBe(0);
      expect(engine.sellStructure('PLAYER', 12)).toBe(0);
    });

    it('rejects construction on an already occupied slot', () => {
      const engine = new GameEngine({ initialPlayerGold: 500 });

      // First build on slot 3 succeeds
      const success1 = engine.buildStructure('PLAYER', 3, 'bldg_barracks_1');
      expect(success1).toBe(true);

      // Second build on slot 3 must be blocked
      const success2 = engine.buildStructure('PLAYER', 3, 'bldg_archery_1');
      expect(success2).toBe(false);

      const slot = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 3);
      expect(slot?.structureId).toBe('bldg_barracks_1');
    });

    it('rejects construction if team has insufficient gold', () => {
      const engine = new GameEngine({ initialPlayerGold: 50 }); // bldg_barracks_1 costs 100

      const success = engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      expect(success).toBe(false);
      expect(engine.economy.PLAYER.gold).toBe(50); // Unchanged

      const slot = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 0);
      expect(slot?.structureId).toBeNull();
    });

    it('rejects upgrade on an empty slot or on an already max-tier structure', () => {
      const engine = new GameEngine({ initialPlayerGold: 1000 });

      // Empty slot upgrade
      expect(engine.upgradeStructure('PLAYER', 0)).toBe(false);

      // Build Barracks N1 and upgrade to N2
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      expect(engine.upgradeStructure('PLAYER', 0)).toBe(true);

      // Barracks N2 (bldg_barracks_2) has no further upgrade
      expect(engine.upgradeStructure('PLAYER', 0)).toBe(false);
    });

    it('rejects upgrade if gold is insufficient', () => {
      const engine = new GameEngine({ initialPlayerGold: 150 });
      // Build Barracks N1 (costs 100, leaves 50 gold)
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      expect(engine.economy.PLAYER.gold).toBe(50);

      // Upgrade costs 130 gold, but player only has 50
      expect(engine.upgradeStructure('PLAYER', 0)).toBe(false);
      expect(engine.economy.PLAYER.gold).toBe(50);
    });
  });

  describe('Spawn Cycle Preservation during Upgrade N1 -> N2 (GDD Section 3)', () => {
    it('does NOT reset current spawn timer when upgrading, spawning Tier 2 unit upon cycle completion', () => {
      const engine = new GameEngine({ initialPlayerGold: 500 });
      const structDefN1 = getStructureDefinition('bldg_barracks_1');
      const structDefN2 = getStructureDefinition('bldg_barracks_2');

      const totalCooldownTicksN1 = Math.round(structDefN1.spawnCooldownSec * TICK_RATE); // 12.0s = 240 ticks
      const totalCooldownTicksN2 = Math.round(structDefN2.spawnCooldownSec * TICK_RATE); // 12.0s = 240 ticks

      // 1. Build Barracks Tier 1
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      const slot = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 0)!;
      expect(slot.currentSpawnCooldownTicks).toBe(totalCooldownTicksN1); // 240

      // 2. Advance 100 ticks
      for (let t = 0; t < 100; t++) {
        engine.tick();
      }
      expect(slot.currentSpawnCooldownTicks).toBe(totalCooldownTicksN1 - 100); // 140 ticks remaining

      // 3. Upgrade to Tier 2 (bldg_barracks_2)
      const upgradeSuccess = engine.upgradeStructure('PLAYER', 0);
      expect(upgradeSuccess).toBe(true);
      expect(slot.structureId).toBe('bldg_barracks_2');

      // CRITICAL ASSERTION: The timer must NOT reset back to 240! It must maintain the 140 ticks remaining.
      expect(slot.currentSpawnCooldownTicks).toBe(140);
      expect(slot.totalSpawnCooldownTicks).toBe(totalCooldownTicksN2);

      // 4. Advance 139 ticks: no unit spawned yet from this structure
      for (let t = 0; t < 139; t++) {
        engine.tick();
      }
      expect(slot.currentSpawnCooldownTicks).toBe(1);
      const unitsBeforeSpawn = engine.units.filter((u) => u.team === 'PLAYER');
      expect(unitsBeforeSpawn.length).toBe(0);

      // 5. On the 140th tick (total 240 ticks from initial build): Tier 2 unit spawns!
      engine.tick();
      expect(slot.currentSpawnCooldownTicks).toBe(totalCooldownTicksN2); // Reset to full cycle for the next wave

      const playerUnits = engine.units.filter((u) => u.team === 'PLAYER');
      expect(playerUnits.length).toBe(1);
      expect(playerUnits[0].typeId).toBe('unit_royal_knight'); // Spawned Royal Knight (Tier 2), NOT Squire (Tier 1)
    });
  });

  describe('Exhaustive Domain Events Emission & Payload Validation (GDD Section 7.1)', () => {
    it('emits StructureBuilt with complete typed payload', () => {
      const engine = new GameEngine({ initialPlayerGold: 300 });
      let eventPayload: StructureBuiltEvent | null = null;

      engine.eventBus.on('StructureBuilt', (e) => {
        eventPayload = e;
      });

      engine.buildStructure('PLAYER', 4, 'bldg_archery_1');

      expect(eventPayload).not.toBeNull();
      const event = eventPayload as unknown as StructureBuiltEvent;
      expect(event.structureId).toBe('bldg_archery_1');
      expect(event.slotIndex).toBe(4);
      expect(event.type).toBe('bldg_archery_1');
      expect(event.team).toBe('PLAYER');
      expect(event.tick).toBe(0);
    });

    it('emits StructureUpgraded with complete typed payload', () => {
      const engine = new GameEngine({ initialPlayerGold: 500 });
      let eventPayload: StructureUpgradedEvent | null = null;

      engine.buildStructure('PLAYER', 2, 'bldg_archery_1');

      engine.eventBus.on('StructureUpgraded', (e) => {
        eventPayload = e;
      });

      engine.upgradeStructure('PLAYER', 2);

      expect(eventPayload).not.toBeNull();
      const event = eventPayload as unknown as StructureUpgradedEvent;
      expect(event.structureId).toBe('bldg_archery_2');
      expect(event.newType).toBe('bldg_archery_2');
      expect(event.team).toBe('PLAYER');
      expect(event.tick).toBe(0);
    });

    it('emits UnitSpawned when a unit is deployed onto the battlefield', () => {
      const engine = new GameEngine();
      let eventPayload: UnitSpawnedEvent | null = null;

      engine.eventBus.on('UnitSpawned', (e) => {
        eventPayload = e;
      });

      const spawnedUnit = engine.spawnUnit('PLAYER', 'unit_squire');

      expect(eventPayload).not.toBeNull();
      const event = eventPayload as unknown as UnitSpawnedEvent;
      expect(event.type).toBe('unit_squire');
      expect(event.unitId).toBe(spawnedUnit.id);
      expect(event.team).toBe('PLAYER');
      expect(event.x).toBe(spawnedUnit.x);
      expect(event.y).toBe(spawnedUnit.y);
      expect(event.tick).toBe(engine.getTick());
    });

    it('emits UnitAttacked and UnitDied with bounty payload during combat kills', () => {
      const engine = new GameEngine();
      let attackEvent: UnitAttackedEvent | null = null;
      let deathEvent: UnitDiedEvent | null = null;

      engine.eventBus.on('UnitAttacked', (e) => {
        attackEvent = e;
      });
      engine.eventBus.on('UnitDied', (e) => {
        deathEvent = e;
      });

      // Spawn an allied Royal Knight and an enemy Squire right in front of each other
      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      const squire = engine.spawnUnit('ENEMY', 'unit_squire');

      knight.x = 1000;
      knight.y = 300;
      // Set squire HP to 5 so one hit will kill it
      squire.x = 1040;
      squire.y = 300;
      squire.currentHp = 5;

      const playerGoldBeforeKill = engine.economy.PLAYER.gold;

      // Advance one tick for targeting & combat resolution
      engine.tick();

      expect(attackEvent).not.toBeNull();
      const atk = attackEvent as unknown as UnitAttackedEvent;
      expect(atk.attackerId).toBe(knight.id);
      expect(atk.targetId).toBe(squire.id);
      expect(atk.damage).toBeGreaterThan(0);

      expect(deathEvent).not.toBeNull();
      const dth = deathEvent as unknown as UnitDiedEvent;
      expect(dth.unitId).toBe(squire.id);
      expect(dth.killerId).toBe(knight.id);
      expect(dth.bountyAwarded).toBe(2); // Squire bounty is 2 gold
      expect(dth.x).toBe(squire.x);
      expect(dth.y).toBe(squire.y);

      // Economy receives the bounty
      expect(engine.economy.PLAYER.gold).toBe(playerGoldBeforeKill + 2);
    });

    it('emits NexusDamaged when a unit attacks the enemy Citadel', () => {
      const engine = new GameEngine();
      let nexusEvent: NexusDamagedEvent | null = null;

      engine.eventBus.on('NexusDamaged', (e) => {
        nexusEvent = e;
      });

      // Place a player unit directly at enemy Citadel (X=2000)
      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      knight.x = 2000;
      knight.y = 300;

      const initialEnemyCitadelHp = engine.citadels.ENEMY.currentHp;

      engine.tick();

      expect(nexusEvent).not.toBeNull();
      const nxs = nexusEvent as unknown as NexusDamagedEvent;
      expect(nxs.team).toBe('ENEMY');
      expect(nxs.damage).toBeGreaterThan(0);
      expect(nxs.currentHp).toBe(initialEnemyCitadelHp - nxs.damage);
      expect(nxs.maxHp).toBe(engine.citadels.ENEMY.maxHp);
    });

    it('emits BattleEnded when Citadel falls, with winnerTeam and durationInTicks', () => {
      const engine = new GameEngine();
      let battleEndedEvent: BattleEndedEvent | null = null;

      engine.eventBus.on('BattleEnded', (e) => {
        battleEndedEvent = e;
      });

      // Directly reduce Player Citadel HP to 0
      engine.citadels.PLAYER.currentHp = 0;
      engine.tick();

      expect(battleEndedEvent).not.toBeNull();
      const btl = battleEndedEvent as unknown as BattleEndedEvent;
      expect(btl.winnerTeam).toBe('ENEMY');
      expect(btl.durationInTicks).toBe(engine.getTick());
    });

    it('DomainEventBus history tracking records ordered event stream when enabled', () => {
      const engine = new GameEngine();
      engine.eventBus.setHistoryTracking(true);

      engine.spawnUnit('PLAYER', 'unit_squire');
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');

      const history = engine.eventBus.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].name).toBe('UnitSpawned');
      expect(history[1].name).toBe('StructureBuilt');

      engine.eventBus.clearHistory();
      expect(engine.eventBus.getHistory().length).toBe(0);
    });
  });
});
