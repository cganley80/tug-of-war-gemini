import { describe, it, expect } from 'vitest';
import { CombatResolver } from '../../src/core/systems/CombatResolver';
import { DAMAGE_MULTIPLIER_MATRIX } from '../../src/core/config/CombatMatrixConfig';
import { ArmorType, DamageType } from '../../src/core/types';

describe('CombatResolver & Damage Formula (GDD Section 4)', () => {
  describe('Canonical Unit Tests from Section 4.2', () => {
    it('Example 1: Arqueiro Longo attacking Escudeiro -> exactly 15 damage', () => {
      // Base Damage: 22 (Piercing), Defender: Heavy Armor, Flat Reduction: 1
      // Multiplier: 0.75
      // floor(22 * 0.75 - 1) = floor(16.5 - 1) = 15
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 22,
        damageType: 'PIERCING',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 1,
        attackerTypeId: 'unit_longbowman',
        defenderTypeId: 'unit_squire',
        applyPassives: false, // Standard matrix formula verification
      });

      expect(damage).toBe(15);
    });

    it('Example 2: Aprendiz Solar attacking Cavaleiro Real -> exactly 45 damage', () => {
      // Base Damage: 32 (Magic), Defender: Heavy Armor, Flat Reduction: 3
      // Multiplier: 1.50
      // floor(32 * 1.50 - 3) = floor(48 - 3) = 45
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 32,
        damageType: 'MAGIC',
        defenderArmorType: 'HEAVY',
        defenderFlatReduction: 3,
        attackerTypeId: 'unit_solar_apprentice',
        defenderTypeId: 'unit_royal_knight',
        applyPassives: false,
      });

      expect(damage).toBe(45);
    });

    it('Example 3: Catapulta de Fogo Grego attacking Citadel -> exactly 315 damage', () => {
      // Base Damage: 160 (Siege), Defender: Fortified Armor, Flat Reduction: 5
      // Multiplier: 2.00
      // floor(160 * 2.00 - 5) = floor(320 - 5) = 315
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 160,
        damageType: 'SIEGE',
        defenderArmorType: 'FORTIFIED',
        defenderFlatReduction: 5,
        attackerTypeId: 'unit_greek_fire_catapult',
        applyPassives: false,
      });

      expect(damage).toBe(315);
    });
  });

  describe('4x4 Damage Multiplier Matrix Invariance (GDD Section 4.1 & 7.3)', () => {
    const expectedMatrix: Record<DamageType, Record<ArmorType, number>> = {
      NORMAL: { LIGHT: 1.0, HEAVY: 1.0, ARCANE: 1.25, FORTIFIED: 0.5 },
      PIERCING: { LIGHT: 1.5, HEAVY: 0.75, ARCANE: 1.0, FORTIFIED: 0.35 },
      MAGIC: { LIGHT: 0.75, HEAVY: 1.5, ARCANE: 0.75, FORTIFIED: 0.5 },
      SIEGE: { LIGHT: 0.5, HEAVY: 0.5, ARCANE: 0.75, FORTIFIED: 2.0 },
    };

    const damageTypes: DamageType[] = ['NORMAL', 'PIERCING', 'MAGIC', 'SIEGE'];
    const armorTypes: ArmorType[] = ['LIGHT', 'HEAVY', 'ARCANE', 'FORTIFIED'];

    for (const dmg of damageTypes) {
      for (const arm of armorTypes) {
        it(`Matrix check: ${dmg} vs ${arm} should be ${expectedMatrix[dmg][arm]}`, () => {
          expect(DAMAGE_MULTIPLIER_MATRIX[dmg][arm]).toBe(expectedMatrix[dmg][arm]);
        });
      }
    }
  });

  describe('Minimum Damage Floor Rule', () => {
    it('always deals at least 1 damage even against massive flat reduction', () => {
      const damage = CombatResolver.calculateEffectiveDamage({
        baseDamage: 10,
        damageType: 'NORMAL',
        defenderArmorType: 'FORTIFIED', // 0.5x -> 5
        defenderFlatReduction: 100, // exceeds damage
      });

      expect(damage).toBe(1);
    });
  });

  describe('Unit Passives Impact on Combat', () => {
    it('Squire Shield Formation reduces ranged piercing damage by 20%', () => {
      // 22 * 0.75 * 0.8 = 13.2. floor(13.2 - 1) = 12
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

    it('Siege Crossbowman ignores 50% flat reduction and deals 120% vs >600 HP target', () => {
      // Defender: Royal Knight (720 HP, Flat Reduction 3)
      // Flat reduction becomes floor(3 * 0.5) = 1
      // Target HP > 600 -> +20% damage
      // Base: 55, Piercing vs Heavy = 0.75 -> 55 * 0.75 * 1.2 = 49.5. floor(49.5 - 1) = 48
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
  });
});
