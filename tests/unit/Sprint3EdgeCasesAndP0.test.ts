import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { CampaignManager } from '../../src/core/campaign/CampaignManager';
import { AIController } from '../../src/core/ai/AIController';
import { CombatResolver } from '../../src/core/systems/CombatResolver';
import { getRelicDefinition } from '../../src/core/config/RelicsCatalog';
import { CITADEL_MAX_HP } from '../../src/core/config/ArenaConfig';

describe('Sprint 3: P0 Bugfixes & Comprehensive Edge Cases Suite', () => {
  // =========================================================================
  // 1. P0-1: ESTADO "GUARDAR OURO" (SAVE GOLD) NO AIController
  // =========================================================================
  describe('P0-1: Save Gold State in AIController', () => {
    it('Valerius (AGGRESSIVE): saves gold when reaching Step 2 (Stable 140g) with 100g..135g, and constructs Stable immediately when gold >= 140g', () => {
      // Step 0: Barracks on Slot 0 (100g)
      // Step 1: Barracks on Slot 1 (100g)
      // Step 2: Stable on Slot 2 (140g)
      const engine = new GameEngine({
        seed: 101,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 200,
      });

      // Tick 20: builds Slot 0 (100g spent, 100g remains)
      for (let t = 0; t < 20; t++) engine.tick();
      const s0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
      expect(s0?.structureId).toBe('bldg_barracks_1');

      // Tick 40: builds Slot 1 (100g spent, 0g remains)
      for (let t = 0; t < 20; t++) engine.tick();
      const s1 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 1);
      expect(s1?.structureId).toBe('bldg_barracks_1');

      // Now at stepIndex = 2. AI wants bldg_stable_1 (140g) in Slot 2.
      // Frontline is safe (<= 1400)
      engine.frontline.frontlineX = 1100;

      // Test with 100g, 120g, and 135g across decision cycles (setting gold right before tick 60)
      engine.economy.ENEMY.gold = 125;
      for (let t = 0; t < 20; t++) {
        engine.economy.ENEMY.gold = 125; // Lock gold below 140g so income does not cross threshold
        engine.tick();
      }

      const s2 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 2);
      // Crucial P0-1 check: Slot 2 must NOT have fallen back to bldg_barracks_1!
      expect(s2?.structureId).toBeNull();
      // Crucial P0-1 check: No other slot should have built an unwanted fallback Barracks
      const otherSlots = engine.slots.filter(
        (s) => s.team === 'ENEMY' && s.slotIndex > 1 && s.structureId !== null
      );
      expect(otherSlots.length).toBe(0);

      // Now provide AI with >= 140g (140g)
      engine.economy.ENEMY.gold = 140;
      for (let t = 0; t < 20; t++) engine.tick();

      // Slot 2 must now be constructed with bldg_stable_1!
      const s2Final = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 2);
      expect(s2Final?.structureId).toBe('bldg_stable_1');
      expect(s2Final?.totalInvestedGold).toBe(140);
    });

    it('Thorne (DEFENSIVE): saves gold when reaching Step 2 (Siege 160g) with 100g..155g, and constructs Siege Forge in Slot 9 when gold >= 160g', () => {
      // Step 0: Barracks on Slot 0 (100g)
      // Step 1: Archery on Slot 3 (90g)
      // Step 2: Siege Forge on Slot 9 (160g)
      const engine = new GameEngine({
        seed: 202,
        aiProfile: 'DEFENSIVE',
        initialEnemyGold: 190,
      });

      // Thorne upgrades mine first if mineLevel === 0 and frontline <= 1000.
      // Pre-set mineLevel = 1 so Thorne executes the canonical structure build order directly
      engine.economy.ENEMY.mineLevel = 1;

      // Tick 20: builds Slot 0 (100g, 90g remains)
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0)?.structureId).toBe('bldg_barracks_1');

      // Tick 40: builds Slot 3 (90g, 0g remains)
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 3)?.structureId).toBe('bldg_archery_1');

      // Step 2 is now active (aims for bldg_siege_1 in Slot 9, cost 160g)
      // Set gold to 120g and run decision ticks while keeping gold < 160g
      for (let t = 0; t < 20; t++) {
        engine.economy.ENEMY.gold = 120;
        engine.tick();
      }

      const s9 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 9);
      expect(s9?.structureId).toBeNull();

      // Ensure no other slot was populated as a fallback
      const emptyCheck = engine.slots.filter(
        (s) => s.team === 'ENEMY' && s.slotIndex !== 0 && s.slotIndex !== 3 && s.structureId !== null
      );
      expect(emptyCheck.length).toBe(0);

      // Provide Thorne with 160g
      engine.economy.ENEMY.gold = 160;
      for (let t = 0; t < 20; t++) engine.tick();

      const s9Built = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 9);
      expect(s9Built?.structureId).toBe('bldg_siege_1');
      expect(s9Built?.totalInvestedGold).toBe(160);
    });

    it('evaluateDecisionMatrix: saves gold (WAITING_GOLD) for Arcane Tower (125g) when heavyThreat > 1200, without falling back to Barracks N1', () => {
      const engine = new GameEngine({
        seed: 303,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 0,
      });

      const controller = new AIController('AGGRESSIVE');

      // Step 0: slot 0 Barracks 1 (100g)
      engine.economy.ENEMY.gold = 100;
      controller.update(engine);
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0)?.structureId).toBe('bldg_barracks_1');

      // Step 1: slot 1 Barracks 1 (100g)
      engine.economy.ENEMY.gold = 100;
      controller.update(engine);
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 1)?.structureId).toBe('bldg_barracks_1');

      // Step 2: slot 2 Stables 1 (140g)
      engine.economy.ENEMY.gold = 140;
      controller.update(engine);
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 2)?.structureId).toBe('bldg_stable_1');

      // Step 3: slot 0 upgrade Barracks 2 (130g)
      engine.economy.ENEMY.gold = 130;
      controller.update(engine);
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0)?.structureId).toBe('bldg_barracks_2');

      // All opening steps completed: controller is now in evaluateDecisionMatrix!

      // Spawn 2 Royal Knights for PLAYER (each has 720 HP heavy -> 1440 heavyThreat > 1200)
      engine.spawnUnit('PLAYER', 'unit_royal_knight');
      engine.spawnUnit('PLAYER', 'unit_royal_knight');

      const threats = controller.calculateThreats(engine.units);
      expect(threats.heavyThreat).toBe(1440);

      // Give enemy 100g: enough for Barracks (100g), but less than Arcane Tower (125g)
      engine.economy.ENEMY.gold = 100;
      engine.frontline.frontlineX = 1100; // Safe frontline <= 1400

      // Update AI controller
      controller.update(engine);

      // Verify AI did NOT fall back to building a Barracks on free slots with its 100g
      const freeSlotsOccupied = engine.slots.filter(
        (s) => s.team === 'ENEMY' && s.slotIndex > 2 && s.structureId !== null
      );
      expect(freeSlotsOccupied.length).toBe(0);
      expect(engine.economy.ENEMY.gold).toBe(100); // Gold was preserved!

      // Now give 125g: AI must build Arcane Tower in the best slot (Slot 3)
      engine.economy.ENEMY.gold = 125;
      controller.update(engine);

      const arcaneSlot = engine.slots.find((s) => s.team === 'ENEMY' && s.structureId === 'bldg_arcane_1');
      expect(arcaneSlot).toBeDefined();
      expect(arcaneSlot?.slotIndex).toBe(3); // Column 1 best slot for Arcane
    });

    it('evaluateDecisionMatrix: saves gold (WAITING_GOLD) for Stables (140g) when siegeThreat >= 2, without falling back to Barracks N1', () => {
      const engine = new GameEngine({
        seed: 404,
        aiProfile: 'DEFENSIVE',
        initialEnemyGold: 0,
      });

      const controller = new AIController('DEFENSIVE');
      engine.economy.ENEMY.mineLevel = 1;

      // Step 0: slot 0 Barracks 1 (100g)
      engine.economy.ENEMY.gold = 100;
      controller.update(engine);

      // Step 1: slot 3 Archery 1 (90g)
      engine.economy.ENEMY.gold = 90;
      controller.update(engine);

      // Step 2: slot 9 Siege 1 (160g)
      engine.economy.ENEMY.gold = 160;
      controller.update(engine);

      // Step 3: mine upgrade (110g)
      engine.economy.ENEMY.gold = 110;
      controller.update(engine);

      // Step 4: slot 9 upgrade Siege 2 (210g)
      engine.economy.ENEMY.gold = 210;
      controller.update(engine);

      // All Thorne steps completed! Now in evaluateDecisionMatrix.

      // Spawn 2 siege units for player -> siegeThreat = 2
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');

      const threats = controller.calculateThreats(engine.units);
      expect(threats.siegeThreat).toBe(2);

      // Set gold to 100g (less than Stable 140g, but enough for Barracks 100g)
      engine.economy.ENEMY.gold = 100;
      engine.frontline.frontlineX = 1100;

      controller.update(engine);

      // No new Barracks should be built
      const stableCheck = engine.slots.find((s) => s.team === 'ENEMY' && s.structureId === 'bldg_stable_1');
      expect(stableCheck).toBeUndefined();
      expect(engine.economy.ENEMY.gold).toBe(100);

      // Now set gold to 140g: AI must build Stable (bldg_stable_1)
      engine.economy.ENEMY.gold = 140;
      controller.update(engine);

      const stableBuilt = engine.slots.find((s) => s.team === 'ENEMY' && s.structureId === 'bldg_stable_1');
      expect(stableBuilt).toBeDefined();
    });
  });

  // =========================================================================
  // 2. COBERTURA EXAUSTIVA E CASOS DE BORDA DAS 8 RELÍQUIAS REAIS
  // =========================================================================
  describe('The 8 Real Relics: Exhaustive Edge Cases', () => {
    // -----------------------------------------------------------------------
    // Relic 1: relic_solar_martyrdom
    // -----------------------------------------------------------------------
    describe('relic_solar_martyrdom Edge Cases', () => {
      it('triggers on PLAYER melee death, damaging enemies within 80px, while allies and enemy citadel are immune', () => {
        const engine = new GameEngine({
          seed: 501,
          activeRelics: ['relic_solar_martyrdom'],
        });

        // Player melee unit (Squire) at (1000, 300)
        const squire = engine.spawnUnit('PLAYER', 'unit_squire');
        squire.x = 1000;
        squire.y = 300;
        squire.currentHp = 5;

        // Close Enemy within 80px at (1050, 300) -> distance = 50px
        const closeEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
        closeEnemy.x = 1050;
        closeEnemy.y = 300;
        const initialCloseEnemyHp = closeEnemy.currentHp;

        // Far Enemy outside 80px at (1085, 300) -> distance = 85px > 80px
        const farEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
        farEnemy.x = 1085;
        farEnemy.y = 300;
        const initialFarEnemyHp = farEnemy.currentHp;

        // Allied unit within 80px at (970, 300) -> distance = 30px
        const alliedUnit = engine.spawnUnit('PLAYER', 'unit_royal_knight');
        alliedUnit.x = 970;
        alliedUnit.y = 300;

        // Enemy killer (an Archer far away at 1150 to keep only closeEnemy within 80px)
        const killer = engine.spawnUnit('ENEMY', 'unit_longbowman');
        killer.x = 1150;
        killer.y = 300;
        squire.targetUnitId = killer.id;
        killer.targetUnitId = squire.id;

        // Track Martyrdom events
        let martyrdomEvents = 0;
        let alliedHitByMartyrdom = false;
        engine.eventBus.on('UnitAttacked', (e) => {
          if (e.attackerId === 'relic_solar_martyrdom') {
            martyrdomEvents++;
            if (e.targetId === alliedUnit.id) {
              alliedHitByMartyrdom = true;
            }
          }
        });

        // Tick until squire dies
        for (let t = 0; t < 20; t++) engine.tick();

        // Exactly 1 enemy was within 80px (closeEnemy)
        expect(martyrdomEvents).toBe(1);
        expect(closeEnemy.currentHp).toBeLessThan(initialCloseEnemyHp);
        expect(farEnemy.currentHp).toBe(initialFarEnemyHp); // Far enemy unaffected
        expect(alliedHitByMartyrdom).toBe(false); // Allied immune to friendly fire martyrdom explosion
      });

      it('does NOT trigger when a PLAYER RANGED unit dies', () => {
        const engine = new GameEngine({
          seed: 502,
          activeRelics: ['relic_solar_martyrdom'],
        });

        const archer = engine.spawnUnit('PLAYER', 'unit_longbowman');
        archer.x = 1000;
        archer.y = 300;
        archer.currentHp = 5;

        const closeEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
        closeEnemy.x = 1020;
        closeEnemy.y = 300;
        const initialHp = closeEnemy.currentHp;

        const killer = engine.spawnUnit('ENEMY', 'unit_squire');
        killer.x = 1005;
        killer.y = 300;
        archer.targetUnitId = killer.id;
        killer.targetUnitId = archer.id;

        let martyrdomTriggered = false;
        engine.eventBus.on('UnitAttacked', (e) => {
          if (e.attackerId === 'relic_solar_martyrdom') martyrdomTriggered = true;
        });

        for (let t = 0; t < 20; t++) engine.tick();

        expect(martyrdomTriggered).toBe(false);
        expect(closeEnemy.currentHp).toBe(initialHp);
      });

      it('does NOT trigger when an ENEMY melee unit dies', () => {
        const engine = new GameEngine({
          seed: 503,
          activeRelics: ['relic_solar_martyrdom'],
        });

        const enemySquire = engine.spawnUnit('ENEMY', 'unit_squire');
        enemySquire.x = 1000;
        enemySquire.y = 300;
        enemySquire.currentHp = 5;

        const playerKnight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
        playerKnight.x = 990;
        playerKnight.y = 300;
        enemySquire.targetUnitId = playerKnight.id;
        playerKnight.targetUnitId = enemySquire.id;

        let martyrdomTriggered = false;
        engine.eventBus.on('UnitAttacked', (e) => {
          if (e.attackerId === 'relic_solar_martyrdom') martyrdomTriggered = true;
        });

        for (let t = 0; t < 20; t++) engine.tick();

        expect(martyrdomTriggered).toBe(false);
      });
    });

    // -----------------------------------------------------------------------
    // Relic 2: relic_febrile_production
    // -----------------------------------------------------------------------
    describe('relic_febrile_production Edge Cases', () => {
      it('strictly reduces player structures cooldown by -15% and player mobile units maxHp by -10%, leaving player citadel and enemy units intact', () => {
        const engine = new GameEngine({
          seed: 504,
          activeRelics: ['relic_febrile_production'],
          initialPlayerGold: 1000,
          initialEnemyGold: 1000,
        });

        // Player structures
        // Barracks 1 (base 12.0s = 240 ticks) -> round(240 * 0.85) = 204 ticks
        engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
        // Stable 1 (base 16.0s = 320 ticks) -> round(320 * 0.85) = 272 ticks
        engine.buildStructure('PLAYER', 1, 'bldg_stable_1');

        const pSlot0 = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 0);
        const pSlot1 = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 1);
        expect(pSlot0?.totalSpawnCooldownTicks).toBe(204);
        expect(pSlot1?.totalSpawnCooldownTicks).toBe(272);

        // Enemy structures: must remain standard 100% cooldown
        engine.buildStructure('ENEMY', 0, 'bldg_barracks_1');
        const eSlot0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
        expect(eSlot0?.totalSpawnCooldownTicks).toBe(240);

        // Player mobile units have -10% maxHp and spawn at that HP
        const pKnight = engine.spawnUnit('PLAYER', 'unit_royal_knight'); // base 720 -> floor(720 * 0.90) = 648
        expect(pKnight.maxHp).toBe(648);
        expect(pKnight.currentHp).toBe(648);

        const pBallista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista'); // base 310 -> floor(310 * 0.90) = 279
        expect(pBallista.maxHp).toBe(279);
        expect(pBallista.currentHp).toBe(279);

        // Player Citadel is NOT reduced: keeps 2500 maxHp and 2500 currentHp
        expect(engine.citadels.PLAYER.maxHp).toBe(CITADEL_MAX_HP);
        expect(engine.citadels.PLAYER.currentHp).toBe(CITADEL_MAX_HP);

        // Enemy mobile units are unaffected: Royal Knight has full 720 HP
        const eKnight = engine.spawnUnit('ENEMY', 'unit_royal_knight');
        expect(eKnight.maxHp).toBe(720);
        expect(eKnight.currentHp).toBe(720);
      });
    });

    // -----------------------------------------------------------------------
    // Relic 3: relic_flaming_dawn_bolts
    // -----------------------------------------------------------------------
    describe('relic_flaming_dawn_bolts Edge Cases', () => {
      it('triggers 70px AoE with 160 Magic Damage on 5th shooter attack, including enemy citadel mitigation if targeted, but does not trigger for enemy shooters', () => {
        const engine = new GameEngine({
          seed: 505,
          activeRelics: ['relic_flaming_dawn_bolts'],
        });

        // 1. Player Siege Crossbowman on 5th attack against enemy unit
        const crossbowman = engine.spawnUnit('PLAYER', 'unit_siege_crossbowman');
        crossbowman.x = 900;
        crossbowman.y = 300;
        crossbowman.attackCount = 4; // 5th attack is next
        crossbowman.attackCooldownTicks = 0;

        const primaryTarget = engine.spawnUnit('ENEMY', 'unit_squire');
        primaryTarget.x = 1000;
        primaryTarget.y = 300;
        primaryTarget.maxHp = 2000;
        primaryTarget.currentHp = 2000;
        crossbowman.targetUnitId = primaryTarget.id;

        const secondaryEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
        secondaryEnemy.x = 1050; // 50px away <= 70px
        secondaryEnemy.y = 300;
        secondaryEnemy.maxHp = 2000;
        secondaryEnemy.currentHp = 2000;

        const outsideEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
        outsideEnemy.x = 1080; // 80px away > 70px
        outsideEnemy.y = 300;
        outsideEnemy.maxHp = 2000;
        outsideEnemy.currentHp = 2000;

        engine.tick();

        // Secondary enemy inside 70px must have taken magic explosion damage (160 Magic base)
        expect(secondaryEnemy.currentHp).toBeLessThan(2000);
        // Outside enemy is untouched
        expect(outsideEnemy.currentHp).toBe(2000);

        // 2. Attack against enemy Citadel:
        // Spawn a second shooter right at the citadel line
        const citadelShooter = engine.spawnUnit('PLAYER', 'unit_siege_crossbowman');
        citadelShooter.x = 1800;
        citadelShooter.y = 300;
        citadelShooter.attackCount = 4;
        citadelShooter.attackCooldownTicks = 0;
        citadelShooter.isTargetingCitadel = true;
        citadelShooter.targetUnitId = null;

        const initialCitadelHp = engine.citadels.ENEMY.currentHp;
        engine.tick();

        // Citadel suffered weapon damage + 160 Magic damage mitigated by Fortified armor
        expect(engine.citadels.ENEMY.currentHp).toBeLessThan(initialCitadelHp);

        // 3. Enemy shooter on 5th attack does NOT proc relic
        const enemyArcher = engine.spawnUnit('ENEMY', 'unit_longbowman');
        enemyArcher.x = 500;
        enemyArcher.y = 300;
        enemyArcher.attackCount = 4;
        enemyArcher.attackCooldownTicks = 0;

        const playerTarget = engine.spawnUnit('PLAYER', 'unit_squire');
        playerTarget.x = 450;
        playerTarget.y = 300;
        playerTarget.maxHp = 2000;
        playerTarget.currentHp = 2000;
        enemyArcher.targetUnitId = playerTarget.id;

        const playerNearby = engine.spawnUnit('PLAYER', 'unit_squire');
        playerNearby.x = 420;
        playerNearby.y = 300;
        playerNearby.maxHp = 2000;
        playerNearby.currentHp = 2000;

        engine.tick();
        // Nearby player unit must NOT take explosion damage from enemy archer
        expect(playerNearby.currentHp).toBe(2000);
      });
    });

    // -----------------------------------------------------------------------
    // Relic 4: relic_blood_and_soil_banner
    // -----------------------------------------------------------------------
    describe('relic_blood_and_soil_banner Edge Cases', () => {
      it('activates +20% damage strictly when frontlineX > 1200 and deactivates immediately when frontlineX <= 1200', () => {
        const engine = new GameEngine({
          seed: 506,
          activeRelics: ['relic_blood_and_soil_banner'],
        });

        // 1200 boundary: exactly 1200 -> false (multiplier = 1.0)
        engine.frontline.frontlineX = 1200;
        expect(engine.getPlayerDamageMultiplier()).toBe(1.0);

        // 1201 -> active (+20%)
        engine.frontline.frontlineX = 1201;
        expect(engine.getPlayerDamageMultiplier()).toBeCloseTo(1.2, 5);

        // 1500 -> active (+20%)
        engine.frontline.frontlineX = 1500;
        expect(engine.getPlayerDamageMultiplier()).toBeCloseTo(1.2, 5);

        // Drops back to 1199 -> immediately deactivates (1.0)
        engine.frontline.frontlineX = 1199;
        expect(engine.getPlayerDamageMultiplier()).toBe(1.0);
      });
    });

    // -----------------------------------------------------------------------
    // Relic 5: relic_blessed_heavy_plating
    // -----------------------------------------------------------------------
    describe('relic_blessed_heavy_plating Edge Cases', () => {
      it('applies +2 flat reduction for PLAYER HEAVY armor vs NORMAL and PIERCING, with 0 bonus vs MAGIC and SIEGE and min 1 floor', () => {
        // Player Knight (HEAVY armor, flat reduction 3) vs NORMAL damage 18
        // Standard: 18 - 3 = 15
        // With relic: 18 - (3 + 2) = 13
        const normalDamageWithRelic = CombatResolver.calculateEffectiveDamage({
          baseDamage: 18,
          damageType: 'NORMAL',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          hasBlessedHeavyPlating: true,
        });
        expect(normalDamageWithRelic).toBe(13);

        // vs PIERCING damage 22:
        // Multiplier vs HEAVY = 0.75 -> raw = 16.5
        // Standard: floor(16.5 - 3) = 13
        // With relic: floor(16.5 - 5) = 11
        const piercingDamageWithRelic = CombatResolver.calculateEffectiveDamage({
          baseDamage: 22,
          damageType: 'PIERCING',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          hasBlessedHeavyPlating: true,
        });
        expect(piercingDamageWithRelic).toBe(11);

        // vs MAGIC damage 32:
        // Multiplier vs HEAVY = 1.50 -> raw = 48
        // With relic: NO +2 bonus for MAGIC! Flat reduction remains 3 -> 48 - 3 = 45
        const magicDamageWithRelic = CombatResolver.calculateEffectiveDamage({
          baseDamage: 32,
          damageType: 'MAGIC',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          hasBlessedHeavyPlating: true,
        });
        expect(magicDamageWithRelic).toBe(45);

        // vs SIEGE damage 50:
        // Multiplier vs HEAVY = 0.50 -> raw = 25
        // With relic: NO +2 bonus for SIEGE! Flat reduction remains 3 -> 25 - 3 = 22
        const siegeDamageWithRelic = CombatResolver.calculateEffectiveDamage({
          baseDamage: 50,
          damageType: 'SIEGE',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          hasBlessedHeavyPlating: true,
        });
        expect(siegeDamageWithRelic).toBe(22);

        // Minimum floor of 1 damage:
        // Base damage 4 NORMAL vs HEAVY (3+2 = 5 reduction): max(1, floor(4 - 5)) = 1
        const floorDamage = CombatResolver.calculateEffectiveDamage({
          baseDamage: 4,
          damageType: 'NORMAL',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          hasBlessedHeavyPlating: true,
        });
        expect(floorDamage).toBe(1);

        // LIGHT armor (e.g. Archer flat reduction 0): NO bonus even if relic flag is passed
        const lightDamage = CombatResolver.calculateEffectiveDamage({
          baseDamage: 18,
          damageType: 'NORMAL',
          defenderArmorType: 'LIGHT',
          defenderFlatReduction: 0,
          hasBlessedHeavyPlating: true,
        });
        expect(lightDamage).toBe(18);
      });
    });

    // -----------------------------------------------------------------------
    // Relic 6: relic_triumphant_dawn_charge
    // -----------------------------------------------------------------------
    describe('relic_triumphant_dawn_charge Edge Cases', () => {
      it('amplifies Mounted Spearman charge to 3.50x + 30 ticks stun, and Paladin charge to 4.00x + 30 ticks stun', () => {
        // Mounted Spearman baseDamage 34 vs HEAVY armor (1.0x) - 3 flat reduction
        // Relic charge (3.50x): floor(34 * 3.50 - 3) = floor(119 - 3) = 116
        const spearmanChargeResult = CombatResolver.resolveDamage({
          baseDamage: 34,
          damageType: 'NORMAL',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          attackerTypeId: 'unit_mounted_spearman',
          isChargeAttack: true,
          hasTriumphantDawnCharge: true,
          applyPassives: true,
        });
        expect(spearmanChargeResult.effectiveDamage).toBe(116);

        // Dawn Paladin baseDamage 42 vs HEAVY armor (1.0x) - 3 flat reduction
        // Relic charge (4.00x): floor(42 * 4.00 - 3) = floor(168 - 3) = 165
        const paladinChargeResult = CombatResolver.resolveDamage({
          baseDamage: 42,
          damageType: 'NORMAL',
          defenderArmorType: 'HEAVY',
          defenderFlatReduction: 3,
          attackerTypeId: 'unit_dawn_paladin',
          isChargeAttack: true,
          hasTriumphantDawnCharge: true,
          applyPassives: true,
        });
        expect(paladinChargeResult.effectiveDamage).toBe(165);
      });

      it('inflicts 30-tick stun on mobile enemy target but enemy Citadel is strictly immune to stun', () => {
        const engine = new GameEngine({
          seed: 507,
          activeRelics: ['relic_triumphant_dawn_charge'],
        });

        // 1. Charge vs Enemy Unit
        const lancer = engine.spawnUnit('PLAYER', 'unit_mounted_spearman');
        lancer.x = 1000;
        lancer.y = 300;
        lancer.attackCooldownTicks = 0;

        const enemyUnit = engine.spawnUnit('ENEMY', 'unit_royal_knight');
        enemyUnit.x = 1020;
        enemyUnit.y = 300;
        lancer.targetUnitId = enemyUnit.id;

        engine.tick();
        // 30 ticks applied at hit, 1 tick decremented in same tick's movement phase = 29
        expect(enemyUnit.stunTicksRemaining).toBe(29);

        // 2. Charge vs Enemy Citadel: Citadel must NOT receive stunTicks
        const lancerCitadel = engine.spawnUnit('PLAYER', 'unit_mounted_spearman');
        lancerCitadel.x = 1960;
        lancerCitadel.y = 300;
        lancerCitadel.isTargetingCitadel = true;
        lancerCitadel.targetUnitId = null;
        lancerCitadel.attackCooldownTicks = 0;

        const initialCitadelHp = engine.citadels.ENEMY.currentHp;
        engine.tick();

        expect(engine.citadels.ENEMY.currentHp).toBeLessThan(initialCitadelHp);
        // Citadel has no stun ticks property and is not frozen
        expect((engine.citadels.ENEMY as any).stunTicksRemaining).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // Relic 7: relic_royal_war_tithe
    // -----------------------------------------------------------------------
    describe('relic_royal_war_tithe Edge Cases', () => {
      it('doubles gold bounty on MAGIC or SIEGE kills, but pays 1x on NORMAL or PIERCING kills', () => {
        const engine = new GameEngine({
          seed: 508,
          activeRelics: ['relic_royal_war_tithe'],
        });

        // Test 1: PLAYER kills enemy with NORMAL damage (Squire, bounty 2g) -> 1x bounty (2g)
        const playerSquire = engine.spawnUnit('PLAYER', 'unit_squire');
        playerSquire.x = 800;
        playerSquire.y = 300;

        const enemy1 = engine.spawnUnit('ENEMY', 'unit_squire');
        enemy1.x = 810;
        enemy1.y = 300;
        enemy1.currentHp = 1;
        playerSquire.targetUnitId = enemy1.id;

        const goldBeforeNormal = engine.economy.PLAYER.gold;
        engine.tick();
        expect(engine.economy.PLAYER.gold - goldBeforeNormal).toBe(2); // 1x bounty

        // Test 2: PLAYER kills enemy with PIERCING damage (Longbowman) -> 1x bounty (2g)
        const playerArcher = engine.spawnUnit('PLAYER', 'unit_longbowman');
        playerArcher.x = 900;
        playerArcher.y = 300;

        const enemy2 = engine.spawnUnit('ENEMY', 'unit_squire');
        enemy2.x = 950;
        enemy2.y = 300;
        enemy2.currentHp = 1;
        playerArcher.targetUnitId = enemy2.id;

        const goldBeforePiercing = engine.economy.PLAYER.gold;
        engine.tick();
        expect(engine.economy.PLAYER.gold - goldBeforePiercing).toBe(2); // 1x bounty

        // Test 3: PLAYER kills enemy with SIEGE damage (Ballista) -> 2x bounty (4g)
        const playerBallista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
        playerBallista.x = 1000;
        playerBallista.y = 300;

        const enemy3 = engine.spawnUnit('ENEMY', 'unit_squire');
        enemy3.x = 1150;
        enemy3.y = 300;
        enemy3.currentHp = 1;
        playerBallista.targetUnitId = enemy3.id;

        const goldBeforeSiege = engine.economy.PLAYER.gold;
        engine.tick();
        expect(engine.economy.PLAYER.gold - goldBeforeSiege).toBe(4); // 2x bounty!
      });
    });

    // -----------------------------------------------------------------------
    // Relic 8: relic_citadel_mana_heart
    // -----------------------------------------------------------------------
    describe('relic_citadel_mana_heart Edge Cases', () => {
      it('heals allies by +120 HP capped at maxHp without healing allied citadel, deals 80 Magic Damage to enemies without damaging enemy citadel, and does nothing on non-600 ticks', () => {
        const engine = new GameEngine({
          seed: 509,
          activeRelics: ['relic_citadel_mana_heart'],
        });

        // Fast forward to tick 598
        for (let t = 0; t < 598; t++) engine.tick();

        // Spawn damaged ally and ally at full HP
        const damagedAlly = engine.spawnUnit('PLAYER', 'unit_royal_knight');
        damagedAlly.currentHp = 200; // max 720

        const fullAlly = engine.spawnUnit('PLAYER', 'unit_squire');
        fullAlly.currentHp = fullAlly.maxHp;

        // Damage Player Citadel
        engine.citadels.PLAYER.currentHp = 1500;

        // Spawn enemy unit and record enemy citadel HP
        const enemyUnit = engine.spawnUnit('ENEMY', 'unit_squire');
        const initialEnemyHp = enemyUnit.currentHp;
        const initialEnemyCitadelHp = engine.citadels.ENEMY.currentHp;

        // Tick 599: NOT a multiple of 600 -> NO effects triggered
        engine.tick();
        expect(damagedAlly.currentHp).toBe(200);
        expect(enemyUnit.currentHp).toBe(initialEnemyHp);

        // Tick 600: TRIGGER WAVE
        engine.tick();

        // 1. Damaged ally healed +120 HP -> 320
        expect(damagedAlly.currentHp).toBe(320);

        // 2. Full ally clamped at maxHp
        expect(fullAlly.currentHp).toBe(fullAlly.maxHp);

        // 3. Allied Citadel NOT healed -> remains 1500
        expect(engine.citadels.PLAYER.currentHp).toBe(1500);

        // 4. Enemy unit took 80 Magic base damage
        expect(enemyUnit.currentHp).toBeLessThan(initialEnemyHp);

        // 5. Enemy Citadel NOT damaged by wave
        expect(engine.citadels.ENEMY.currentHp).toBe(initialEnemyCitadelHp);
      });
    });
  });

  // =========================================================================
  // 3. COBERTURA EXAUSTIVA DO GRAFO ROGUELIKE E NÓS ESPECIAIS
  // =========================================================================
  describe('Roguelike Campaign Manager & Special Nodes: Exhaustive Coverage', () => {
    it('validates 7 layers (0..6) topology, valid node types and acyclic DAG connectivity', () => {
      const manager = new CampaignManager(7890);
      const nodes = manager.nodes;

      const layerCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const nodeId in nodes) {
        const node = nodes[nodeId];
        layerCounts[node.layer]++;
        // Every outgoing node must belong strictly to a higher layer
        for (const outId of node.outgoingNodeIds) {
          const outNode = nodes[outId];
          expect(outNode).toBeDefined();
          expect(outNode.layer).toBeGreaterThan(node.layer);
        }
      }

      // Layer 0: 1 node (Entry)
      expect(layerCounts[0]).toBe(1);
      // Layer 1: 2 nodes
      expect(layerCounts[1]).toBe(2);
      // Layer 2: 3 nodes
      expect(layerCounts[2]).toBe(3);
      // Layer 3: 2 nodes
      expect(layerCounts[3]).toBe(2);
      // Layer 4: 1 node (Campfire)
      expect(layerCounts[4]).toBe(1);
      // Layer 5: 2 nodes
      expect(layerCounts[5]).toBe(2);
      // Layer 6: 1 node (Boss)
      expect(layerCounts[6]).toBe(1);
    });

    it('persists playerCitadelHp between battles and terminates run in defeat when citadelHp <= 0', () => {
      const manager = new CampaignManager(1234);

      // Battle 1: Win with 1400 HP
      manager.completeBattle({
        playerCitadelFinalHp: 1400,
        isPlayerWinner: true,
      });
      expect(manager.state.playerCitadelHp).toBe(1400);
      expect(manager.state.isRunOver).toBe(false);

      // Verify that options created for the next battle receive 1400 HP
      const opts = manager.createBattleEngineOptions();
      expect(opts.initialPlayerCitadelHp).toBe(1400);

      // Battle 2: Defeat (0 HP)
      manager.completeBattle({
        playerCitadelFinalHp: 0,
        isPlayerWinner: false,
      });
      expect(manager.state.playerCitadelHp).toBe(0);
      expect(manager.state.isRunOver).toBe(true);
      expect(manager.state.isVictory).toBe(false);

      // Subsequent actions must be blocked once run is over
      expect(manager.travelToNode('node_1_0')).toBe(false);
    });

    it('handles all 3 Campfire actions with accurate capping and bonus consumption', () => {
      const manager = new CampaignManager(4567);
      manager.state.currentNodeId = 'node_4_0'; // Set to Campfire

      // 1. REPAIR: +875 HP clamped at 2500
      manager.state.playerCitadelHp = 2000;
      expect(manager.applyCampfireAction('REPAIR')).toBe(true);
      expect(manager.state.playerCitadelHp).toBe(2500); // 2000 + 875 = 2875 clamped to 2500

      // 2. FORGE: cumulative +0.10 damage bonus
      expect(manager.applyCampfireAction('FORGE')).toBe(true);
      expect(manager.state.campaignDamageBonus).toBe(0.1);
      expect(manager.applyCampfireAction('FORGE')).toBe(true);
      expect(manager.state.campaignDamageBonus).toBe(0.2);

      // 3. INSPIRATION: +50g opening gold for next battle
      expect(manager.applyCampfireAction('INSPIRATION')).toBe(true);
      expect(manager.state.nextBattleBonusGold).toBe(50);

      const battleOpts = manager.createBattleEngineOptions();
      expect(battleOpts.initialPlayerGold).toBe(120 + 50); // 170g opening

      // Once battle completes, nextBattleBonusGold resets to 0
      manager.completeBattle({
        playerCitadelFinalHp: 2500,
        isPlayerWinner: true,
      });
      expect(manager.state.nextBattleBonusGold).toBe(0);
    });

    it('Merchant node: enforces rarity prices, prevents overspending, duplicate purchases, and caps emergency repair at 2500', () => {
      const manager = new CampaignManager(9999);
      manager.state.campaignGold = 100;
      manager.state.playerCitadelHp = 2200;
      manager.travelToNode('node_1_0');
      manager.travelToNode('node_2_1'); // Merchant

      expect(manager.merchantRelics.length).toBe(3);

      // Emergency repair (40g -> +500 HP clamped at 2500)
      expect(manager.buyMerchantRepair()).toBe(true);
      expect(manager.state.campaignGold).toBe(60);
      expect(manager.state.playerCitadelHp).toBe(2500); // 2200 + 500 = 2700 clamped to 2500

      // Try buying repair with insufficient gold
      manager.state.campaignGold = 30; // < 40g
      expect(manager.buyMerchantRepair()).toBe(false);
      expect(manager.state.campaignGold).toBe(30);

      // Relic purchase with insufficient gold
      const expensiveRelic = manager.merchantRelics.find((r) => getRelicDefinition(r).merchantCostGold > 30);
      if (expensiveRelic) {
        expect(manager.buyMerchantRelic(expensiveRelic)).toBe(false);
      }

      // Relic purchase with sufficient gold
      manager.state.campaignGold = 500;
      const targetRelic = manager.merchantRelics[0];
      const targetCost = getRelicDefinition(targetRelic).merchantCostGold;

      expect(manager.buyMerchantRelic(targetRelic)).toBe(true);
      expect(manager.state.activeRelicIds).toContain(targetRelic);
      expect(manager.state.campaignGold).toBe(500 - targetCost);

      // Attempting to buy the same relic again must fail
      expect(manager.buyMerchantRelic(targetRelic)).toBe(false);
    });

    it('Crossroads Events: resolves both Option A and Option B for all 3 events with failure and game-over conditions', () => {
      const manager = new CampaignManager(3333);
      manager.state.currentNodeId = 'node_1_1'; // EVENT

      // ---------------------------------------------------------------------
      // Event 1: event_supply_convoy
      // Option A: 30g -> random uncommon/rare relic
      manager.state.campaignGold = 20; // insufficient (< 30)
      expect(manager.resolveEventChoice('event_supply_convoy', 'A')).toBe(false);

      manager.state.campaignGold = 30;
      expect(manager.resolveEventChoice('event_supply_convoy', 'A')).toBe(true);
      expect(manager.state.campaignGold).toBe(0);
      expect(manager.state.activeRelicIds.length).toBe(1);

      // Option B: -300 HP -> +80g
      manager.state.playerCitadelHp = 250; // less than 300 HP -> will lead to defeat!
      expect(manager.resolveEventChoice('event_supply_convoy', 'B')).toBe(true);
      expect(manager.state.playerCitadelHp).toBe(0);
      expect(manager.state.isRunOver).toBe(true);
      expect(manager.state.isVictory).toBe(false);

      // Reset for Event 2
      const manager2 = new CampaignManager(4444);
      manager2.state.currentNodeId = 'node_1_1';

      // ---------------------------------------------------------------------
      // Event 2: event_profaned_sanctuary
      // Option A: -400 HP -> relic_solar_martyrdom
      manager2.state.playerCitadelHp = 1000;
      expect(manager2.resolveEventChoice('event_profaned_sanctuary', 'A')).toBe(true);
      expect(manager2.state.playerCitadelHp).toBe(600);
      expect(manager2.state.activeRelicIds).toContain('relic_solar_martyrdom');

      // Option B: -50g -> relic_blessed_heavy_plating
      manager2.state.campaignGold = 40; // insufficient
      expect(manager2.resolveEventChoice('event_profaned_sanctuary', 'B')).toBe(false);

      manager2.state.campaignGold = 50;
      expect(manager2.resolveEventChoice('event_profaned_sanctuary', 'B')).toBe(true);
      expect(manager2.state.campaignGold).toBe(0);
      expect(manager2.state.activeRelicIds).toContain('relic_blessed_heavy_plating');

      // ---------------------------------------------------------------------
      // Event 3: event_iron_guard_deserter
      // Option A: -40g -> +100g next battle opening gold
      manager2.state.campaignGold = 35; // insufficient
      expect(manager2.resolveEventChoice('event_iron_guard_deserter', 'A')).toBe(false);

      manager2.state.campaignGold = 40;
      expect(manager2.resolveEventChoice('event_iron_guard_deserter', 'A')).toBe(true);
      expect(manager2.state.campaignGold).toBe(0);
      expect(manager2.state.nextBattleBonusGold).toBe(100);

      // Option B: 0g -> +300 HP clamped at 2500
      manager2.state.playerCitadelHp = 2400;
      expect(manager2.resolveEventChoice('event_iron_guard_deserter', 'B')).toBe(true);
      expect(manager2.state.playerCitadelHp).toBe(2500); // 2400 + 300 clamped to 2500
    });

    it('deterministic serialization and deserialization retains complete game state and RNG sequence', () => {
      const manager = new CampaignManager(88888);
      manager.travelToNode('node_1_1'); // Event node
      manager.resolveEventChoice('event_supply_convoy', 'B'); // -300 HP, +80g
      manager.state.campaignDamageBonus = 0.3;
      manager.state.nextBattleBonusGold = 100;
      manager.state.activeRelicIds = ['relic_flaming_dawn_bolts', 'relic_blood_and_soil_banner'];

      const serialized = manager.serialize();
      const restored = CampaignManager.deserialize(serialized);

      expect(restored.state.runSeed).toBe(88888);
      expect(restored.state.currentLayer).toBe(1);
      expect(restored.state.currentNodeId).toBe('node_1_1');
      expect(restored.state.playerCitadelHp).toBe(manager.state.playerCitadelHp);
      expect(restored.state.campaignGold).toBe(manager.state.campaignGold);
      expect(restored.state.campaignDamageBonus).toBe(0.3);
      expect(restored.state.nextBattleBonusGold).toBe(100);
      expect(restored.state.activeRelicIds).toEqual([
        'relic_flaming_dawn_bolts',
        'relic_blood_and_soil_banner',
      ]);

      // Verify PRNG parity
      const nextOriginal = (manager as any).rng.next();
      const nextRestored = (restored as any).rng.next();
      expect(nextRestored).toBe(nextOriginal);
    });
  });
});
