import {
  TeamId,
  UnitTypeId,
  StructureTypeId,
  DamageType,
  UnitState,
  StructureSlotState,
  CitadelState,
  TeamEconomyState,
  FrontlineState,
  GameStateSnapshot,
} from './types';
import { SeededRNG } from './prng/SeededRNG';
import { DomainEventBus } from './events/DomainEventBus';
import {
  TICK_RATE,
  TICK_DURATION_SEC,
  SLOTS_PER_TEAM,
  CITADEL_MAX_HP,
  CITADEL_FLAT_REDUCTION,
  CITADEL_ARMOR_TYPE,
  PLAYER_CITADEL_X,
  ENEMY_CITADEL_X,
  SPAWN_MIN_Y,
  SPAWN_MAX_Y,
  VANGUARD_GOLD_INTERVAL_TICKS,
  DESPERATION_BALISTA_INTERVAL_TICKS,
} from './config/ArenaConfig';
import {
  INITIAL_GOLD,
  INCOME_INTERVAL_TICKS,
  SELL_REFUND_RATE,
  MINE_MAX_LEVEL,
  MINE_LEVEL_DEFINITIONS,
} from './config/EconomyConfig';
import { getUnitDefinition } from './config/UnitsCatalog';
import { getStructureDefinition } from './config/StructuresCatalog';
import { CombatResolver } from './systems/CombatResolver';
import { TargetingSystem } from './systems/TargetingSystem';
import { MovementSystem } from './systems/MovementSystem';
import { FrontlineSystem } from './systems/FrontlineSystem';
import { sha256Hex } from './hash/sha256';

export interface GameEngineOptions {
  seed?: number;
  initialPlayerGold?: number;
  initialEnemyGold?: number;
}

export class GameEngine {
  private tickCount = 0;
  private isGameOver = false;
  private winnerTeam: TeamId | null = null;
  private unitIdCounter = 0;

  public readonly rng: SeededRNG;
  public readonly eventBus: DomainEventBus;

  public readonly citadels: Record<TeamId, CitadelState>;
  public readonly economy: Record<TeamId, TeamEconomyState>;
  public readonly slots: StructureSlotState[];
  public units: UnitState[] = [];
  public readonly frontline: FrontlineState;

  constructor(options: GameEngineOptions = {}) {
    this.rng = new SeededRNG(options.seed ?? 123456);
    this.eventBus = new DomainEventBus();

    this.citadels = {
      PLAYER: {
        team: 'PLAYER',
        x: PLAYER_CITADEL_X,
        currentHp: CITADEL_MAX_HP,
        maxHp: CITADEL_MAX_HP,
        armorType: CITADEL_ARMOR_TYPE,
        flatReduction: CITADEL_FLAT_REDUCTION,
        ballistaCooldownTicks: DESPERATION_BALISTA_INTERVAL_TICKS,
      },
      ENEMY: {
        team: 'ENEMY',
        x: ENEMY_CITADEL_X,
        currentHp: CITADEL_MAX_HP,
        maxHp: CITADEL_MAX_HP,
        armorType: CITADEL_ARMOR_TYPE,
        flatReduction: CITADEL_FLAT_REDUCTION,
        ballistaCooldownTicks: DESPERATION_BALISTA_INTERVAL_TICKS,
      },
    };

    this.economy = {
      PLAYER: {
        team: 'PLAYER',
        gold: options.initialPlayerGold ?? INITIAL_GOLD,
        mineLevel: 0,
        incomeCycleTicksRemaining: INCOME_INTERVAL_TICKS,
        vanguardRewardTicksRemaining: VANGUARD_GOLD_INTERVAL_TICKS,
      },
      ENEMY: {
        team: 'ENEMY',
        gold: options.initialEnemyGold ?? INITIAL_GOLD,
        mineLevel: 0,
        incomeCycleTicksRemaining: INCOME_INTERVAL_TICKS,
        vanguardRewardTicksRemaining: VANGUARD_GOLD_INTERVAL_TICKS,
      },
    };

    this.slots = [];
    // Initialize 12 slots for Player (0..11) and 12 for Enemy (0..11)
    for (let i = 0; i < SLOTS_PER_TEAM; i++) {
      this.slots.push({
        slotIndex: i,
        structureId: null,
        team: 'PLAYER',
        currentSpawnCooldownTicks: 0,
        totalSpawnCooldownTicks: 0,
        totalInvestedGold: 0,
      });
    }
    for (let i = 0; i < SLOTS_PER_TEAM; i++) {
      this.slots.push({
        slotIndex: i,
        structureId: null,
        team: 'ENEMY',
        currentSpawnCooldownTicks: 0,
        totalSpawnCooldownTicks: 0,
        totalInvestedGold: 0,
      });
    }

    this.frontline = {
      frontlineX: 1000,
      playerVanguardTicks: 0,
      playerDesperationTicks: 0,
      enemyVanguardTicks: 0,
      enemyDesperationTicks: 0,
      isPlayerVanguardActive: false,
      isPlayerDesperationActive: false,
      isEnemyVanguardActive: false,
      isEnemyDesperationActive: false,
    };
  }

  public getTick(): number {
    return this.tickCount;
  }

  public getTimeSeconds(): number {
    return Math.round(this.tickCount * TICK_DURATION_SEC * 100) / 100;
  }

  public getIsGameOver(): boolean {
    return this.isGameOver;
  }

  public getWinner(): TeamId | null {
    return this.winnerTeam;
  }

  /**
   * Builds a generator structure in a specific team slot.
   */
  public buildStructure(team: TeamId, slotIndex: number, structureId: StructureTypeId): boolean {
    if (slotIndex < 0 || slotIndex >= SLOTS_PER_TEAM) return false;

    const slot = this.slots.find((s) => s.team === team && s.slotIndex === slotIndex);
    if (!slot || slot.structureId !== null) return false;

    const def = getStructureDefinition(structureId);
    const cost = def.buildCostGold;
    if (this.economy[team].gold < cost) return false;

    this.economy[team].gold -= cost;
    slot.structureId = structureId;
    slot.totalInvestedGold = cost;
    slot.totalSpawnCooldownTicks = Math.round(def.spawnCooldownSec * TICK_RATE);
    slot.currentSpawnCooldownTicks = slot.totalSpawnCooldownTicks;

    this.eventBus.emit('StructureBuilt', {
      structureId,
      slotIndex,
      type: structureId,
      team,
      tick: this.tickCount,
    });

    return true;
  }

  /**
   * Upgrades an existing structure to Tier 2 without resetting the current spawn cycle progress.
   */
  public upgradeStructure(team: TeamId, slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= SLOTS_PER_TEAM) return false;

    const slot = this.slots.find((s) => s.team === team && s.slotIndex === slotIndex);
    if (!slot || slot.structureId === null) return false;

    const currentDef = getStructureDefinition(slot.structureId);
    if (!currentDef.upgradesTo) return false;

    const nextDef = getStructureDefinition(currentDef.upgradesTo);
    const upgradeCost = nextDef.upgradeCostGold;
    if (this.economy[team].gold < upgradeCost) return false;

    this.economy[team].gold -= upgradeCost;
    slot.structureId = nextDef.id;
    slot.totalInvestedGold += upgradeCost;

    // Preserve current spawn timer countdown without resetting
    const newTotalCooldown = Math.round(nextDef.spawnCooldownSec * TICK_RATE);
    slot.currentSpawnCooldownTicks = Math.min(slot.currentSpawnCooldownTicks, newTotalCooldown);
    slot.totalSpawnCooldownTicks = newTotalCooldown;

    this.eventBus.emit('StructureUpgraded', {
      structureId: slot.structureId,
      newType: nextDef.id,
      team,
      tick: this.tickCount,
    });

    return true;
  }

  /**
   * Sells/demolishes a structure, refunding 60% of total gold invested (floored).
   */
  public sellStructure(team: TeamId, slotIndex: number): number {
    if (slotIndex < 0 || slotIndex >= SLOTS_PER_TEAM) return 0;

    const slot = this.slots.find((s) => s.team === team && s.slotIndex === slotIndex);
    if (!slot || slot.structureId === null) return 0;

    const refund = Math.floor(slot.totalInvestedGold * SELL_REFUND_RATE);
    this.economy[team].gold += refund;

    slot.structureId = null;
    slot.totalInvestedGold = 0;
    slot.currentSpawnCooldownTicks = 0;
    slot.totalSpawnCooldownTicks = 0;

    return refund;
  }

  /**
   * Upgrades the Royal Mine treasury (Level 0 to 4).
   */
  public upgradeMine(team: TeamId): boolean {
    const currentLevel = this.economy[team].mineLevel;
    if (currentLevel >= MINE_MAX_LEVEL) return false;

    const nextLevel = currentLevel + 1;
    const nextDef = MINE_LEVEL_DEFINITIONS[nextLevel];
    if (this.economy[team].gold < nextDef.costGold) return false;

    this.economy[team].gold -= nextDef.costGold;
    this.economy[team].mineLevel = nextLevel;
    return true;
  }

  /**
   * Main Fixed Timestep simulation tick (20 TPS = 50ms per tick).
   */
  public tick(): void {
    if (this.isGameOver) return;

    this.tickCount++;

    // 1. Process Economy Income Cycles (every 5.0 seconds = 100 ticks)
    this.updateEconomy();

    // 2. Process Structure Spawning
    this.updateSpawners();

    // 3. Process Unit Targeting & Engagement State
    this.updateTargeting();

    // 4. Process Combat Attacks
    this.updateCombat();

    // 5. Process Movement & Separations
    MovementSystem.updateMovement(this.units);

    // 6. Process Frontline Push, Vanguard & Desperation Balistas
    this.updateFrontline();

    // 7. Cleanup dead units
    this.units = this.units.filter((u) => u.currentHp > 0);

    // 8. Check Game Over conditions
    this.checkGameOver();
  }

  private updateEconomy(): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const eco = this.economy[team];
      eco.incomeCycleTicksRemaining--;
      if (eco.incomeCycleTicksRemaining <= 0) {
        const mineDef = MINE_LEVEL_DEFINITIONS[eco.mineLevel];
        eco.gold += mineDef.incomePerCycle;
        eco.incomeCycleTicksRemaining = INCOME_INTERVAL_TICKS;
      }
    }
  }

  private updateSpawners(): void {
    for (const slot of this.slots) {
      if (!slot.structureId) continue;

      slot.currentSpawnCooldownTicks--;
      if (slot.currentSpawnCooldownTicks <= 0) {
        const structDef = getStructureDefinition(slot.structureId);
        this.spawnUnit(slot.team, structDef.spawnsUnitId);
        slot.currentSpawnCooldownTicks = slot.totalSpawnCooldownTicks;
      }
    }
  }

  public spawnUnit(team: TeamId, typeId: UnitTypeId): UnitState {
    const unitDef = getUnitDefinition(typeId);
    this.unitIdCounter++;
    const unitId = `u_${team.toLowerCase()}_${this.unitIdCounter}`;

    const spawnX = team === 'PLAYER' ? PLAYER_CITADEL_X : ENEMY_CITADEL_X;
    const spawnY = this.rng.nextInt(SPAWN_MIN_Y, SPAWN_MAX_Y);

    const unit: UnitState = {
      id: unitId,
      typeId,
      team,
      x: spawnX,
      y: spawnY,
      currentHp: unitDef.maxHp,
      maxHp: unitDef.maxHp,
      targetUnitId: null,
      isTargetingCitadel: false,
      attackCooldownTicks: 0,
      ticksStationary: 0,
      isEngaged: false,
      hasRadiantMorale: false,
      attackCount: 0,
      hasCharged: false,
      stunTicksRemaining: 0,
    };

    this.units.push(unit);

    this.eventBus.emit('UnitSpawned', {
      type: typeId,
      unitId,
      team,
      x: spawnX,
      y: spawnY,
      tick: this.tickCount,
    });

    return unit;
  }

  private updateTargeting(): void {
    // Reset engagement flags
    for (const unit of this.units) {
      unit.isEngaged = false;
    }

    for (const unit of this.units) {
      if (unit.currentHp <= 0) continue;

      const enemyCitadel = unit.team === 'PLAYER' ? this.citadels.ENEMY : this.citadels.PLAYER;
      const decision = TargetingSystem.selectTarget(unit, this.units, enemyCitadel);

      unit.targetUnitId = decision.targetUnitId;
      unit.isTargetingCitadel = decision.isTargetingCitadel;

      if (unit.targetUnitId !== null) {
        unit.isEngaged = true;
        const target = this.units.find((u) => u.id === unit.targetUnitId);
        if (target) {
          target.isEngaged = true;
        }
      } else if (unit.isTargetingCitadel) {
        unit.isEngaged = true;
      }
    }
  }

  private updateCombat(): void {
    for (const unit of this.units) {
      if (unit.currentHp <= 0 || unit.stunTicksRemaining > 0) continue;

      if (unit.attackCooldownTicks > 0) {
        unit.attackCooldownTicks--;
      }

      if (unit.attackCooldownTicks <= 0) {
        const unitDef = getUnitDefinition(unit.typeId);

        // 1. Attack against an enemy Unit
        if (unit.targetUnitId !== null) {
          const target = this.units.find((u) => u.id === unit.targetUnitId && u.currentHp > 0);
          if (target) {
            const targetDef = getUnitDefinition(target.typeId);
            const isSmash = unit.typeId === 'unit_royal_knight' && (unit.attackCount + 1) % 4 === 0;
            const isCharge = !unit.hasCharged && (unit.typeId === 'unit_mounted_spearman' || unit.typeId === 'unit_dawn_paladin');

            const result = CombatResolver.resolveDamage({
              baseDamage: unitDef.baseDamage,
              damageType: unitDef.damageType,
              defenderArmorType: targetDef.armorType,
              defenderFlatReduction: targetDef.flatReduction,
              attackerTypeId: unit.typeId,
              defenderTypeId: target.typeId,
              defenderMaxHp: target.maxHp,
              defenderCurrentHp: target.currentHp,
              isRangedAttack: !unitDef.isMelee,
              isSmashAttack: isSmash,
              isChargeAttack: isCharge,
              applyPassives: true,
            });

            target.currentHp = Math.max(0, target.currentHp - result.effectiveDamage);
            unit.attackCount++;

            this.eventBus.emit('UnitAttacked', {
              attackerId: unit.id,
              targetId: target.id,
              damage: result.effectiveDamage,
              isCritical: result.isCritical,
              tick: this.tickCount,
            });

            // Royal Knight Smashing Strike knockback: 20px
            if (isSmash) {
              const pushDir = unit.team === 'PLAYER' ? 20 : -20;
              target.x = Math.max(0, Math.min(2000, target.x + pushDir));
            }

            // Mounted unit charge resolution
            if (isCharge) {
              unit.hasCharged = true;
              if (unit.typeId === 'unit_dawn_paladin') {
                target.stunTicksRemaining = Math.round(1.0 * TICK_RATE); // 1.0s stun
              }
            }

            // Splash / AoE damage handling (Solar Apprentice 40px, Greek Fire Catapult 120px)
            if (unitDef.aoeRadiusPx && unitDef.aoeRadiusPx > 0) {
              this.applySplashDamage(unit, target.x, target.y, unitDef.aoeRadiusPx, unitDef.baseDamage, unitDef.damageType);
            }

            // Check target death
            if (target.currentHp <= 0) {
              const bounty = targetDef.bountyGold;
              this.economy[unit.team].gold += bounty;
              this.eventBus.emit('UnitDied', {
                unitId: target.id,
                killerId: unit.id,
                bountyAwarded: bounty,
                x: target.x,
                y: target.y,
                tick: this.tickCount,
              });
            }

            // Set attack cooldown
            let interval = unitDef.attackIntervalSec;
            if (MovementSystem.hasRapidVolleyActive(unit)) {
              interval /= 1.15; // +15% attack speed
            }
            unit.attackCooldownTicks = Math.max(1, Math.round(interval * TICK_RATE));
          }
        }
        // 2. Attack against enemy Citadel
        else if (unit.isTargetingCitadel) {
          const enemyCitadel = unit.team === 'PLAYER' ? this.citadels.ENEMY : this.citadels.PLAYER;
          if (enemyCitadel.currentHp > 0) {
            const result = CombatResolver.resolveDamage({
              baseDamage: unitDef.baseDamage,
              damageType: unitDef.damageType,
              defenderArmorType: enemyCitadel.armorType,
              defenderFlatReduction: enemyCitadel.flatReduction,
              attackerTypeId: unit.typeId,
              isRangedAttack: !unitDef.isMelee,
              applyPassives: true,
            });

            enemyCitadel.currentHp = Math.max(0, enemyCitadel.currentHp - result.effectiveDamage);
            unit.attackCount++;

            this.eventBus.emit('NexusDamaged', {
              team: enemyCitadel.team,
              currentHp: enemyCitadel.currentHp,
              maxHp: enemyCitadel.maxHp,
              damage: result.effectiveDamage,
              tick: this.tickCount,
            });

            unit.attackCooldownTicks = Math.max(1, Math.round(unitDef.attackIntervalSec * TICK_RATE));
          }
        }
      }
    }
  }

  private applySplashDamage(
    attacker: UnitState,
    centerX: number,
    centerY: number,
    radiusPx: number,
    baseDamage: number,
    damageType: DamageType
  ): void {
    const splashTargets = this.units.filter((u) => {
      if (u.team === attacker.team || u.currentHp <= 0) return false;
      const dx = u.x - centerX;
      const dy = u.y - centerY;
      return dx * dx + dy * dy <= radiusPx * radiusPx;
    });

    for (const splTarget of splashTargets) {
      const def = getUnitDefinition(splTarget.typeId);
      // Splash damage is 50% of base damage
      const splashBase = Math.floor(baseDamage * 0.5);
      const splashDmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: splashBase,
        damageType,
        defenderArmorType: def.armorType,
        defenderFlatReduction: def.flatReduction,
        defenderTypeId: splTarget.typeId,
        applyPassives: true,
      });

      splTarget.currentHp = Math.max(0, splTarget.currentHp - splashDmg);
      if (splTarget.currentHp <= 0) {
        this.economy[attacker.team].gold += def.bountyGold;
        this.eventBus.emit('UnitDied', {
          unitId: splTarget.id,
          killerId: attacker.id,
          bountyAwarded: def.bountyGold,
          x: splTarget.x,
          y: splTarget.y,
          tick: this.tickCount,
        });
      }
    }
  }

  private updateFrontline(): void {
    const result = FrontlineSystem.updateFrontline(
      this.frontline,
      this.units,
      this.citadels,
      this.economy
    );

    // Process automated Balista shots from Desperation Bulwark
    for (const shot of result.balistaShots) {
      const target = this.units.find((u) => u.id === shot.targetUnitId && u.currentHp > 0);
      if (target) {
        target.currentHp = Math.max(0, target.currentHp - shot.damage);

        this.eventBus.emit('UnitAttacked', {
          attackerId: `citadel_${shot.attackerCitadelTeam.toLowerCase()}`,
          targetId: target.id,
          damage: shot.damage,
          isCritical: false,
          tick: this.tickCount,
        });

        if (target.currentHp <= 0) {
          const targetDef = getUnitDefinition(target.typeId);
          this.economy[shot.attackerCitadelTeam].gold += targetDef.bountyGold;
          this.eventBus.emit('UnitDied', {
            unitId: target.id,
            killerId: `citadel_${shot.attackerCitadelTeam.toLowerCase()}`,
            bountyAwarded: targetDef.bountyGold,
            x: target.x,
            y: target.y,
            tick: this.tickCount,
          });
        }
      }
    }
  }

  private checkGameOver(): void {
    if (this.citadels.PLAYER.currentHp <= 0 && this.citadels.ENEMY.currentHp <= 0) {
      // Simultaneous defeat -> Tie or player defeat
      this.isGameOver = true;
      this.winnerTeam = null;
      this.eventBus.emit('BattleEnded', {
        winnerTeam: 'ENEMY',
        durationInTicks: this.tickCount,
      });
    } else if (this.citadels.ENEMY.currentHp <= 0) {
      this.isGameOver = true;
      this.winnerTeam = 'PLAYER';
      this.eventBus.emit('BattleEnded', {
        winnerTeam: 'PLAYER',
        durationInTicks: this.tickCount,
      });
    } else if (this.citadels.PLAYER.currentHp <= 0) {
      this.isGameOver = true;
      this.winnerTeam = 'ENEMY';
      this.eventBus.emit('BattleEnded', {
        winnerTeam: 'ENEMY',
        durationInTicks: this.tickCount,
      });
    }
  }

  /**
   * Generates a complete immutable snapshot of the current simulation state.
   */
  public getSnapshot(): GameStateSnapshot {
    return {
      tick: this.tickCount,
      timeSeconds: this.getTimeSeconds(),
      isGameOver: this.isGameOver,
      winnerTeam: this.winnerTeam,
      frontline: { ...this.frontline },
      citadels: {
        PLAYER: { ...this.citadels.PLAYER },
        ENEMY: { ...this.citadels.ENEMY },
      },
      economy: {
        PLAYER: { ...this.economy.PLAYER },
        ENEMY: { ...this.economy.ENEMY },
      },
      slots: this.slots.map((s) => ({ ...s })),
      units: this.units.map((u) => ({ ...u })),
      stateHash: this.computeStateHash(),
    };
  }

  /**
   * Computes a bit-by-bit deterministic SHA-256 hash of the simulation state.
   */
  public computeStateHash(): string {
    const sortedUnits = [...this.units]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((u) => `${u.id}:${u.typeId}:${u.team}:${Math.round(u.x * 100)}:${Math.round(u.y * 100)}:${u.currentHp}`);

    const statePayload = [
      `tick:${this.tickCount}`,
      `p_hp:${this.citadels.PLAYER.currentHp}`,
      `e_hp:${this.citadels.ENEMY.currentHp}`,
      `p_gold:${this.economy.PLAYER.gold}`,
      `e_gold:${this.economy.ENEMY.gold}`,
      `front:${this.frontline.frontlineX}`,
      `rng:${this.rng.getState()}`,
      `units:[${sortedUnits.join(',')}]`,
    ].join('|');

    return sha256Hex(statePayload);
  }
}
