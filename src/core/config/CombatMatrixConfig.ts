import { ArmorType, DamageType } from '../types';

/**
 * 4x4 Combat Multiplier Matrix defined in Section 4.1 of GDD.
 * Row: DamageType (Attacker)
 * Column: ArmorType (Defender)
 */
export const DAMAGE_MULTIPLIER_MATRIX: Record<DamageType, Record<ArmorType, number>> = {
  NORMAL: {
    LIGHT: 1.0,
    HEAVY: 1.0,
    ARCANE: 1.25,
    FORTIFIED: 0.5,
  },
  PIERCING: {
    LIGHT: 1.5,
    HEAVY: 0.75,
    ARCANE: 1.0,
    FORTIFIED: 0.35,
  },
  MAGIC: {
    LIGHT: 0.75,
    HEAVY: 1.5,
    ARCANE: 0.75,
    FORTIFIED: 0.5,
  },
  SIEGE: {
    LIGHT: 0.5,
    HEAVY: 0.5,
    ARCANE: 0.75,
    FORTIFIED: 2.0,
  },
};

/**
 * Helper function to retrieve the damage multiplier from the combat matrix.
 */
export function getDamageMultiplier(damageType: DamageType, armorType: ArmorType): number {
  return DAMAGE_MULTIPLIER_MATRIX[damageType][armorType];
}
