import { UnitState } from '../types';
import { getUnitDefinition } from '../config/UnitsCatalog';
import {
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
  TICK_DURATION_SEC,
  VANGUARD_MORALE_SPEED_MULTIPLIER,
  SOFT_COLLISION_RADIUS,
  SOFT_COLLISION_FORCE,
  LONGBOWMAN_STATIONARY_TICKS,
  AGGRO_RANGE_PX,
  AGGRO_BEHIND_MAX_PX,
} from '../config/ArenaConfig';

export class MovementSystem {
  /**
   * Updates unit movement, soft collision separation, stationary ticks tracking, and strict boundary clamping.
   */
  public static updateMovement(units: UnitState[]): void {
    const aliveUnits = units.filter((u) => u.currentHp > 0);

    for (const unit of aliveUnits) {
      if (unit.stunTicksRemaining > 0) {
        unit.stunTicksRemaining--;
        unit.ticksStationary++;
        continue;
      }

      // If unit is actively targeting an enemy unit or targeting the Citadel within range, it stops to fight
      const isAttackingTarget = unit.targetUnitId !== null || unit.isTargetingCitadel;

      if (isAttackingTarget) {
        unit.ticksStationary++;
        continue;
      }

      const unitDef = getUnitDefinition(unit.typeId);
      let speed = unitDef.moveSpeedPxPerSec;

      // Radiant Morale bonus (+15% move speed)
      if (unit.hasRadiantMorale) {
        speed *= VANGUARD_MORALE_SPEED_MULTIPLIER;
      }

      // Mounted charge acceleration: if charging before first strike
      if (!unit.hasCharged && (unit.typeId === 'unit_mounted_spearman' || unit.typeId === 'unit_dawn_paladin')) {
        // Check if an enemy is in charge sight (between 150 and 300 px ahead)
        const hasEnemyInChargeWindow = aliveUnits.some((other) => {
          if (other.team === unit.team || other.currentHp <= 0) return false;
          const distHorizontal = unit.team === 'PLAYER' ? other.x - unit.x : unit.x - other.x;
          return distHorizontal >= 150 && distHorizontal <= 300;
        });

        if (hasEnemyInChargeWindow) {
          speed = 220; // 220 px/s charge speed as defined in GDD Section 3.2
        }
      }

      const moveStep = speed * TICK_DURATION_SEC;
      const prevX = unit.x;

      // P0-1: Tactical Aggro & Y-Steering (Convergência Vertical de Interceptação)
      // Escaneia inimigos vivos dentro de AGGRO_RANGE_PX (260px) à frente ou até 40px atrás
      let closestEnemy: UnitState | null = null;
      let minDistance = Infinity;

      for (const enemy of aliveUnits) {
        if (enemy.team === unit.team || enemy.currentHp <= 0) continue;

        const deltaXFront = unit.team === 'PLAYER' ? enemy.x - unit.x : unit.x - enemy.x;
        if (deltaXFront < -AGGRO_BEHIND_MAX_PX) continue;

        const dx = enemy.x - unit.x;
        const dy = enemy.y - unit.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= AGGRO_RANGE_PX) {
          if (dist < minDistance - 0.0001) {
            minDistance = dist;
            closestEnemy = enemy;
          } else if (Math.abs(dist - minDistance) <= 0.0001 && closestEnemy) {
            if (enemy.id.localeCompare(closestEnemy.id) < 0) {
              closestEnemy = enemy;
            }
          }
        }
      }

      if (closestEnemy && minDistance > 0.0001) {
        const dx = closestEnemy.x - unit.x;
        const dy = closestEnemy.y - unit.y;
        const nx = dx / minDistance;
        const ny = dy / minDistance;
        unit.x += nx * moveStep;
        unit.y += ny * moveStep;
      } else {
        if (unit.team === 'PLAYER') {
          unit.x += moveStep;
        } else {
          unit.x -= moveStep;
        }
      }

      // Check Citadel boundaries
      if (unit.team === 'PLAYER' && unit.x >= ARENA_MAX_X) {
        unit.x = ARENA_MAX_X;
        unit.isTargetingCitadel = true;
      } else if (unit.team === 'ENEMY' && unit.x <= ARENA_MIN_X) {
        unit.x = ARENA_MIN_X;
        unit.isTargetingCitadel = true;
      }

      // Track stationary ticks for Longbowman passive (Saraivada Rápida)
      if (Math.abs(unit.x - prevX) < 0.0001) {
        unit.ticksStationary++;
      } else {
        unit.ticksStationary = 0;
      }
    }

    // Apply Soft Collision Separation among friendly alive units
    MovementSystem.applySoftCollision(aliveUnits);

    // Final boundary clamp for all units
    for (const unit of aliveUnits) {
      if (unit.x < ARENA_MIN_X) unit.x = ARENA_MIN_X;
      if (unit.x > ARENA_MAX_X) unit.x = ARENA_MAX_X;
      if (unit.y < ARENA_MIN_Y) unit.y = ARENA_MIN_Y;
      if (unit.y > ARENA_MAX_Y) unit.y = ARENA_MAX_Y;
    }
  }

  /**
   * Applies gentle repulsive forces between nearby friendly units to prevent sprite stacking.
   */
  private static applySoftCollision(units: UnitState[]): void {
    const len = units.length;
    for (let i = 0; i < len; i++) {
      const u1 = units[i];
      for (let j = i + 1; j < len; j++) {
        const u2 = units[j];
        if (u1.team !== u2.team) continue;

        const dx = u2.x - u1.x;
        const dy = u2.y - u1.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > 0 && distSq < SOFT_COLLISION_RADIUS * SOFT_COLLISION_RADIUS) {
          const dist = Math.sqrt(distSq);
          const overlap = SOFT_COLLISION_RADIUS - dist;
          const separationForce = overlap * SOFT_COLLISION_FORCE * 0.5;

          const ny = dy !== 0 ? dy / dist : u1.id < u2.id ? -1 : 1;
          const pushY = ny * separationForce;

          u1.y -= pushY;
          u2.y += pushY;
        }
      }
    }
  }

  /**
   * Checks if the unit has the Rapid Volley passive active (+15% attack speed).
   */
  public static hasRapidVolleyActive(unit: UnitState): boolean {
    return unit.typeId === 'unit_longbowman' && unit.ticksStationary >= LONGBOWMAN_STATIONARY_TICKS;
  }
}
