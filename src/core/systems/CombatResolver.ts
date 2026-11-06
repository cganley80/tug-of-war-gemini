import { ArmorType, DamageType, UnitTypeId } from '../types';
import { getDamageMultiplier } from '../config/CombatMatrixConfig';

export interface DamageCalculationParams {
  readonly baseDamage: number;
  readonly damageType: DamageType;
  readonly defenderArmorType: ArmorType;
  readonly defenderFlatReduction: number;
  readonly attackerTypeId?: UnitTypeId;
  readonly defenderTypeId?: UnitTypeId;
  readonly relicDamageMultiplier?: number;
  readonly customMultiplier?: number;
  readonly isRangedAttack?: boolean;
  readonly defenderMaxHp?: number;
  readonly defenderCurrentHp?: number;
  readonly isChargeAttack?: boolean;
  readonly isSmashAttack?: boolean; // Royal Knight 3rd attack
  readonly hasPaladinAura?: boolean; // Dawn Paladin Devotion Aura (+1 flat reduction)
  readonly applyPassives?: boolean;
}

export interface DamageCalculationResult {
  readonly effectiveDamage: number;
  readonly rawDamageBeforeReduction: number;
  readonly appliedFlatReduction: number;
  readonly isCritical: boolean;
}

export class CombatResolver {
  /**
   * Calculates effective damage strictly following Section 4.2 of GDD:
   * effectiveDamage = Math.max(1, Math.floor((baseDamage * typeMultiplier * modifiersProduct) - effectiveFlatReduction))
   */
  public static calculateEffectiveDamage(params: DamageCalculationParams): number {
    return CombatResolver.resolveDamage(params).effectiveDamage;
  }

  /**
   * Resolves complete combat outcome including passives, flat reduction and critical/charge flags.
   */
  public static resolveDamage(params: DamageCalculationParams): DamageCalculationResult {
    const {
      baseDamage,
      damageType,
      defenderArmorType,
      defenderFlatReduction,
      attackerTypeId,
      defenderTypeId,
      relicDamageMultiplier = 1.0,
      customMultiplier = 1.0,
      isRangedAttack = false,
      defenderMaxHp,
      defenderCurrentHp,
      isChargeAttack = false,
      isSmashAttack = false,
      hasPaladinAura = false,
      applyPassives = false,
    } = params;

    const typeMultiplier = getDamageMultiplier(damageType, defenderArmorType);

    let passiveDamageMultiplier = 1.0;
    let effectiveFlatReduction = defenderFlatReduction + (hasPaladinAura ? 1 : 0);
    let isCritical = false;

    if (applyPassives) {
      // 1. Squire Passive: "Shield Formation" - Receives -20% damage from ranged piercing attacks
      if (defenderTypeId === 'unit_squire' && isRangedAttack && damageType === 'PIERCING') {
        passiveDamageMultiplier *= 0.8;
      }

      // 2. Siege Crossbowman Passive: "Armor-Piercing Bolt"
      // Ignores 50% of target Flat Reduction, and deals 120% damage against targets above 600 max HP
      if (attackerTypeId === 'unit_siege_crossbowman') {
        effectiveFlatReduction = Math.floor(effectiveFlatReduction * 0.5);
        const targetHpToCheck = defenderMaxHp ?? defenderCurrentHp ?? 0;
        if (targetHpToCheck > 600) {
          passiveDamageMultiplier *= 1.2;
        }
      }

      // 3. Royal Knight: "Smashing Strike" - Every 3rd attack deals +50% damage
      if (attackerTypeId === 'unit_royal_knight' && isSmashAttack) {
        passiveDamageMultiplier *= 1.5;
        isCritical = true;
      }

      // 4. Mounted Spearman / Dawn Paladin Charge Impact
      if (isChargeAttack) {
        if (attackerTypeId === 'unit_mounted_spearman') {
          // 200% damage on first charge attack
          passiveDamageMultiplier *= 2.0;
          isCritical = true;
        } else if (attackerTypeId === 'unit_dawn_paladin') {
          // 250% damage on first charge attack
          passiveDamageMultiplier *= 2.5;
          isCritical = true;
        }
      }
    }

    const totalMultiplier =
      typeMultiplier * relicDamageMultiplier * customMultiplier * passiveDamageMultiplier;
    const rawDamageBeforeReduction = baseDamage * totalMultiplier;
    const finalDamage = Math.max(1, Math.floor(rawDamageBeforeReduction - effectiveFlatReduction));

    return {
      effectiveDamage: finalDamage,
      rawDamageBeforeReduction,
      appliedFlatReduction: effectiveFlatReduction,
      isCritical,
    };
  }
}
