/**
 * Tug of War: Citadels of Aethelgard
 * SnapshotInterpolator: 60 FPS Linear Interpolation Layer (Section 4.4)
 * Interpolates positions between 20 TPS logical simulation ticks.
 */

import { GameStateSnapshot, UnitState, TeamId, UnitTypeId } from '../../core/types';

export interface InterpolatedUnit {
  readonly id: string;
  readonly typeId: UnitTypeId;
  readonly team: TeamId;
  readonly renderX: number;
  readonly renderY: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly isEngaged: boolean;
  readonly hasRadiantMorale: boolean;
  readonly stunTicksRemaining: number;
  readonly solarFlameTicksRemaining: number;
  readonly hasCharged: boolean;
  readonly isTargetingCitadel: boolean;
  readonly targetUnitId: string | null;
  readonly attackCooldownTicks: number;
}

export interface InterpolationResult {
  readonly units: InterpolatedUnit[];
  readonly frontlineX: number;
  readonly tick: number;
  readonly alpha: number;
  readonly currSnapshot: GameStateSnapshot;
  readonly prevSnapshot: GameStateSnapshot;
}

export class SnapshotInterpolator {
  /**
   * Performs linear interpolation between prevSnapshot and currSnapshot.
   *
   * Formula:
   * X_render = X_prev + alpha * (X_curr - X_prev)
   * Y_render = Y_prev + alpha * (Y_curr - Y_prev)
   *
   * For newly spawned units in currSnapshot that did not exist in prevSnapshot,
   * the current snapshot position (X_curr, Y_curr) is used directly.
   *
   * @param prevSnapshot Snapshot from previous simulation tick (t - 1)
   * @param currSnapshot Snapshot from current simulation tick (t)
   * @param alpha Interpolation factor in [0, 1] (time since last tick / tick interval)
   */
  public static interpolate(
    prevSnapshot: GameStateSnapshot,
    currSnapshot: GameStateSnapshot,
    alpha: number
  ): InterpolationResult {
    const clampedAlpha = Math.max(0, Math.min(1, alpha));

    // Map previous units by id for O(1) lookup
    const prevMap = new Map<string, UnitState>();
    for (const unit of prevSnapshot.units) {
      prevMap.set(unit.id, unit);
    }

    const interpolatedUnits: InterpolatedUnit[] = [];

    for (const currUnit of currSnapshot.units) {
      if (currUnit.currentHp <= 0) continue;

      const prevUnit = prevMap.get(currUnit.id);

      let renderX: number;
      let renderY: number;

      if (prevUnit) {
        renderX = prevUnit.x + clampedAlpha * (currUnit.x - prevUnit.x);
        renderY = prevUnit.y + clampedAlpha * (currUnit.y - prevUnit.y);
      } else {
        // Unit newly spawned in current tick
        renderX = currUnit.x;
        renderY = currUnit.y;
      }

      interpolatedUnits.push({
        id: currUnit.id,
        typeId: currUnit.typeId,
        team: currUnit.team,
        renderX,
        renderY,
        currentHp: currUnit.currentHp,
        maxHp: currUnit.maxHp,
        isEngaged: currUnit.isEngaged,
        hasRadiantMorale: currUnit.hasRadiantMorale,
        stunTicksRemaining: currUnit.stunTicksRemaining,
        solarFlameTicksRemaining: currUnit.solarFlameTicksRemaining,
        hasCharged: currUnit.hasCharged,
        isTargetingCitadel: currUnit.isTargetingCitadel,
        targetUnitId: currUnit.targetUnitId,
        attackCooldownTicks: currUnit.attackCooldownTicks,
      });
    }

    // Interpolate frontline position
    const prevFront = prevSnapshot.frontline.frontlineX;
    const currFront = currSnapshot.frontline.frontlineX;
    const frontlineX = prevFront + clampedAlpha * (currFront - prevFront);

    return {
      units: interpolatedUnits,
      frontlineX,
      tick: currSnapshot.tick,
      alpha: clampedAlpha,
      currSnapshot,
      prevSnapshot,
    };
  }

  /**
   * Instance helper wrapping the static method.
   */
  public interpolate(
    prevSnapshot: GameStateSnapshot,
    currSnapshot: GameStateSnapshot,
    alpha: number
  ): InterpolationResult {
    return SnapshotInterpolator.interpolate(prevSnapshot, currSnapshot, alpha);
  }
}
