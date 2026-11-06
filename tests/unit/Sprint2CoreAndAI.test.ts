import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { MovementSystem } from '../../src/core/systems/MovementSystem';
import { CombatResolver } from '../../src/core/systems/CombatResolver';
import { AIController } from '../../src/core/ai/AIController';
import { UnitState } from '../../src/core/types';
import {
  SOLAR_FLAME_DURATION_TICKS,
  DAWN_PALADIN_STUN_TICKS,
  GREEK_FIRE_RADIUS_PX,
  GREEK_FIRE_DURATION_TICKS,
} from '../../src/core/config/ArenaConfig';

describe('Sprint 2 — Core Simulation & AI Specifications', () => {
  describe('P0-1: Vertical Convergence / Y-Steering (MovementSystem)', () => {
    it('Melee units on different vertical lanes converge in Y towards nearby enemies within AGGRO_RANGE_PX (260px)', () => {
      // Player Squire at (500, 180), Enemy Squire at (650, 260)
      // Horizontal delta = 150px, Vertical delta = 80px -> Euclidean dist = sqrt(150^2 + 80^2) = 170px <= 260px
      const playerSquire: UnitState = {
        id: 'u_p1',
        typeId: 'unit_squire',
        team: 'PLAYER',
        x: 500,
        y: 180,
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
      };

      const enemySquire: UnitState = {
        id: 'u_e1',
        typeId: 'unit_squire',
        team: 'ENEMY',
        x: 650,
        y: 260,
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
      };

      // Before movement, Y difference is 80px
      expect(Math.abs(playerSquire.y - enemySquire.y)).toBe(80);

      // Run 5 ticks of movement
      for (let i = 0; i < 5; i++) {
        MovementSystem.updateMovement([playerSquire, enemySquire]);
      }

      // Player Squire should have moved DOWN towards Y=260 (Y increased)
      expect(playerSquire.y).toBeGreaterThan(180);
      // Enemy Squire should have moved UP towards Y=180 (Y decreased)
      expect(enemySquire.y).toBeLessThan(260);
      // Total vertical distance must have decreased significantly
      expect(Math.abs(playerSquire.y - enemySquire.y)).toBeLessThan(80);
    });

    it('Units ignore enemies beyond AGGRO_RANGE_PX (260px) and move straight along X axis', () => {
      const playerSquire: UnitState = {
        id: 'u_p1',
        typeId: 'unit_squire',
        team: 'PLAYER',
        x: 200,
        y: 180,
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
      };

      const distantEnemy: UnitState = {
        id: 'u_e1',
        typeId: 'unit_squire',
        team: 'ENEMY',
        x: 800, // Distance = 600px > 260px
        y: 350,
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
      };

      MovementSystem.updateMovement([playerSquire, distantEnemy]);

      // Player Y should not have moved towards distant enemy
      expect(playerSquire.y).toBe(180);
      expect(playerSquire.x).toBeGreaterThan(200);
    });
  });

  describe('P0-2: Primary Target Splash Damage Exclusion (GameEngine)', () => {
    it('Solar Apprentice: primary target receives 100% direct damage, secondary receives 50% splash, primary is not hit twice', () => {
      const engine = new GameEngine({ seed: 42 });

      // Create Solar Apprentice (base damage 32 Magic, 40px AoE)
      const mage = engine.spawnUnit('PLAYER', 'unit_solar_apprentice');
      mage.x = 500;
      mage.y = 300;

      // Primary target: Enemy Squire at distance 100px (Light Armor / Heavy Armor: Squire has HEAVY 1 flat reduction)
      // Base 32 Magic vs HEAVY (1.5x) - 1 flat = floor(48 - 1) = 47 direct damage.
      // Max HP of Squire = 380.
      const primaryTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      primaryTarget.x = 550;
      primaryTarget.y = 300;

      // Secondary target: Enemy Squire positioned 20px next to primary target (within 40px AoE)
      // Splash damage: base 16 Magic vs HEAVY (1.5x) - 1 = floor(24 - 1) = 23 splash damage.
      const secondaryTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      secondaryTarget.x = 560;
      secondaryTarget.y = 310;

      // Distant target: beyond 40px AoE
      const distantTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      distantTarget.x = 700;
      distantTarget.y = 300;

      const initialPrimaryHp = primaryTarget.currentHp;
      const initialSecondaryHp = secondaryTarget.currentHp;
      const initialDistantHp = distantTarget.currentHp;

      // Force target and cooldown ready
      mage.targetUnitId = primaryTarget.id;
      mage.attackCooldownTicks = 0;

      // Execute 1 tick
      engine.tick();

      const primaryDamageTaken = initialPrimaryHp - primaryTarget.currentHp;
      const secondaryDamageTaken = initialSecondaryHp - secondaryTarget.currentHp;
      const distantDamageTaken = initialDistantHp - distantTarget.currentHp;

      // Primary took exactly 47 direct damage (NOT 47 + 23 = 70)
      expect(primaryDamageTaken).toBe(47);
      // Secondary took exactly 23 splash damage
      expect(secondaryDamageTaken).toBe(23);
      // Distant target took 0 damage
      expect(distantDamageTaken).toBe(0);
    });
  });

  describe('P0-3: Royal Knight Smashing Strike Cadence & Knockback', () => {
    it('Royal Knight triggers Smashing Strike on every 3rd attack with 1.50x damage and 20px knockback', () => {
      const engine = new GameEngine({ seed: 42 });

      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      knight.x = 500;
      knight.y = 300;

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.x = 530;
      enemy.y = 300;

      knight.targetUnitId = enemy.id;

      // Attack 1: normal attack (1.0x)
      knight.attackCooldownTicks = 0;
      knight.attackCount = 0;
      const xBefore1 = enemy.x;
      engine.tick();
      expect(knight.attackCount).toBe(1);
      expect(enemy.x).toBe(xBefore1); // No knockback

      // Attack 2: normal attack (1.0x)
      knight.attackCooldownTicks = 0;
      const xBefore2 = enemy.x;
      engine.tick();
      expect(knight.attackCount).toBe(2);
      expect(enemy.x).toBe(xBefore2); // No knockback

      // Attack 3: Smashing Strike! (1.50x + 20px knockback)
      knight.attackCooldownTicks = 0;
      const xBefore3 = enemy.x;
      engine.tick();
      expect(knight.attackCount).toBe(3);
      // Enemy was pushed 20px towards enemy rear (530 + 20 = 550)
      expect(enemy.x).toBe(xBefore3 + 20);
    });

    it('Smashing Strike against Citadel does NOT apply physical displacement', () => {
      const engine = new GameEngine({ seed: 42 });

      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      knight.x = 1980;
      knight.y = 300;
      knight.isTargetingCitadel = true;
      knight.attackCount = 2; // Next is 3rd attack (Smashing Strike)
      knight.attackCooldownTicks = 0;

      const citadelXBefore = engine.citadels.ENEMY.x;
      const citadelHpBefore = engine.citadels.ENEMY.currentHp;

      engine.tick();

      expect(engine.citadels.ENEMY.x).toBe(citadelXBefore); // Absolutely static
      expect(engine.citadels.ENEMY.currentHp).toBeLessThan(citadelHpBefore);
    });
  });

  describe('10 Unit Special Abilities', () => {
    it('1. Squire Shield Formation: reduces ranged piercing damage by 20%', () => {
      // Longbowman: 22 Piercing vs Squire HEAVY (0.75x) - 1 flat
      // Without passive: floor(22 * 0.75 - 1) = 15
      // With Shield Formation: floor(22 * 0.75 * 0.80 - 1) = floor(13.2 - 1) = 12
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 22,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_longbowman',
        defenderTypeId: 'unit_squire',
        isRangedAttack: true,
        applyPassives: true,
      });

      expect(damage).toBe(12);
    });

    it('3. Longbowman Rapid Volley: triggers 19 ticks cooldown after 60 stationary ticks', () => {
      const engine = new GameEngine({ seed: 42 });
      const archer = engine.spawnUnit('PLAYER', 'unit_longbowman');
      archer.ticksStationary = 60;

      const cooldown = engine.calculateAttackCooldownTicks(archer);
      // 1.10 / 1.15 = 0.9565s -> round(0.9565 * 20) = 19 ticks
      expect(cooldown).toBe(19);
    });

    it('4. Siege Crossbowman Armor-Piercing Bolt: halves flat reduction and gets 1.20x vs MaxHP > 600', () => {
      // Base: 55 Piercing vs Royal Knight (720 HP > 600, HEAVY armor, 3 flat reduction)
      // Piercing vs HEAVY = 0.75x.
      // Halved flat reduction = floor(3 * 0.5) = 1.
      // 55 * 0.75 * 1.20 = 49.5.
      // floor(49.5 - 1) = 48 damage.
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 55,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 3,
        attackerTypeId: 'unit_siege_crossbowman',
        defenderTypeId: 'unit_royal_knight',
        defenderMaxHp: 720,
        applyPassives: true,
      });

      expect(damage).toBe(48);
    });

    it('6. Solar Archmage Supernova da Alvorada on 4th attack: 110 Magic Base in 100px AoE and applies Solar Flame', () => {
      const engine = new GameEngine({ seed: 42 });

      const archmage = engine.spawnUnit('PLAYER', 'unit_solar_archmage');
      archmage.x = 500;
      archmage.y = 300;
      archmage.attackCount = 3; // 4th attack will be Supernova
      archmage.attackCooldownTicks = 0;

      const enemy1 = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy1.x = 550;
      enemy1.y = 300;

      const enemy2 = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy2.x = 580;
      enemy2.y = 340; // Euclidean dist = sqrt(30^2 + 40^2) = 50px <= 100px

      archmage.targetUnitId = enemy1.id;

      engine.tick();

      expect(archmage.attackCount).toBe(4);
      // Both enemies took heavy magic damage from 110 base
      // 110 * 1.50 (Magic vs HEAVY) - 1 = floor(165 - 1) = 164 damage
      expect(380 - enemy1.currentHp).toBe(164);
      expect(380 - enemy2.currentHp).toBe(164);

      // Both enemies received Solar Flame debuff
      expect(enemy1.solarFlameTicksRemaining).toBe(SOLAR_FLAME_DURATION_TICKS);
      expect(enemy2.solarFlameTicksRemaining).toBe(SOLAR_FLAME_DURATION_TICKS);

      // Attack cooldown under Solar Flame is increased by / 0.75
      const enemyDefCooldown = engine.calculateAttackCooldownTicks(enemy1);
      // Squire base interval 1.2s -> 1.2 / 0.75 = 1.6s -> 32 ticks (vs standard 24 ticks)
      expect(enemyDefCooldown).toBe(32);
    });

    it('7. Mounted Spearman: charges at 220 px/s when enemy in [150, 300]px, deals 2.0x on first strike', () => {
      const engine = new GameEngine({ seed: 42 });

      const spearman = engine.spawnUnit('PLAYER', 'unit_mounted_spearman');
      spearman.x = 200;
      spearman.y = 300;

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.x = 420; // deltaX = 220px in [150, 300]
      enemy.y = 300;

      expect(spearman.hasCharged).toBe(false);

      // First tick of movement should accelerate
      const initialX = spearman.x;
      MovementSystem.updateMovement([spearman, enemy]);

      // Move step with 220px/s * 0.05s = 11px (vs standard 120 * 0.05 = 6px)
      expect(spearman.x - initialX).toBeCloseTo(11, 1);

      // Test combat strike: 2.00x critical
      const result = CombatResolver.resolveDamage({
        baseDamage: 28,
        damageType: 'NORMAL',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_mounted_spearman',
        isChargeAttack: true,
        applyPassives: true,
      });

      // 28 * 1.0 (Normal vs Heavy) * 2.0 - 1 = 56 - 1 = 55
      expect(result.effectiveDamage).toBe(55);
      expect(result.isCritical).toBe(true);
    });

    it('8. Dawn Paladin: Sacred Charge (2.5x + 1s Stun) and Devotion Aura (+1 flat reduction in 120px)', () => {
      const engine = new GameEngine({ seed: 42 });

      const paladin = engine.spawnUnit('PLAYER', 'unit_dawn_paladin');
      paladin.x = 500;
      paladin.y = 300;

      const allySquire = engine.spawnUnit('PLAYER', 'unit_squire');
      allySquire.x = 560; // Distance = 60px <= 120px
      allySquire.y = 300;

      // Devotion Aura check: ally within 120px has aura
      expect(engine.hasPaladinAura(allySquire)).toBe(true);
      expect(engine.hasPaladinAura(paladin)).toBe(true); // Paladin protects self

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.x = 540;
      enemy.y = 300;

      paladin.targetUnitId = enemy.id;
      paladin.attackCooldownTicks = 0;
      paladin.hasCharged = false;

      engine.tick();

      // Paladin first strike applies 1s (20 ticks) stun, which consumed 1 tick during Movement phase
      expect(enemy.stunTicksRemaining).toBe(DAWN_PALADIN_STUN_TICKS - 1); // 19 ticks remaining
      expect(paladin.hasCharged).toBe(true);

      // While stunned, enemy cannot move or advance cooldown
      const enemyX = enemy.x;
      MovementSystem.updateMovement([enemy]);
      // Decrements stun, stays stationary
      expect(enemy.stunTicksRemaining).toBe(DAWN_PALADIN_STUN_TICKS - 2); // 18 ticks remaining
      expect(enemy.x).toBe(enemyX);
    });

    it('9. Mobile Ballista: Piercing Bolt hits primary target and +1 aligned enemy behind it', () => {
      const engine = new GameEngine({ seed: 42 });

      const ballista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      ballista.x = 200;
      ballista.y = 300;

      const primaryTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      primaryTarget.x = 500;
      primaryTarget.y = 300;

      // Secondary target aligned behind primary: deltaX = 60px (in [0, 120]), deltaY = 10px (<= 30px)
      const piercedTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      piercedTarget.x = 560;
      piercedTarget.y = 310;

      // Unaligned target (deltaY > 30px)
      const unalignedTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      unalignedTarget.x = 560;
      unalignedTarget.y = 360;

      ballista.targetUnitId = primaryTarget.id;
      ballista.attackCooldownTicks = 0;

      const primHpBefore = primaryTarget.currentHp;
      const secHpBefore = piercedTarget.currentHp;
      const unalignedHpBefore = unalignedTarget.currentHp;

      engine.tick();

      // Primary took 90 Siege vs Heavy (0.5x) - 1 = floor(45 - 1) = 44 damage
      expect(primHpBefore - primaryTarget.currentHp).toBe(44);
      // Secondary aligned enemy also took 44 damage!
      expect(secHpBefore - piercedTarget.currentHp).toBe(44);
      // Unaligned enemy took 0 damage
      expect(unalignedHpBefore - unalignedTarget.currentHp).toBe(0);
    });

    it('10. Greek Fire Catapult: Direct hit + splash + Ground Hazard that deals 25 Magic damage/s, Citadel immune to ground pool', () => {
      const engine = new GameEngine({ seed: 42 });

      const catapult = engine.spawnUnit('PLAYER', 'unit_greek_fire_catapult');
      catapult.x = 200;
      catapult.y = 300;

      const target = engine.spawnUnit('ENEMY', 'unit_squire');
      target.x = 600;
      target.y = 300;

      catapult.targetUnitId = target.id;
      catapult.attackCooldownTicks = 0;

      expect(engine.hazards.length).toBe(0);

      engine.tick();

      // Direct hit spawned a Greek Fire hazard pool during Combat phase
      expect(engine.hazards.length).toBe(1);
      const hazard = engine.hazards[0];
      expect(hazard.radiusPx).toBe(GREEK_FIRE_RADIUS_PX);
      expect(hazard.ticksRemaining).toBe(GREEK_FIRE_DURATION_TICKS); // Created with 80 ticks

      // Simulate 20 ticks until next hazard pulse (at ticksRemaining = 60)
      const enemyInPool = engine.spawnUnit('ENEMY', 'unit_squire');
      enemyInPool.x = 620;
      enemyInPool.y = 300;
      const hpBefore = enemyInPool.currentHp;

      for (let t = 0; t < 20; t++) {
        engine.tick();
      }

      // Hazard pulsed at tickRemaining 60: 25 Magic vs Heavy (1.5x) - 1 = floor(37.5 - 1) = 36 damage
      expect(hpBefore - enemyInPool.currentHp).toBe(36);
    });
  });

  describe('AI Opponent Controller (Section 3 of GD Spec)', () => {
    it('Threat Analysis correctly computes heavyThreat, lightThreat, and siegeThreat', () => {
      const controller = new AIController('AGGRESSIVE');

      const units: UnitState[] = [
        {
          id: 'u_p1',
          typeId: 'unit_squire', // HEAVY, maxHp 380
          team: 'PLAYER',
          x: 500,
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
        },
        {
          id: 'u_p2',
          typeId: 'unit_longbowman', // LIGHT, maxHp 170
          team: 'PLAYER',
          x: 400,
          y: 300,
          currentHp: 170,
          maxHp: 170,
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
        },
        {
          id: 'u_p3',
          typeId: 'unit_mobile_ballista', // SIEGE, FORTIFIED, maxHp 310
          team: 'PLAYER',
          x: 300,
          y: 300,
          currentHp: 310,
          maxHp: 310,
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
        },
      ];

      const threats = controller.calculateThreats(units);
      expect(threats.heavyThreat).toBe(380);
      expect(threats.lightThreat).toBe(170);
      expect(threats.siegeThreat).toBe(1);
    });

    it('Aggressive Profile ("Comandante Valerius") executes initial sequence (Barracks slot 0 & 1, Stable slot 2)', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 300, // Enough to execute opening
      });

      // Tick 20: AI decision cycle
      for (let t = 0; t < 20; t++) engine.tick();

      const enemySlot0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
      expect(enemySlot0?.structureId).toBe('bldg_barracks_1');

      // Tick 40: Next step
      for (let t = 0; t < 20; t++) engine.tick();
      const enemySlot1 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 1);
      expect(enemySlot1?.structureId).toBe('bldg_barracks_1');
    });

    it('Defensive Profile ("Grão-Marechal Thorne") invests in Mine N1 when frontline <= 1000 and builds Barracks Slot 0 and Archery Slot 3', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'DEFENSIVE',
        initialEnemyGold: 300,
      });

      // Frontline starts at 1000 <= 1000, so Thorne upgrades Mine to Level 1
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.economy.ENEMY.mineLevel).toBe(1);

      // Next decision cycle (tick 40): builds Barracks in Slot 0
      for (let t = 0; t < 20; t++) engine.tick();
      const slot0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
      expect(slot0?.structureId).toBe('bldg_barracks_1');

      // Next decision cycle (tick 60): builds Archery in Slot 3
      for (let t = 0; t < 20; t++) engine.tick();
      const slot3 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 3);
      expect(slot3?.structureId).toBe('bldg_archery_1');
    });

    it('Swarm Profile ("Rainha Seline") prioritizes filling N1 slots before any N2 upgrades', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'SWARM',
        initialEnemyGold: 500,
      });

      // Run multiple decision cycles
      for (let t = 0; t < 100; t++) engine.tick();

      const enemySlots = engine.slots.filter((s) => s.team === 'ENEMY' && s.structureId !== null);
      // Swarm should have built several N1 structures (Barracks/Archery)
      expect(enemySlots.length).toBeGreaterThanOrEqual(3);
      // None should be Tier 2 yet
      const tier2 = enemySlots.filter((s) => s.structureId?.endsWith('_2'));
      expect(tier2.length).toBe(0);
    });

    it('Boss Act 1 ("O Tirano de Ferro") starts with 200g, Renegade Altar in Slot 11, and spawns Colossal Warrior', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'BOSS_ACT1',
      });

      expect(engine.economy.ENEMY.gold).toBe(200);

      const slot11 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 11);
      expect(slot11?.structureId).toBe('bldg_renegade_altar');
      expect(slot11?.totalSpawnCooldownTicks).toBe(900); // 45.0s @ 20 TPS

      // Attempting to sell the Boss Altar is rejected
      const refund = engine.sellStructure('ENEMY', 11);
      expect(refund).toBe(0);
      expect(slot11?.structureId).toBe('bldg_renegade_altar');

      // Test Colossal Warrior spawn from Altar
      slot11!.currentSpawnCooldownTicks = 1;
      engine.tick();

      const colossal = engine.units.find((u) => u.typeId === 'unit_colossal_warrior');
      expect(colossal).toBeDefined();
      expect(colossal?.team).toBe('ENEMY');
      expect(colossal?.maxHp).toBe(1800);
      expect(colossal?.currentHp).toBe(1800);
    });
  });

  describe('Snapshots and SHA-256 State Hash with Hazards', () => {
    it('Snapshot exposes hazards and computeStateHash includes hazard state deterministically', () => {
      const engine = new GameEngine({ seed: 999 });

      const snapBefore = engine.getSnapshot();
      expect(snapBefore.hazards).toBeDefined();
      expect(Array.isArray(snapBefore.hazards)).toBe(true);

      const hash1 = engine.computeStateHash();

      // Add a hazard
      engine.hazards.push({
        id: 'hazard_test',
        team: 'PLAYER',
        x: 600,
        y: 300,
        radiusPx: 120,
        ticksRemaining: 80,
        tickInterval: 20,
        baseMagicDamage: 25,
      });

      const hash2 = engine.computeStateHash();
      // Hashes must differ because hazard state is incorporated
      expect(hash1).not.toBe(hash2);

      const snapAfter = engine.getSnapshot();
      expect(snapAfter.hazards.length).toBe(1);
      expect(snapAfter.hazards[0].id).toBe('hazard_test');
    });
  });
});
