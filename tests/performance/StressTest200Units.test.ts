import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { UnitTypeId } from '../../src/core/types';

describe('Performance Stress Test: 200 Simultaneous Units (GDD Section 7.3.2)', () => {
  it('sustains 200 simultaneous units in active combat with average tick time < 5ms', () => {
    const engine = new GameEngine({ seed: 777777 });

    const unitTypes: UnitTypeId[] = [
      'unit_squire',
      'unit_royal_knight',
      'unit_longbowman',
      'unit_siege_crossbowman',
      'unit_solar_apprentice',
      'unit_solar_archmage',
      'unit_mounted_spearman',
      'unit_dawn_paladin',
      'unit_mobile_ballista',
      'unit_greek_fire_catapult',
    ];

    // Spawn 100 Player units and 100 Enemy units (200 total)
    // Distributed across the central combat corridor (X: 900..1100, Y: 200..400)
    for (let i = 0; i < 100; i++) {
      const typeId = unitTypes[i % unitTypes.length];
      const playerUnit = engine.spawnUnit('PLAYER', typeId);
      playerUnit.x = 920 + (i % 10) * 6; // Concentrated around frontline
      playerUnit.y = 200 + ((i * 17) % 200);
      // Give sufficient HP so all 200 units remain alive and active throughout the entire benchmark
      playerUnit.maxHp = 500000;
      playerUnit.currentHp = 500000;

      const enemyUnit = engine.spawnUnit('ENEMY', typeId);
      enemyUnit.x = 1020 + (i % 10) * 6;
      enemyUnit.y = 200 + ((i * 19) % 200);
      enemyUnit.maxHp = 500000;
      enemyUnit.currentHp = 500000;
    }

    expect(engine.units.length).toBe(200);

    // Warm-up phase (10 ticks) to allow V8 JIT compiler optimization
    for (let w = 0; w < 10; w++) {
      engine.tick();
    }
    expect(engine.units.length).toBe(200);

    // Benchmark phase: 100 consecutive logical ticks (representing 5.0 seconds of intense battle @ 20 TPS)
    const benchmarkTicks = 100;
    let maxTickDurationMs = 0;

    const startTime = performance.now();
    for (let t = 0; t < benchmarkTicks; t++) {
      const tickStart = performance.now();
      engine.tick();
      const tickDuration = performance.now() - tickStart;
      if (tickDuration > maxTickDurationMs) {
        maxTickDurationMs = tickDuration;
      }
    }
    const totalElapsedMs = performance.now() - startTime;
    const avgMsPerTick = totalElapsedMs / benchmarkTicks;

    // Strict requirements from GDD Section 7.3.2:
    // "O tick time da simulação lógica não pode ultrapassar 5 ms por tick"
    expect(avgMsPerTick).toBeLessThan(5.0);

    // Peak tick time must also remain well within the 50ms (20 TPS) window
    expect(maxTickDurationMs).toBeLessThan(25.0);

    // Verify all 200 units remained actively simulated and engaged
    expect(engine.units.length).toBe(200);
    const engagedCount = engine.units.filter((u) => u.isEngaged).length;
    expect(engagedCount).toBeGreaterThan(0);
  });
});
