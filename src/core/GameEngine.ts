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
  RelicTypeId,
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
  activeRelics?: RelicTypeId[];
  playerDamageBonus?: number;
  initialPlayerCitadelHp?: number;
  enemyUnitHpMultiplier?: number;
}

export class GameEngine {
  private tickCount = 0;
  private isGameOver = false;
  private winnerTeam: TeamId | null = null;
  private unitIdCounter = 0;
  private hazardIdCounter = 0;
  private playerPaladins: UnitState[] = [];
  private enemyPaladins: UnitState[] = [];
  private paladinsInitialized = false;

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
        currentHp: options.initialPlayerCitadelHp ?? CITADEL_MAX_HP,
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
    const isFebrile = team === 'PLAYER' && this.hasRelic('relic_febrile_production');
    const cooldownMultiplier = isFebrile ? 0.85 : 1.0;
    slot.totalSpawnCooldownTicks = Math.max(1, Math.round(def.spawnCooldownSec * cooldownMultiplier * TICK_RATE));
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
    const isFebrile = team === 'PLAYER' && this.hasRelic('relic_febrile_production');
    const cooldownMultiplier = isFebrile ? 0.85 : 1.0;
    const newTotalCooldown = Math.max(1, Math.round(nextDef.spawnCooldownSec * cooldownMultiplier * TICK_RATE));
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

    // [P0-3] Refresh alive paladins cache once at the start of tick for high-performance Devotion Aura queries
    this.refreshAlivePaladins();

    // 0. Update Solar Flame debuffs on units
    for (const unit of this.units) {
      if (unit.solarFlameTicksRemaining > 0) {
        unit.solarFlameTicksRemaining--;
      }
    }

    // Process relic_citadel_mana_heart every 600 ticks (30.0s)
    if (
      this.tickCount > 0 &&
      this.tickCount % 600 === 0 &&
      this.hasRelic('relic_citadel_mana_heart')
    ) {
      this.triggerCitadelManaHeart();
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

    // Apply relic_febrile_production (-10% Max HP) or enemyUnitHpMultiplier (+20% for Elite)
    let maxHp = unitDef.maxHp;
    if (team === 'PLAYER' && this.hasRelic('relic_febrile_production')) {
      maxHp = Math.max(1, Math.floor(unitDef.maxHp * 0.9));
    } else if (team === 'ENEMY' && this.options.enemyUnitHpMultiplier) {
      maxHp = Math.max(1, Math.floor(unitDef.maxHp * this.options.enemyUnitHpMultiplier));
    }

    const unit: UnitState = {
      id: unitId,
      typeId,
      team,
      x: spawnX,
      y: spawnY,
      currentHp: maxHp,
      maxHp,
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
    if (typeId === 'unit_dawn_paladin') {
      if (team === 'PLAYER') {
        this.playerPaladins.push(unit);
      } else {
        this.enemyPaladins.push(unit);
      }
    }

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
   * [P0-3] Refresh alive paladins list once per tick partitioned by team.
   */
  public refreshAlivePaladins(): void {
    this.playerPaladins = [];
    this.enemyPaladins = [];
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.currentHp > 0 && u.typeId === 'unit_dawn_paladin') {
        if (u.team === 'PLAYER') {
          this.playerPaladins.push(u);
        } else {
          this.enemyPaladins.push(u);
        }
      }
    }
    this.paladinsInitialized = true;
  }

  /**
   * [P0-3] Fast aura query against pre-filtered short list of alive Paladins of same team.
   */
  public hasPaladinAura(unit: UnitState): boolean {
    if (!this.paladinsInitialized) {
      this.refreshAlivePaladins();
    }
    const list = unit.team === 'PLAYER' ? this.playerPaladins : this.enemyPaladins;
    const len = list.length;
    if (len === 0) return false;

    const r2 = DAWN_PALADIN_AURA_RADIUS_PX * DAWN_PALADIN_AURA_RADIUS_PX;
    const ux = unit.x;
    const uy = unit.y;

    for (let i = 0; i < len; i++) {
      const paladin = list[i];
      if (paladin.currentHp > 0) {
        const dx = paladin.x - ux;
        const dy = paladin.y - uy;
        if (dx * dx + dy * dy <= r2) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Helper to check if an active relic is enabled for the player.
   */
  public hasRelic(id: RelicTypeId): boolean {
    return this.options.activeRelics?.includes(id) ?? false;
  }

  /**
   * Helper to calculate global damage multiplier for PLAYER troops (Field Forge + Blood and Soil banner).
   */
  public getPlayerDamageMultiplier(): number {
    let mult = 1.0;
    if (this.options.playerDamageBonus) {
      mult *= 1 + this.options.playerDamageBonus;
    }
    if (this.hasRelic('relic_blood_and_soil_banner') && this.frontline.frontlineX > 1200) {
      mult *= 1.2;
    }
    return mult;
  }

  /**
   * Handles unit death, applying gold bounties (doubled with relic_royal_war_tithe) and martyr triggers.
   */
  private handleUnitDeath(
    victim: UnitState,
    killerTeam: TeamId,
    killerId: string,
    damageType: DamageType
  ): void {
    const def = getUnitDefinition(victim.typeId);
    let bounty = def.bountyGold;

    // relic_royal_war_tithe: double bounty when PLAYER kills ENEMY unit with MAGIC or SIEGE
    if (
      killerTeam === 'PLAYER' &&
      victim.team === 'ENEMY' &&
      this.hasRelic('relic_royal_war_tithe') &&
      (damageType === 'MAGIC' || damageType === 'SIEGE')
    ) {
      bounty *= 2;
    }

    this.economy[killerTeam].gold += bounty;
    this.eventBus.emit('UnitDied', {
      unitId: victim.id,
      killerId,
      bountyAwarded: bounty,
      x: victim.x,
      y: victim.y,
      tick: this.tickCount,
    });

    // relic_solar_martyrdom: radial 80px AoE causing 60 Magic Damage on PLAYER melee death
    if (
      victim.team === 'PLAYER' &&
      this.hasRelic('relic_solar_martyrdom') &&
      def.isMelee
    ) {
      this.triggerSolarMartyrdom(victim.x, victim.y);
    }
  }

  /**
   * Triggers relic_solar_martyrdom 80px radial explosion on melee death.
   */
  private triggerSolarMartyrdom(deathX: number, deathY: number): void {
    const r2 = 80 * 80;
    const affectedEnemies = this.units.filter((u) => {
      if (u.team !== 'ENEMY' || u.currentHp <= 0) return false;
      const dx = u.x - deathX;
      const dy = u.y - deathY;
      return dx * dx + dy * dy <= r2;
    });

    for (const enemy of affectedEnemies) {
      const def = getUnitDefinition(enemy.typeId);
      const aura = this.hasPaladinAura(enemy);
      const dmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: 60,
        damageType: 'MAGIC',
        defenderArmorType: def.armorType,
        defenderFlatReduction: def.flatReduction,
        defenderTypeId: enemy.typeId,
        hasPaladinAura: aura,
        applyPassives: true,
      });

      enemy.currentHp = Math.max(0, enemy.currentHp - dmg);

      this.eventBus.emit('UnitAttacked', {
        attackerId: 'relic_solar_martyrdom',
        targetId: enemy.id,
        damage: dmg,
        isCritical: false,
        tick: this.tickCount,
      });

      if (enemy.currentHp <= 0) {
        this.handleUnitDeath(enemy, 'PLAYER', 'relic_solar_martyrdom', 'MAGIC');
      }
    }
  }

  /**
   * Triggers relic_flaming_dawn_bolts 70px fiery explosion on every 5th shooter attack.
   */
  private triggerFlamingDawnBolts(
    impactX: number,
    impactY: number,
    isTargetCitadel: boolean,
    attackerId: string
  ): void {
    const r2 = 70 * 70;
    const affectedEnemies = this.units.filter((u) => {
      if (u.team !== 'ENEMY' || u.currentHp <= 0) return false;
      const dx = u.x - impactX;
      const dy = u.y - impactY;
      return dx * dx + dy * dy <= r2;
    });

    for (const enemy of affectedEnemies) {
      const def = getUnitDefinition(enemy.typeId);
      const aura = this.hasPaladinAura(enemy);
      const dmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: 160,
        damageType: 'MAGIC',
        defenderArmorType: def.armorType,
        defenderFlatReduction: def.flatReduction,
        defenderTypeId: enemy.typeId,
        hasPaladinAura: aura,
        applyPassives: true,
      });

      enemy.currentHp = Math.max(0, enemy.currentHp - dmg);

      this.eventBus.emit('UnitAttacked', {
        attackerId,
        targetId: enemy.id,
        damage: dmg,
        isCritical: false,
        tick: this.tickCount,
      });

      if (enemy.currentHp <= 0) {
        this.handleUnitDeath(enemy, 'PLAYER', attackerId, 'MAGIC');
      }
    }

    // Damage enemy citadel if targeted or within 70px
    const enemyCitadel = this.citadels.ENEMY;
    if (isTargetCitadel || (enemyCitadel.x - impactX) ** 2 <= r2) {
      const citadelDmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: 160,
        damageType: 'MAGIC',
        defenderArmorType: enemyCitadel.armorType,
        defenderFlatReduction: enemyCitadel.flatReduction,
        applyPassives: true,
      });

      enemyCitadel.currentHp = Math.max(0, enemyCitadel.currentHp - citadelDmg);

      this.eventBus.emit('NexusDamaged', {
        team: 'ENEMY',
        currentHp: enemyCitadel.currentHp,
        maxHp: enemyCitadel.maxHp,
        damage: citadelDmg,
        tick: this.tickCount,
      });
    }
  }

  /**
   * Triggers relic_citadel_mana_heart periodic wave (+120 HP heal to allies, 80 Magic Damage to enemies).
   */
  private triggerCitadelManaHeart(): void {
    // 1. Heal all alive PLAYER units +120 HP (Citadel not healed)
    for (const unit of this.units) {
      if (unit.team === 'PLAYER' && unit.currentHp > 0) {
        unit.currentHp = Math.min(unit.maxHp, unit.currentHp + 120);
      }
    }

    // 2. Pulse 80 Magic Damage to all alive ENEMY mobile units (Citadel not damaged)
    const aliveEnemies = this.units.filter((u) => u.team === 'ENEMY' && u.currentHp > 0);
    for (const enemy of aliveEnemies) {
      const def = getUnitDefinition(enemy.typeId);
      const aura = this.hasPaladinAura(enemy);
      const dmg = CombatResolver.calculateEffectiveDamage({
        baseDamage: 80,
        damageType: 'MAGIC',
        defenderArmorType: def.armorType,
        defenderFlatReduction: def.flatReduction,
        defenderTypeId: enemy.typeId,
        hasPaladinAura: aura,
        applyPassives: true,
      });

      enemy.currentHp = Math.max(0, enemy.currentHp - dmg);

      this.eventBus.emit('UnitAttacked', {
        attackerId: 'relic_citadel_mana_heart',
        targetId: enemy.id,
        damage: dmg,
        isCritical: false,
        tick: this.tickCount,
      });

      if (enemy.currentHp <= 0) {
        this.handleUnitDeath(enemy, 'PLAYER', 'relic_citadel_mana_heart', 'MAGIC');
      }
    }
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
        const attackerMultiplier = unit.team === 'PLAYER' ? this.getPlayerDamageMultiplier() : 1.0;
        const isShooter =
          unit.typeId === 'unit_longbowman' || unit.typeId === 'unit_siege_crossbowman';
        const isFlamingBoltsProc =
          unit.team === 'PLAYER' &&
          isShooter &&
          this.hasRelic('relic_flaming_dawn_bolts') &&
          (unit.attackCount + 1) % 5 === 0;

        // 1. Attack against an enemy Unit
        if (unit.targetUnitId !== null) {
          const target = this.units.find((u) => u.id === unit.targetUnitId && u.currentHp > 0);
          if (target) {
            const targetDef = getUnitDefinition(target.typeId);
            const targetHasAura = this.hasPaladinAura(target);
            const targetHeavyPlating =
              target.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');
            const unitHasDawnCharge =
              unit.team === 'PLAYER' && this.hasRelic('relic_triumphant_dawn_charge');

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
              const snR2 = ARCHMAGE_SUPERNOVA_RADIUS_PX * ARCHMAGE_SUPERNOVA_RADIUS_PX;
              const tx = target.x;
              const ty = target.y;

              for (let i = 0; i < this.units.length; i++) {
                const snTarget = this.units[i];
                if (snTarget.team === unit.team || snTarget.currentHp <= 0) continue;
                const dx = snTarget.x - tx;
                const dy = snTarget.y - ty;
                if (dx * dx + dy * dy <= snR2) {
                  const snDef = getUnitDefinition(snTarget.typeId);
                  const snAura = this.hasPaladinAura(snTarget);
                  const snHeavyPlating =
                    snTarget.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');
                  const snDmg = CombatResolver.calculateEffectiveDamage({
                    baseDamage: ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
                    damageType: 'MAGIC',
                    defenderArmorType: snDef.armorType,
                    defenderFlatReduction: snDef.flatReduction,
                    defenderTypeId: snTarget.typeId,
                    relicDamageMultiplier: attackerMultiplier,
                    hasPaladinAura: snAura,
                    hasBlessedHeavyPlating: snHeavyPlating,
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
                    this.handleUnitDeath(snTarget, unit.team, unit.id, 'MAGIC');
                  }
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
                relicDamageMultiplier: attackerMultiplier,
                isRangedAttack: !unitDef.isMelee,
                isSmashAttack: isSmash,
                isChargeAttack: isCharge,
                hasPaladinAura: targetHasAura,
                hasBlessedHeavyPlating: targetHeavyPlating,
                hasTriumphantDawnCharge: unitHasDawnCharge,
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
                if (unitHasDawnCharge) {
                  target.stunTicksRemaining = 30; // 1.5s stun from epic relic
                } else if (unit.typeId === 'unit_dawn_paladin') {
                  target.stunTicksRemaining = DAWN_PALADIN_STUN_TICKS; // 20 ticks (1.0s)
                }
              }

              // relic_flaming_dawn_bolts: Proc 70px fiery explosion on 5th attack
              if (isFlamingBoltsProc) {
                this.triggerFlamingDawnBolts(target.x, target.y, false, unit.id);
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
                  const secHeavyPlating =
                    secondTarget.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');

                  const secDmg = CombatResolver.calculateEffectiveDamage({
                    baseDamage: unitDef.baseDamage,
                    damageType: unitDef.damageType,
                    defenderArmorType: secDef.armorType,
                    defenderFlatReduction: secDef.flatReduction,
                    defenderTypeId: secondTarget.typeId,
                    relicDamageMultiplier: attackerMultiplier,
                    hasPaladinAura: secAura,
                    hasBlessedHeavyPlating: secHeavyPlating,
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
                    this.handleUnitDeath(secondTarget, unit.team, unit.id, unitDef.damageType);
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
                this.handleUnitDeath(target, unit.team, unit.id, unitDef.damageType);
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
            const unitHasDawnCharge =
              unit.team === 'PLAYER' && this.hasRelic('relic_triumphant_dawn_charge');
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
                relicDamageMultiplier: attackerMultiplier,
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
                const nbHeavyPlating =
                  nb.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');
                const nbDmg = CombatResolver.calculateEffectiveDamage({
                  baseDamage: ARCHMAGE_SUPERNOVA_BASE_DAMAGE,
                  damageType: 'MAGIC',
                  defenderArmorType: nbDef.armorType,
                  defenderFlatReduction: nbDef.flatReduction,
                  defenderTypeId: nb.typeId,
                  relicDamageMultiplier: attackerMultiplier,
                  hasPaladinAura: nbAura,
                  hasBlessedHeavyPlating: nbHeavyPlating,
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
                  this.handleUnitDeath(nb, unit.team, unit.id, 'MAGIC');
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
                relicDamageMultiplier: attackerMultiplier,
                isRangedAttack: !unitDef.isMelee,
                isSmashAttack: isSmash,
                isChargeAttack: isCharge,
                hasTriumphantDawnCharge: unitHasDawnCharge,
                applyPassives: true,
              });

              enemyCitadel.currentHp = Math.max(0, enemyCitadel.currentHp - result.effectiveDamage);
              unit.attackCount++;

              if (isCharge) {
                unit.hasCharged = true;
              }

              // relic_flaming_dawn_bolts: Proc 70px fiery explosion on Citadel
              if (isFlamingBoltsProc) {
                this.triggerFlamingDawnBolts(enemyCitadel.x, unit.y, true, unit.id);
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
    const r2 = radiusPx * radiusPx;
    const attackerMultiplier = attacker.team === 'PLAYER' ? this.getPlayerDamageMultiplier() : 1.0;
    const splashBase = Math.floor(baseDamage * 0.5);

    for (let i = 0; i < this.units.length; i++) {
      const splTarget = this.units[i];
      if (splTarget.team === attacker.team || splTarget.currentHp <= 0) continue;
      if (primaryTargetId !== null && splTarget.id === primaryTargetId) continue;
      const dx = splTarget.x - centerX;
      const dy = splTarget.y - centerY;
      if (dx * dx + dy * dy <= r2) {
        const def = getUnitDefinition(splTarget.typeId);
        const splHeavyPlating =
          splTarget.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');
        const splashDmg = CombatResolver.calculateEffectiveDamage({
          baseDamage: splashBase,
          damageType,
          defenderArmorType: def.armorType,
          defenderFlatReduction: def.flatReduction,
          defenderTypeId: splTarget.typeId,
          relicDamageMultiplier: attackerMultiplier,
          hasPaladinAura: this.hasPaladinAura(splTarget),
          hasBlessedHeavyPlating: splHeavyPlating,
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
          this.handleUnitDeath(splTarget, attacker.team, attacker.id, damageType);
        }
      }
    }
  }

  /**
   * Updates Greek Fire ground hazards. Applies 25 Magic Damage every 20 ticks (1.0s).
   * Citadel is strictly immune to ground hazard pools.
   */
  private updateHazards(): void {
    for (let h = 0; h < this.hazards.length; h++) {
      const hazard = this.hazards[h];
      hazard.ticksRemaining--;

      // Pulse damage every 20 ticks (e.g. 60, 40, 20, 0)
      if (hazard.ticksRemaining % hazard.tickInterval === 0) {
        const r2 = hazard.radiusPx * hazard.radiusPx;
        const hx = hazard.x;
        const hy = hazard.y;

        for (let i = 0; i < this.units.length; i++) {
          const target = this.units[i];
          if (target.team === hazard.team || target.currentHp <= 0) continue;
          const dx = target.x - hx;
          const dy = target.y - hy;
          if (dx * dx + dy * dy <= r2) {
            const def = getUnitDefinition(target.typeId);
            const targetHeavyPlating =
              target.team === 'PLAYER' && this.hasRelic('relic_blessed_heavy_plating');
            const damage = CombatResolver.calculateEffectiveDamage({
              baseDamage: hazard.baseMagicDamage,
              damageType: 'MAGIC',
              defenderArmorType: def.armorType,
              defenderFlatReduction: def.flatReduction,
              defenderTypeId: target.typeId,
              hasPaladinAura: this.hasPaladinAura(target),
              hasBlessedHeavyPlating: targetHeavyPlating,
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
              this.handleUnitDeath(target, hazard.team, hazard.id, 'MAGIC');
            }
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
          this.handleUnitDeath(
            target,
            shot.attackerCitadelTeam,
            `citadel_${shot.attackerCitadelTeam.toLowerCase()}`,
            'SIEGE'
          );
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
