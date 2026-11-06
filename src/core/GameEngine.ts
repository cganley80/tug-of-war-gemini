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
  GreekFireHazard,
  AIProfileId,
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
  SOLAR_FLAME_DURATION_TICKS,
  SOLAR_FLAME_COOLDOWN_MULTIPLIER,
  DAWN_PALADIN_AURA_RADIUS_PX,
  DAWN_PALADIN_STUN_TICKS,
  BALLISTA_PIERCE_FORWARD_MAX_PX,
  BALLISTA_PIERCE_VERTICAL_MAX_PX,
  ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
  ARCHMAGE_SUPERNOVA_RADIUS_PX,
  GREEK_FIRE_DURATION_TICKS,
  GREEK_FIRE_RADIUS_PX,
  GREEK_FIRE_INTERVAL_TICKS,
  GREEK_FIRE_BASE_MAGIC_DAMAGE,
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
import { AIController } from './ai/AIController';
import { sha256Hex } from './hash/sha256';

export interface GameEngineOptions {
  seed?: number;
  initialPlayerGold?: number;
  initialEnemyGold?: number;
  aiProfile?: AIProfileId | null;
}

export class GameEngine {
  private tickCount = 0;
  private isGameOver = false;
  private winnerTeam: TeamId | null = null;
  private unitIdCounter = 0;
  private hazardIdCounter = 0;

  public readonly rng: SeededRNG;
  public readonly eventBus: DomainEventBus;
  public readonly options: GameEngineOptions;

  public readonly citadels: Record<TeamId, CitadelState>;
  public readonly economy: Record<TeamId, TeamEconomyState>;
  public readonly slots: StructureSlotState[];
  public units: UnitState[] = [];
  public hazards: GreekFireHazard[] = [];
  public readonly frontline: FrontlineState;
  public readonly aiController: AIController | null = null;

  constructor(options: GameEngineOptions = {}) {
    this.options = options;
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

    // Boss Act 1 starts with 200g unless overridden
    const initialEnemyGold =
      options.initialEnemyGold ??
      (options.aiProfile === 'BOSS_ACT1' ? 200 : INITIAL_GOLD);

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
        gold: initialEnemyGold,
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

    // Boss Act 1: Slot 11 permanently occupied by Renegade Altar
    if (options.aiProfile === 'BOSS_ACT1') {
      const bossSlot11 = this.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 11);
      if (bossSlot11) {
        bossSlot11.structureId = 'bldg_renegade_altar';
        bossSlot11.totalSpawnCooldownTicks = 900; // 45.0s @ 20 TPS
        bossSlot11.currentSpawnCooldownTicks = 900;
        bossSlot11.totalInvestedGold = 0;
      }
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

    if (options.aiProfile) {
      this.aiController = new AIController(options.aiProfile);
    }
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

    // Boss Altar cannot be demolished/sold
    if (slot.structureId === 'bldg_renegade_altar') {
      return 0;
    }

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

    // 0. Update Solar Flame debuffs on units
    for (const unit of this.units) {
      if (unit.solarFlameTicksRemaining > 0) {
        unit.solarFlameTicksRemaining--;
      }
    }

    // 1. Process Economy Income Cycles (every 5.0 seconds = 100 ticks)
    this.updateEconomy();

    // 2. Process Structure Spawning
    this.updateSpawners();

    // 3. Process AI Decision Loop (strictly every 20 ticks = 1.0s)
    if (this.aiController && this.tickCount % 20 === 0 && !this.isGameOver) {
      this.aiController.update(this);
    }

    // 4. Process Ground Hazards (Greek Fire Poças)
    this.updateHazards();

    // 5. Process Unit Targeting & Engagement State
    this.updateTargeting();

    // 6. Process Combat Attacks
    this.updateCombat();

    // 7. Process Movement, Tactical Aggro Y-Steering & Soft Collisions
    MovementSystem.updateMovement(this.units);

    // 8. Process Frontline Push, Vanguard & Desperation Balistas
    this.updateFrontline();

    // 9. Cleanup dead units
    this.units = this.units.filter((u) => u.currentHp > 0);

    // 10. Check Game Over conditions
    this.checkGameOver();
  }

  private updateEconomy(): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const eco = this.economy[team];
      eco.incomeCycleTicksRemaining--;
      if (eco.incomeCycleTicksRemaining <= 0) {
        const mineDef = MINE_LEVEL_DEFINITIONS[eco.mineLevel];
        let income = mineDef.incomePerCycle;
        // Boss Act 1: 1.25x passive income multiplier
        if (team === 'ENEMY' && this.options.aiProfile === 'BOSS_ACT1') {
          income = Math.floor(income * 1.25);
        }
        eco.gold += income;
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
      solarFlameTicksRemaining: 0,
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

  /**
   * Helper to check if a unit is under the protection of a friendly Dawn Paladin's Devotion Aura.
   */
  public hasPaladinAura(unit: UnitState): boolean {
    return this.units.some(
      (ally) =>
        ally.team === unit.team &&
        ally.currentHp > 0 &&
        ally.typeId === 'unit_dawn_paladin' &&
        (ally.x - unit.x) ** 2 + (ally.y - unit.y) ** 2 <=
          DAWN_PALADIN_AURA_RADIUS_PX * DAWN_PALADIN_AURA_RADIUS_PX
    );
  }

  /**
   * Calculates attack cooldown ticks considering Rapid Volley and Solar Flame debuff.
   */
  public calculateAttackCooldownTicks(unit: UnitState): number {
    const unitDef = getUnitDefinition(unit.typeId);
    let interval = unitDef.attackIntervalSec;

    // Rapid Volley passive (+15% attack speed)
    if (MovementSystem.hasRapidVolleyActive(unit)) {
      interval /= 1.15;
    }

    // Solar Flame debuff (-25% attack speed -> interval / 0.75)
    if (unit.solarFlameTicksRemaining > 0) {
      interval *= SOLAR_FLAME_COOLDOWN_MULTIPLIER;
    }

    return Math.max(1, Math.round(interval * TICK_RATE));
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
            const targetHasAura = this.hasPaladinAura(target);

            // [P0-3] Royal Knight Smashing Strike every 3rd attack
            const isSmash =
              unit.typeId === 'unit_royal_knight' && (unit.attackCount + 1) % 3 === 0;

            // Mounted charge: first attack before setting hasCharged
            const isCharge =
              !unit.hasCharged &&
              (unit.typeId === 'unit_mounted_spearman' || unit.typeId === 'unit_dawn_paladin');

            // Solar Archmage Supernova da Alvorada every 4th attack
            const isSupernova =
              unit.typeId === 'unit_solar_archmage' && (unit.attackCount + 1) % 4 === 0;

            if (isSupernova) {
              // Supernova: 100px AoE with 110 Magic Damage base applied to all enemies in area
              const supernovaTargets = this.units.filter((u) => {
                if (u.team === unit.team || u.currentHp <= 0) return false;
                const dx = u.x - target.x;
                const dy = u.y - target.y;
                return dx * dx + dy * dy <= ARCHMAGE_SUPERNOVA_RADIUS_PX * ARCHMAGE_SUPERNOVA_RADIUS_PX;
              });

              for (const snTarget of supernovaTargets) {
                const snDef = getUnitDefinition(snTarget.typeId);
                const snAura = this.hasPaladinAura(snTarget);
                const snDmg = CombatResolver.calculateEffectiveDamage({
                  baseDamage: ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
                  damageType: 'MAGIC',
                  defenderArmorType: snDef.armorType,
                  defenderFlatReduction: snDef.flatReduction,
                  defenderTypeId: snTarget.typeId,
                  hasPaladinAura: snAura,
                  applyPassives: true,
                });

                snTarget.currentHp = Math.max(0, snTarget.currentHp - snDmg);
                snTarget.solarFlameTicksRemaining = SOLAR_FLAME_DURATION_TICKS; // 60 ticks (3.0s)

                this.eventBus.emit('UnitAttacked', {
                  attackerId: unit.id,
                  targetId: snTarget.id,
                  damage: snDmg,
                  isCritical: false,
                  tick: this.tickCount,
                });

                if (snTarget.currentHp <= 0) {
                  this.economy[unit.team].gold += snDef.bountyGold;
                  this.eventBus.emit('UnitDied', {
                    unitId: snTarget.id,
                    killerId: unit.id,
                    bountyAwarded: snDef.bountyGold,
                    x: snTarget.x,
                    y: snTarget.y,
                    tick: this.tickCount,
                  });
                }
              }

              unit.attackCount++;
              unit.attackCooldownTicks = this.calculateAttackCooldownTicks(unit);
            } else {
              // Standard single-target attack calculation
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
                hasPaladinAura: targetHasAura,
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

              // [P0-3] Royal Knight Smashing Strike knockback: 20px towards enemy rear clamped to [0, 2000]
              if (isSmash) {
                const pushDir = unit.team === 'PLAYER' ? 20 : -20;
                target.x = Math.max(0, Math.min(2000, target.x + pushDir));
              }

              // Mounted unit charge resolution
              if (isCharge) {
                unit.hasCharged = true;
                if (unit.typeId === 'unit_dawn_paladin') {
                  target.stunTicksRemaining = DAWN_PALADIN_STUN_TICKS; // 20 ticks (1.0s)
                }
              }

              // Mobile Ballista: Piercing linear bolt (+1 additional enemy behind target)
              if (unit.typeId === 'unit_mobile_ballista') {
                const potentialSecondTargets = this.units.filter((other) => {
                  if (other.team === unit.team || other.currentHp <= 0 || other.id === target.id) {
                    return false;
                  }
                  const forwardDeltaX =
                    unit.team === 'PLAYER' ? other.x - target.x : target.x - other.x;
                  const deltaY = Math.abs(other.y - target.y);
                  return (
                    forwardDeltaX >= 0 &&
                    forwardDeltaX <= BALLISTA_PIERCE_FORWARD_MAX_PX &&
                    deltaY <= BALLISTA_PIERCE_VERTICAL_MAX_PX
                  );
                });

                if (potentialSecondTargets.length > 0) {
                  potentialSecondTargets.sort((a, b) => {
                    const distA = Math.sqrt((a.x - target.x) ** 2 + (a.y - target.y) ** 2);
                    const distB = Math.sqrt((b.x - target.x) ** 2 + (b.y - target.y) ** 2);
                    if (Math.abs(distA - distB) > 0.0001) return distA - distB;
                    return a.id.localeCompare(b.id);
                  });

                  const secondTarget = potentialSecondTargets[0];
                  const secDef = getUnitDefinition(secondTarget.typeId);
                  const secAura = this.hasPaladinAura(secondTarget);

                  const secDmg = CombatResolver.calculateEffectiveDamage({
                    baseDamage: unitDef.baseDamage,
                    damageType: unitDef.damageType,
                    defenderArmorType: secDef.armorType,
                    defenderFlatReduction: secDef.flatReduction,
                    defenderTypeId: secondTarget.typeId,
                    hasPaladinAura: secAura,
                    applyPassives: true,
                  });

                  secondTarget.currentHp = Math.max(0, secondTarget.currentHp - secDmg);

                  this.eventBus.emit('UnitAttacked', {
                    attackerId: unit.id,
                    targetId: secondTarget.id,
                    damage: secDmg,
                    isCritical: false,
                    tick: this.tickCount,
                  });

                  if (secondTarget.currentHp <= 0) {
                    this.economy[unit.team].gold += secDef.bountyGold;
                    this.eventBus.emit('UnitDied', {
                      unitId: secondTarget.id,
                      killerId: unit.id,
                      bountyAwarded: secDef.bountyGold,
                      x: secondTarget.x,
                      y: secondTarget.y,
                      tick: this.tickCount,
                    });
                  }
                }
              }

              // [P0-2] Splash Damage handling with primaryTargetId excluded:
              // Solar Apprentice: 40px radius, 50% splash
              if (unit.typeId === 'unit_solar_apprentice') {
                this.applySplashDamage(
                  unit,
                  target.id,
                  target.x,
                  target.y,
                  40,
                  unitDef.baseDamage,
                  unitDef.damageType
                );
              }

              // Greek Fire Catapult: 120px radius, 50% splash + Ground Hazard creation
              if (unit.typeId === 'unit_greek_fire_catapult') {
                this.applySplashDamage(
                  unit,
                  target.id,
                  target.x,
                  target.y,
                  GREEK_FIRE_RADIUS_PX,
                  unitDef.baseDamage,
                  unitDef.damageType
                );

                // Create Greek Fire ground hazard
                this.hazards.push({
                  id: `hazard_${++this.hazardIdCounter}`,
                  team: unit.team,
                  x: target.x,
                  y: target.y,
                  radiusPx: GREEK_FIRE_RADIUS_PX,
                  ticksRemaining: GREEK_FIRE_DURATION_TICKS,
                  tickInterval: GREEK_FIRE_INTERVAL_TICKS,
                  baseMagicDamage: GREEK_FIRE_BASE_MAGIC_DAMAGE,
                });
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
              unit.attackCooldownTicks = this.calculateAttackCooldownTicks(unit);
            }
          }
        }
        // 2. Attack against enemy Citadel
        else if (unit.isTargetingCitadel) {
          const enemyCitadel = unit.team === 'PLAYER' ? this.citadels.ENEMY : this.citadels.PLAYER;
          if (enemyCitadel.currentHp > 0) {
            const isSmash =
              unit.typeId === 'unit_royal_knight' && (unit.attackCount + 1) % 3 === 0;
            const isCharge =
              !unit.hasCharged &&
              (unit.typeId === 'unit_mounted_spearman' || unit.typeId === 'unit_dawn_paladin');
            const isSupernova =
              unit.typeId === 'unit_solar_archmage' && (unit.attackCount + 1) % 4 === 0;

            if (isSupernova) {
              // Supernova on Citadel: deals 110 Magic Damage to Citadel + secondary units in 100px
              const citadelDmg = CombatResolver.calculateEffectiveDamage({
                baseDamage: ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
                damageType: 'MAGIC',
                defenderArmorType: enemyCitadel.armorType,
                defenderFlatReduction: enemyCitadel.flatReduction,
                attackerTypeId: unit.typeId,
                isRangedAttack: true,
                applyPassives: true,
              });

              enemyCitadel.currentHp = Math.max(0, enemyCitadel.currentHp - citadelDmg);
              unit.attackCount++;

              this.eventBus.emit('NexusDamaged', {
                team: enemyCitadel.team,
                currentHp: enemyCitadel.currentHp,
                maxHp: enemyCitadel.maxHp,
                damage: citadelDmg,
                tick: this.tickCount,
              });

              // Also damage enemy units near the citadel impact point
              const nearbyEnemies = this.units.filter((u) => {
                if (u.team === unit.team || u.currentHp <= 0) return false;
                const dx = u.x - enemyCitadel.x;
                const dy = u.y - unit.y;
                return dx * dx + dy * dy <= ARCHMAGE_SUPERNOVA_RADIUS_PX * ARCHMAGE_SUPERNOVA_RADIUS_PX;
              });

              for (const nb of nearbyEnemies) {
                const nbDef = getUnitDefinition(nb.typeId);
                const nbAura = this.hasPaladinAura(nb);
                const nbDmg = CombatResolver.calculateEffectiveDamage({
                  baseDamage: ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
                  damageType: 'MAGIC',
                  defenderArmorType: nbDef.armorType,
                  defenderFlatReduction: nbDef.flatReduction,
                  defenderTypeId: nb.typeId,
                  hasPaladinAura: nbAura,
                  applyPassives: true,
                });

                nb.currentHp = Math.max(0, nb.currentHp - nbDmg);
                nb.solarFlameTicksRemaining = SOLAR_FLAME_DURATION_TICKS;

                this.eventBus.emit('UnitAttacked', {
                  attackerId: unit.id,
                  targetId: nb.id,
                  damage: nbDmg,
                  isCritical: false,
                  tick: this.tickCount,
                });

                if (nb.currentHp <= 0) {
                  this.economy[unit.team].gold += nbDef.bountyGold;
                  this.eventBus.emit('UnitDied', {
                    unitId: nb.id,
                    killerId: unit.id,
                    bountyAwarded: nbDef.bountyGold,
                    x: nb.x,
                    y: nb.y,
                    tick: this.tickCount,
                  });
                }
              }

              unit.attackCooldownTicks = this.calculateAttackCooldownTicks(unit);
            } else {
              const result = CombatResolver.resolveDamage({
                baseDamage: unitDef.baseDamage,
                damageType: unitDef.damageType,
                defenderArmorType: enemyCitadel.armorType,
                defenderFlatReduction: enemyCitadel.flatReduction,
                attackerTypeId: unit.typeId,
                isRangedAttack: !unitDef.isMelee,
                isSmashAttack: isSmash,
                isChargeAttack: isCharge,
                applyPassives: true,
              });

              enemyCitadel.currentHp = Math.max(0, enemyCitadel.currentHp - result.effectiveDamage);
              unit.attackCount++;

              if (isCharge) {
                unit.hasCharged = true;
              }

              // Greek fire catapult splash and hazard at citadel impact
              if (unit.typeId === 'unit_greek_fire_catapult') {
                this.applySplashDamage(
                  unit,
                  null,
                  enemyCitadel.x,
                  unit.y,
                  GREEK_FIRE_RADIUS_PX,
                  unitDef.baseDamage,
                  unitDef.damageType
                );

                this.hazards.push({
                  id: `hazard_${++this.hazardIdCounter}`,
                  team: unit.team,
                  x: enemyCitadel.x,
                  y: unit.y,
                  radiusPx: GREEK_FIRE_RADIUS_PX,
                  ticksRemaining: GREEK_FIRE_DURATION_TICKS,
                  tickInterval: GREEK_FIRE_INTERVAL_TICKS,
                  baseMagicDamage: GREEK_FIRE_BASE_MAGIC_DAMAGE,
                });
              } else if (unit.typeId === 'unit_solar_apprentice') {
                this.applySplashDamage(
                  unit,
                  null,
                  enemyCitadel.x,
                  unit.y,
                  40,
                  unitDef.baseDamage,
                  unitDef.damageType
                );
              }

              this.eventBus.emit('NexusDamaged', {
                team: enemyCitadel.team,
                currentHp: enemyCitadel.currentHp,
                maxHp: enemyCitadel.maxHp,
                damage: result.effectiveDamage,
                tick: this.tickCount,
              });

              unit.attackCooldownTicks = this.calculateAttackCooldownTicks(unit);
            }
          }
        }
      }
    }
  }

  /**
   * [P0-2] Applies 50% splash damage to secondary enemies in radius, strictly excluding primaryTargetId.
   */
  private applySplashDamage(
    attacker: UnitState,
    primaryTargetId: string | null,
    centerX: number,
    centerY: number,
    radiusPx: number,
    baseDamage: number,
    damageType: DamageType
  ): void {
    const splashTargets = this.units.filter((u) => {
      if (u.team === attacker.team || u.currentHp <= 0) return false;
      if (primaryTargetId !== null && u.id === primaryTargetId) return false;
      const dx = u.x - centerX;
      const dy = u.y - centerY;
      return dx * dx + dy * dy <= radiusPx * radiusPx;
    });

    for (const splTarget of splashTargets) {
      const def = getUnitDefinition(splTarget.typeId);
      const splashBase = Math.floor(baseDamage * 0.5);
      const splashDmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: splashBase,
        damageType,
        defenderArmorType: def.armorType,
        defenderFlatReduction: def.flatReduction,
        defenderTypeId: splTarget.typeId,
        hasPaladinAura: this.hasPaladinAura(splTarget),
        applyPassives: true,
      });

      splTarget.currentHp = Math.max(0, splTarget.currentHp - splashDmg);

      this.eventBus.emit('UnitAttacked', {
        attackerId: attacker.id,
        targetId: splTarget.id,
        damage: splashDmg,
        isCritical: false,
        tick: this.tickCount,
      });

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

  /**
   * Updates Greek Fire ground hazards. Applies 25 Magic Damage every 20 ticks (1.0s).
   * Citadel is strictly immune to ground hazard pools.
   */
  private updateHazards(): void {
    for (const hazard of this.hazards) {
      hazard.ticksRemaining--;

      // Pulse damage every 20 ticks (e.g. 60, 40, 20, 0)
      if (hazard.ticksRemaining % hazard.tickInterval === 0) {
        const affectedUnits = this.units.filter((u) => {
          if (u.team === hazard.team || u.currentHp <= 0) return false;
          const dx = u.x - hazard.x;
          const dy = u.y - hazard.y;
          return dx * dx + dy * dy <= hazard.radiusPx * hazard.radiusPx;
        });

        for (const target of affectedUnits) {
          const def = getUnitDefinition(target.typeId);
          const damage = CombatResolver.calculateEffectiveDamage({
            baseDamage: hazard.baseMagicDamage,
            damageType: 'MAGIC',
            defenderArmorType: def.armorType,
            defenderFlatReduction: def.flatReduction,
            defenderTypeId: target.typeId,
            hasPaladinAura: this.hasPaladinAura(target),
            applyPassives: true,
          });

          target.currentHp = Math.max(0, target.currentHp - damage);

          this.eventBus.emit('UnitAttacked', {
            attackerId: hazard.id,
            targetId: target.id,
            damage,
            isCritical: false,
            tick: this.tickCount,
          });

          if (target.currentHp <= 0) {
            this.economy[hazard.team].gold += def.bountyGold;
            this.eventBus.emit('UnitDied', {
              unitId: target.id,
              killerId: hazard.id,
              bountyAwarded: def.bountyGold,
              x: target.x,
              y: target.y,
              tick: this.tickCount,
            });
          }
        }
      }
    }

    // Cleanup expired hazards
    this.hazards = this.hazards.filter((h) => h.ticksRemaining > 0);
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
      hazards: this.hazards.map((h) => ({ ...h })),
      stateHash: this.computeStateHash(),
    };
  }

  /**
   * Computes a bit-by-bit deterministic SHA-256 hash of the simulation state.
   */
  public computeStateHash(): string {
    const sortedUnits = [...this.units]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(
        (u) =>
          `${u.id}:${u.typeId}:${u.team}:${Math.round(u.x * 100)}:${Math.round(u.y * 100)}:${u.currentHp}:${u.solarFlameTicksRemaining}`
      );

    const sortedHazards = [...this.hazards]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((h) => `${h.id}:${h.team}:${Math.round(h.x)}:${Math.round(h.y)}:${h.ticksRemaining}`);

    const statePayload = [
      `tick:${this.tickCount}`,
      `p_hp:${this.citadels.PLAYER.currentHp}`,
      `e_hp:${this.citadels.ENEMY.currentHp}`,
      `p_gold:${this.economy.PLAYER.gold}`,
      `e_gold:${this.economy.ENEMY.gold}`,
      `front:${this.frontline.frontlineX}`,
      `rng:${this.rng.getState()}`,
      `units:[${sortedUnits.join(',')}]`,
      `hazards:[${sortedHazards.join(',')}]`,
    ].join('|');

    return sha256Hex(statePayload);
  }
}
