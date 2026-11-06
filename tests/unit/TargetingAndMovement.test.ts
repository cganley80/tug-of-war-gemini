import { describe, it, expect } from 'vitest';
import { TargetingSystem } from '../../src/core/systems/TargetingSystem';
import { MovementSystem } from '../../src/core/systems/MovementSystem';
import { UnitState, CitadelState } from '../../src/core/types';

describe('Targeting & Movement Systems (GDD Section 4.3 & 7.3)', () => {
  const dummyCitadel: CitadelState = {
    team: 'ENEMY',
    x: 2000,
    currentHp: 2500,
    maxHp: 2500,
    armorType: 'FORTIFIED',
    flatReduction: 5,
    ballistaCooldownTicks: 40,
  };

  it('Minimum Range Filter: Mobile Ballista discards targets closer than 150px', () => {
    const ballista: UnitState = {
      id: 'u_player_1',
      typeId: 'unit_mobile_ballista',
      team: 'PLAYER',
      x: 500,
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
    };

    // Enemy unit at distance 100px (< 150px min range)
    const tooCloseEnemy: UnitState = {
      id: 'u_enemy_close',
      typeId: 'unit_squire',
      team: 'ENEMY',
      x: 600,
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
    };

    // Enemy unit at distance 300px (eligible: >= 150px and <= 580px range)
    const validEnemy: UnitState = {
      id: 'u_enemy_valid',
      typeId: 'unit_squire',
      team: 'ENEMY',
      x: 800,
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
    };

    const decision = TargetingSystem.selectTarget(
      ballista,
      [ballista, tooCloseEnemy, validEnemy],
      dummyCitadel
    );

    expect(decision.targetUnitId).toBe('u_enemy_valid');
  });

  it('Minimum Range Filter: Greek Fire Catapult discards targets closer than 180px', () => {
    const catapult: UnitState = {
      id: 'u_catapult_1',
      typeId: 'unit_greek_fire_catapult',
      team: 'PLAYER',
      x: 500,
      y: 300,
      currentHp: 480,
      maxHp: 480,
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

    // Enemy unit at distance 160px (< 180px min range for catapult)
    const tooCloseEnemy: UnitState = {
      id: 'u_enemy_too_close',
      typeId: 'unit_squire',
      team: 'ENEMY',
      x: 660,
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
    };

    // Enemy unit at distance 250px (eligible: >= 180px and <= 680px range)
    const validEnemy: UnitState = {
      id: 'u_enemy_valid_catapult',
      typeId: 'unit_squire',
      team: 'ENEMY',
      x: 750,
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
    };

    const decision = TargetingSystem.selectTarget(
      catapult,
      [catapult, tooCloseEnemy, validEnemy],
      dummyCitadel
    );

    expect(decision.targetUnitId).toBe('u_enemy_valid_catapult');
  });

  it('Boundary Check: Units are strictly clamped to X [0, 2000] and switch to targeting Citadel', () => {
    const playerUnit: UnitState = {
      id: 'u_player_1',
      typeId: 'unit_squire',
      team: 'PLAYER',
      x: 1995,
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
    };

    // Update movement - with speed 65px/s and dt=0.05s, step = 3.25px
    // In two ticks it hits 2000 and must clamp to 2000
    MovementSystem.updateMovement([playerUnit]);
    MovementSystem.updateMovement([playerUnit]);

    expect(playerUnit.x).toBe(2000);
    expect(playerUnit.isTargetingCitadel).toBe(true);
  });

  it('Rapid Volley Passive: Longbowman standing stationary for >= 60 ticks activates attack speed bonus', () => {
    const archer: UnitState = {
      id: 'u_player_arch',
      typeId: 'unit_longbowman',
      team: 'PLAYER',
      x: 500,
      y: 300,
      currentHp: 170,
      maxHp: 170,
      targetUnitId: 'u_enemy_1', // actively targeting enemy -> stops moving
      isTargetingCitadel: false,
      attackCooldownTicks: 0,
      ticksStationary: 0,
      isEngaged: true,
      hasRadiantMorale: false,
      attackCount: 0,
      hasCharged: false,
      stunTicksRemaining: 0,
      solarFlameTicksRemaining: 0,
    };

    expect(MovementSystem.hasRapidVolleyActive(archer)).toBe(false);

    // Simulate 60 ticks of stationary combat (3.0 seconds)
    for (let t = 0; t < 60; t++) {
      MovementSystem.updateMovement([archer]);
    }

    expect(archer.ticksStationary).toBeGreaterThanOrEqual(60);
    expect(MovementSystem.hasRapidVolleyActive(archer)).toBe(true);
  });
});
