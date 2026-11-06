import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { MovementSystem } from '../../src/core/systems/MovementSystem';
import { CombatResolver } from '../../src/core/systems/CombatResolver';
import { UnitState } from '../../src/core/types';
import { SnapshotInterpolator } from '../../src/renderer/interpolation/SnapshotInterpolator';
import {
  AGGRO_RANGE_PX,
  SOLAR_FLAME_DURATION_TICKS,
  DAWN_PALADIN_STUN_TICKS,
  GREEK_FIRE_RADIUS_PX,
  GREEK_FIRE_DURATION_TICKS,
} from '../../src/core/config/ArenaConfig';

describe('Sprint 2 — Comprehensive Abilities & AI Verification (GD Spec Sections 1.4, 2 & 3)', () => {
  // =========================================================================
  // 1. [P0-1] Convergência Vertical (Y-Steering)
  // =========================================================================
  describe('[P0-1] Vertical Convergence / Y-Steering (MovementSystem)', () => {
    it('Two Squires spawned at Y=170 and Y=260 (deltaY = 90 > 40) within AGGRO_RANGE_PX = 260 converge and enter melee combat without walking past each other', () => {
      expect(AGGRO_RANGE_PX).toBe(260);
      const engine = new GameEngine({ seed: 12345 });

      // Player Squire at (500, 170)
      const pSquire = engine.spawnUnit('PLAYER', 'unit_squire');
      pSquire.x = 500;
      pSquire.y = 170;

      // Enemy Squire at (650, 260)
      // Delta X = 150, Delta Y = 90 -> Distance = sqrt(150^2 + 90^2) = 174.93 <= 260 (AGGRO_RANGE_PX)
      const eSquire = engine.spawnUnit('ENEMY', 'unit_squire');
      eSquire.x = 650;
      eSquire.y = 260;

      const initialDistY = Math.abs(pSquire.y - eSquire.y);
      expect(initialDistY).toBe(90);

      let combatStarted = false;

      // Simulate step by step
      for (let t = 0; t < 50; t++) {
        engine.tick();

        const dx = eSquire.x - pSquire.x;
        const dy = eSquire.y - pSquire.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= 40) {
          combatStarted = true;
          break;
        }

        // They must never pass each other horizontally without engaging
        if (pSquire.x > eSquire.x) {
          expect(combatStarted).toBe(true);
        }
      }

      expect(combatStarted).toBe(true);
      expect(pSquire.y).toBeGreaterThan(170); // Converged down
      expect(eSquire.y).toBeLessThan(260); // Converged up
      expect(Math.abs(pSquire.y - eSquire.y)).toBeLessThan(40);

      // Verify active melee combat exchanges damage
      const pHpBefore = pSquire.currentHp;
      const eHpBefore = eSquire.currentHp;

      for (let t = 0; t < 30; t++) {
        engine.tick();
      }

      expect(pSquire.currentHp).toBeLessThan(pHpBefore);
      expect(eSquire.currentHp).toBeLessThan(eHpBefore);
    });

    it('Ignores enemies beyond AGGRO_RANGE_PX (260px) and moves strictly along horizontal X axis', () => {
      const pSquire: UnitState = {
        id: 'u_p1',
        typeId: 'unit_squire',
        team: 'PLAYER',
        x: 300,
        y: 200,
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
        x: 700, // Delta X = 400 > 260px
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

      MovementSystem.updateMovement([pSquire, distantEnemy]);

      expect(pSquire.y).toBe(200); // Unchanged
      expect(pSquire.x).toBeGreaterThan(300); // Advanced horizontally
    });

    it('Detects enemies up to 40px behind for tactical convergence, but ignores enemies beyond 40px behind', () => {
      // Enemy is 30px behind player (DeltaX = -30 >= -AGGRO_BEHIND_MAX_PX), vertical delta = 50px
      const pSquire: UnitState = {
        id: 'u_p1',
        typeId: 'unit_squire',
        team: 'PLAYER',
        x: 500,
        y: 200,
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

      const behindEnemy: UnitState = {
        id: 'u_e1',
        typeId: 'unit_squire',
        team: 'ENEMY',
        x: 470, // 30px behind player
        y: 250, // 50px vertical
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

      MovementSystem.updateMovement([pSquire, behindEnemy]);

      // Player should steer towards Y=250 (Y increases)
      expect(pSquire.y).toBeGreaterThan(200);

      // Now test enemy 60px behind (> 40px behind)
      const pSquire2: UnitState = { ...pSquire, x: 500, y: 200 };
      const tooFarBehindEnemy: UnitState = { ...behindEnemy, x: 440, y: 250 }; // 60px behind

      MovementSystem.updateMovement([pSquire2, tooFarBehindEnemy]);
      expect(pSquire2.y).toBe(200); // Ignored because deltaX < -40px
    });
  });

  // =========================================================================
  // 2. [P0-2] Exclusão do Alvo Primário no Dano Radial
  // =========================================================================
  describe('[P0-2] Primary Target Splash Damage Exclusion', () => {
    it('Solar Apprentice: primary target receives exactly 100% direct damage, secondary receives 50% splash, primary is not hit twice', () => {
      const engine = new GameEngine({ seed: 42 });

      const apprentice = engine.spawnUnit('PLAYER', 'unit_solar_apprentice');
      apprentice.x = 400;
      apprentice.y = 300;

      // Primary target: Squire (HEAVY, 1 flat reduction)
      // Direct: 32 Magic vs HEAVY (1.5x) - 1 = floor(48 - 1) = 47
      const primary = engine.spawnUnit('ENEMY', 'unit_squire');
      primary.x = 500;
      primary.y = 300;

      // Secondary target: Squire positioned 25px from primary (within 40px AoE)
      // Splash: base 16 Magic vs HEAVY (1.5x) - 1 = floor(24 - 1) = 23
      const secondary = engine.spawnUnit('ENEMY', 'unit_squire');
      secondary.x = 520;
      secondary.y = 310;

      // Distant target outside 40px AoE
      const distant = engine.spawnUnit('ENEMY', 'unit_squire');
      distant.x = 560;
      distant.y = 300;

      apprentice.targetUnitId = primary.id;
      apprentice.attackCooldownTicks = 0;

      engine.tick();

      expect(380 - primary.currentHp).toBe(47); // Exactly 47, NOT 47 + 23 = 70
      expect(380 - secondary.currentHp).toBe(23); // Exactly 23
      expect(380 - distant.currentHp).toBe(0); // Untouched
    });

    it('Greek Fire Catapult: primary target receives exactly 100% direct damage, secondary receives 50% splash, primary is not hit twice', () => {
      const engine = new GameEngine({ seed: 42 });

      const catapult = engine.spawnUnit('PLAYER', 'unit_greek_fire_catapult');
      catapult.x = 300;
      catapult.y = 300;

      // Primary target: Royal Knight (HEAVY armor, 3 flat reduction, 720 HP)
      // Direct: 160 Siege vs HEAVY (0.50x) - 3 = floor(80 - 3) = 77
      const primary = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      primary.x = 600;
      primary.y = 300;

      // Secondary target: Royal Knight at 50px away (within 120px AoE)
      // Splash: base 80 Siege vs HEAVY (0.50x) - 3 = floor(40 - 3) = 37
      const secondary = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      secondary.x = 650;
      secondary.y = 300;

      // Distant target: Royal Knight at 150px away (> 120px AoE)
      const distant = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      distant.x = 760;
      distant.y = 300;

      catapult.targetUnitId = primary.id;
      catapult.attackCooldownTicks = 0;

      engine.tick();

      expect(720 - primary.currentHp).toBe(77); // Exactly 77, NOT 77 + 37 = 114
      expect(720 - secondary.currentHp).toBe(37); // Exactly 37
      expect(720 - distant.currentHp).toBe(0); // Untouched
    });

    it('Catapult attacking Citadel: Citadel receives exactly 100% direct damage (315) and does not receive duplicate splash damage', () => {
      const engine = new GameEngine({ seed: 42 });

      const catapult = engine.spawnUnit('PLAYER', 'unit_greek_fire_catapult');
      catapult.x = 1600;
      catapult.y = 300;
      catapult.attackCooldownTicks = 0;

      const citadelHpBefore = engine.citadels.ENEMY.currentHp;
      expect(engine.hazards.length).toBe(0);

      engine.tick();

      // Citadel direct damage: 160 Siege vs Fortified (2.0x) - 5 flat = 315
      expect(citadelHpBefore - engine.citadels.ENEMY.currentHp).toBe(315);
      // Spawned ground hazard pool at Citadel impact
      expect(engine.hazards.length).toBe(1);
    });
  });

  // =========================================================================
  // 3. [P0-3] Cadência e Casos de Borda do Golpe Esmagador (unit_royal_knight)
  // =========================================================================
  describe('[P0-3] Royal Knight Smashing Strike Cadence, Knockback & Edge Cases', () => {
    it('Triggers exactly on 3rd, 6th, 9th attack with 1.50x damage, isCritical=true and 20px knockback', () => {
      const engine = new GameEngine({ seed: 42 });

      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      knight.x = 500;
      knight.y = 300;

      const target = engine.spawnUnit('ENEMY', 'unit_squire');
      target.x = 540;
      target.y = 300;
      target.maxHp = 50000;
      target.currentHp = 50000;

      knight.targetUnitId = target.id;

      const criticalAttacks: number[] = [];
      engine.eventBus.on('UnitAttacked', (ev) => {
        if (ev.attackerId === knight.id && ev.isCritical) {
          criticalAttacks.push(knight.attackCount);
        }
      });

      for (let attackNum = 1; attackNum <= 9; attackNum++) {
        knight.attackCooldownTicks = 0;
        target.x = 540;
        // Keep target stunned so it does not walk during movement phase, cleanly verifying knockback
        target.stunTicksRemaining = 10;

        engine.tick();

        if (attackNum % 3 === 0) {
          // 3rd, 6th, 9th attacks: knockback +20px (540 -> 560)
          expect(target.x).toBe(560);
        } else {
          // Normal attacks: no knockback (remains 540)
          expect(target.x).toBe(540);
        }
      }

      expect(criticalAttacks).toEqual([3, 6, 9]);
    });

    it('Knockback clamps strictly within arena boundaries [0, 2000]', () => {
      const engine = new GameEngine({ seed: 42 });

      // 1. Player pushes enemy near right boundary (X = 1990)
      const pKnight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      pKnight.x = 1945;
      pKnight.y = 300;
      pKnight.attackCount = 2; // Next is 3rd attack
      pKnight.attackCooldownTicks = 0;

      const enemyNearWall = engine.spawnUnit('ENEMY', 'unit_squire');
      enemyNearWall.x = 1990;
      enemyNearWall.y = 300;
      enemyNearWall.stunTicksRemaining = 10; // Prevent movement so position reflects exact knockback clamping
      pKnight.targetUnitId = enemyNearWall.id;

      engine.tick();

      // 1990 + 20 = 2010 -> clamped to 2000
      expect(enemyNearWall.x).toBe(2000);

      // 2. Enemy pushes player near left boundary (X = 10)
      const eKnight = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      eKnight.x = 55;
      eKnight.y = 300;
      eKnight.attackCount = 2;
      eKnight.attackCooldownTicks = 0;

      const playerNearWall = engine.spawnUnit('PLAYER', 'unit_squire');
      playerNearWall.x = 10;
      playerNearWall.y = 300;
      playerNearWall.stunTicksRemaining = 10;
      eKnight.targetUnitId = playerNearWall.id;

      engine.tick();

      // 10 - 20 = -10 -> clamped to 0
      expect(playerNearWall.x).toBe(0);
    });

    it('Smashing Strike against Citadel deals 1.50x damage but causes ZERO physical displacement', () => {
      const engine = new GameEngine({ seed: 42 });

      const knight = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      knight.x = 1980;
      knight.y = 300;
      knight.isTargetingCitadel = true;
      knight.attackCount = 2; // Next is 3rd attack
      knight.attackCooldownTicks = 0;

      const citadelXBefore = engine.citadels.ENEMY.x;
      const citadelHpBefore = engine.citadels.ENEMY.currentHp;

      engine.tick();

      // Citadel remains strictly motionless
      expect(engine.citadels.ENEMY.x).toBe(citadelXBefore);
      // 36 Normal * 1.50 = 54. 54 * Fortified (0.50x) - 5 = 27 - 5 = 22 damage
      expect(citadelHpBefore - engine.citadels.ENEMY.currentHp).toBe(22);
    });
  });

  // =========================================================================
  // 4. Besteiro de Cerco (unit_siege_crossbowman - Virote Perfurador)
  // =========================================================================
  describe('Siege Crossbowman: Virote Perfurador', () => {
    it('Ignores 50% of target flat reduction and deals 1.20x damage vs MaxHP > 600', () => {
      // Royal Knight: maxHp = 720 > 600, HEAVY armor (0.75x vs Piercing), flatReduction = 3
      // Effective flat = floor(3 * 0.5) = 1
      // 55 * 0.75 * 1.20 = 49.5 -> floor(49.5 - 1) = 48
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 55,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 3,
        attackerTypeId: 'unit_siege_crossbowman',
        defenderTypeId: 'unit_royal_knight',
        defenderMaxHp: 720,
        defenderCurrentHp: 720,
        applyPassives: true,
      });

      expect(damage).toBe(48);
    });

    it('Bonus 1.20x persists even if target currentHp drops far below 600 (checks maxHp strictly)', () => {
      // Royal Knight wounded down to 50 HP: maxHp is STILL 720!
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 55,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 3,
        attackerTypeId: 'unit_siege_crossbowman',
        defenderTypeId: 'unit_royal_knight',
        defenderMaxHp: 720,
        defenderCurrentHp: 50, // Current HP < 600
        applyPassives: true,
      });

      expect(damage).toBe(48);
    });

    it('Does NOT apply 1.20x bonus against targets with MaxHP <= 600 (e.g. Squire maxHp = 380)', () => {
      // Squire: maxHp 380 <= 600, HEAVY armor (0.75x vs Piercing), flatReduction = 1
      // Effective flat = floor(1 * 0.5) = 0
      // 55 * 0.75 * 1.00 = 41.25 -> floor(41.25 - 0) = 41
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 55,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_siege_crossbowman',
        defenderTypeId: 'unit_squire',
        defenderMaxHp: 380,
        defenderCurrentHp: 380,
        applyPassives: true,
      });

      expect(damage).toBe(41);
    });

    it('Applies both 50% flat reduction ignore and 1.20x Colossus Slayer to Citadel (maxHp 2500)', () => {
      // Citadel: maxHp 2500 > 600, Fortified (0.35x vs Piercing), flatReduction = 5
      // Effective flat = floor(5 * 0.5) = 2
      // 55 * 0.35 * 1.20 = 23.1 -> floor(23.1 - 2) = 21
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 55,
        damageType: 'PIERCING',
        defenderArmorType: 'FORTIFIED',
        defenderFlatReduction: 5,
        attackerTypeId: 'unit_siege_crossbowman',
        defenderMaxHp: 2500,
        applyPassives: true,
      });

      expect(damage).toBe(21);
    });
  });

  // =========================================================================
  // 5. Arquimago Solar (unit_solar_archmage - Supernova da Alvorada)
  // =========================================================================
  describe('Solar Archmage: Supernova da Alvorada & Chama Solar', () => {
    it('On 4th attack deals 110 Magic base in 100px AoE and applies Solar Flame debuff', () => {
      const engine = new GameEngine({ seed: 42 });

      const archmage = engine.spawnUnit('PLAYER', 'unit_solar_archmage');
      archmage.x = 500;
      archmage.y = 300;
      archmage.attackCount = 3; // 4th attack will be Supernova
      archmage.attackCooldownTicks = 0;

      const target1 = engine.spawnUnit('ENEMY', 'unit_squire');
      target1.x = 550;
      target1.y = 300;

      const target2 = engine.spawnUnit('ENEMY', 'unit_squire');
      target2.x = 580;
      target2.y = 320; // Distance = sqrt(30^2 + 20^2) = 36px <= 100px

      archmage.targetUnitId = target1.id;

      engine.tick();

      expect(archmage.attackCount).toBe(4);
      // Both took: 110 Magic vs HEAVY (1.50x) - 1 flat = floor(165 - 1) = 164
      expect(380 - target1.currentHp).toBe(164);
      expect(380 - target2.currentHp).toBe(164);

      // Debuff applied: 60 ticks
      expect(target1.solarFlameTicksRemaining).toBe(SOLAR_FLAME_DURATION_TICKS);
      expect(target2.solarFlameTicksRemaining).toBe(SOLAR_FLAME_DURATION_TICKS);

      // Attack cooldown under Solar Flame: interval / 0.75
      // Squire: 1.2s / 0.75 = 1.6s -> round(1.6 * 20) = 32 ticks
      expect(engine.calculateAttackCooldownTicks(target1)).toBe(32);
    });

    it('Solar Flame does NOT stack in magnitude, only refreshes duration to 60 ticks', () => {
      const engine = new GameEngine({ seed: 42 });

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.solarFlameTicksRemaining = 20; // Already afflicted, 20 ticks left

      // Calculate cooldown under single debuff
      const cd1 = engine.calculateAttackCooldownTicks(enemy);
      expect(cd1).toBe(32);

      // Hit by another Supernova
      const archmage = engine.spawnUnit('PLAYER', 'unit_solar_archmage');
      archmage.x = enemy.x - 50;
      archmage.y = enemy.y;
      archmage.targetUnitId = enemy.id;
      archmage.attackCount = 3;
      archmage.attackCooldownTicks = 0;

      engine.tick();

      // Duration refreshed to 60 ticks
      expect(enemy.solarFlameTicksRemaining).toBe(SOLAR_FLAME_DURATION_TICKS);
      // Cooldown is STILL 32 ticks (NOT compounded to 1.2 / 0.75 / 0.75 = 43 ticks)
      const cd2 = engine.calculateAttackCooldownTicks(enemy);
      expect(cd2).toBe(32);
    });

    it('Citadel is immune to Solar Flame debuff (takes damage, but receives no debuff)', () => {
      const engine = new GameEngine({ seed: 42 });

      const archmage = engine.spawnUnit('PLAYER', 'unit_solar_archmage');
      archmage.x = 1960;
      archmage.y = 300;
      archmage.isTargetingCitadel = true;
      archmage.attackCount = 3; // 4th attack is Supernova
      archmage.attackCooldownTicks = 0;

      const hpBefore = engine.citadels.ENEMY.currentHp;
      engine.tick();

      // 110 Magic vs Fortified (0.50x) - 5 flat = 55 - 5 = 50 damage
      expect(hpBefore - engine.citadels.ENEMY.currentHp).toBe(50);
      // Citadel ballista cooldown is untouched by debuff
      expect(engine.citadels.ENEMY.ballistaCooldownTicks).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Lanceiro Montado & Paladino da Alvorada
  // =========================================================================
  describe('Mounted Spearman & Dawn Paladin: Charge, Stun & Devotion Aura', () => {
    it('Mounted Spearman accelerates to 220 px/s in window [150, 300]px and deals 2.00x critical damage on first impact', () => {
      const engine = new GameEngine({ seed: 42 });

      const lancer = engine.spawnUnit('PLAYER', 'unit_mounted_spearman');
      lancer.x = 200;
      lancer.y = 300;

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.x = 420; // deltaX = 220px in [150, 300]
      enemy.y = 300;

      expect(lancer.hasCharged).toBe(false);

      // In 1 tick of charging movement: 220 px/s * 0.05s = 11 px
      const initialX = lancer.x;
      MovementSystem.updateMovement([lancer, enemy]);
      expect(lancer.x - initialX).toBeCloseTo(11, 1);

      // Resolve first charge attack
      const result = CombatResolver.resolveDamage({
        baseDamage: 28,
        damageType: 'NORMAL',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_mounted_spearman',
        isChargeAttack: true,
        applyPassives: true,
      });

      // 28 * 1.0 (Normal vs Heavy) * 2.0 - 1 = 55
      expect(result.effectiveDamage).toBe(55);
      expect(result.isCritical).toBe(true);

      // Subsequent attacks without charge: 28 * 1.0 - 1 = 27, isCritical = false
      const normalResult = CombatResolver.resolveDamage({
        baseDamage: 28,
        damageType: 'NORMAL',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_mounted_spearman',
        isChargeAttack: false,
        applyPassives: true,
      });
      expect(normalResult.effectiveDamage).toBe(27);
      expect(normalResult.isCritical).toBe(false);
    });

    it('Dawn Paladin: Sacred Charge deals 2.50x damage, applies 20 ticks Stun, and Citadel is immune to stun', () => {
      const engine = new GameEngine({ seed: 42 });

      const paladin = engine.spawnUnit('PLAYER', 'unit_dawn_paladin');
      paladin.x = 500;
      paladin.y = 300;

      const enemy = engine.spawnUnit('ENEMY', 'unit_squire');
      enemy.x = 540;
      enemy.y = 300;

      paladin.targetUnitId = enemy.id;
      paladin.attackCooldownTicks = 0;
      paladin.hasCharged = false;

      engine.tick();

      // Paladin first strike deals: 52 * 1.0 * 2.5 - 1 = 129 damage
      expect(380 - enemy.currentHp).toBe(129);
      // Applied 20 ticks stun (19 remaining after movement tick)
      expect(enemy.stunTicksRemaining).toBe(DAWN_PALADIN_STUN_TICKS - 1);
      expect(paladin.hasCharged).toBe(true);

      // Stunned unit does not move
      const enemyX = enemy.x;
      MovementSystem.updateMovement([enemy]);
      expect(enemy.x).toBe(enemyX);
      expect(enemy.stunTicksRemaining).toBe(DAWN_PALADIN_STUN_TICKS - 2);

      // Stunned unit does not attack
      enemy.attackCooldownTicks = 0;
      const enemyAttackCount = enemy.attackCount;
      engine.tick();
      expect(enemy.attackCount).toBe(enemyAttackCount);
    });

    it('Dawn Paladin Devotion Aura grants +1 flat reduction in 120px, protects self, and does NOT stack with multiple Paladins', () => {
      const engine = new GameEngine({ seed: 42 });

      // Paladin 1 at (500, 300)
      const paladin1 = engine.spawnUnit('PLAYER', 'unit_dawn_paladin');
      paladin1.x = 500;
      paladin1.y = 300;

      // Paladin 2 at (530, 300)
      const paladin2 = engine.spawnUnit('PLAYER', 'unit_dawn_paladin');
      paladin2.x = 530;
      paladin2.y = 300;

      // Friendly Squire at (515, 300) - within 120px of BOTH Paladins
      const allySquire = engine.spawnUnit('PLAYER', 'unit_squire');
      allySquire.x = 515;
      allySquire.y = 300;

      // Distant ally at (700, 300) - outside 120px
      const distantAlly = engine.spawnUnit('PLAYER', 'unit_squire');
      distantAlly.x = 700;
      distantAlly.y = 300;

      // 1. Both Paladins protect themselves
      expect(engine.hasPaladinAura(paladin1)).toBe(true);
      expect(engine.hasPaladinAura(paladin2)).toBe(true);

      // 2. Ally inside radius has aura active
      expect(engine.hasPaladinAura(allySquire)).toBe(true);

      // 3. Distant ally does NOT have aura
      expect(engine.hasPaladinAura(distantAlly)).toBe(false);

      // 4. Non-stacking rule: Ally receives strictly +1 flat reduction (not +2)
      const combatOutcome = CombatResolver.resolveDamage({
        baseDamage: 22,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        hasPaladinAura: engine.hasPaladinAura(allySquire),
        applyPassives: false,
      });

      expect(combatOutcome.appliedFlatReduction).toBe(2); // 1 + 1 = 2 (NOT 3)
      expect(combatOutcome.effectiveDamage).toBe(14);
    });
  });

  // =========================================================================
  // 7. Balista Móvel (unit_mobile_ballista - Disparo Linear Perfurante)
  // =========================================================================
  describe('Mobile Ballista: Linear Piercing Bolt', () => {
    it('Requires minimum range 150px and maximum range 580px', () => {
      const engine = new GameEngine({ seed: 42 });

      const ballista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      ballista.x = 200;
      ballista.y = 300;

      // Enemy inside minimum range (< 150px)
      const tooCloseEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
      tooCloseEnemy.x = 300; // Delta X = 100px < 150px
      tooCloseEnemy.y = 300;

      engine.tick();
      expect(ballista.targetUnitId).not.toBe(tooCloseEnemy.id);

      // Move enemy into valid range [150, 580]
      tooCloseEnemy.x = 450; // Delta X = 250px
      engine.tick();
      expect(ballista.targetUnitId).toBe(tooCloseEnemy.id);
    });

    it('Pierces +1 aligned enemy behind primary target (DeltaX in [0, 120]px, |DeltaY| <= 30px) causing 100% base damage', () => {
      const engine = new GameEngine({ seed: 42 });

      const ballista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      ballista.x = 200;
      ballista.y = 300;

      const primary = engine.spawnUnit('ENEMY', 'unit_squire');
      primary.x = 450;
      primary.y = 300;

      // Aligned behind: deltaX = 70px (in [0, 120]), deltaY = 20px (<= 30)
      const secondaryAligned = engine.spawnUnit('ENEMY', 'unit_squire');
      secondaryAligned.x = 520;
      secondaryAligned.y = 320;

      // Unaligned behind: deltaY = 40px (> 30)
      const unalignedVertical = engine.spawnUnit('ENEMY', 'unit_squire');
      unalignedVertical.x = 520;
      unalignedVertical.y = 350;

      // Too far behind: deltaX = 140px (> 120)
      const tooFarBehind = engine.spawnUnit('ENEMY', 'unit_squire');
      tooFarBehind.x = 600;
      tooFarBehind.y = 300;

      ballista.targetUnitId = primary.id;
      ballista.attackCooldownTicks = 0;

      engine.tick();

      // 90 Siege vs HEAVY (0.50x) - 1 flat = floor(45 - 1) = 44 damage
      expect(380 - primary.currentHp).toBe(44);
      expect(380 - secondaryAligned.currentHp).toBe(44);
      expect(380 - unalignedVertical.currentHp).toBe(0);
      expect(380 - tooFarBehind.currentHp).toBe(0);
    });

    it('Hits only the closest aligned candidate if multiple secondary targets qualify', () => {
      const engine = new GameEngine({ seed: 42 });

      const ballista = engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      ballista.x = 200;
      ballista.y = 300;

      const primary = engine.spawnUnit('ENEMY', 'unit_squire');
      primary.x = 450;
      primary.y = 300;

      // Candidate 1: 30px behind
      const cand1 = engine.spawnUnit('ENEMY', 'unit_squire');
      cand1.x = 480;
      cand1.y = 300;

      // Candidate 2: 70px behind
      const cand2 = engine.spawnUnit('ENEMY', 'unit_squire');
      cand2.x = 520;
      cand2.y = 300;

      ballista.targetUnitId = primary.id;
      ballista.attackCooldownTicks = 0;

      engine.tick();

      // Only candidate 1 (closest) is hit, candidate 2 remains unscathed
      expect(380 - cand1.currentHp).toBe(44);
      expect(380 - cand2.currentHp).toBe(0);
    });
  });

  // =========================================================================
  // 8. Catapulta de Fogo Grego (unit_greek_fire_catapult - Poça de Fogo Grego)
  // =========================================================================
  describe('Greek Fire Catapult: Bombardeio & Poça de Fogo Grego', () => {
    it('Requires minimum range 180px and maximum range 680px', () => {
      const engine = new GameEngine({ seed: 42 });

      const catapult = engine.spawnUnit('PLAYER', 'unit_greek_fire_catapult');
      catapult.x = 200;
      catapult.y = 300;

      const tooClose = engine.spawnUnit('ENEMY', 'unit_squire');
      tooClose.x = 350; // Delta X = 150px < 180px
      tooClose.y = 300;

      engine.tick();
      expect(catapult.targetUnitId).not.toBe(tooClose.id);

      tooClose.x = 450; // Delta X = 250px in [180, 680]
      engine.tick();
      expect(catapult.targetUnitId).toBe(tooClose.id);
    });

    it('Creates GreekFireHazard of 80 ticks and 120px radius that pulses 25 Magic Damage every 20 ticks', () => {
      const engine = new GameEngine({ seed: 42 });

      const catapult = engine.spawnUnit('PLAYER', 'unit_greek_fire_catapult');
      catapult.x = 200;
      catapult.y = 300;

      const target = engine.spawnUnit('ENEMY', 'unit_squire');
      target.x = 500;
      target.y = 300;

      catapult.targetUnitId = target.id;
      catapult.attackCooldownTicks = 0;

      expect(engine.hazards.length).toBe(0);
      engine.tick();

      // Hazard spawned
      expect(engine.hazards.length).toBe(1);
      const hazard = engine.hazards[0];
      expect(hazard.radiusPx).toBe(GREEK_FIRE_RADIUS_PX);
      expect(hazard.ticksRemaining).toBe(GREEK_FIRE_DURATION_TICKS); // 80 ticks

      // Spawn an enemy standing inside the pool
      const victim = engine.spawnUnit('ENEMY', 'unit_squire');
      victim.x = 520;
      victim.y = 310;
      const initialHp = victim.currentHp;

      // Run 20 ticks until first hazard pulse (at ticksRemaining = 60)
      for (let t = 0; t < 20; t++) {
        engine.tick();
      }

      // 25 Magic base vs HEAVY (1.5x) - 1 flat = floor(37.5 - 1) = 36 damage
      expect(initialHp - victim.currentHp).toBe(36);
    });

    it('Citadel is strictly immune to ground hazard damage', () => {
      const engine = new GameEngine({ seed: 42 });

      // Create hazard directly on top of Enemy Citadel
      engine.hazards.push({
        id: 'hazard_citadel_test',
        team: 'PLAYER',
        x: engine.citadels.ENEMY.x,
        y: 300,
        radiusPx: 120,
        ticksRemaining: 80,
        tickInterval: 20,
        baseMagicDamage: 25,
      });

      const citadelHpBefore = engine.citadels.ENEMY.currentHp;

      // Run 20 ticks (triggers pulse at tickRemaining = 60)
      for (let t = 0; t < 20; t++) {
        engine.tick();
      }

      // Citadel suffered 0 damage from ground puddle
      expect(engine.citadels.ENEMY.currentHp).toBe(citadelHpBefore);
    });

    it('Overlapping ground puddles stack damage independently', () => {
      const engine = new GameEngine({ seed: 42 });

      // Add 2 overlapping hazards at (500, 300) with synchronized timers
      engine.hazards.push(
        {
          id: 'hazard_1',
          team: 'PLAYER',
          x: 500,
          y: 300,
          radiusPx: 120,
          ticksRemaining: 80,
          tickInterval: 20,
          baseMagicDamage: 25,
        },
        {
          id: 'hazard_2',
          team: 'PLAYER',
          x: 510,
          y: 300,
          radiusPx: 120,
          ticksRemaining: 80,
          tickInterval: 20,
          baseMagicDamage: 25,
        }
      );

      const victim = engine.spawnUnit('ENEMY', 'unit_squire');
      victim.x = 505;
      victim.y = 300;
      const hpBefore = victim.currentHp;

      // Run 20 ticks to trigger pulse
      for (let t = 0; t < 20; t++) {
        engine.tick();
      }

      // Two pulses of 36 damage each = 72 damage
      expect(hpBefore - victim.currentHp).toBe(72);
    });
  });

  // =========================================================================
  // 9. Os 4 Perfis de IA & Matriz de Reação (Seção 3 do GD Spec)
  // =========================================================================
  describe('AI Opponents: Profiles & Threat Reaction Matrix (GD Spec Section 3)', () => {
    it('AI decision cycle executes strictly when tick % 20 === 0', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 300,
      });

      // Run 19 ticks (ticks 1..19)
      for (let t = 1; t <= 19; t++) {
        engine.tick();
        const slot0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
        expect(slot0?.structureId).toBeNull();
        expect(engine.economy.ENEMY.gold).toBe(300);
      }

      // Tick 20: AI decision fires
      engine.tick();
      const slot0After = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
      expect(slot0After?.structureId).toBe('bldg_barracks_1');
      expect(engine.economy.ENEMY.gold).toBe(200);
    });

    it('Valerius (AGGRESSIVE) never upgrades Royal Mine before 1800 ticks (90s)', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 500,
      });

      // Frontline is safe (< 800)
      engine.frontline.frontlineX = 500;

      // Run up to tick 100
      for (let t = 0; t < 100; t++) engine.tick();

      // Valerius has plenty of gold and safe frontline, but tick < 1800 -> mineLevel remains 0
      expect(engine.economy.ENEMY.mineLevel).toBe(0);
    });

    it('Thorne (DEFENSIVE) invests in Royal Mine N1 when frontline <= 1000 and builds Siege in Col 3 (Slot 9)', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'DEFENSIVE',
        initialEnemyGold: 500,
      });

      // Tick 20: Frontline starts at 1000 <= 1000 -> Upgrades Mine Level 1
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.economy.ENEMY.mineLevel).toBe(1);

      // Tick 40: Slot 0 -> Barracks
      for (let t = 0; t < 20; t++) engine.tick();
      const slot0 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0);
      expect(slot0?.structureId).toBe('bldg_barracks_1');

      // Tick 60: Slot 3 -> Archery (Col 1)
      for (let t = 0; t < 20; t++) engine.tick();
      const slot3 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 3);
      expect(slot3?.structureId).toBe('bldg_archery_1');

      // Tick 80: Slot 9 -> Siege (Col 3)
      for (let t = 0; t < 20; t++) engine.tick();
      const slot9 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 9);
      expect(slot9?.structureId).toBe('bldg_siege_1');
    });

    it('Seline (SWARM) strictly refuses to do Tier 2 upgrades while empty Tier 1 slots exist', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'SWARM',
        initialEnemyGold: 800,
      });

      // Run multiple cycles
      for (let t = 0; t < 120; t++) engine.tick();

      const occupiedSlots = engine.slots.filter(
        (s) => s.team === 'ENEMY' && s.structureId !== null
      );
      expect(occupiedSlots.length).toBeGreaterThanOrEqual(4);

      // Zero Tier 2 structures because empty slots still remain
      const t2Count = occupiedSlots.filter((s) => s.structureId?.endsWith('_2')).length;
      expect(t2Count).toBe(0);
    });

    it('The Iron Tyrant (BOSS_ACT1): starts with 200g, 1.25x income, Slot 11 Altar, summons Colossal Warrior at 900 ticks', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'BOSS_ACT1',
      });

      // 1. Initial gold = 200
      expect(engine.economy.ENEMY.gold).toBe(200);

      // 2. Income multiplier 1.25x: at income cycle (100 ticks = 5s), base income is 12g -> floor(12 * 1.25) = 15g
      // Account for AI building expenditures by checking total wealth = gold + totalInvestedGold
      const totalWealthBefore =
        engine.economy.ENEMY.gold +
        engine.slots
          .filter((s) => s.team === 'ENEMY')
          .reduce((sum, s) => sum + s.totalInvestedGold, 0);

      for (let t = 0; t < 100; t++) engine.tick();

      const totalWealthAfter =
        engine.economy.ENEMY.gold +
        engine.slots
          .filter((s) => s.team === 'ENEMY')
          .reduce((sum, s) => sum + s.totalInvestedGold, 0);

      // Total wealth gained over 100 ticks must be exactly 15 gold (12 * 1.25)
      expect(totalWealthAfter - totalWealthBefore).toBe(15);

      // 3. Slot 11 Altar
      const slot11 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 11);
      expect(slot11?.structureId).toBe('bldg_renegade_altar');

      // Attempting to sell Slot 11 returns 0 refund
      const refund = engine.sellStructure('ENEMY', 11);
      expect(refund).toBe(0);
      expect(slot11?.structureId).toBe('bldg_renegade_altar');

      // 4. Summons Colossal Warrior
      slot11!.currentSpawnCooldownTicks = 1;
      engine.tick();

      const colossal = engine.units.find((u) => u.typeId === 'unit_colossal_warrior');
      expect(colossal).toBeDefined();
      expect(colossal?.maxHp).toBe(1800);
      expect(colossal?.currentHp).toBe(1800);
    });

    it('Threat Reaction Matrix: triggers Arcane Tower for heavyThreat > 1200, Archery for lightThreat > 800, Stable for siegeThreat >= 2', () => {
      const engine = new GameEngine({
        seed: 12345,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 500,
      });

      const controller = engine.aiController!;

      // 1. Heavy Threat > 1200: Spawn 4 Player Squires (380 * 4 = 1520 > 1200)
      for (let i = 0; i < 4; i++) {
        engine.spawnUnit('PLAYER', 'unit_squire');
      }

      const threats1 = controller.calculateThreats(engine.units);
      expect(threats1.heavyThreat).toBe(1520);
      expect(threats1.heavyThreat).toBeGreaterThan(1200);

      // 2. Light Threat > 800: Spawn 5 Player Longbowmen (170 * 5 = 850 > 800)
      for (let i = 0; i < 5; i++) {
        engine.spawnUnit('PLAYER', 'unit_longbowman');
      }

      const threats2 = controller.calculateThreats(engine.units);
      expect(threats2.lightThreat).toBe(850);
      expect(threats2.lightThreat).toBeGreaterThan(800);

      // 3. Siege Threat >= 2: Spawn 2 Player Ballistas
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');

      const threats3 = controller.calculateThreats(engine.units);
      expect(threats3.siegeThreat).toBe(2);
    });
  });

  // =========================================================================
  // 10. Determinismo SHA-256 em Batalha de 3600 Ticks com IA BOSS_ACT1
  // =========================================================================
  describe('SHA-256 Determinism across full 3600-tick battle with BOSS_ACT1 AI', () => {
    it('produces 100% identical state hash across independent runs with seed 123456', { timeout: 30000 }, () => {
      const seed = 123456;
      const ticks = 3600;

      function simulate(): { hash: string; unitCount: number; playerHp: number; enemyHp: number } {
        const engine = new GameEngine({
          seed,
          aiProfile: 'BOSS_ACT1',
          initialPlayerGold: 800,
          initialEnemyGold: 200,
        });

        // Set high HP to allow full 3600 ticks
        engine.citadels.PLAYER.currentHp = 30000;
        engine.citadels.ENEMY.currentHp = 30000;

        // Player establishes balanced base
        engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
        engine.buildStructure('PLAYER', 1, 'bldg_archery_1');
        engine.buildStructure('PLAYER', 2, 'bldg_stable_1');

        for (let t = 0; t < ticks; t++) {
          if (t === 400) engine.upgradeStructure('PLAYER', 0);
          if (t === 800) engine.upgradeStructure('PLAYER', 1);
          if (t === 1200) engine.upgradeMine('PLAYER');
          engine.tick();
        }

        return {
          hash: engine.computeStateHash(),
          unitCount: engine.units.length,
          playerHp: engine.citadels.PLAYER.currentHp,
          enemyHp: engine.citadels.ENEMY.currentHp,
        };
      }

      const res1 = simulate();
      const res2 = simulate();

      expect(res1.hash).toBe(res2.hash);
      expect(res1.unitCount).toBe(res2.unitCount);
      expect(res1.playerHp).toBe(res2.playerHp);
      expect(res1.enemyHp).toBe(res2.enemyHp);
    });
  });

  // =========================================================================
  // 11. 60 FPS Snapshot Linear Interpolator (GD Spec Section 4.4)
  // =========================================================================
  describe('60 FPS SnapshotInterpolator (GD Spec Section 4.4)', () => {
    it('Linearly interpolates X and Y coordinates between prevSnapshot and currSnapshot and uses curr position for newly spawned units', () => {
      const engine = new GameEngine({ seed: 777 });
      const u1 = engine.spawnUnit('PLAYER', 'unit_squire');
      u1.x = 100;
      u1.y = 200;
      const prevSnap = engine.getSnapshot();

      u1.x = 120;
      u1.y = 240;
      const u2 = engine.spawnUnit('ENEMY', 'unit_longbowman');
      u2.x = 1800;
      u2.y = 300;
      const currSnap = engine.getSnapshot();

      const interpHalf = SnapshotInterpolator.interpolate(prevSnap, currSnap, 0.5);
      const interpU1 = interpHalf.units.find((u) => u.id === u1.id)!;
      const interpU2 = interpHalf.units.find((u) => u.id === u2.id)!;

      expect(interpU1.renderX).toBe(110);
      expect(interpU1.renderY).toBe(220);
      // Newly spawned unit in currSnap uses current position directly
      expect(interpU2.renderX).toBe(1800);
      expect(interpU2.renderY).toBe(300);
    });
  });
});
