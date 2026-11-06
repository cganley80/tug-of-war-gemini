import { UnitState, CitadelState, TeamEconomyState, FrontlineState, TeamId } from '../types';
import {
  NEUTRAL_CENTER_X,
  ALLIED_ZONE_MAX_X,
  ENEMY_ZONE_MIN_X,
  VANGUARD_THRESHOLD_TICKS,
  VANGUARD_GOLD_INTERVAL_TICKS,
  VANGUARD_BONUS_GOLD,
  DESPERATION_THRESHOLD_TICKS,
  DESPERATION_BALISTA_INTERVAL_TICKS,
  DESPERATION_BALISTA_DAMAGE,
  DESPERATION_BALISTA_DAMAGE_TYPE,
} from '../config/ArenaConfig';
import { CombatResolver } from './CombatResolver';
import { getUnitDefinition } from '../config/UnitsCatalog';

export interface DesperationBalistaShot {
  attackerCitadelTeam: TeamId;
  targetUnitId: string;
  damage: number;
}

export interface FrontlineUpdateResult {
  balistaShots: DesperationBalistaShot[];
  bonusGoldAwarded: Record<TeamId, number>;
}

export class FrontlineSystem {
  /**
   * Calculates the Frontline X coordinate:
   * Average X of all actively engaged units (attacking or taking damage).
   * Defaults to NEUTRAL_CENTER_X (1000) if no units are engaged.
   */
  public static calculateFrontlineX(units: readonly UnitState[]): number {
    const engagedUnits = units.filter((u) => u.currentHp > 0 && u.isEngaged);
    if (engagedUnits.length === 0) {
      return NEUTRAL_CENTER_X;
    }

    const totalX = engagedUnits.reduce((acc, u) => acc + u.x, 0);
    return Math.round((totalX / engagedUnits.length) * 100) / 100;
  }

  /**
   * Updates Frontline status, manages continuous Vanguard Momentum and Desperation Bulwark timers,
   * fires automated Citadel balistas when desperate, and distributes territorial control gold.
   */
  public static updateFrontline(
    frontline: FrontlineState,
    units: UnitState[],
    citadels: Record<TeamId, CitadelState>,
    economy: Record<TeamId, TeamEconomyState>
  ): FrontlineUpdateResult {
    const balistaShots: DesperationBalistaShot[] = [];
    const bonusGoldAwarded: Record<TeamId, number> = {
      PLAYER: 0,
      ENEMY: 0,
    };

    const frontX = FrontlineSystem.calculateFrontlineX(units);
    frontline.frontlineX = frontX;

    // 1. PLAYER Vanguard Momentum: Frontline pushed past ENEMY_ZONE_MIN_X (1200)
    if (frontX > ENEMY_ZONE_MIN_X) {
      frontline.playerVanguardTicks++;
      if (frontline.playerVanguardTicks >= VANGUARD_THRESHOLD_TICKS) {
        frontline.isPlayerVanguardActive = true;
      }
    } else {
      frontline.playerVanguardTicks = 0;
      frontline.isPlayerVanguardActive = false;
    }

    // 2. ENEMY Vanguard Momentum: Frontline pushed below ALLIED_ZONE_MAX_X (800)
    if (frontX < ALLIED_ZONE_MAX_X) {
      frontline.enemyVanguardTicks++;
      if (frontline.enemyVanguardTicks >= VANGUARD_THRESHOLD_TICKS) {
        frontline.isEnemyVanguardActive = true;
      }
    } else {
      frontline.enemyVanguardTicks = 0;
      frontline.isEnemyVanguardActive = false;
    }

    // 3. PLAYER Desperation Bulwark: Frontline pushed back below ALLIED_ZONE_MAX_X (800)
    if (frontX < ALLIED_ZONE_MAX_X) {
      frontline.playerDesperationTicks++;
      if (frontline.playerDesperationTicks >= DESPERATION_THRESHOLD_TICKS) {
        frontline.isPlayerDesperationActive = true;
      }
    } else {
      frontline.playerDesperationTicks = 0;
      frontline.isPlayerDesperationActive = false;
    }

    // 4. ENEMY Desperation Bulwark: Frontline pushed back past ENEMY_ZONE_MIN_X (1200)
    if (frontX > ENEMY_ZONE_MIN_X) {
      frontline.enemyDesperationTicks++;
      if (frontline.enemyDesperationTicks >= DESPERATION_THRESHOLD_TICKS) {
        frontline.isEnemyDesperationActive = true;
      }
    } else {
      frontline.enemyDesperationTicks = 0;
      frontline.isEnemyDesperationActive = false;
    }

    // Apply Radiant Morale buff to units
    for (const unit of units) {
      if (unit.team === 'PLAYER') {
        unit.hasRadiantMorale = frontline.isPlayerVanguardActive;
      } else {
        unit.hasRadiantMorale = frontline.isEnemyVanguardActive;
      }
    }

    // Award +1 Gold every 5s of active Vanguard
    if (frontline.isPlayerVanguardActive) {
      economy.PLAYER.vanguardRewardTicksRemaining--;
      if (economy.PLAYER.vanguardRewardTicksRemaining <= 0) {
        economy.PLAYER.gold += VANGUARD_BONUS_GOLD;
        bonusGoldAwarded.PLAYER += VANGUARD_BONUS_GOLD;
        economy.PLAYER.vanguardRewardTicksRemaining = VANGUARD_GOLD_INTERVAL_TICKS;
      }
    } else {
      economy.PLAYER.vanguardRewardTicksRemaining = VANGUARD_GOLD_INTERVAL_TICKS;
    }

    if (frontline.isEnemyVanguardActive) {
      economy.ENEMY.vanguardRewardTicksRemaining--;
      if (economy.ENEMY.vanguardRewardTicksRemaining <= 0) {
        economy.ENEMY.gold += VANGUARD_BONUS_GOLD;
        bonusGoldAwarded.ENEMY += VANGUARD_BONUS_GOLD;
        economy.ENEMY.vanguardRewardTicksRemaining = VANGUARD_GOLD_INTERVAL_TICKS;
      }
    } else {
      economy.ENEMY.vanguardRewardTicksRemaining = VANGUARD_GOLD_INTERVAL_TICKS;
    }

    // Process Player Citadel Desperation Automated Balistas
    if (frontline.isPlayerDesperationActive && citadels.PLAYER.currentHp > 0) {
      citadels.PLAYER.ballistaCooldownTicks--;
      if (citadels.PLAYER.ballistaCooldownTicks <= 0) {
        // Target the most advanced enemy unit (closest to player citadel X=0, lowest X)
        const aliveEnemies = units.filter((u) => u.team === 'ENEMY' && u.currentHp > 0);
        if (aliveEnemies.length > 0) {
          aliveEnemies.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
          const target = aliveEnemies[0];
          const targetDef = getUnitDefinition(target.typeId);

          const damage = CombatResolver.calculateEffectiveDamage({
            baseDamage: DESPERATION_BALISTA_DAMAGE,
            damageType: DESPERATION_BALISTA_DAMAGE_TYPE,
            defenderArmorType: targetDef.armorType,
            defenderFlatReduction: targetDef.flatReduction,
            defenderTypeId: target.typeId,
            isRangedAttack: true,
            applyPassives: true,
          });

          balistaShots.push({
            attackerCitadelTeam: 'PLAYER',
            targetUnitId: target.id,
            damage,
          });
        }
        citadels.PLAYER.ballistaCooldownTicks = DESPERATION_BALISTA_INTERVAL_TICKS;
      }
    } else {
      citadels.PLAYER.ballistaCooldownTicks = Math.min(
        citadels.PLAYER.ballistaCooldownTicks,
        DESPERATION_BALISTA_INTERVAL_TICKS
      );
    }

    // Process Enemy Citadel Desperation Automated Balistas
    if (frontline.isEnemyDesperationActive && citadels.ENEMY.currentHp > 0) {
      citadels.ENEMY.ballistaCooldownTicks--;
      if (citadels.ENEMY.ballistaCooldownTicks <= 0) {
        // Target the most advanced player unit (closest to enemy citadel X=2000, highest X)
        const alivePlayers = units.filter((u) => u.team === 'PLAYER' && u.currentHp > 0);
        if (alivePlayers.length > 0) {
          alivePlayers.sort((a, b) => b.x - a.x || a.id.localeCompare(b.id));
          const target = alivePlayers[0];
          const targetDef = getUnitDefinition(target.typeId);

          const damage = CombatResolver.calculateEffectiveDamage({
            baseDamage: DESPERATION_BALISTA_DAMAGE,
            damageType: DESPERATION_BALISTA_DAMAGE_TYPE,
            defenderArmorType: targetDef.armorType,
            defenderFlatReduction: targetDef.flatReduction,
            defenderTypeId: target.typeId,
            isRangedAttack: true,
            applyPassives: true,
          });

          balistaShots.push({
            attackerCitadelTeam: 'ENEMY',
            targetUnitId: target.id,
            damage,
          });
        }
        citadels.ENEMY.ballistaCooldownTicks = DESPERATION_BALISTA_INTERVAL_TICKS;
      }
    } else {
      citadels.ENEMY.ballistaCooldownTicks = Math.min(
        citadels.ENEMY.ballistaCooldownTicks,
        DESPERATION_BALISTA_INTERVAL_TICKS
      );
    }

    return { balistaShots, bonusGoldAwarded };
  }
}
