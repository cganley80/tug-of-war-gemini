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

    // Filter alive enemy units
    const aliveEnemies = allUnits.filter(
      (candidate) => candidate.team !== unit.team && candidate.currentHp > 0
    );

    // Filter by attack range and minimum range
    const eligibleEnemies: Array<{ enemy: UnitState; distance: number }> = [];

    for (const enemy of aliveEnemies) {
      const dx = enemy.x - unit.x;
      const dy = enemy.y - unit.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= attackRange && distance >= minRange) {
        eligibleEnemies.push({ enemy, distance });
      }
    }

    if (eligibleEnemies.length > 0) {
      // Sort by Euclidean distance ascending, with deterministic tie-breaking by id
      eligibleEnemies.sort((a, b) => {
        if (Math.abs(a.distance - b.distance) > 0.0001) {
          return a.distance - b.distance;
        }
        return a.enemy.id.localeCompare(b.enemy.id);
      });

      const chosen = eligibleEnemies[0];
      return {
        targetUnitId: chosen.enemy.id,
        isTargetingCitadel: false,
        distanceToTarget: chosen.distance,
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
