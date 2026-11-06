import {
  AIProfileId,
  StructureTypeId,
  StructureCategory,
  StructureSlotState,
  UnitState,
} from '../types';
import { GameEngine } from '../GameEngine';
import { getUnitDefinition } from '../config/UnitsCatalog';
import { getStructureDefinition } from '../config/StructuresCatalog';
import { MINE_LEVEL_DEFINITIONS } from '../config/EconomyConfig';

export interface ThreatAnalysis {
  readonly heavyThreat: number;
  readonly lightThreat: number;
  readonly siegeThreat: number;
}

export class AIController {
  public readonly profileId: AIProfileId;

  // Track initial sequence progression for scripted openings
  private stepIndex = 0;

  constructor(profileId: AIProfileId) {
    this.profileId = profileId;
  }

  /**
   * Evaluates and executes AI decisions. Strictly invoked every 20 ticks (1.0s).
   */
  public update(engine: GameEngine): void {
    const enemyEconomy = engine.economy.ENEMY;
    const currentGold = enemyEconomy.gold;
    const frontlineX = engine.frontline.frontlineX;
    const tick = engine.getTick();

    const enemySlots = engine.slots.filter((s) => s.team === 'ENEMY');
    const threats = this.calculateThreats(engine.units);

    switch (this.profileId) {
      case 'AGGRESSIVE':
        this.runAggressiveStrategy(engine, currentGold, frontlineX, tick, enemySlots, threats);
        break;
      case 'DEFENSIVE':
        this.runDefensiveStrategy(engine, currentGold, frontlineX, enemySlots, threats);
        break;
      case 'SWARM':
        this.runSwarmStrategy(engine, currentGold, enemySlots, threats);
        break;
      case 'BOSS_ACT1':
        this.runBossStrategy(engine, currentGold, frontlineX, enemySlots, threats);
        break;
    }
  }

  /**
   * Calculates player threat vectors according to Section 3.3:
   * Heavy Threat = sum(maxHp of HEAVY player units)
   * Light Threat = sum(maxHp of LIGHT player units)
   * Siege Threat = count(SIEGE player units)
   */
  public calculateThreats(units: readonly UnitState[]): ThreatAnalysis {
    let heavyThreat = 0;
    let lightThreat = 0;
    let siegeThreat = 0;

    for (const u of units) {
      if (u.team !== 'PLAYER' || u.currentHp <= 0) continue;
      const def = getUnitDefinition(u.typeId);

      if (def.armorType === 'HEAVY') {
        heavyThreat += u.maxHp;
      } else if (def.armorType === 'LIGHT') {
        lightThreat += u.maxHp;
      }

      if (def.damageType === 'SIEGE') {
        siegeThreat++;
      }
    }

    return { heavyThreat, lightThreat, siegeThreat };
  }

  // =========================================================================
  // PROFILE 1: AGGRESSIVE ("Comandante Valerius")
  // =========================================================================
  private runAggressiveStrategy(
    engine: GameEngine,
    gold: number,
    frontlineX: number,
    tick: number,
    slots: StructureSlotState[],
    threats: ThreatAnalysis
  ): void {
    // 1. Initial Opening Sequence (t = 0s to 45s):
    // t=0s: Slot 0 -> bldg_barracks_1 (100g)
    // t=10s: Slot 1 -> bldg_barracks_1 (100g)
    // t=25s: Slot 2 -> bldg_stable_1 (140g)
    // t=45s: Upgrade Slot 0 -> bldg_barracks_2 (130g)
    if (this.stepIndex === 0) {
      const s0 = slots.find((s) => s.slotIndex === 0);
      if (s0 && s0.structureId === null && gold >= 100) {
        if (engine.buildStructure('ENEMY', 0, 'bldg_barracks_1')) {
          this.stepIndex = 1;
          return;
        }
      }
    } else if (this.stepIndex === 1) {
      const s1 = slots.find((s) => s.slotIndex === 1);
      if (s1 && s1.structureId === null && gold >= 100) {
        if (engine.buildStructure('ENEMY', 1, 'bldg_barracks_1')) {
          this.stepIndex = 2;
          return;
        }
      }
    } else if (this.stepIndex === 2) {
      const s2 = slots.find((s) => s.slotIndex === 2);
      if (s2 && s2.structureId === null && gold >= 140) {
        if (engine.buildStructure('ENEMY', 2, 'bldg_stable_1')) {
          this.stepIndex = 3;
          return;
        }
      }
    } else if (this.stepIndex === 3) {
      const s0 = slots.find((s) => s.slotIndex === 0);
      if (s0 && s0.structureId === 'bldg_barracks_1' && gold >= 130) {
        if (engine.upgradeStructure('ENEMY', 0)) {
          this.stepIndex = 4;
          return;
        }
      }
    }

    // Never upgrades mine before 1800 ticks (90s)
    if (tick >= 1800 && frontlineX < 800) {
      this.tryUpgradeMine(engine);
    }

    // Beyond initial sequence, apply dynamic decision matrix
    this.evaluateDecisionMatrix(engine, slots, threats, frontlineX, true);
  }

  // =========================================================================
  // PROFILE 2: DEFENSIVE ("Grão-Marechal Thorne")
  // =========================================================================
  private runDefensiveStrategy(
    engine: GameEngine,
    gold: number,
    frontlineX: number,
    slots: StructureSlotState[],
    threats: ThreatAnalysis
  ): void {
    const mineLevel = engine.economy.ENEMY.mineLevel;

    // Invests in Mine Level 1 (60g) as soon as frontline reaches <= 1000
    if (mineLevel === 0 && frontlineX <= 1000 && gold >= 60) {
      if (engine.upgradeMine('ENEMY')) {
        return;
      }
    }

    // Initial sequence:
    // Slot 0 -> bldg_barracks_1 (100g)
    // Slot 3 -> bldg_archery_1 (90g)
    // Slot 9 -> bldg_siege_1 (160g)
    // Upgrade Mine Level 2 (110g)
    // Upgrade Slot 9 -> bldg_siege_2 (210g)
    if (this.stepIndex === 0) {
      const s0 = slots.find((s) => s.slotIndex === 0);
      if (s0 && s0.structureId === null && gold >= 100) {
        if (engine.buildStructure('ENEMY', 0, 'bldg_barracks_1')) {
          this.stepIndex = 1;
          return;
        }
      }
    } else if (this.stepIndex === 1) {
      const s3 = slots.find((s) => s.slotIndex === 3);
      if (s3 && s3.structureId === null && gold >= 90) {
        if (engine.buildStructure('ENEMY', 3, 'bldg_archery_1')) {
          this.stepIndex = 2;
          return;
        }
      }
    } else if (this.stepIndex === 2) {
      const s9 = slots.find((s) => s.slotIndex === 9);
      if (s9 && s9.structureId === null && gold >= 160) {
        if (engine.buildStructure('ENEMY', 9, 'bldg_siege_1')) {
          this.stepIndex = 3;
          return;
        }
      }
    } else if (this.stepIndex === 3) {
      if (mineLevel < 2 && gold >= 110) {
        if (engine.upgradeMine('ENEMY')) {
          this.stepIndex = 4;
          return;
        }
      }
    } else if (this.stepIndex === 4) {
      const s9 = slots.find((s) => s.slotIndex === 9);
      if (s9 && s9.structureId === 'bldg_siege_1' && gold >= 210) {
        if (engine.upgradeStructure('ENEMY', 9)) {
          this.stepIndex = 5;
          return;
        }
      }
    }

    // Beyond initial sequence: evaluate decision matrix favoring defense and siege
    this.evaluateDecisionMatrix(engine, slots, threats, frontlineX, false);
  }

  // =========================================================================
  // PROFILE 3: SWARM ("Rainha dos Salteadores Seline")
  // =========================================================================
  private runSwarmStrategy(
    engine: GameEngine,
    gold: number,
    slots: StructureSlotState[],
    _threats: ThreatAnalysis
  ): void {
    // Golden Rule: Do not perform N2 upgrades while having empty N1 slots
    const emptySlots = slots.filter((s) => s.structureId === null);

    if (emptySlots.length > 0) {
      // Alternate between Barracks N1 (100g) and Archery N1 (90g)
      // Pick first empty slot among 0..7 first, then 8..11
      const preferredSlots = emptySlots.sort((a, b) => a.slotIndex - b.slotIndex);
      const targetSlot = preferredSlots[0];

      // Alternate structure type based on slot index
      const desiredType: StructureTypeId =
        targetSlot.slotIndex % 2 === 0 ? 'bldg_barracks_1' : 'bldg_archery_1';
      const cost = desiredType === 'bldg_barracks_1' ? 100 : 90;

      if (gold >= cost) {
        engine.buildStructure('ENEMY', targetSlot.slotIndex, desiredType);
      }
      return;
    }

    // If all slots are filled with N1, evaluate upgrades
    for (const slot of slots) {
      if (!slot.structureId) continue;
      const def = getStructureDefinition(slot.structureId);
      if (def.tier === 1 && def.upgradesTo && gold >= def.upgradeCostGold) {
        if (engine.upgradeStructure('ENEMY', slot.slotIndex)) {
          return;
        }
      }
    }
  }

  // =========================================================================
  // PROFILE 4: BOSS ("O Tirano de Ferro")
  // =========================================================================
  private runBossStrategy(
    engine: GameEngine,
    _gold: number,
    frontlineX: number,
    slots: StructureSlotState[],
    threats: ThreatAnalysis
  ): void {
    // Slot 11 is permanently reserved for bldg_renegade_altar.
    // Use the reactive decision matrix for remaining slots
    this.evaluateDecisionMatrix(engine, slots, threats, frontlineX, true);
  }

  // =========================================================================
  // DECISION MATRIX EVALUATION (Section 3.4)
  // =========================================================================
  private evaluateDecisionMatrix(
    engine: GameEngine,
    slots: StructureSlotState[],
    threats: ThreatAnalysis,
    frontlineX: number,
    aggressiveBias: boolean
  ): void {
    const gold = engine.economy.ENEMY.gold;
    const structureCounts = this.countStructures(slots);

    // Condition 5: Citadel Threatened (frontlineX > 1400) -> Weight +70
    // Suspend economy and build emergency Barracks or Siege on first free slot
    if (frontlineX > 1400) {
      const freeSlot = this.findBestFreeSlot(slots, 'BARRACKS');
      if (freeSlot !== null && gold >= 100) {
        engine.buildStructure('ENEMY', freeSlot, 'bldg_barracks_1');
        return;
      }
    }

    // Condition 3: Siege Threat >= 2 and Stables < 2 -> Weight +60
    // Counter with Stables (Cavalry speed 120px/s flanks artillery)
    if (threats.siegeThreat >= 2 && structureCounts.stable < 2) {
      if (this.tryBuildOrUpgrade(engine, slots, 'bldg_stable_1', 'bldg_stable_2', 'STABLE', gold)) {
        return;
      }
    }

    // Condition 1: Heavy Threat > 1200 and Arcane Towers < 2 -> Weight +50
    // Magic damage melts heavy armor
    if (threats.heavyThreat > 1200 && structureCounts.arcane < 2) {
      if (this.tryBuildOrUpgrade(engine, slots, 'bldg_arcane_1', 'bldg_arcane_2', 'ARCANE', gold)) {
        return;
      }
    }

    // Condition 2: Light Threat > 800 and Archery < 2 -> Weight +40
    // Piercing damage deals 150% vs light armor
    if (threats.lightThreat > 800 && structureCounts.archery < 2) {
      if (this.tryBuildOrUpgrade(engine, slots, 'bldg_archery_1', 'bldg_archery_2', 'ARCHERY', gold)) {
        return;
      }
    }

    // Condition 4: Frontline push in allied territory (frontlineX < 800) and Gold >= 80 -> Weight +30
    // Upgrade Royal Mine
    if (frontlineX < 800 && gold >= 80) {
      if (this.tryUpgradeMine(engine)) {
        return;
      }
    }

    // General expansion: Build or upgrade based on bias
    if (aggressiveBias) {
      // Prioritize Barracks/Stables upgrades
      if (this.tryUpgradeTier1(engine, slots, ['bldg_barracks_1', 'bldg_stable_1', 'bldg_arcane_1'], gold)) {
        return;
      }
      // Or build new Barracks
      const freeSlot = this.findBestFreeSlot(slots, 'BARRACKS');
      if (freeSlot !== null && gold >= 100) {
        engine.buildStructure('ENEMY', freeSlot, 'bldg_barracks_1');
        return;
      }
    } else {
      // Defensive bias: Upgrade Siege/Archery
      if (this.tryUpgradeTier1(engine, slots, ['bldg_siege_1', 'bldg_archery_1', 'bldg_barracks_1'], gold)) {
        return;
      }
      const freeSlot = this.findBestFreeSlot(slots, 'SIEGE');
      if (freeSlot !== null && gold >= 160) {
        engine.buildStructure('ENEMY', freeSlot, 'bldg_siege_1');
        return;
      }
    }
  }

  private tryBuildOrUpgrade(
    engine: GameEngine,
    slots: StructureSlotState[],
    tier1Id: StructureTypeId,
    _tier2Id: StructureTypeId,
    category: StructureCategory,
    gold: number
  ): boolean {
    // 1. Try upgrading an existing Tier 1 structure of this category
    const existingTier1 = slots.find((s) => s.structureId === tier1Id);
    if (existingTier1) {
      const def = getStructureDefinition(tier1Id);
      if (gold >= def.upgradeCostGold) {
        return engine.upgradeStructure('ENEMY', existingTier1.slotIndex);
      }
    }

    // 2. Try building a new Tier 1 structure
    const defT1 = getStructureDefinition(tier1Id);
    if (gold >= defT1.buildCostGold) {
      const targetSlot = this.findBestFreeSlot(slots, category);
      if (targetSlot !== null) {
        return engine.buildStructure('ENEMY', targetSlot, tier1Id);
      }
    }

    return false;
  }

  private tryUpgradeTier1(
    engine: GameEngine,
    slots: StructureSlotState[],
    priorityTypes: StructureTypeId[],
    gold: number
  ): boolean {
    for (const typeId of priorityTypes) {
      const slot = slots.find((s) => s.structureId === typeId);
      if (slot) {
        const def = getStructureDefinition(typeId);
        if (gold >= def.upgradeCostGold) {
          if (engine.upgradeStructure('ENEMY', slot.slotIndex)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private tryUpgradeMine(engine: GameEngine): boolean {
    const currentLevel = engine.economy.ENEMY.mineLevel;
    const nextLevelDef = MINE_LEVEL_DEFINITIONS[currentLevel + 1];
    if (nextLevelDef && engine.economy.ENEMY.gold >= nextLevelDef.costGold) {
      return engine.upgradeMine('ENEMY');
    }
    return false;
  }

  /**
   * Finds the best free slot for a structure category following Section 3.2 topology:
   * Col 0: Slots 0, 1, 2 (Frontline / Infantry & Cavalry)
   * Col 1: Slots 3, 4, 5 (Mid-front / Archers & Mages)
   * Col 2: Slots 6, 7, 8 (Mid-back / Secondary)
   * Col 3: Slots 9, 10, 11 (Backline / Siege)
   */
  public findBestFreeSlot(slots: StructureSlotState[], category: StructureCategory): number | null {
    let preferredOrder: number[];

    switch (category) {
      case 'BARRACKS':
      case 'STABLE':
        // Col 0 -> Col 1 -> Col 2 -> Col 3
        preferredOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        break;
      case 'ARCHERY':
      case 'ARCANE':
        // Col 1 -> Col 2 -> Col 0 -> Col 3
        preferredOrder = [3, 4, 5, 6, 7, 8, 0, 1, 2, 9, 10, 11];
        break;
      case 'SIEGE':
        // Col 3 -> Col 2 -> Col 1 -> Col 0
        preferredOrder = [9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2];
        break;
      default:
        preferredOrder = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }

    for (const idx of preferredOrder) {
      // In BOSS_ACT1, Slot 11 is permanently reserved for the Altar
      if (this.profileId === 'BOSS_ACT1' && idx === 11) continue;

      const slot = slots.find((s) => s.slotIndex === idx);
      if (slot && slot.structureId === null) {
        return idx;
      }
    }

    return null;
  }

  private countStructures(slots: StructureSlotState[]): {
    barracks: number;
    archery: number;
    arcane: number;
    stable: number;
    siege: number;
  } {
    let barracks = 0;
    let archery = 0;
    let arcane = 0;
    let stable = 0;
    let siege = 0;

    for (const s of slots) {
      if (!s.structureId) continue;
      if (s.structureId.startsWith('bldg_barracks')) barracks++;
      else if (s.structureId.startsWith('bldg_archery')) archery++;
      else if (s.structureId.startsWith('bldg_arcane')) arcane++;
      else if (s.structureId.startsWith('bldg_stable')) stable++;
      else if (s.structureId.startsWith('bldg_siege')) siege++;
    }

    return { barracks, archery, arcane, stable, siege };
  }
}
