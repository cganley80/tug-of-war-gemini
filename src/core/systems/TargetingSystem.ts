import { UnitState, CitadelState } from '../types';
import { getUnitDefinition } from '../config/UnitsCatalog';

export interface TargetingDecision {
  targetUnitId: string | null;
  isTargetingCitadel: boolean;
  distanceToTarget: number;
}

export class TargetingSystem {
  /**
   * Evaluates targets strictly following Section 4.3 of GDD:
   * 1. Taunt Priority
   * 2. Minimum Range Filter (Ballista 150px, Catapult 180px)
   * 3. Closest Euclidean Distance with deterministic tie-breaking (unit.id)
   * 4. Citadel Target / Default Advance
   */
  public static selectTarget(
    unit: UnitState,
    allUnits: readonly UnitState[],
    enemyCitadel: CitadelState
  ): TargetingDecision {
    const unitDef = getUnitDefinition(unit.typeId);
    const attackRange = unitDef.attackRangePx;
    const minRange = unitDef.minAttackRangePx ?? 0;

    // Find closest eligible enemy within attack range and minimum range
    let closestEnemy: UnitState | null = null;
    let minDistance = Infinity;

    const r2 = attackRange * attackRange;
    const minR2 = minRange * minRange;
    const ux = unit.x;
    const uy = unit.y;

    for (let i = 0; i < allUnits.length; i++) {
      const enemy = allUnits[i];
      if (enemy.team === unit.team || enemy.currentHp <= 0) continue;

      const dx = enemy.x - ux;
      const dy = enemy.y - uy;
      const distSq = dx * dx + dy * dy;

      if (distSq <= r2 && distSq >= minR2) {
        const dist = Math.sqrt(distSq);
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

    if (closestEnemy !== null) {
      return {
        targetUnitId: closestEnemy.id,
        isTargetingCitadel: false,
        distanceToTarget: minDistance,
      };
    }

    // No enemy unit within range: check if the Citadel is within attack range
    const distanceToCitadelX = Math.abs(enemyCitadel.x - unit.x);
    // Citadel spans the battlefield height; check if horizontal distance is within range
    if (distanceToCitadelX <= attackRange && distanceToCitadelX >= minRange) {
      return {
        targetUnitId: null,
        isTargetingCitadel: true,
        distanceToTarget: distanceToCitadelX,
      };
    }

    // Default advance towards Citadel
    return {
      targetUnitId: null,
      isTargetingCitadel: false,
      distanceToTarget: distanceToCitadelX,
    };
  }
}
